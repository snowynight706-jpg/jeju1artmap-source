import { adminAccess, type AdminRuntimeEnv } from "../../admin-auth";

export const runtime = "edge";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_STORIES_PER_PLACE = 80;
const GLOBAL_PAGE_SIZE = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_COUNT = 3;

type RuntimeEnv = AdminRuntimeEnv & {
  DB?: D1Database;
  BUCKET?: R2Bucket;
};

type StoryRow = {
  id: string;
  placeKey: string;
  placeName: string;
  authorName: string;
  reviewText: string;
  photoKey: string | null;
  photoContentType: string | null;
  status: "published" | "hidden";
  createdAt: string;
  updatedAt: string;
};

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS place_stories (
  id TEXT PRIMARY KEY NOT NULL,
  place_key TEXT NOT NULL,
  place_name TEXT NOT NULL,
  author_name TEXT NOT NULL,
  review_text TEXT NOT NULL,
  photo_key TEXT,
  photo_content_type TEXT,
  photo_size INTEGER,
  status TEXT NOT NULL,
  actor_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  moderated_by TEXT
)`;

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
  return { canModerate: access.allowed, currentEmail: access.actor };
}

async function ensureStorage(db: D1Database) {
  if (!storageReady) {
    storageReady = db.batch([
      db.prepare(TABLE_SQL),
      db.prepare("CREATE INDEX IF NOT EXISTS place_stories_place_status_created_idx ON place_stories (place_key, status, created_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS place_stories_actor_created_idx ON place_stories (actor_hash, created_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS place_stories_status_created_idx ON place_stories (status, created_at)"),
    ]).then(() => undefined).catch((error) => {
      storageReady = null;
      throw error;
    });
  }
  await storageReady;
}

function cleanText(value: FormDataEntryValue | null, maximum: number) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum)
    : "";
}

function validPlaceKey(value: string) {
  return value.length >= 3 && value.length <= 260 && /^(directory|element):[^\s]{1,240}$/.test(value);
}

function photoFormat(bytes: Uint8Array) {
  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { contentType: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 12 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { contentType: "image/png", extension: "png" };
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return { contentType: "image/webp", extension: "webp" };
  return null;
}

async function actorHash(request: Request, visitorId: string) {
  const source = [
    "jeju-wondosim-place-story-v1",
    visitorId,
    request.headers.get("cf-connecting-ip") ?? "unknown-ip",
    request.headers.get("user-agent") ?? "unknown-agent",
  ].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function publishedPlaceExists(db: D1Database, placeKey: string, placeName: string) {
  const row = await db.prepare("SELECT document_json AS documentJson FROM public_map_layout WHERE id = 1").first() as { documentJson?: string } | null;
  if (!row?.documentJson) return false;
  try {
    const document = JSON.parse(row.documentJson) as { elements?: Array<{ id?: unknown; directoryId?: unknown; name?: unknown; mapVisible?: unknown }> };
    return Array.isArray(document.elements) && document.elements.some((element) => {
      const key = typeof element.directoryId === "string" && element.directoryId.trim()
        ? `directory:${element.directoryId.trim()}`
        : typeof element.id === "string" ? `element:${element.id}` : "";
      return key === placeKey && element.mapVisible !== false && typeof element.name === "string" && element.name.trim() === placeName;
    });
  } catch {
    return false;
  }
}

function publicStory(row: StoryRow) {
  return {
    id: row.id,
    placeKey: row.placeKey,
    placeName: row.placeName,
    authorName: row.authorName,
    reviewText: row.reviewText,
    photoUrl: row.photoKey ? `/api/place-story-photo?id=${encodeURIComponent(row.id)}` : null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  const { canModerate } = ownerAccess(request, runtime);
  if (!runtime.DB) return json({ stories: [], canModerate, persistent: false }, 503);
  const searchParams = new URL(request.url).searchParams;
  const scope = searchParams.get("scope")?.trim();
  const placeKey = searchParams.get("placeKey")?.trim() ?? "";
  await ensureStorage(runtime.DB);
  if (scope === "all") {
    const visibleStatuses = canModerate ? "status IN ('published', 'hidden')" : "status = 'published'";
    const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const countRow = await runtime.DB.prepare(
      `SELECT COUNT(*) AS count FROM place_stories WHERE ${visibleStatuses}`,
    ).first() as { count?: number } | null;
    const total = Number(countRow?.count ?? 0);
    const pageCount = Math.ceil(total / GLOBAL_PAGE_SIZE);
    const normalizedPage = pageCount > 0 ? Math.min(page, pageCount) : 1;
    const result = await runtime.DB.prepare(
      `SELECT id, place_key AS placeKey, place_name AS placeName, author_name AS authorName,
        review_text AS reviewText, photo_key AS photoKey, photo_content_type AS photoContentType,
        status, created_at AS createdAt, updated_at AS updatedAt
       FROM place_stories WHERE ${visibleStatuses}
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    ).bind(GLOBAL_PAGE_SIZE, (normalizedPage - 1) * GLOBAL_PAGE_SIZE).all() as { results?: StoryRow[] };
    return json({
      stories: (result.results ?? []).map(publicStory),
      canModerate,
      persistent: true,
      page: normalizedPage,
      pageSize: GLOBAL_PAGE_SIZE,
      pageCount,
      total,
    });
  }
  if (!validPlaceKey(placeKey)) return json({ error: "valid place key required" }, 400);
  const query = canModerate
    ? `SELECT id, place_key AS placeKey, place_name AS placeName, author_name AS authorName,
        review_text AS reviewText, photo_key AS photoKey, photo_content_type AS photoContentType,
        status, created_at AS createdAt, updated_at AS updatedAt
       FROM place_stories WHERE place_key = ? AND status IN ('published', 'hidden')
       ORDER BY created_at DESC LIMIT ?`
    : `SELECT id, place_key AS placeKey, place_name AS placeName, author_name AS authorName,
        review_text AS reviewText, photo_key AS photoKey, photo_content_type AS photoContentType,
        status, created_at AS createdAt, updated_at AS updatedAt
       FROM place_stories WHERE place_key = ? AND status = 'published'
       ORDER BY created_at DESC LIMIT ?`;
  const result = await runtime.DB.prepare(query).bind(placeKey, MAX_STORIES_PER_PLACE).all() as { results?: StoryRow[] };
  return json({ stories: (result.results ?? []).map(publicStory), canModerate, persistent: true });
}

export async function POST(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB || !runtime.BUCKET) return json({ error: "storage unavailable" }, 503);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PHOTO_BYTES + 64 * 1024) return json({ error: "upload too large" }, 413);
  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "multipart form required" }, 400);

  const placeKey = cleanText(form.get("placeKey"), 260);
  const placeName = cleanText(form.get("placeName"), 120);
  const authorName = cleanText(form.get("authorName"), 20);
  const reviewText = cleanText(form.get("reviewText"), 220);
  const visitorId = cleanText(form.get("visitorId"), 100);
  if (!validPlaceKey(placeKey) || !placeName || authorName.length < 1 || reviewText.length < 2 || !/^[a-zA-Z0-9_-]{24,100}$/.test(visitorId)) {
    return json({ error: "valid place, nickname, review, and visitor id required" }, 400);
  }

  await ensureStorage(runtime.DB);
  if (!await publishedPlaceExists(runtime.DB, placeKey, placeName)) return json({ error: "published place not found" }, 404);
  const hash = await actorHash(request, visitorId);
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const recent = await runtime.DB.prepare(
    "SELECT COUNT(*) AS count FROM place_stories WHERE actor_hash = ? AND created_at >= ?",
  ).bind(hash, windowStart).first() as { count: number } | null;
  if (Number(recent?.count ?? 0) >= RATE_LIMIT_COUNT) return json({ error: "too many recent submissions" }, 429);

  const id = crypto.randomUUID();
  const photo = form.get("photo");
  let photoKey: string | null = null;
  let photoContentType: string | null = null;
  let photoSize: number | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_PHOTO_BYTES) return json({ error: "photo too large" }, 413);
    const buffer = await photo.arrayBuffer();
    const format = photoFormat(new Uint8Array(buffer.slice(0, 16)));
    if (!format) return json({ error: "unsupported photo type" }, 415);
    photoKey = `place-stories/${id}.${format.extension}`;
    photoContentType = format.contentType;
    photoSize = buffer.byteLength;
    await runtime.BUCKET.put(photoKey, buffer, {
      httpMetadata: { contentType: format.contentType },
      customMetadata: { placeKey, placeName, uploadedAt: new Date().toISOString() },
    });
  }

  const createdAt = new Date().toISOString();
  try {
    await runtime.DB.prepare(
      `INSERT INTO place_stories
        (id, place_key, place_name, author_name, review_text, photo_key, photo_content_type,
         photo_size, status, actor_hash, created_at, updated_at, moderated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, NULL)`,
    ).bind(id, placeKey, placeName, authorName, reviewText, photoKey, photoContentType, photoSize, hash, createdAt, createdAt).run();
  } catch (error) {
    if (photoKey) await runtime.BUCKET.delete(photoKey).catch(() => undefined);
    throw error;
  }
  const row: StoryRow = { id, placeKey, placeName, authorName, reviewText, photoKey, photoContentType, status: "published", createdAt, updatedAt: createdAt };
  return json({ story: publicStory(row), persistent: true }, 201);
}

export async function PATCH(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const { canModerate, currentEmail } = ownerAccess(request, runtime);
  if (!canModerate || !currentEmail) return json({ error: "owner authentication required" }, 403);
  const payload = await request.json().catch(() => null) as { id?: unknown; status?: unknown } | null;
  const id = typeof payload?.id === "string" ? payload.id : "";
  const status = payload?.status === "published" || payload?.status === "hidden" ? payload.status : null;
  if (!id || !status) return json({ error: "valid story and status required" }, 400);
  await ensureStorage(runtime.DB);
  const updatedAt = new Date().toISOString();
  const result = await runtime.DB.prepare(
    "UPDATE place_stories SET status = ?, updated_at = ?, moderated_by = ? WHERE id = ?",
  ).bind(status, updatedAt, currentEmail, id).run();
  if (!result.meta.changes) return json({ error: "story not found" }, 404);
  return json({ id, status, updatedAt });
}

export async function DELETE(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB || !runtime.BUCKET) return json({ error: "storage unavailable" }, 503);
  const { canModerate, currentEmail } = ownerAccess(request, runtime);
  if (!canModerate || !currentEmail) return json({ error: "owner authentication required" }, 403);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return json({ error: "story id required" }, 400);
  await ensureStorage(runtime.DB);
  const row = await runtime.DB.prepare("SELECT photo_key AS photoKey FROM place_stories WHERE id = ?").bind(id).first() as { photoKey: string | null } | null;
  if (!row) return json({ error: "story not found" }, 404);
  const moderatedAt = new Date().toISOString();
  await runtime.DB.prepare(
    "UPDATE place_stories SET status = 'hidden', updated_at = ?, moderated_by = ? WHERE id = ?",
  ).bind(moderatedAt, currentEmail, id).run();
  try {
    if (row.photoKey) await runtime.BUCKET.delete(row.photoKey);
    await runtime.DB.prepare("DELETE FROM place_stories WHERE id = ?").bind(id).run();
  } catch {
    return json({ error: "story cleanup failed", hidden: true, id }, 500);
  }
  return json({ deleted: true, id });
}
