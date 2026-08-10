export const runtime = "edge";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const GLOBAL_PAGE_SIZE = 10;
const MAX_EVENTS_PER_PLACE = 60;

type RuntimeEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  BASE_MAP_OWNER_EMAIL?: string;
};

type EventRow = {
  id: string;
  placeKey: string;
  placeName: string;
  eventName: string;
  eventInfo: string;
  photoKey: string;
  photoContentType: string;
  visibleFrom: string;
  visibleUntil: string;
  status: "active" | "hidden";
  createdAt: string;
  updatedAt: string;
};

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS place_events (
  id TEXT PRIMARY KEY NOT NULL,
  place_key TEXT NOT NULL,
  place_name TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_info TEXT NOT NULL,
  photo_key TEXT NOT NULL,
  photo_content_type TEXT NOT NULL,
  photo_size INTEGER NOT NULL,
  visible_from TEXT NOT NULL,
  visible_until TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
)`;

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
    db.prepare("CREATE INDEX IF NOT EXISTS place_events_place_status_visibility_idx ON place_events (place_key, status, visible_from, visible_until)"),
    db.prepare("CREATE INDEX IF NOT EXISTS place_events_status_visibility_created_idx ON place_events (status, visible_from, visible_until, created_at)"),
  ]);
}

function cleanText(value: FormDataEntryValue | null, maximum: number) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum)
    : "";
}

function cleanMultiline(value: FormDataEntryValue | null, maximum: number) {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, maximum)
    : "";
}

function validPlaceKey(value: string) {
  return value.length >= 3 && value.length <= 260 && /^(directory|element):[^\s]{1,240}$/.test(value);
}

function validIsoDate(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function photoFormat(bytes: Uint8Array) {
  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { contentType: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 12 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { contentType: "image/png", extension: "png" };
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return { contentType: "image/webp", extension: "webp" };
  return null;
}

async function publishedPlaceExists(db: D1Database, placeKey: string, placeName: string) {
  const row = await db.prepare("SELECT document_json AS documentJson FROM public_map_layout WHERE id = 1").first() as { documentJson?: string } | null;
  if (!row?.documentJson) return false;
  try {
    const document = JSON.parse(row.documentJson) as { elements?: Array<{ id?: unknown; directoryId?: unknown; name?: unknown; category?: unknown; mapVisible?: unknown }> };
    return Array.isArray(document.elements) && document.elements.some((element) => {
      const key = typeof element.directoryId === "string" && element.directoryId.trim()
        ? `directory:${element.directoryId.trim()}`
        : typeof element.id === "string" ? `element:${element.id}` : "";
      return key === placeKey
        && element.mapVisible !== false
        && typeof element.name === "string"
        && element.name.trim() === placeName;
    });
  } catch {
    return false;
  }
}

function publicEvent(row: EventRow, now: string) {
  const isVisible = row.status === "active" && row.visibleFrom <= now && row.visibleUntil > now;
  return {
    id: row.id,
    placeKey: row.placeKey,
    placeName: row.placeName,
    eventName: row.eventName,
    eventInfo: row.eventInfo,
    photoUrl: `/api/place-event-photo?id=${encodeURIComponent(row.id)}`,
    visibleFrom: row.visibleFrom,
    visibleUntil: row.visibleUntil,
    status: row.status,
    isVisible,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const EVENT_SELECT = `SELECT id, place_key AS placeKey, place_name AS placeName,
  event_name AS eventName, event_info AS eventInfo, photo_key AS photoKey,
  photo_content_type AS photoContentType, visible_from AS visibleFrom,
  visible_until AS visibleUntil, status, created_at AS createdAt, updated_at AS updatedAt
 FROM place_events`;

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  const { canManage } = ownerAccess(request, runtime);
  if (!runtime.DB) return json({ events: [], canManage, persistent: false }, 503);
  await ensureStorage(runtime.DB);
  const searchParams = new URL(request.url).searchParams;
  const scope = searchParams.get("scope")?.trim();
  const placeKey = searchParams.get("placeKey")?.trim() ?? "";
  const now = new Date().toISOString();

  if (scope === "all") {
    const where = canManage ? "1 = 1" : "status = 'active' AND visible_from <= ? AND visible_until > ?";
    const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const countStatement = runtime.DB.prepare(`SELECT COUNT(*) AS count FROM place_events WHERE ${where}`);
    const countRow = (canManage ? await countStatement.first() : await countStatement.bind(now, now).first()) as { count?: number } | null;
    const total = Number(countRow?.count ?? 0);
    const pageCount = Math.ceil(total / GLOBAL_PAGE_SIZE);
    const normalizedPage = pageCount > 0 ? Math.min(page, pageCount) : 1;
    const query = runtime.DB.prepare(`${EVENT_SELECT} WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`);
    const result = (canManage
      ? await query.bind(GLOBAL_PAGE_SIZE, (normalizedPage - 1) * GLOBAL_PAGE_SIZE).all()
      : await query.bind(now, now, GLOBAL_PAGE_SIZE, (normalizedPage - 1) * GLOBAL_PAGE_SIZE).all()) as { results?: EventRow[] };
    return json({
      events: (result.results ?? []).map((row) => publicEvent(row, now)),
      canManage,
      persistent: true,
      page: normalizedPage,
      pageSize: GLOBAL_PAGE_SIZE,
      pageCount,
      total,
    });
  }

  if (!validPlaceKey(placeKey)) return json({ error: "valid place key required" }, 400);
  const where = canManage
    ? "place_key = ?"
    : "place_key = ? AND status = 'active' AND visible_from <= ? AND visible_until > ?";
  const query = runtime.DB.prepare(`${EVENT_SELECT} WHERE ${where} ORDER BY created_at DESC LIMIT ?`);
  const result = (canManage
    ? await query.bind(placeKey, MAX_EVENTS_PER_PLACE).all()
    : await query.bind(placeKey, now, now, MAX_EVENTS_PER_PLACE).all()) as { results?: EventRow[] };
  return json({ events: (result.results ?? []).map((row) => publicEvent(row, now)), canManage, persistent: true });
}

export async function POST(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB || !runtime.BUCKET) return json({ error: "storage unavailable" }, 503);
  const { canManage, currentEmail } = ownerAccess(request, runtime);
  if (!canManage || !currentEmail) return json({ error: "owner authentication required" }, 403);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PHOTO_BYTES + 96 * 1024) return json({ error: "upload too large" }, 413);
  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "multipart form required" }, 400);

  const placeKey = cleanText(form.get("placeKey"), 260);
  const placeName = cleanText(form.get("placeName"), 120);
  const eventName = cleanText(form.get("eventName"), 100);
  const eventInfo = cleanMultiline(form.get("eventInfo"), 1200);
  const visibleFrom = validIsoDate(cleanText(form.get("visibleFrom"), 60));
  const visibleUntil = validIsoDate(cleanText(form.get("visibleUntil"), 60));
  if (!validPlaceKey(placeKey) || !placeName || eventName.length < 2 || eventInfo.length < 2 || !visibleFrom || !visibleUntil || visibleUntil <= visibleFrom) {
    return json({ error: "valid cultural place, event, information, and visibility period required" }, 400);
  }
  if (Date.parse(visibleUntil) - Date.parse(visibleFrom) > 366 * 24 * 60 * 60 * 1000) return json({ error: "visibility period too long" }, 400);

  await ensureStorage(runtime.DB);
  if (!await publishedPlaceExists(runtime.DB, placeKey, placeName)) return json({ error: "published place not found" }, 404);

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size < 1) return json({ error: "event photo required" }, 400);
  if (photo.size > MAX_PHOTO_BYTES) return json({ error: "photo too large" }, 413);
  const buffer = await photo.arrayBuffer();
  const format = photoFormat(new Uint8Array(buffer.slice(0, 16)));
  if (!format) return json({ error: "unsupported photo type" }, 415);

  const id = crypto.randomUUID();
  const photoKey = `place-events/${id}.${format.extension}`;
  const createdAt = new Date().toISOString();
  await runtime.BUCKET.put(photoKey, buffer, {
    httpMetadata: { contentType: format.contentType },
    customMetadata: { placeKey, placeName, eventName, uploadedAt: createdAt },
  });
  try {
    await runtime.DB.prepare(
      `INSERT INTO place_events
        (id, place_key, place_name, event_name, event_info, photo_key, photo_content_type,
         photo_size, visible_from, visible_until, status, created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    ).bind(id, placeKey, placeName, eventName, eventInfo, photoKey, format.contentType, buffer.byteLength, visibleFrom, visibleUntil, createdAt, createdAt, currentEmail).run();
  } catch (error) {
    await runtime.BUCKET.delete(photoKey).catch(() => undefined);
    throw error;
  }
  const row: EventRow = { id, placeKey, placeName, eventName, eventInfo, photoKey, photoContentType: format.contentType, visibleFrom, visibleUntil, status: "active", createdAt, updatedAt: createdAt };
  return json({ event: publicEvent(row, createdAt), persistent: true }, 201);
}

export async function PATCH(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const { canManage, currentEmail } = ownerAccess(request, runtime);
  if (!canManage || !currentEmail) return json({ error: "owner authentication required" }, 403);
  const payload = await request.json().catch(() => null) as { id?: unknown; status?: unknown } | null;
  const id = typeof payload?.id === "string" ? payload.id : "";
  const status = payload?.status === "active" || payload?.status === "hidden" ? payload.status : null;
  if (!id || !status) return json({ error: "valid event and status required" }, 400);
  await ensureStorage(runtime.DB);
  const updatedAt = new Date().toISOString();
  const result = await runtime.DB.prepare(
    "UPDATE place_events SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?",
  ).bind(status, updatedAt, currentEmail, id).run();
  if (!result.meta.changes) return json({ error: "event not found" }, 404);
  return json({ id, status, updatedAt });
}

export async function DELETE(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB || !runtime.BUCKET) return json({ error: "storage unavailable" }, 503);
  const { canManage } = ownerAccess(request, runtime);
  if (!canManage) return json({ error: "owner authentication required" }, 403);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return json({ error: "event id required" }, 400);
  await ensureStorage(runtime.DB);
  const row = await runtime.DB.prepare("SELECT photo_key AS photoKey FROM place_events WHERE id = ?").bind(id).first() as { photoKey: string } | null;
  if (!row) return json({ error: "event not found" }, 404);
  await runtime.BUCKET.delete(row.photoKey).catch(() => undefined);
  await runtime.DB.prepare("DELETE FROM place_events WHERE id = ?").bind(id).run();
  return json({ deleted: true, id });
}
