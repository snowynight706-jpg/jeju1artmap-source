import { normalizePlaceName } from "../../core-landmarks";

export const runtime = "edge";

type RuntimeEnv = {
  DB?: D1Database;
  BASE_MAP_OWNER_EMAIL?: string;
};

type PrintMode = "auto" | "include" | "exclude";

type PrintSetting = {
  key: string;
  directoryId?: string;
  name: string;
  recommended: boolean;
  markerMode: PrintMode;
  labelMode: PrintMode;
};

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS place_print_settings (
  place_key TEXT PRIMARY KEY,
  directory_id TEXT,
  name TEXT NOT NULL,
  recommended INTEGER NOT NULL,
  marker_mode TEXT NOT NULL,
  label_mode TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
)`;
const MODES = new Set<PrintMode>(["auto", "include", "exclude"]);

async function runtimeEnv() {
  const workers = await import("cloudflare:workers");
  return workers.env as unknown as RuntimeEnv;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function ownerAccess(request: Request, runtime: RuntimeEnv) {
  const ownerEmail = runtime.BASE_MAP_OWNER_EMAIL?.trim().toLowerCase();
  const currentEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  return { canEdit: Boolean(ownerEmail && currentEmail === ownerEmail), currentEmail };
}

function normalizeSetting(value: unknown): PrintSetting | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PrintSetting>;
  const key = cleanText(raw.key, 240);
  const name = normalizePlaceName(cleanText(raw.name, 160));
  const markerMode = cleanText(raw.markerMode, 16) as PrintMode;
  const labelMode = cleanText(raw.labelMode, 16) as PrintMode;
  if (!key || !name || !MODES.has(markerMode) || !MODES.has(labelMode)) return null;
  const directoryId = cleanText(raw.directoryId, 180);
  return {
    key,
    ...(directoryId ? { directoryId } : {}),
    name,
    recommended: Boolean(raw.recommended),
    markerMode,
    labelMode,
  };
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  const { canEdit } = ownerAccess(request, runtime);
  if (!runtime.DB) return json({ settings: [], persistent: false, canEdit }, 503);
  await runtime.DB.prepare(TABLE_SQL).run();
  const result = await runtime.DB.prepare(
    `SELECT place_key AS key, directory_id AS directoryId, name, recommended,
      marker_mode AS markerMode, label_mode AS labelMode
     FROM place_print_settings ORDER BY name COLLATE NOCASE`,
  ).all() as { results: Array<Omit<PrintSetting, "recommended"> & { recommended: number }> };
  return json({
    settings: result.results.map((setting) => ({ ...setting, recommended: Boolean(setting.recommended) })),
    persistent: true,
    canEdit,
  });
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
  const setting = normalizeSetting((payload as { setting?: unknown })?.setting);
  if (!setting) return json({ error: "valid print setting required" }, 400);
  await runtime.DB.prepare(TABLE_SQL).run();
  const updatedAt = new Date().toISOString();
  await runtime.DB.prepare(
    `INSERT INTO place_print_settings
      (place_key, directory_id, name, recommended, marker_mode, label_mode, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(place_key) DO UPDATE SET
       directory_id = excluded.directory_id,
       name = excluded.name,
       recommended = excluded.recommended,
       marker_mode = excluded.marker_mode,
       label_mode = excluded.label_mode,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).bind(
    setting.key,
    setting.directoryId ?? null,
    setting.name,
    setting.recommended ? 1 : 0,
    setting.markerMode,
    setting.labelMode,
    updatedAt,
    currentEmail,
  ).run();
  return json({ setting, persistent: true, canEdit: true, updatedAt });
}
