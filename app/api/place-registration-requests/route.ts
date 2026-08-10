import { normalizePlaceName } from "../../core-landmarks";

export const runtime = "edge";

const PAGE_SIZE = 10;
const MAX_REQUESTS_PER_DAY = 5;
const MARKER_CATEGORIES = new Set(["culture", "cafe", "food", "shop", "parking", "park", "utility"]);
const MARKER_STYLES = new Set(["01", "02", "03"]);

type RuntimeEnv = {
  DB?: D1Database;
  BASE_MAP_OWNER_EMAIL?: string;
};

type RequestStatus = "pending" | "approved" | "rejected";

type RegistrationRow = {
  id: string;
  submittedName: string;
  submittedAddress: string;
  submittedDescription: string;
  submittedCategory: string;
  submittedMarkerStyle: string;
  name: string;
  address: string;
  description: string;
  category: string;
  markerStyle: string;
  status: RequestStatus;
  directoryId: string | null;
  rejectionNote: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS place_registration_requests (
  id TEXT PRIMARY KEY NOT NULL,
  submitted_name TEXT NOT NULL,
  submitted_address TEXT NOT NULL,
  submitted_description TEXT NOT NULL,
  submitted_category TEXT NOT NULL,
  submitted_marker_style TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  marker_style TEXT NOT NULL,
  status TEXT NOT NULL,
  actor_hash TEXT NOT NULL,
  directory_id TEXT,
  rejection_note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT
)`;

const REQUEST_SELECT = `SELECT id,
  submitted_name AS submittedName, submitted_address AS submittedAddress,
  submitted_description AS submittedDescription, submitted_category AS submittedCategory,
  submitted_marker_style AS submittedMarkerStyle, name, address, description, category,
  marker_style AS markerStyle, status, directory_id AS directoryId,
  rejection_note AS rejectionNote, created_at AS createdAt, updated_at AS updatedAt,
  reviewed_at AS reviewedAt
 FROM place_registration_requests`;

async function runtimeEnv() {
  const workers = await import("cloudflare:workers");
  return workers.env as unknown as RuntimeEnv;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function ownerAccess(request: Request, runtime: RuntimeEnv) {
  const ownerEmail = runtime.BASE_MAP_OWNER_EMAIL?.trim().toLowerCase();
  const currentEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  return { canManage: Boolean(ownerEmail && currentEmail === ownerEmail), currentEmail };
}

async function ensureStorage(db: D1Database) {
  await db.batch([
    db.prepare(TABLE_SQL),
    db.prepare("CREATE INDEX IF NOT EXISTS place_registration_requests_status_created_idx ON place_registration_requests (status, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS place_registration_requests_actor_created_idx ON place_registration_requests (actor_hash, created_at)"),
  ]);
}

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum)
    : "";
}

function cleanMultiline(value: unknown, maximum: number) {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, maximum)
    : "";
}

function validatedFields(payload: Record<string, unknown>) {
  const name = normalizePlaceName(cleanText(payload.name, 120));
  const address = cleanText(payload.address, 260);
  const description = cleanMultiline(payload.description, 800);
  const category = cleanText(payload.category, 24);
  const markerStyle = cleanText(payload.markerStyle, 4);
  if (name.length < 2 || address.length < 5 || description.length < 10 || !MARKER_CATEGORIES.has(category) || !MARKER_STYLES.has(markerStyle)) return null;
  return { name, address, description, category, markerStyle };
}

async function actorHash(request: Request, visitorId: string) {
  const forwarded = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const bytes = new TextEncoder().encode(`${forwarded}|${userAgent}|${visitorId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function categorySubtype(category: string) {
  return ({ culture: "문화시설", cafe: "카페", food: "음식점", shop: "소품샵", parking: "주차장", park: "공원·광장", utility: "기타 편의시설" } as Record<string, string>)[category] ?? "기타";
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  const { canManage } = ownerAccess(request, runtime);
  if (!canManage) return json({ error: "owner authentication required" }, 403);
  if (!runtime.DB) return json({ requests: [], canManage: true, persistent: false }, 503);
  await ensureStorage(runtime.DB);
  const searchParams = new URL(request.url).searchParams;
  const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const count = await runtime.DB.prepare("SELECT COUNT(*) AS count FROM place_registration_requests").first() as { count?: number } | null;
  const total = Number(count?.count ?? 0);
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const normalizedPage = pageCount > 0 ? Math.min(page, pageCount) : 1;
  const result = await runtime.DB.prepare(
    `${REQUEST_SELECT} ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END, created_at DESC, id DESC LIMIT ? OFFSET ?`,
  ).bind(PAGE_SIZE, (normalizedPage - 1) * PAGE_SIZE).all() as { results?: RegistrationRow[] };
  return json({ requests: result.results ?? [], canManage: true, persistent: true, page: normalizedPage, pageSize: PAGE_SIZE, pageCount, total });
}

export async function POST(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const fields = payload ? validatedFields(payload) : null;
  const visitorId = cleanText(payload?.visitorId, 100);
  if (!fields || !/^[a-zA-Z0-9_-]{24,100}$/.test(visitorId)) return json({ error: "valid place request required" }, 400);
  await ensureStorage(runtime.DB);

  const existingPlace = await runtime.DB.prepare("SELECT id FROM place_directory WHERE lower(name) = lower(?) LIMIT 1")
    .bind(fields.name).first() as { id?: string } | null;
  if (existingPlace?.id) return json({ error: "place already registered" }, 409);

  const hash = await actorHash(request, visitorId);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await runtime.DB.prepare(
    "SELECT COUNT(*) AS count FROM place_registration_requests WHERE actor_hash = ? AND created_at >= ?",
  ).bind(hash, since).first() as { count?: number } | null;
  if (Number(recent?.count ?? 0) >= MAX_REQUESTS_PER_DAY) return json({ error: "daily request limit reached" }, 429);
  const duplicate = await runtime.DB.prepare(
    "SELECT id FROM place_registration_requests WHERE actor_hash = ? AND lower(name) = lower(?) AND status = 'pending' AND created_at >= ? LIMIT 1",
  ).bind(hash, fields.name, since).first() as { id?: string } | null;
  if (duplicate?.id) return json({ error: "duplicate pending request" }, 409);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await runtime.DB.prepare(
    `INSERT INTO place_registration_requests
      (id, submitted_name, submitted_address, submitted_description, submitted_category,
       submitted_marker_style, name, address, description, category, marker_style, status,
       actor_hash, directory_id, rejection_note, created_at, updated_at, reviewed_at, reviewed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, '', ?, ?, NULL, NULL)`,
  ).bind(
    id, fields.name, fields.address, fields.description, fields.category, fields.markerStyle,
    fields.name, fields.address, fields.description, fields.category, fields.markerStyle,
    hash, createdAt, createdAt,
  ).run();
  return json({ request: { id, ...fields, status: "pending", createdAt }, persistent: true }, 201);
}

export async function PATCH(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const { canManage, currentEmail } = ownerAccess(request, runtime);
  if (!canManage || !currentEmail) return json({ error: "owner authentication required" }, 403);
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = cleanText(payload?.id, 80);
  const action = cleanText(payload?.action, 20);
  if (!id || !["edit", "approve", "reject"].includes(action)) return json({ error: "valid request action required" }, 400);
  await ensureStorage(runtime.DB);
  const existing = await runtime.DB.prepare(`${REQUEST_SELECT} WHERE id = ?`).bind(id).first() as RegistrationRow | null;
  if (!existing) return json({ error: "request not found" }, 404);

  if (action === "edit") {
    if (existing.status === "approved") return json({ error: "approved request cannot be edited" }, 409);
    const fields = payload ? validatedFields(payload) : null;
    if (!fields) return json({ error: "valid edited fields required" }, 400);
    const updatedAt = new Date().toISOString();
    await runtime.DB.prepare(
      `UPDATE place_registration_requests SET name = ?, address = ?, description = ?, category = ?,
       marker_style = ?, updated_at = ?, reviewed_by = ? WHERE id = ?`,
    ).bind(fields.name, fields.address, fields.description, fields.category, fields.markerStyle, updatedAt, currentEmail, id).run();
    return json({ request: { ...existing, ...fields, updatedAt } });
  }

  if (action === "reject") {
    if (existing.status === "approved") return json({ error: "approved request cannot be rejected" }, 409);
    const rejectionNote = cleanMultiline(payload?.rejectionNote, 500);
    const reviewedAt = new Date().toISOString();
    await runtime.DB.prepare(
      "UPDATE place_registration_requests SET status = 'rejected', rejection_note = ?, updated_at = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?",
    ).bind(rejectionNote, reviewedAt, reviewedAt, currentEmail, id).run();
    return json({ request: { ...existing, status: "rejected", rejectionNote, updatedAt: reviewedAt, reviewedAt } });
  }

  if (existing.status === "approved") return json({ error: "request already approved" }, 409);
  const fields = (payload ? validatedFields(payload) : null)
    ?? validatedFields(existing as unknown as Record<string, unknown>);
  if (!fields) return json({ error: "request must be corrected before approval" }, 400);
  const duplicate = await runtime.DB.prepare("SELECT id FROM place_directory WHERE lower(name) = lower(?) LIMIT 1")
    .bind(fields.name).first() as { id?: string } | null;
  if (duplicate?.id) return json({ error: "place already registered", directoryId: duplicate.id }, 409);
  const reviewedAt = new Date().toISOString();
  const directoryId = `community-${crypto.randomUUID()}`;
  await runtime.DB.batch([
    runtime.DB.prepare(
      `INSERT INTO place_directory
        (id, name, category, area, address, subtype, priority, description, operating_info,
         notes, source_url, map_url, checked_at, updated_at, updated_by)
       VALUES (?, ?, ?, '등록 요청', ?, ?, '관리자 검수 승인', ?, '', ?, '', '', ?, ?, ?)`,
    ).bind(
      directoryId, fields.name, fields.category, fields.address, categorySubtype(fields.category),
      fields.description, "공개 지도 장소 등록 요청에서 승인됨", reviewedAt.slice(0, 10), reviewedAt, currentEmail,
    ),
    runtime.DB.prepare(
      `INSERT INTO place_directory_revision (id, updated_at, updated_by) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    ).bind(reviewedAt, currentEmail),
    runtime.DB.prepare(
      `UPDATE place_registration_requests SET name = ?, address = ?, description = ?, category = ?, marker_style = ?,
       status = 'approved', directory_id = ?, rejection_note = '', updated_at = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?`,
    ).bind(fields.name, fields.address, fields.description, fields.category, fields.markerStyle, directoryId, reviewedAt, reviewedAt, currentEmail, id),
  ]);
  return json({
    request: { ...existing, ...fields, status: "approved", directoryId, rejectionNote: "", updatedAt: reviewedAt, reviewedAt },
    directory: {
      id: directoryId, name: fields.name, category: fields.category, area: "등록 요청", address: fields.address,
      subtype: categorySubtype(fields.category), priority: "관리자 검수 승인", description: fields.description,
      operatingInfo: "", notes: "공개 지도 장소 등록 요청에서 승인됨", sourceUrl: "", mapUrl: "", checkedAt: reviewedAt.slice(0, 10),
    },
  });
}

export async function DELETE(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const { canManage } = ownerAccess(request, runtime);
  if (!canManage) return json({ error: "owner authentication required" }, 403);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return json({ error: "request id required" }, 400);
  await ensureStorage(runtime.DB);
  const result = await runtime.DB.prepare("DELETE FROM place_registration_requests WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return json({ error: "request not found" }, 404);
  return json({ deleted: true, id });
}
