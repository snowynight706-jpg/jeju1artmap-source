import { adminAccess, type AdminRuntimeEnv } from "../../admin-auth";
import { readUploadedBaseMapMetadata } from "../../base-map-storage";
import { contentSummaryFromBatchResults } from "../../content-summary.mjs";
import { normalizeOptionalLabelScaleSteps } from "../../label-density.mjs";
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
  defaultMarkerSize: number;
  optionalLabelScaleSteps: Array<{ maximumRatio: number; limit: number }>;
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

type StoredLabelDensitySettings = {
  optionalLabelScaleStepsJson: string;
  updatedAt: string;
  revision: number;
};

type LabelDensitySettings = {
  optionalLabelScaleSteps: Array<{ maximumRatio: number; limit: number }>;
  updatedAt: string;
  revision: number;
};

type LayoutHistoryKind = "snapshot" | "published" | "restored" | "legacy";

type StoredLayoutHistory = {
  id: string;
  kind: LayoutHistoryKind;
  documentJson: string;
  viewSettingsJson: string;
  sourceRevision: number;
  elementCount: number;
  placedCount: number;
  createdAt: string;
  createdBy: string;
};

type LayoutHistoryItem = Omit<StoredLayoutHistory, "documentJson" | "viewSettingsJson">;

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
    defaultMarkerSize: finiteNumber(raw.defaultMarkerSize, 0.8, 15) ? Number(raw.defaultMarkerSize) : 1.7,
    optionalLabelScaleSteps: normalizeOptionalLabelScaleSteps(raw.optionalLabelScaleSteps),
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
  const assets = Array.isArray(value.assets) ? value.assets.filter((item) => (
    !isRecord(item) || item.builtIn !== true
  )).map((item) => {
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

async function readLabelDensitySettings(db: D1Database) {
  return db.prepare(
    `SELECT optional_label_scale_steps_json AS optionalLabelScaleStepsJson,
      updated_at AS updatedAt, revision
     FROM map_label_density_settings WHERE id = 1`,
  ).first() as Promise<StoredLabelDensitySettings | null>;
}

function parseLabelDensitySettings(row: StoredLabelDensitySettings | null): LabelDensitySettings | null {
  if (!row) return null;
  return {
    optionalLabelScaleSteps: normalizeOptionalLabelScaleSteps(JSON.parse(row.optionalLabelScaleStepsJson)),
    updatedAt: row.updatedAt,
    revision: row.revision,
  };
}

function applyLabelDensitySettings(view: unknown, settings: LabelDensitySettings | null) {
  const normalized = normalizeViewSettings(view);
  return settings
    ? { ...normalized, optionalLabelScaleSteps: settings.optionalLabelScaleSteps }
    : normalized;
}

async function readHistory(db: D1Database) {
  return db.prepare(
    `SELECT id, kind, source_revision AS sourceRevision,
      element_count AS elementCount, placed_count AS placedCount,
      created_at AS createdAt, created_by AS createdBy
     FROM public_map_layout_history
     ORDER BY created_at DESC, id DESC
     LIMIT 80`,
  ).all() as Promise<D1Result<LayoutHistoryItem>>;
}

async function readHistoryEntry(db: D1Database, id: string) {
  return db.prepare(
    `SELECT id, kind, document_json AS documentJson, view_settings_json AS viewSettingsJson,
      source_revision AS sourceRevision, element_count AS elementCount, placed_count AS placedCount,
      created_at AS createdAt, created_by AS createdBy
     FROM public_map_layout_history WHERE id = ?`,
  ).bind(id).first() as Promise<StoredLayoutHistory | null>;
}

function documentCounts(value: unknown) {
  const elements = isRecord(value) && Array.isArray(value.elements) ? value.elements : [];
  return {
    elementCount: elements.length,
    placedCount: elements.filter((item) => isRecord(item) && item.mapVisible !== false).length,
  };
}

function historyItem(row: StoredLayoutHistory): LayoutHistoryItem {
  return {
    id: row.id,
    kind: row.kind,
    sourceRevision: row.sourceRevision,
    elementCount: row.elementCount,
    placedCount: row.placedCount,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

function syntheticHistoryItem(row: StoredLayout, target: "current" | "previous"): LayoutHistoryItem | null {
  const documentJson = target === "current" ? row.documentJson : row.previousDocumentJson;
  if (!documentJson) return null;
  let counts = { elementCount: 0, placedCount: 0 };
  try {
    counts = documentCounts(JSON.parse(documentJson) as unknown);
  } catch {}
  return {
    id: target,
    kind: "legacy",
    sourceRevision: Math.max(0, row.revision - (target === "previous" ? 1 : 0)),
    ...counts,
    createdAt: row.publishedAt,
    createdBy: target === "current" ? "현재 공개본" : "기존 공개본",
  };
}

function mergeHistory(rows: LayoutHistoryItem[], layout: StoredLayout | null) {
  if (!layout) return rows;
  const result = [...rows];
  const publishedRevisions = new Set(rows.filter((item) => item.kind !== "snapshot").map((item) => item.sourceRevision));
  const current = syntheticHistoryItem(layout, "current");
  const previous = syntheticHistoryItem(layout, "previous");
  if (current && !publishedRevisions.has(current.sourceRevision)) result.unshift(current);
  if (previous && !publishedRevisions.has(previous.sourceRevision)) result.push(previous);
  return result;
}

function parseHistoryDocument(row: StoredLayoutHistory) {
  return {
    ...historyItem(row),
    document: stabilizeMainHubDocument(JSON.parse(row.documentJson) as unknown),
    view: normalizeViewSettings(JSON.parse(row.viewSettingsJson)),
  };
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
  const reviewPlaceIndex = db.prepare(
    `SELECT place_key AS placeKey, place_name AS placeName, COUNT(*) AS count,
       MAX(created_at) AS latestCreatedAt
     FROM place_stories
     WHERE ${reviewWhere}
     GROUP BY place_key, place_name
     ORDER BY place_name, place_key`,
  );
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
    reviewPlaceIndex,
    db.prepare(
      `SELECT optional_label_scale_steps_json AS optionalLabelScaleStepsJson,
        updated_at AS updatedAt, revision
       FROM map_label_density_settings WHERE id = 1`,
    ),
    ...(canEdit ? [db.prepare(
      `SELECT document_json AS documentJson, view_settings_json AS viewSettingsJson,
        previous_document_json AS previousDocumentJson, previous_view_settings_json AS previousViewSettingsJson,
        updated_at AS updatedAt, revision
       FROM map_editor_draft WHERE id = 1`,
    )] : []),
  ];
  const [layoutResult, reviewResult, eventResult, placeRequestResult, eventPlaceResult, reviewPlaceResult, labelDensityResult, draftResult] = await db.batch(statements);
  const contentSummary = contentSummaryFromBatchResults(reviewResult, eventResult, placeRequestResult, now);
  return {
    row: batchRow(layoutResult) as StoredLayout | null,
    draftRow: canEdit && draftResult ? batchRow(draftResult) as StoredDraft | null : null,
    contentSummary,
    eventLinkedPlaces: (eventPlaceResult.results ?? []) as Array<{ placeKey: string; placeName: string }>,
    reviewCountsByPlace: ((reviewPlaceResult.results ?? []) as Array<{
      placeKey?: unknown;
      placeName?: unknown;
      count?: unknown;
      latestCreatedAt?: unknown;
    }>).map((row) => ({
      placeKey: String(row.placeKey ?? ""),
      placeName: String(row.placeName ?? ""),
      count: Math.max(0, Number(row.count ?? 0)),
      latestCreatedAt: typeof row.latestCreatedAt === "string" ? row.latestCreatedAt : null,
    })),
    labelDensityRow: batchRow(labelDensityResult) as StoredLabelDensitySettings | null,
  };
}

function parseStored(row: StoredLayout, canEdit: boolean, labelDensitySettings: LabelDensitySettings | null = null) {
  const storedDocument = stabilizeMainHubDocument(JSON.parse(row.documentJson) as unknown);
  const completed = completeReviewStatuses(storedDocument);
  return {
    document: canEdit ? completed.document : publicDocument(completed.document),
    view: applyLabelDensitySettings(JSON.parse(row.viewSettingsJson), labelDensitySettings),
    publishedAt: row.publishedAt,
    revision: row.revision,
    hasPrevious: Boolean(row.previousDocumentJson),
    reviewCompletedCount: completed.completedCount,
  };
}

function parseDraft(row: StoredDraft, labelDensitySettings: LabelDensitySettings | null = null) {
  return {
    document: stabilizeMainHubDocument(JSON.parse(row.documentJson) as unknown),
    view: applyLabelDensitySettings(JSON.parse(row.viewSettingsJson), labelDensitySettings),
    updatedAt: row.updatedAt,
    revision: row.revision,
    hasPrevious: Boolean(row.previousDocumentJson),
  };
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  const { canEdit, accessMethod } = ownerAccess(request, runtime);
  const requestedHistoryId = new URL(request.url).searchParams.get("historyId");
  if (!runtime.DB) {
    const uploadedBaseMap = await readUploadedBaseMapMetadata(runtime.BUCKET, canEdit);
    return cacheableJson(request, { document: null, draft: null, canEdit, accessMethod, persistent: false, publishedAt: null, revision: 0, hasPrevious: false, contentSummary: null, eventLinkedPlaces: [], reviewCountsByPlace: [], uploadedBaseMap }, 503);
  }
  if (requestedHistoryId) {
    if (!canEdit) return json({ error: "owner authentication required" }, 403);
    const layout = await readLayout(runtime.DB);
    if ((requestedHistoryId === "current" || requestedHistoryId === "previous") && layout) {
      const documentJson = requestedHistoryId === "current" ? layout.documentJson : layout.previousDocumentJson;
      const viewSettingsJson = requestedHistoryId === "current" ? layout.viewSettingsJson : layout.previousViewSettingsJson;
      const item = syntheticHistoryItem(layout, requestedHistoryId);
      if (!documentJson || !viewSettingsJson || !item) return json({ error: "layout history entry unavailable" }, 404);
      return json({ historyEntry: { ...item, document: stabilizeMainHubDocument(JSON.parse(documentJson) as unknown), view: normalizeViewSettings(JSON.parse(viewSettingsJson)) } });
    }
    const entry = await readHistoryEntry(runtime.DB, requestedHistoryId);
    if (!entry) return json({ error: "layout history entry unavailable" }, 404);
    return json({ historyEntry: parseHistoryDocument(entry) });
  }
  const [{ row, draftRow, contentSummary, eventLinkedPlaces, reviewCountsByPlace, labelDensityRow }, uploadedBaseMap, historyResult] = await Promise.all([
    readInitialState(runtime.DB, canEdit),
    readUploadedBaseMapMetadata(runtime.BUCKET, canEdit),
    canEdit ? readHistory(runtime.DB) : Promise.resolve({ results: [] as LayoutHistoryItem[] }),
  ]);
  let labelDensitySettings: LabelDensitySettings | null = null;
  try {
    labelDensitySettings = parseLabelDensitySettings(labelDensityRow);
  } catch {
    labelDensitySettings = null;
  }
  const history = canEdit ? mergeHistory(historyResult.results ?? [], row) : undefined;
  let draft = null;
  try {
    draft = draftRow ? parseDraft(draftRow, labelDensitySettings) : null;
  } catch {
    draft = null;
  }
  if (!row) return cacheableJson(request, { document: null, draft, history, labelDensitySettings, canEdit, accessMethod, persistent: true, publishedAt: null, revision: 0, hasPrevious: false, contentSummary, eventLinkedPlaces, reviewCountsByPlace, uploadedBaseMap });
  try {
    return cacheableJson(request, { ...parseStored(row, canEdit, labelDensitySettings), draft, history, labelDensitySettings, canEdit, accessMethod, persistent: true, contentSummary, eventLinkedPlaces, reviewCountsByPlace, uploadedBaseMap });
  } catch {
    return cacheableJson(request, { document: null, draft, history, labelDensitySettings, canEdit, accessMethod, persistent: true, publishedAt: row.publishedAt, revision: row.revision, hasPrevious: Boolean(row.previousDocumentJson), contentSummary, eventLinkedPlaces, reviewCountsByPlace, uploadedBaseMap }, 500);
  }
}

export async function PATCH(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const { canEdit, currentEmail } = ownerAccess(request, runtime);
  if (!canEdit || !currentEmail) return json({ error: "owner authentication required" }, 403);

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (payload?.action === "save-label-density-settings") {
    if (!Array.isArray(payload.optionalLabelScaleSteps)) return json({ error: "valid label density settings required" }, 400);
    const current = await readLabelDensitySettings(runtime.DB);
    const baseRevision = typeof payload.baseRevision === "number" && Number.isInteger(payload.baseRevision) && payload.baseRevision >= 0
      ? payload.baseRevision
      : null;
    if (baseRevision === null) return json({ error: "valid label density settings revision required" }, 400);
    if (baseRevision !== (current?.revision ?? 0)) {
      return json({ error: "label density settings changed", revision: current?.revision ?? 0 }, 409);
    }
    const optionalLabelScaleSteps = normalizeOptionalLabelScaleSteps(payload.optionalLabelScaleSteps);
    const updatedAt = new Date().toISOString();
    const revision = (current?.revision ?? 0) + 1;
    const result = await runtime.DB.prepare(
      `INSERT INTO map_label_density_settings
        (id, optional_label_scale_steps_json, updated_at, updated_by, revision)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         optional_label_scale_steps_json = excluded.optional_label_scale_steps_json,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by,
         revision = excluded.revision
       WHERE map_label_density_settings.revision = ?`,
    ).bind(JSON.stringify(optionalLabelScaleSteps), updatedAt, currentEmail, revision, baseRevision).run();
    if (!result.success || Number(result.meta?.changes ?? 0) === 0) {
      const latest = await readLabelDensitySettings(runtime.DB);
      return json({ error: "label density settings changed", revision: latest?.revision ?? 0 }, 409);
    }
    return json({ labelDensitySettings: { optionalLabelScaleSteps, updatedAt, revision }, canEdit: true, persistent: true });
  }
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
  const historyId = crypto.randomUUID();
  const historyCounts = documentCounts(completed.document);
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
    runtime.DB.prepare(
      `INSERT INTO public_map_layout_history
        (id, kind, document_json, view_settings_json, source_revision, element_count, placed_count, created_at, created_by)
       VALUES (?, 'published', ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      historyId,
      documentJson,
      viewSettingsJson,
      revision,
      historyCounts.elementCount,
      historyCounts.placedCount,
      publishedAt,
      currentEmail,
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
    historyEntry: {
      id: historyId,
      kind: "published",
      sourceRevision: revision,
      ...historyCounts,
      createdAt: publishedAt,
      createdBy: currentEmail,
    },
  });
}

export async function POST(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const { canEdit, currentEmail } = ownerAccess(request, runtime);
  if (!canEdit || !currentEmail) return json({ error: "owner authentication required" }, 403);
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (payload?.action === "save-history") {
    const stableDocument = stabilizeMainHubDocument(payload.document);
    if (!validDocument(stableDocument)) return json({ error: "valid history document required" }, 400);
    const documentJson = JSON.stringify(stableDocument);
    if (new TextEncoder().encode(documentJson).byteLength > MAX_DOCUMENT_BYTES) return json({ error: "history document too large" }, 413);
    const view = normalizeViewSettings(payload.view);
    const viewSettingsJson = JSON.stringify(view);
    const [current, currentDraft] = await Promise.all([readLayout(runtime.DB), readDraft(runtime.DB)]);
    const createdAt = new Date().toISOString();
    const historyId = crypto.randomUUID();
    const sourceRevision = current?.revision ?? 0;
    const counts = documentCounts(stableDocument);
    const draftRevision = (currentDraft?.revision ?? 0) + 1;
    await runtime.DB.batch([
      runtime.DB.prepare(
        `INSERT INTO public_map_layout_history
          (id, kind, document_json, view_settings_json, source_revision, element_count, placed_count, created_at, created_by)
         VALUES (?, 'snapshot', ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(historyId, documentJson, viewSettingsJson, sourceRevision, counts.elementCount, counts.placedCount, createdAt, currentEmail),
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
      ).bind(documentJson, viewSettingsJson, currentDraft?.documentJson ?? null, currentDraft?.viewSettingsJson ?? null, createdAt, currentEmail, draftRevision),
    ]);
    return json({
      historyEntry: { id: historyId, kind: "snapshot", sourceRevision, ...counts, createdAt, createdBy: currentEmail },
      draft: { document: stableDocument, view, updatedAt: createdAt, revision: draftRevision, hasPrevious: Boolean(currentDraft) },
      canEdit: true,
      persistent: true,
    });
  }
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
  const historyId = crypto.randomUUID();
  const historyCounts = documentCounts(restoredCompleted.document);
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
    runtime.DB.prepare(
      `INSERT INTO public_map_layout_history
        (id, kind, document_json, view_settings_json, source_revision, element_count, placed_count, created_at, created_by)
       VALUES (?, 'restored', ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(historyId, restoredDocumentJson, restoredViewSettingsJson, revision, historyCounts.elementCount, historyCounts.placedCount, publishedAt, currentEmail),
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
    historyEntry: { id: historyId, kind: "restored", sourceRevision: revision, ...historyCounts, createdAt: publishedAt, createdBy: currentEmail },
  });
}
