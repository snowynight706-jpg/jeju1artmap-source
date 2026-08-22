import { normalizePlaceName } from "../../core-landmarks";
import { adminAccess, type AdminRuntimeEnv } from "../../admin-auth";

export const runtime = "edge";

const PAGE_SIZE = 10;
const MAX_REQUESTS_PER_DAY = 5;
const MARKER_CATEGORIES = new Set(["culture", "cafe", "food", "shop", "parking", "park", "utility"]);
const MARKER_STYLES = new Set(["01", "02", "03", "v2"]);

type RuntimeEnv = AdminRuntimeEnv & {
  DB?: D1Database;
};

type RequestStatus = "pending" | "reviewing" | "approved" | "rejected";

type RegistrationRow = {
  id: string;
  submittedName: string;
  submittedArea: string;
  submittedAddress: string;
  submittedDescription: string;
  submittedCategory: string;
  submittedMarkerStyle: string;
  submittedX: number | null;
  submittedY: number | null;
  name: string;
  area: string;
  address: string;
  description: string;
  category: string;
  markerStyle: string;
  markerX: number | null;
  markerY: number | null;
  status: RequestStatus;
  directoryId: string | null;
  rejectionNote: string;
  createdAt: string;
  updatedAt: string;
  reviewStartedAt: string | null;
  reviewedAt: string | null;
};

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS place_registration_requests (
  id TEXT PRIMARY KEY NOT NULL,
  submitted_name TEXT NOT NULL,
  submitted_area TEXT NOT NULL DEFAULT '',
  submitted_address TEXT NOT NULL,
  submitted_description TEXT NOT NULL,
  submitted_category TEXT NOT NULL,
  submitted_marker_style TEXT NOT NULL,
  submitted_x REAL,
  submitted_y REAL,
  name TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  marker_style TEXT NOT NULL,
  marker_x REAL,
  marker_y REAL,
  status TEXT NOT NULL,
  actor_hash TEXT NOT NULL,
  directory_id TEXT,
  rejection_note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  review_started_at TEXT,
  review_started_by TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT
)`;

const REQUEST_SELECT = `SELECT id,
  submitted_name AS submittedName, submitted_area AS submittedArea, submitted_address AS submittedAddress,
  submitted_description AS submittedDescription, submitted_category AS submittedCategory,
  submitted_marker_style AS submittedMarkerStyle, submitted_x AS submittedX, submitted_y AS submittedY,
  name, area, address, description, category, marker_style AS markerStyle,
  marker_x AS markerX, marker_y AS markerY, status, directory_id AS directoryId,
  rejection_note AS rejectionNote, created_at AS createdAt, updated_at AS updatedAt,
  review_started_at AS reviewStartedAt, reviewed_at AS reviewedAt
 FROM place_registration_requests`;

let storageReady: Promise<void> | null = null;

async function runtimeEnv() {
  const workers = await import("cloudflare:workers");
  return workers.env as unknown as RuntimeEnv;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function ownerAccess(request: Request, runtime: RuntimeEnv) {
  const access = adminAccess(request, runtime);
  return { canManage: access.allowed, currentEmail: access.actor };
}

async function ensureStorage(db: D1Database) {
  if (!storageReady) {
    storageReady = db.batch([
      db.prepare(TABLE_SQL),
      db.prepare("CREATE INDEX IF NOT EXISTS place_registration_requests_status_created_idx ON place_registration_requests (status, created_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS place_registration_requests_actor_created_idx ON place_registration_requests (actor_hash, created_at)"),
    ]).then(() => undefined).catch((error: unknown) => {
      storageReady = null;
      throw error;
    });
  }
  await storageReady;
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
  const area = cleanText(payload.area, 160);
  const address = cleanText(payload.address, 260);
  const description = cleanMultiline(payload.description, 800);
  const category = cleanText(payload.category, 24);
  const markerStyle = cleanText(payload.markerStyle, 4);
  if (name.length < 2 || !area || address.length < 5 || description.length < 10 || !MARKER_CATEGORIES.has(category) || !MARKER_STYLES.has(markerStyle)) return null;
  return { name, area, address, description, category, markerStyle };
}

function validatedLocation(payload: Record<string, unknown>, required = false) {
  const x = typeof payload.markerX === "number" ? payload.markerX : Number(payload.markerX);
  const y = typeof payload.markerY === "number" ? payload.markerY : Number(payload.markerY);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
    return required ? null : undefined;
  }
  return { markerX: Math.round(x * 1000) / 1000, markerY: Math.round(y * 1000) / 1000 };
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
  const listStatement = (targetPage: number) => runtime.DB!.prepare(
    `${REQUEST_SELECT} ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'reviewing' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END, created_at DESC, id DESC LIMIT ? OFFSET ?`,
  ).bind(PAGE_SIZE, (targetPage - 1) * PAGE_SIZE);
  const [countResult, requestedResult] = await runtime.DB.batch([
    runtime.DB.prepare("SELECT COUNT(*) AS count FROM place_registration_requests"),
    listStatement(page),
  ]) as [D1Result<{ count?: number }>, D1Result<RegistrationRow>];
  const total = Number(countResult.results?.[0]?.count ?? 0);
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const normalizedPage = pageCount > 0 ? Math.min(page, pageCount) : 1;
  const result = normalizedPage === page
    ? requestedResult
    : await listStatement(normalizedPage).all() as D1Result<RegistrationRow>;
  return json({ requests: result.results ?? [], canManage: true, persistent: true, page: normalizedPage, pageSize: PAGE_SIZE, pageCount, total });
}

export async function POST(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const fields = payload ? validatedFields(payload) : null;
  const location = payload ? validatedLocation(payload, true) : null;
  const visitorId = cleanText(payload?.visitorId, 100);
  if (!fields || !location || !/^[a-zA-Z0-9_-]{24,100}$/.test(visitorId)) return json({ error: "valid place request and marker location required" }, 400);
  await ensureStorage(runtime.DB);

  const hash = await actorHash(request, visitorId);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [existingPlaceResult, recentResult, duplicateResult] = await runtime.DB.batch([
    runtime.DB.prepare("SELECT id FROM place_directory WHERE lower(name) = lower(?) LIMIT 1").bind(fields.name),
    runtime.DB.prepare(
      "SELECT COUNT(*) AS count FROM place_registration_requests WHERE actor_hash = ? AND created_at >= ?",
    ).bind(hash, since),
    runtime.DB.prepare(
      "SELECT id FROM place_registration_requests WHERE actor_hash = ? AND lower(name) = lower(?) AND status IN ('pending', 'reviewing') AND created_at >= ? LIMIT 1",
    ).bind(hash, fields.name, since),
  ]) as [D1Result<{ id?: string }>, D1Result<{ count?: number }>, D1Result<{ id?: string }>];
  const existingPlace = existingPlaceResult.results?.[0];
  if (existingPlace?.id) return json({ error: "place already registered" }, 409);
  const recent = recentResult.results?.[0];
  if (Number(recent?.count ?? 0) >= MAX_REQUESTS_PER_DAY) return json({ error: "daily request limit reached" }, 429);
  const duplicate = duplicateResult.results?.[0];
  if (duplicate?.id) return json({ error: "duplicate pending request" }, 409);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await runtime.DB.prepare(
    `INSERT INTO place_registration_requests
      (id, submitted_name, submitted_area, submitted_address, submitted_description, submitted_category,
       submitted_marker_style, submitted_x, submitted_y, name, area, address, description, category,
       marker_style, marker_x, marker_y, status, actor_hash, directory_id, rejection_note,
       created_at, updated_at, review_started_at, review_started_by, reviewed_at, reviewed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, '', ?, ?, NULL, NULL, NULL, NULL)`,
  ).bind(
    id, fields.name, fields.area, fields.address, fields.description, fields.category, fields.markerStyle,
    location.markerX, location.markerY,
    fields.name, fields.area, fields.address, fields.description, fields.category, fields.markerStyle,
    location.markerX, location.markerY,
    hash, createdAt, createdAt,
  ).run();
  return json({ request: {
    id,
    ...fields,
    ...location,
    submittedName: fields.name,
    submittedArea: fields.area,
    submittedAddress: fields.address,
    submittedDescription: fields.description,
    submittedCategory: fields.category,
    submittedMarkerStyle: fields.markerStyle,
    submittedX: location.markerX,
    submittedY: location.markerY,
    status: "pending",
    createdAt,
  }, persistent: true }, 201);
}

export async function PATCH(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const { canManage, currentEmail } = ownerAccess(request, runtime);
  if (!canManage || !currentEmail) return json({ error: "owner authentication required" }, 403);
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = cleanText(payload?.id, 80);
  const action = cleanText(payload?.action, 20);
  if (!id || !["edit", "start-review", "move-marker", "approve", "reject"].includes(action)) return json({ error: "valid request action required" }, 400);
  await ensureStorage(runtime.DB);
  const existing = await runtime.DB.prepare(`${REQUEST_SELECT} WHERE id = ?`).bind(id).first() as RegistrationRow | null;
  if (!existing) return json({ error: "request not found" }, 404);

  if (action === "edit") {
    if (existing.status === "approved") return json({ error: "approved request cannot be edited" }, 409);
    const fields = payload ? validatedFields(payload) : null;
    if (!fields) return json({ error: "valid edited fields required" }, 400);
    const location = payload ? validatedLocation(payload) : undefined;
    const updatedAt = new Date().toISOString();
    await runtime.DB.prepare(
      `UPDATE place_registration_requests SET name = ?, area = ?, address = ?, description = ?, category = ?,
       marker_style = ?, marker_x = ?, marker_y = ?, updated_at = ?, reviewed_by = ? WHERE id = ?`,
    ).bind(
      fields.name, fields.area, fields.address, fields.description, fields.category, fields.markerStyle,
      location?.markerX ?? existing.markerX, location?.markerY ?? existing.markerY,
      updatedAt, currentEmail, id,
    ).run();
    return json({ request: { ...existing, ...fields, ...(location ?? {}), updatedAt } });
  }

  if (action === "start-review") {
    if (existing.status === "approved" || existing.status === "rejected") return json({ error: "closed request cannot start review" }, 409);
    const fields = (payload ? validatedFields(payload) : null)
      ?? validatedFields(existing as unknown as Record<string, unknown>);
    if (!fields) return json({ error: "request must be corrected before review" }, 400);
    const location = (payload ? validatedLocation(payload) : undefined)
      ?? (existing.markerX !== null && existing.markerY !== null ? { markerX: existing.markerX, markerY: existing.markerY } : { markerX: 50, markerY: 50 });
    const reviewStartedAt = existing.reviewStartedAt ?? new Date().toISOString();
    const updatedAt = new Date().toISOString();
    await runtime.DB.prepare(
      `UPDATE place_registration_requests SET name = ?, area = ?, address = ?, description = ?, category = ?, marker_style = ?,
       marker_x = ?, marker_y = ?, status = 'reviewing', updated_at = ?, review_started_at = ?, review_started_by = ?, reviewed_by = ? WHERE id = ?`,
    ).bind(
      fields.name, fields.area, fields.address, fields.description, fields.category, fields.markerStyle,
      location.markerX, location.markerY, updatedAt, reviewStartedAt, currentEmail, currentEmail, id,
    ).run();
    return json({ request: { ...existing, ...fields, ...location, status: "reviewing", reviewStartedAt, updatedAt } });
  }

  if (action === "move-marker") {
    if (existing.status !== "reviewing") return json({ error: "request is not under review" }, 409);
    const location = payload ? validatedLocation(payload, true) : null;
    if (!location) return json({ error: "valid marker location required" }, 400);
    const updatedAt = new Date().toISOString();
    await runtime.DB.prepare(
      "UPDATE place_registration_requests SET marker_x = ?, marker_y = ?, updated_at = ?, reviewed_by = ? WHERE id = ?",
    ).bind(location.markerX, location.markerY, updatedAt, currentEmail, id).run();
    return json({ request: { ...existing, ...location, updatedAt } });
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
  if (existing.status !== "reviewing") return json({ error: "request review must start before approval" }, 409);
  const fields = (payload ? validatedFields(payload) : null)
    ?? validatedFields(existing as unknown as Record<string, unknown>);
  if (!fields) return json({ error: "request must be corrected before approval" }, 400);
  const location = (payload ? validatedLocation(payload) : undefined)
    ?? (existing.markerX !== null && existing.markerY !== null ? { markerX: existing.markerX, markerY: existing.markerY } : null);
  if (!location) return json({ error: "marker location required before approval" }, 400);
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
       VALUES (?, ?, ?, ?, ?, ?, '관리자 검수 승인', ?, '', ?, '', '', ?, ?, ?)`,
    ).bind(
      directoryId, fields.name, fields.category, fields.area, fields.address, categorySubtype(fields.category),
      fields.description, "공개 지도 장소 등록 요청에서 승인됨", reviewedAt.slice(0, 10), reviewedAt, currentEmail,
    ),
    runtime.DB.prepare(
      `INSERT INTO place_directory_revision (id, updated_at, updated_by) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    ).bind(reviewedAt, currentEmail),
    runtime.DB.prepare(
      `UPDATE place_registration_requests SET name = ?, area = ?, address = ?, description = ?, category = ?, marker_style = ?,
       marker_x = ?, marker_y = ?, status = 'approved', directory_id = ?, rejection_note = '',
       updated_at = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?`,
    ).bind(
      fields.name, fields.area, fields.address, fields.description, fields.category, fields.markerStyle,
      location.markerX, location.markerY, directoryId, reviewedAt, reviewedAt, currentEmail, id,
    ),
  ]);
  return json({
    request: { ...existing, ...fields, ...location, status: "approved", directoryId, rejectionNote: "", updatedAt: reviewedAt, reviewedAt },
    directory: {
      id: directoryId, name: fields.name, category: fields.category, area: fields.area, address: fields.address,
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
