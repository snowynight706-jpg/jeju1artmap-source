export const runtime = "edge";

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_ELEMENTS = 1200;
const MAX_ASSETS = 900;

type RuntimeEnv = {
  DB?: D1Database;
  BASE_MAP_OWNER_EMAIL?: string;
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
  return { canEdit: Boolean(ownerEmail && currentEmail === ownerEmail), currentEmail };
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

function parseStored(row: StoredLayout, canEdit: boolean) {
  const storedDocument = JSON.parse(row.documentJson) as unknown;
  return {
    document: canEdit ? storedDocument : publicDocument(storedDocument),
    view: normalizeViewSettings(JSON.parse(row.viewSettingsJson)),
    publishedAt: row.publishedAt,
    revision: row.revision,
    hasPrevious: Boolean(row.previousDocumentJson),
  };
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  const { canEdit } = ownerAccess(request, runtime);
  if (!runtime.DB) return json({ document: null, canEdit, persistent: false, publishedAt: null, revision: 0, hasPrevious: false }, 503);
  const row = await readLayout(runtime.DB);
  if (!row) return json({ document: null, canEdit, persistent: true, publishedAt: null, revision: 0, hasPrevious: false });
  try {
    return json({ ...parseStored(row, canEdit), canEdit, persistent: true });
  } catch {
    return json({ document: null, canEdit, persistent: true, publishedAt: row.publishedAt, revision: row.revision, hasPrevious: Boolean(row.previousDocumentJson) }, 500);
  }
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
  if (!isRecord(payload) || !validDocument(payload.document)) return json({ error: "valid layout document required" }, 400);
  const documentJson = JSON.stringify(payload.document);
  if (new TextEncoder().encode(documentJson).byteLength > MAX_DOCUMENT_BYTES) return json({ error: "layout document too large" }, 413);
  const viewSettingsJson = JSON.stringify(normalizeViewSettings(payload.view));
  const current = await readLayout(runtime.DB);
  const baseRevision = typeof payload.baseRevision === "number" ? payload.baseRevision : 0;
  if (current && baseRevision !== current.revision) {
    return json({ error: "public layout changed", publishedAt: current.publishedAt, revision: current.revision }, 409);
  }
  const publishedAt = new Date().toISOString();
  const revision = (current?.revision ?? 0) + 1;
  await runtime.DB.prepare(
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
  ).run();
  return json({ document: payload.document, view: normalizeViewSettings(payload.view), canEdit: true, persistent: true, publishedAt, revision, hasPrevious: Boolean(current) });
}

export async function POST(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const { canEdit, currentEmail } = ownerAccess(request, runtime);
  if (!canEdit || !currentEmail) return json({ error: "owner authentication required" }, 403);
  const payload = await request.json().catch(() => null) as { action?: unknown; baseRevision?: unknown } | null;
  if (payload?.action !== "restore-previous") return json({ error: "unsupported action" }, 400);
  const current = await readLayout(runtime.DB);
  if (!current?.previousDocumentJson || !current.previousViewSettingsJson) return json({ error: "previous public layout unavailable" }, 404);
  if (typeof payload.baseRevision !== "number" || payload.baseRevision !== current.revision) {
    return json({ error: "public layout changed", publishedAt: current.publishedAt, revision: current.revision }, 409);
  }
  const restoredDocumentJson = current.previousDocumentJson;
  const restoredViewSettingsJson = current.previousViewSettingsJson;
  const publishedAt = new Date().toISOString();
  const revision = current.revision + 1;
  await runtime.DB.prepare(
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
  ).run();
  const restored: StoredLayout = {
    documentJson: restoredDocumentJson,
    viewSettingsJson: restoredViewSettingsJson,
    previousDocumentJson: current.documentJson,
    previousViewSettingsJson: current.viewSettingsJson,
    publishedAt,
    revision,
  };
  return json({ ...parseStored(restored, true), canEdit: true, persistent: true });
}
