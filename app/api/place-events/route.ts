import { adminAccess, type AdminRuntimeEnv } from "../../admin-auth";

export const runtime = "edge";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const GLOBAL_PAGE_SIZE = 10;
const MAX_EVENTS_PER_PLACE = 60;
const MAX_PLACES_PER_EVENT = 20;
const MAX_PERIOD_MS = 366 * 24 * 60 * 60 * 1000;

type RuntimeEnv = AdminRuntimeEnv & {
  DB?: D1Database;
  BUCKET?: R2Bucket;
};

type EventPlace = {
  placeKey: string;
  placeName: string;
};

type EventRow = {
  id: string;
  placeKey: string;
  placeName: string;
  eventName: string;
  eventInfo: string;
  photoKey: string;
  photoContentType: string;
  photoSize: number;
  startsAt: string;
  endsAt: string;
  visibleFrom: string;
  visibleUntil: string;
  status: "active" | "hidden";
  createdAt: string;
  updatedAt: string;
};

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

function parsePlaces(form: FormData) {
  const rawEntry = form.get("places");
  const raw = cleanMultiline(rawEntry, 12000);
  let candidates: unknown[] = [];
  if (typeof rawEntry === "string") {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return null;
      candidates = parsed;
    } catch {
      return null;
    }
  } else {
    candidates = [{ placeKey: cleanText(form.get("placeKey"), 260), placeName: cleanText(form.get("placeName"), 120) }];
  }
  const places: EventPlace[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates.slice(0, MAX_PLACES_PER_EVENT)) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const placeKey = typeof record.placeKey === "string" ? record.placeKey.trim().slice(0, 260) : "";
    const placeName = typeof record.placeName === "string" ? record.placeName.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    if (!validPlaceKey(placeKey) || !placeName || seen.has(placeKey)) continue;
    seen.add(placeKey);
    places.push({ placeKey, placeName });
  }
  return candidates.length === 0 ? [] : places.length ? places : null;
}

async function publishedPlacesExist(db: D1Database, places: EventPlace[]) {
  const row = await db.prepare("SELECT document_json AS documentJson FROM public_map_layout WHERE id = 1").first() as { documentJson?: string } | null;
  if (!row?.documentJson) return false;
  try {
    const document = JSON.parse(row.documentJson) as { elements?: Array<{ id?: unknown; directoryId?: unknown; name?: unknown; mapVisible?: unknown }> };
    if (!Array.isArray(document.elements)) return false;
    const published = new Map<string, string>();
    document.elements.forEach((element) => {
      if (element.mapVisible === false || typeof element.name !== "string") return;
      const key = typeof element.directoryId === "string" && element.directoryId.trim()
        ? `directory:${element.directoryId.trim()}`
        : typeof element.id === "string" ? `element:${element.id}` : "";
      if (key) published.set(key, element.name.trim());
    });
    return places.every((place) => published.get(place.placeKey) === place.placeName);
  } catch {
    return false;
  }
}

async function placesForRows(db: D1Database, rows: EventRow[]) {
  const byEvent = new Map<string, EventPlace[]>();
  if (rows.length) {
    const placeholders = rows.map(() => "?").join(", ");
    const result = await db.prepare(
      `SELECT event_id AS eventId, place_key AS placeKey, place_name AS placeName
       FROM place_event_places WHERE event_id IN (${placeholders}) ORDER BY event_id, position, place_name`,
    ).bind(...rows.map((row) => row.id)).all() as { results?: Array<{ eventId: string; placeKey: string; placeName: string }> };
    for (const relation of result.results ?? []) {
      const places = byEvent.get(relation.eventId) ?? [];
      places.push({ placeKey: relation.placeKey, placeName: relation.placeName });
      byEvent.set(relation.eventId, places);
    }
  }
  return byEvent;
}

function publicEvent(row: EventRow, places: EventPlace[], now: string) {
  const normalizedPlaces = places.length
    ? places
    : validPlaceKey(row.placeKey) && row.placeName ? [{ placeKey: row.placeKey, placeName: row.placeName }] : [];
  const isVisible = row.status === "active" && row.visibleFrom <= now && row.visibleUntil > now;
  return {
    id: row.id,
    placeKey: normalizedPlaces[0]?.placeKey ?? "",
    placeName: normalizedPlaces[0]?.placeName ?? "",
    places: normalizedPlaces,
    eventName: row.eventName,
    eventInfo: row.eventInfo,
    photoUrl: `/api/place-event-photo?id=${encodeURIComponent(row.id)}`,
    startsAt: row.startsAt || row.visibleFrom,
    endsAt: row.endsAt || row.visibleUntil,
    visibleFrom: row.visibleFrom,
    visibleUntil: row.visibleUntil,
    status: row.status,
    isVisible,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const EVENT_SELECT = `SELECT e.id, e.place_key AS placeKey, e.place_name AS placeName,
  e.event_name AS eventName, e.event_info AS eventInfo, e.photo_key AS photoKey,
  e.photo_content_type AS photoContentType, e.photo_size AS photoSize,
  COALESCE(NULLIF(e.starts_at, ''), e.visible_from) AS startsAt,
  COALESCE(NULLIF(e.ends_at, ''), e.visible_until) AS endsAt,
  e.visible_from AS visibleFrom, e.visible_until AS visibleUntil, e.status,
  e.created_at AS createdAt, e.updated_at AS updatedAt
 FROM place_events e`;

async function eventPayload(db: D1Database, rows: EventRow[], now: string) {
  const relations = await placesForRows(db, rows);
  return rows.map((row) => publicEvent(row, relations.get(row.id) ?? [], now));
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  const { canManage } = ownerAccess(request, runtime);
  if (!runtime.DB) return json({ events: [], canManage, persistent: false }, 503);
  const searchParams = new URL(request.url).searchParams;
  const scope = searchParams.get("scope")?.trim();
  const placeKey = searchParams.get("placeKey")?.trim() ?? "";
  const now = new Date().toISOString();

  if (scope === "place-index") {
    const where = canManage ? "1 = 1" : "e.status = 'active' AND e.visible_from <= ? AND e.visible_until > ?";
    const query = runtime.DB.prepare(
      `SELECT DISTINCT ep.place_key AS placeKey, ep.place_name AS placeName
       FROM place_event_places ep
       INNER JOIN place_events e ON e.id = ep.event_id
       WHERE ${where}
       ORDER BY ep.place_name, ep.place_key`,
    );
    const result = (canManage ? await query.all() : await query.bind(now, now).all()) as { results?: EventPlace[] };
    return json({ linkedPlaces: result.results ?? [], canManage, persistent: true });
  }

  if (scope === "all") {
    const where = canManage ? "1 = 1" : "e.status = 'active' AND e.visible_from <= ? AND e.visible_until > ?";
    const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const countStatement = runtime.DB.prepare(`SELECT COUNT(*) AS count FROM place_events e WHERE ${where}`);
    const pageStatement = runtime.DB.prepare(`${EVENT_SELECT} WHERE ${where} ORDER BY e.created_at DESC, e.id DESC LIMIT ? OFFSET ?`);
    const requestedOffset = (page - 1) * GLOBAL_PAGE_SIZE;
    const [countResult, pageResult] = await runtime.DB.batch(canManage
      ? [countStatement, pageStatement.bind(GLOBAL_PAGE_SIZE, requestedOffset)]
      : [countStatement.bind(now, now), pageStatement.bind(now, now, GLOBAL_PAGE_SIZE, requestedOffset)]) as unknown as [
        { results?: Array<{ count?: number }> },
        { results?: EventRow[] },
      ];
    const countRow = countResult.results?.[0] ?? null;
    const total = Number(countRow?.count ?? 0);
    const pageCount = Math.ceil(total / GLOBAL_PAGE_SIZE);
    const normalizedPage = pageCount > 0 ? Math.min(page, pageCount) : 1;
    let rows = pageResult.results ?? [];
    if (normalizedPage !== page) {
      const normalizedStatement = runtime.DB.prepare(`${EVENT_SELECT} WHERE ${where} ORDER BY e.created_at DESC, e.id DESC LIMIT ? OFFSET ?`);
      const normalizedResult = (canManage
        ? await normalizedStatement.bind(GLOBAL_PAGE_SIZE, (normalizedPage - 1) * GLOBAL_PAGE_SIZE).all()
        : await normalizedStatement.bind(now, now, GLOBAL_PAGE_SIZE, (normalizedPage - 1) * GLOBAL_PAGE_SIZE).all()) as { results?: EventRow[] };
      rows = normalizedResult.results ?? [];
    }
    return json({
      events: await eventPayload(runtime.DB, rows, now),
      canManage,
      persistent: true,
      page: normalizedPage,
      pageSize: GLOBAL_PAGE_SIZE,
      pageCount,
      total,
    });
  }

  if (!validPlaceKey(placeKey)) return json({ error: "valid place key required" }, 400);
  const visibility = canManage ? "1 = 1" : "e.status = 'active' AND e.visible_from <= ? AND e.visible_until > ?";
  const where = `(${visibility}) AND EXISTS (
    SELECT 1 FROM place_event_places ep WHERE ep.event_id = e.id AND ep.place_key = ?
  )`;
  const query = runtime.DB.prepare(`${EVENT_SELECT} WHERE ${where} ORDER BY e.created_at DESC LIMIT ?`);
  const result = (canManage
    ? await query.bind(placeKey, MAX_EVENTS_PER_PLACE).all()
    : await query.bind(now, now, placeKey, MAX_EVENTS_PER_PLACE).all()) as { results?: EventRow[] };
  const rows = result.results ?? [];
  return json({ events: await eventPayload(runtime.DB, rows, now), canManage, persistent: true });
}

export async function POST(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB || !runtime.BUCKET) return json({ error: "storage unavailable" }, 503);
  const { canManage, currentEmail } = ownerAccess(request, runtime);
  if (!canManage || !currentEmail) return json({ error: "owner authentication required" }, 403);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PHOTO_BYTES + 128 * 1024) return json({ error: "upload too large" }, 413);
  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "multipart form required" }, 400);

  const places = parsePlaces(form);
  const eventName = cleanText(form.get("eventName"), 100);
  const eventInfo = cleanMultiline(form.get("eventInfo"), 1200);
  const startsAt = validIsoDate(cleanText(form.get("startsAt"), 60));
  const endsAt = validIsoDate(cleanText(form.get("endsAt"), 60));
  const visibleFrom = validIsoDate(cleanText(form.get("visibleFrom"), 60));
  const visibleUntil = validIsoDate(cleanText(form.get("visibleUntil"), 60));
  if (places === null || eventName.length < 2 || eventInfo.length < 2 || !startsAt || !endsAt || endsAt <= startsAt || !visibleFrom || !visibleUntil || visibleUntil <= visibleFrom) {
    return json({ error: "valid event, information, schedule, optional places, and visibility period required" }, 400);
  }
  if (Date.parse(endsAt) - Date.parse(startsAt) > MAX_PERIOD_MS) return json({ error: "event period too long" }, 400);
  if (Date.parse(visibleUntil) - Date.parse(visibleFrom) > MAX_PERIOD_MS) return json({ error: "visibility period too long" }, 400);

  if (places.length && !await publishedPlacesExist(runtime.DB, places)) return json({ error: "published place not found" }, 404);

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size < 1) return json({ error: "event photo required" }, 400);
  if (photo.size > MAX_PHOTO_BYTES) return json({ error: "photo too large" }, 413);
  const buffer = await photo.arrayBuffer();
  const format = photoFormat(new Uint8Array(buffer.slice(0, 16)));
  if (!format) return json({ error: "unsupported photo type" }, 415);

  const id = crypto.randomUUID();
  const photoKey = `place-events/${id}.${format.extension}`;
  const createdAt = new Date().toISOString();
  const primaryPlace = places[0] ?? { placeKey: "", placeName: "" };
  await runtime.BUCKET.put(photoKey, buffer, {
    httpMetadata: { contentType: format.contentType },
    customMetadata: { placeKey: primaryPlace.placeKey, placeName: primaryPlace.placeName, eventName, uploadedAt: createdAt },
  });
  try {
    await runtime.DB.batch([
      runtime.DB.prepare(
        `INSERT INTO place_events
          (id, place_key, place_name, event_name, event_info, photo_key, photo_content_type,
           photo_size, starts_at, ends_at, visible_from, visible_until, status, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      ).bind(id, primaryPlace.placeKey, primaryPlace.placeName, eventName, eventInfo, photoKey, format.contentType, buffer.byteLength, startsAt, endsAt, visibleFrom, visibleUntil, createdAt, createdAt, currentEmail),
      ...places.map((place, index) => runtime.DB!.prepare(
        "INSERT INTO place_event_places (event_id, place_key, place_name, position) VALUES (?, ?, ?, ?)",
      ).bind(id, place.placeKey, place.placeName, index)),
    ]);
  } catch (error) {
    await runtime.BUCKET.delete(photoKey).catch(() => undefined);
    throw error;
  }
  const row: EventRow = { id, placeKey: primaryPlace.placeKey, placeName: primaryPlace.placeName, eventName, eventInfo, photoKey, photoContentType: format.contentType, photoSize: buffer.byteLength, startsAt, endsAt, visibleFrom, visibleUntil, status: "active", createdAt, updatedAt: createdAt };
  return json({ event: publicEvent(row, places, createdAt), persistent: true }, 201);
}

export async function PATCH(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const { canManage, currentEmail } = ownerAccess(request, runtime);
  if (!canManage || !currentEmail) return json({ error: "owner authentication required" }, 403);
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    const payload = await request.json().catch(() => null) as { id?: unknown; status?: unknown } | null;
    const id = typeof payload?.id === "string" ? payload.id : "";
    const status = payload?.status === "active" || payload?.status === "hidden" ? payload.status : null;
    if (!id || !status) return json({ error: "valid event and status required" }, 400);
    const updatedAt = new Date().toISOString();
    const result = await runtime.DB.prepare(
      "UPDATE place_events SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?",
    ).bind(status, updatedAt, currentEmail, id).run();
    if (!result.meta.changes) return json({ error: "event not found" }, 404);
    return json({ id, status, updatedAt });
  }

  if (!runtime.BUCKET) return json({ error: "storage unavailable" }, 503);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PHOTO_BYTES + 128 * 1024) return json({ error: "upload too large" }, 413);
  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "multipart form required" }, 400);
  const id = cleanText(form.get("id"), 120);
  const places = parsePlaces(form);
  const eventName = cleanText(form.get("eventName"), 100);
  const eventInfo = cleanMultiline(form.get("eventInfo"), 1200);
  const startsAt = validIsoDate(cleanText(form.get("startsAt"), 60));
  const endsAt = validIsoDate(cleanText(form.get("endsAt"), 60));
  const visibleFrom = validIsoDate(cleanText(form.get("visibleFrom"), 60));
  const visibleUntil = validIsoDate(cleanText(form.get("visibleUntil"), 60));
  if (!id || places === null || eventName.length < 2 || eventInfo.length < 2 || !startsAt || !endsAt || endsAt <= startsAt || !visibleFrom || !visibleUntil || visibleUntil <= visibleFrom) {
    return json({ error: "valid event edit required" }, 400);
  }
  if (Date.parse(endsAt) - Date.parse(startsAt) > MAX_PERIOD_MS) return json({ error: "event period too long" }, 400);
  if (Date.parse(visibleUntil) - Date.parse(visibleFrom) > MAX_PERIOD_MS) return json({ error: "visibility period too long" }, 400);
  if (places.length && !await publishedPlacesExist(runtime.DB, places)) return json({ error: "published place not found" }, 404);

  const existing = await runtime.DB.prepare(`${EVENT_SELECT} WHERE e.id = ?`).bind(id).first() as EventRow | null;
  if (!existing) return json({ error: "event not found" }, 404);
  const photo = form.get("photo");
  let nextPhotoKey = existing.photoKey;
  let nextPhotoContentType = existing.photoContentType;
  let nextPhotoSize = existing.photoSize;
  let uploadedPhotoKey: string | null = null;
  const primaryPlace = places[0] ?? { placeKey: "", placeName: "" };
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_PHOTO_BYTES) return json({ error: "photo too large" }, 413);
    const buffer = await photo.arrayBuffer();
    const format = photoFormat(new Uint8Array(buffer.slice(0, 16)));
    if (!format) return json({ error: "unsupported photo type" }, 415);
    uploadedPhotoKey = `place-events/${id}-${crypto.randomUUID()}.${format.extension}`;
    await runtime.BUCKET.put(uploadedPhotoKey, buffer, {
      httpMetadata: { contentType: format.contentType },
      customMetadata: { placeKey: primaryPlace.placeKey, placeName: primaryPlace.placeName, eventName, uploadedAt: new Date().toISOString() },
    });
    nextPhotoKey = uploadedPhotoKey;
    nextPhotoContentType = format.contentType;
    nextPhotoSize = buffer.byteLength;
  }

  const updatedAt = new Date().toISOString();
  try {
    await runtime.DB.batch([
      runtime.DB.prepare(
        `UPDATE place_events SET place_key = ?, place_name = ?, event_name = ?, event_info = ?,
          photo_key = ?, photo_content_type = ?, photo_size = ?, starts_at = ?, ends_at = ?, visible_from = ?, visible_until = ?,
          updated_at = ?, updated_by = ? WHERE id = ?`,
      ).bind(primaryPlace.placeKey, primaryPlace.placeName, eventName, eventInfo, nextPhotoKey, nextPhotoContentType, nextPhotoSize, startsAt, endsAt, visibleFrom, visibleUntil, updatedAt, currentEmail, id),
      runtime.DB.prepare("DELETE FROM place_event_places WHERE event_id = ?").bind(id),
      ...places.map((place, index) => runtime.DB!.prepare(
        "INSERT INTO place_event_places (event_id, place_key, place_name, position) VALUES (?, ?, ?, ?)",
      ).bind(id, place.placeKey, place.placeName, index)),
    ]);
  } catch (error) {
    if (uploadedPhotoKey) await runtime.BUCKET.delete(uploadedPhotoKey).catch(() => undefined);
    throw error;
  }
  if (uploadedPhotoKey && existing.photoKey !== uploadedPhotoKey) await runtime.BUCKET.delete(existing.photoKey).catch(() => undefined);
  const row: EventRow = { ...existing, placeKey: primaryPlace.placeKey, placeName: primaryPlace.placeName, eventName, eventInfo, photoKey: nextPhotoKey, photoContentType: nextPhotoContentType, photoSize: nextPhotoSize, startsAt, endsAt, visibleFrom, visibleUntil, updatedAt };
  return json({ event: publicEvent(row, places, updatedAt), persistent: true });
}

export async function DELETE(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB || !runtime.BUCKET) return json({ error: "storage unavailable" }, 503);
  const { canManage } = ownerAccess(request, runtime);
  if (!canManage) return json({ error: "owner authentication required" }, 403);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return json({ error: "event id required" }, 400);
  const row = await runtime.DB.prepare("SELECT photo_key AS photoKey FROM place_events WHERE id = ?").bind(id).first() as { photoKey: string } | null;
  if (!row) return json({ error: "event not found" }, 404);
  await runtime.BUCKET.delete(row.photoKey).catch(() => undefined);
  await runtime.DB.batch([
    runtime.DB.prepare("DELETE FROM place_event_places WHERE event_id = ?").bind(id),
    runtime.DB.prepare("DELETE FROM place_events WHERE id = ?").bind(id),
  ]);
  return json({ deleted: true, id });
}
