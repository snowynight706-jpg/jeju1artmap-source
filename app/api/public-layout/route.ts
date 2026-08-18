import { adminAccess, type AdminRuntimeEnv } from "../../admin-auth";
import { readUploadedBaseMapMetadata } from "../../base-map-storage";
import { contentSummaryFromBatchResults } from "../../content-summary.mjs";
import { completeReviewStatuses } from "../../review-status.mjs";
import { stabilizeMainHubDocument } from "../../main-hub-persistence.mjs";

export const runtime = "edge";

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_ELEMENTS = 1200;
const MAX_ASSETS = 900;

type RuntimeEnv = AdminRuntimeEnv & {
  DB?: D1Database;
  BUCKET?: R2Bucket;
};

type PublicViewSettings = {
  baseMap: "svg" | "png" | "uploaded";
  markerLabelsVisible: boolean;
  mergeDenseLabels: boolean;
  screenRecommendedOnly: boolean;
};

type StoredLayout = {
  documentJson: string;
  viewSettingsJson: string;
  previousDocumentJson: string | null;
  previousViewSettingsJson: string | null;
  publishedAt: string;
  revision: number;
};

type StoredDraft = {
  documentJson: string;
  viewSettingsJson: string;
  previousDocumentJson: string | null;
  previousViewSettingsJson: string | null;
  updatedAt: string;
  revision: number;
};

async function runtimeEnv() {
  const workers = await import("cloudflare:workers");
  return workers.env as unknown as RuntimeEnv;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function cacheableJson(request: Request, body: unknown, status = 200) {
  const serialized = JSON.stringify(body);
  const stableSerialized = serialized.replace(/"refreshedAt":"[^"]*"/, '"refreshedAt":""');
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableSerialized));
  const hash = [...new Uint8Array(digest)].slice(0, 12).map((value) => value.toString(16).padStart(2, "0")).join("");
  const etag = `"public-layout-${hash}"`;
  const headers = new Headers({
    "cache-control": "private, no-cache",
    "content-type": "application/json; charset=utf-8",
    etag,
    vary: "Cookie",
  });
  const candidate = request.headers.get("if-none-match");
  const matches = candidate?.split(",").some((value) => value.trim().replace(/^W\//, "") === etag) ?? false;
  return matches ? new Response(null, { status: 304, headers }) : new Response(serialized, { status, headers });
}

function ownerAccess(request: Request, runtime: RuntimeEnv) {
  const access = adminAccess(request, runtime);
  return { canEdit: access.allowed, currentEmail: access.actor, accessMethod: access.method };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validDocument(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.elements) || !Array.isArray(value.assets) || !Array.isArray(value.reviewNotes)) return false;
  if (value.elements.length > MAX_ELEMENTS || value.assets.length > MAX_ASSETS) return false;
  return value.elements.every((item) => {
    if (!isRecord(item)) return false;
    return typeof item.id === "string"
      && typeof item.name === "string"
      && typeof item.category === "string"
      && finiteNumber(item.x, 0, 100)
      && finiteNumber(item.y, 0, 100)
      && finiteNumber(item.anchorX, 0, 100)
      && finiteNumber(item.anchorY, 0, 100)
      && finiteNumber(item.size, 0.1, 40);
  });
}

function hasUnapprovedPlaceRequestMarker(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.elements)) return false;
  return value.elements.some((item) => isRecord(item)
    && typeof item.placeRequestId === "string"
    && item.placeRequestId.length > 0
    && !(typeof item.directoryId === "string" && item.directoryId.length > 0));
}

function normalizeViewSettings(value: unknown): PublicViewSettings {
  const raw = isRecord(value) ? value : {};
  const baseMap = raw.baseMap === "png" || raw.baseMap === "uploaded" ? raw.baseMap : "svg";
  return {
    baseMap,
    markerLabelsVisible: raw.markerLabelsVisible !== false,
    mergeDenseLabels: raw.mergeDenseLabels !== false,
    screenRecommendedOnly: raw.screenRecommendedOnly === true,
  };
}

function publicDocument(value: unknown) {
  if (!isRecord(value)) return null;
  const elements = Array.isArray(value.elements) ? value.elements.map((item) => {
    if (!isRecord(item)) return item;
    const safe = { ...item };
    delete safe.memo;
    delete safe.addressSourceUrl;
    delete safe.placeRequestId;
    return { ...safe, status: "approved", locked: false, labelLocked: false };
  }) : [];
  const assets = Array.isArray(value.assets) ? value.assets.map((item) => {
    if (!isRecord(item)) return item;
    const safe = { ...item };
    delete safe.sourceLabel;
    delete safe.sourceUrl;
    delete safe.addressSourceUrl;
    return { ...safe, status: "approved" };
  }) : [];
  const directoryPlaces = Array.isArray(value.directoryPlaces) ? value.directoryPlaces.map((item) => {
    if (!isRecord(item)) return item;
    const safe = { ...item };
    delete safe.notes;
    delete safe.sourceUrl;
    return safe;
  }) : undefined;
  return {
    ...value,
    elements,
    assets,
    reviewNotes: [],
    ...(directoryPlaces ? { directoryPlaces } : {}),
  };
}

async function readLayout(db: D1Database) {
  return db.prepare(
    `SELECT document_json AS documentJson, view_settings_json AS viewSettingsJson,
      previous_document_json AS previousDocumentJson, previous_view_settings_json AS previousViewSettingsJson,
      published_at AS publishedAt, revision
     FROM public_map_layout WHERE id = 1`,
  ).first() as Promise<StoredLayout | null>;
}

async function readDraft(db: D1Database) {
  return db.prepare(
    `SELECT document_json AS documentJson, view_settings_json AS viewSettingsJson,
      previous_document_json AS previousDocumentJson, previous_view_settings_json AS previousViewSettingsJson,
      updated_at AS updatedAt, revision
     FROM map_editor_draft WHERE id = 1`,
  ).first() as Promise<StoredDraft | null>;
}

function batchRow<T>(result: D1Result<T>) {
  return result.results?.[0] ?? null;
}

async function readInitialState(db: D1Database, canEdit: boolean) {
  const now = new Date().toISOString();
  const reviewWhere = canEdit ? "status IN ('published', 'hidden')" : "status = 'published'";
  const eventCount = canEdit
    ? db.prepare("SELECT COUNT(*) AS count FROM place_events")
    : db.prepare("SELECT COUNT(*) AS count FROM place_events WHERE status = 'active' AND visible_from <= ? AND visible_until > ?").bind(now, now);
  const placeRequestCount = canEdit
    ? db.prepare("SELECT COUNT(*) AS count FROM place_registration_requests")
    : db.prepare("SELECT 0 AS count");
  const eventPlaceIndex = canEdit
    ? db.prepare(
      `SELECT DISTINCT ep.place_key AS placeKey, ep.place_name AS placeName
       FROM place_event_places ep
       INNER JOIN place_events e ON e.id = ep.event_id
       ORDER BY ep.place_name, ep.place_key`,
    )
    : db.prepare(
      `SELECT DISTINCT ep.place_key AS placeKey, ep.place_name AS placeName
       FROM place_event_places ep
       INNER JOIN place_events e ON e.id = ep.event_id
       WHERE e.status = 'active' AND e.visible_from <= ? AND e.visible_until > ?
       ORDER BY ep.place_name, ep.place_key`,
    ).bind(now, now);
  const statements = [
    db.prepare(
      `SELECT document_json AS documentJson, view_settings_json AS viewSettingsJson,
        previous_document_json AS previousDocumentJson, previous_view_settings_json AS previousViewSettingsJson,
        published_at AS publishedAt, revision
       FROM public_map_layout WHERE id = 1`,
    ),
    db.prepare(`SELECT COUNT(*) AS count FROM place_stories WHERE ${reviewWhere}`),
    eventCount,
    placeRequestCount,
    eventPlaceIndex,
    ...(canEdit ? [db.prepare(
      `SELECT document_json AS documentJson, view_settings_json AS viewSettingsJson,
        previous_document_json AS previousDocumentJson, previous_view_settings_json AS previousViewSettingsJson,
        updated_at AS updatedAt, revision
       FROM map_editor_draft WHERE id = 1`,
    )] : []),
  ];
  const [layoutResult, reviewResult, eventResult, placeRequestResult, eventPlaceResult, draftResult] = await db.batch(statements);
  const contentSummary = contentSummaryFromBatchResults(reviewResult, eventResult, placeRequestResult, now);
  return {
    row: batchRow(layoutResult) as StoredLayout | null,
    draftRow: canEdit && draftResult ? batchRow(draftResult) as StoredDraft | null : null,
    contentSummary,
    eventLinkedPlaces: (eventPlaceResult.results ?? []) as Array<{ placeKey: string; placeName: string }>,
  };
}

function parseStored(row: StoredLayout, canEdit: boolean) {
  const storedDocument = stabilizeMainHubDocument(JSON.parse(row.documentJson) as unknown);
  const completed = completeReviewStatuses(storedDocument);
  return {
    document: canEdit ? completed.document : publicDocument(completed.document),
    view: normalizeViewSettings(JSON.parse(row.viewSettingsJson)),
    publishedAt: row.publishedAt,
    revision: row.revision,
    hasPrevious: Boolean(row.previousDocumentJson),
    reviewCompletedCount: completed.completedCount,
  };
}

function parseDraft(row: StoredDraft) {
  return {
    document: stabilizeMainHubDocument(JSON.parse(row.documentJson) as unknown),
    view: normalizeViewSettings(JSON.parse(row.viewSettingsJson)),
    updatedAt: row.updatedAt,
    revision: row.revision,
    hasPrevious: Boolean(row.previousDocumentJson),
  };
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  const { canEdit, accessMethod } = ownerAccess(request, runtime);
  if (!runtime.DB) {
    const uploadedBaseMap = await readUploadedBaseMapMetadata(runtime.BUCKET, canEdit);
    return cacheableJson(request, { document: null, draft: null, canEdit, accessMethod, persistent: false, publishedAt: null, revision: 0, hasPrevious: false, contentSummary: null, eventLinkedPlaces: [], uploadedBaseMap }, 503);
  }
  const [{ row, draftRow, contentSummary, eventLinkedPlaces }, uploadedBaseMap] = await Promise.all([
    readInitialState(runtime.DB, canEdit),
    readUploadedBaseMapMetadata(runtime.BUCKET, canEdit),
  ]);
  let draft = null;
  try {
    draft = draftRow ? parseDraft(draftRow) : null;
  } catch {
    draft = null;
  }
  if (!row) return cacheableJson(request, { document: null, draft, canEdit, accessMethod, persistent: true, publishedAt: null, revision: 0, hasPrevious: false, contentSummary, eventLinkedPlaces, uploadedBaseMap });
  try {
    return cacheableJson(request, { ...parseStored(row, canEdit), draft, canEdit, accessMethod, persistent: true, contentSummary, eventLinkedPlaces, uploadedBaseMap });
  } catch {
    return cacheableJson(request, { document: null, draft, canEdit, accessMethod, persistent: true, publishedAt: row.publishedAt, revision: row.revision, hasPrevious: Boolean(row.previousDocumentJson), contentSummary, eventLinkedPlaces, uploadedBaseMap }, 500);
  }
}

export async function PATCH(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const { canEdit, currentEmail } = ownerAccess(request, runtime);
  if (!canEdit || !currentEmail) return json({ error: "owner authentication required" }, 403);

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const stableDocument = payload ? stabilizeMainHubDocument(payload.document) : null;
  if (!payload || !validDocument(stableDocument)) return json({ error: "valid draft document required" }, 400);
  const documentJson = JSON.stringify(stableDocument);
  if (new TextEncoder().encode(documentJson).byteLength > MAX_DOCUMENT_BYTES) return json({ error: "draft document too large" }, 413);
  const viewSettingsJson = JSON.stringify(normalizeViewSettings(payload.view));
  const current = await readDraft(runtime.DB);
  const baseRevision = typeof payload.baseDraftRevision === "number" ? payload.baseDraftRevision : 0;
  if (current && baseRevision !== current.revision) {
    return json({ error: "editor draft changed", updatedAt: current.updatedAt, draftRevision: current.revision }, 409);
  }
  const updatedAt = new Date().toISOString();
  const revision = (current?.revision ?? 0) + 1;
  await runtime.DB.prepare(
    `INSERT INTO map_editor_draft
      (id, document_json, view_settings_json, previous_document_json, previous_view_settings_json, updated_at, updated_by, revision)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       previous_document_json = map_editor_draft.document_json,
       previous_view_settings_json = map_editor_draft.view_settings_json,
       document_json = excluded.document_json,
       view_settings_json = excluded.view_settings_json,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by,
       revision = excluded.revision`,
  ).bind(
    documentJson,
    viewSettingsJson,
    current?.documentJson ?? null,
    current?.viewSettingsJson ?? null,
    updatedAt,
    currentEmail,
    revision,
  ).run();
  return json({ draft: { document: stableDocument, view: normalizeViewSettings(payload.view), updatedAt, revision, hasPrevious: Boolean(current) }, canEdit: true, persistent: true });
}

export async function PUT(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const { canEdit, currentEmail } = ownerAccess(request, runtime);
  if (!canEdit || !currentEmail) return json({ error: "owner authentication required" }, 403);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const stableDocument = isRecord(payload) ? stabilizeMainHubDocument(payload.document) : null;
  if (!isRecord(payload) || !validDocument(stableDocument)) return json({ error: "valid layout document required" }, 400);
  if (hasUnapprovedPlaceRequestMarker(stableDocument)) {
    return json({ error: "place request marker still under review" }, 422);
  }
  const completed = completeReviewStatuses(stableDocument);
  const documentJson = JSON.stringify(completed.document);
  if (new TextEncoder().encode(documentJson).byteLength > MAX_DOCUMENT_BYTES) return json({ error: "layout document too large" }, 413);
  const viewSettingsJson = JSON.stringify(normalizeViewSettings(payload.view));
  const current = await readLayout(runtime.DB);
  const currentDraft = await readDraft(runtime.DB);
  const baseRevision = typeof payload.baseRevision === "number" ? payload.baseRevision : 0;
  if (current && baseRevision !== current.revision) {
    return json({ error: "public layout changed", publishedAt: current.publishedAt, revision: current.revision }, 409);
  }
  const publishedAt = new Date().toISOString();
  const revision = (current?.revision ?? 0) + 1;
  const draftRevision = (currentDraft?.revision ?? 0) + 1;
  await runtime.DB.batch([
    runtime.DB.prepare(
      `INSERT INTO public_map_layout
        (id, document_json, view_settings_json, previous_document_json, previous_view_settings_json, published_at, published_by, revision)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         previous_document_json = public_map_layout.document_json,
         previous_view_settings_json = public_map_layout.view_settings_json,
         document_json = excluded.document_json,
         view_settings_json = excluded.view_settings_json,
         published_at = excluded.published_at,
         published_by = excluded.published_by,
         revision = excluded.revision`,
    ).bind(
      documentJson,
      viewSettingsJson,
      current?.documentJson ?? null,
      current?.viewSettingsJson ?? null,
      publishedAt,
      currentEmail,
      revision,
    ),
    runtime.DB.prepare(
      `INSERT INTO map_editor_draft
        (id, document_json, view_settings_json, previous_document_json, previous_view_settings_json, updated_at, updated_by, revision)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         previous_document_json = map_editor_draft.document_json,
         previous_view_settings_json = map_editor_draft.view_settings_json,
         document_json = excluded.document_json,
         view_settings_json = excluded.view_settings_json,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by,
         revision = excluded.revision`,
    ).bind(
      documentJson,
      viewSettingsJson,
      currentDraft?.documentJson ?? null,
      currentDraft?.viewSettingsJson ?? null,
      publishedAt,
      currentEmail,
      draftRevision,
    ),
  ]);
  return json({
    document: completed.document,
    view: normalizeViewSettings(payload.view),
    draft: { document: completed.document, view: normalizeViewSettings(payload.view), updatedAt: publishedAt, revision: draftRevision, hasPrevious: Boolean(currentDraft) },
    canEdit: true,
    persistent: true,
    publishedAt,
    revision,
    hasPrevious: Boolean(current),
    reviewCompletedCount: completed.completedCount,
  });
}

export async function POST(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const { canEdit, currentEmail } = ownerAccess(request, runtime);
  if (!canEdit || !currentEmail) return json({ error: "owner authentication required" }, 403);
  const payload = await request.json().catch(() => null) as { action?: unknown; baseRevision?: unknown; baseDraftRevision?: unknown } | null;
  if (payload?.action === "restore-previous-draft") {
    const currentDraft = await readDraft(runtime.DB);
    if (!currentDraft?.previousDocumentJson || !currentDraft.previousViewSettingsJson) return json({ error: "previous editor draft unavailable" }, 404);
    if (typeof payload.baseDraftRevision !== "number" || payload.baseDraftRevision !== currentDraft.revision) {
      return json({ error: "editor draft changed", updatedAt: currentDraft.updatedAt, draftRevision: currentDraft.revision }, 409);
    }
    const restoredDraftDocument = stabilizeMainHubDocument(JSON.parse(currentDraft.previousDocumentJson) as unknown);
    const restoredDraftDocumentJson = JSON.stringify(restoredDraftDocument);
    const updatedAt = new Date().toISOString();
    const revision = currentDraft.revision + 1;
    await runtime.DB.prepare(
      `UPDATE map_editor_draft SET
        document_json = ?, view_settings_json = ?,
        previous_document_json = ?, previous_view_settings_json = ?,
        updated_at = ?, updated_by = ?, revision = ?
       WHERE id = 1`,
    ).bind(
      restoredDraftDocumentJson,
      currentDraft.previousViewSettingsJson,
      currentDraft.documentJson,
      currentDraft.viewSettingsJson,
      updatedAt,
      currentEmail,
      revision,
    ).run();
    const restoredDraft: StoredDraft = {
      documentJson: restoredDraftDocumentJson,
      viewSettingsJson: currentDraft.previousViewSettingsJson,
      previousDocumentJson: currentDraft.documentJson,
      previousViewSettingsJson: currentDraft.viewSettingsJson,
      updatedAt,
      revision,
    };
    return json({ draft: parseDraft(restoredDraft), canEdit: true, persistent: true });
  }
  if (payload?.action !== "restore-previous") return json({ error: "unsupported action" }, 400);
  const current = await readLayout(runtime.DB);
  if (!current?.previousDocumentJson || !current.previousViewSettingsJson) return json({ error: "previous public layout unavailable" }, 404);
  if (typeof payload.baseRevision !== "number" || payload.baseRevision !== current.revision) {
    return json({ error: "public layout changed", publishedAt: current.publishedAt, revision: current.revision }, 409);
  }
  const restoredCompleted = completeReviewStatuses(
    stabilizeMainHubDocument(JSON.parse(current.previousDocumentJson) as unknown),
  );
  const restoredDocumentJson = JSON.stringify(restoredCompleted.document);
  const restoredViewSettingsJson = current.previousViewSettingsJson;
  const publishedAt = new Date().toISOString();
  const revision = current.revision + 1;
  const currentDraft = await readDraft(runtime.DB);
  const draftRevision = (currentDraft?.revision ?? 0) + 1;
  await runtime.DB.batch([
    runtime.DB.prepare(
      `UPDATE public_map_layout SET
        document_json = ?, view_settings_json = ?,
        previous_document_json = ?, previous_view_settings_json = ?,
        published_at = ?, published_by = ?, revision = ?
       WHERE id = 1`,
    ).bind(
      restoredDocumentJson,
      restoredViewSettingsJson,
      current.documentJson,
      current.viewSettingsJson,
      publishedAt,
      currentEmail,
      revision,
    ),
    runtime.DB.prepare(
      `INSERT INTO map_editor_draft
        (id, document_json, view_settings_json, previous_document_json, previous_view_settings_json, updated_at, updated_by, revision)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         previous_document_json = map_editor_draft.document_json,
         previous_view_settings_json = map_editor_draft.view_settings_json,
         document_json = excluded.document_json,
         view_settings_json = excluded.view_settings_json,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by,
         revision = excluded.revision`,
    ).bind(
      restoredDocumentJson,
      restoredViewSettingsJson,
      currentDraft?.documentJson ?? null,
      currentDraft?.viewSettingsJson ?? null,
      publishedAt,
      currentEmail,
      draftRevision,
    ),
  ]);
  const restored: StoredLayout = {
    documentJson: restoredDocumentJson,
    viewSettingsJson: restoredViewSettingsJson,
    previousDocumentJson: current.documentJson,
    previousViewSettingsJson: current.viewSettingsJson,
    publishedAt,
    revision,
  };
  return json({
    ...parseStored(restored, true),
    draft: { document: restoredCompleted.document, view: normalizeViewSettings(JSON.parse(restoredViewSettingsJson)), updatedAt: publishedAt, revision: draftRevision, hasPrevious: Boolean(currentDraft) },
    canEdit: true,
    persistent: true,
    reviewCompletedCount: restoredCompleted.completedCount,
  });
}
