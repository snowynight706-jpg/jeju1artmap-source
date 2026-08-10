import { adminAccess, type AdminRuntimeEnv } from "../../admin-auth";

export const runtime = "edge";

type RuntimeEnv = AdminRuntimeEnv & {
  DB?: D1Database;
};

type DenseLabelPosition = {
  key: string;
  elementIds: string[];
  x: number;
  y: number;
};

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS dense_label_settings (
  id INTEGER PRIMARY KEY,
  positions_json TEXT NOT NULL,
  excluded_element_ids_json TEXT NOT NULL,
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
  const access = adminAccess(request, runtime);
  return { canEdit: access.allowed, currentEmail: access.actor };
}

function finiteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function validPosition(value: unknown): value is DenseLabelPosition {
  if (!value || typeof value !== "object") return false;
  const position = value as Partial<DenseLabelPosition>;
  return typeof position.key === "string"
    && position.key.length > 0
    && position.key.length <= 1200
    && Array.isArray(position.elementIds)
    && position.elementIds.length >= 2
    && position.elementIds.length <= 4
    && position.elementIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 220)
    && new Set(position.elementIds).size === position.elementIds.length
    && finiteCoordinate(position.x)
    && finiteCoordinate(position.y);
}

function validExcludedIds(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= 500
    && value.every((id) => typeof id === "string" && id.length > 0 && id.length <= 220)
    && new Set(value).size === value.length;
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  const { canEdit } = ownerAccess(request, runtime);
  if (!runtime.DB) return json({ positions: [], excludedElementIds: [], persistent: false, canEdit, updatedAt: null }, 503);
  await runtime.DB.prepare(TABLE_SQL).run();
  const row = await runtime.DB.prepare(
    `SELECT positions_json AS positionsJson, excluded_element_ids_json AS excludedElementIdsJson,
      updated_at AS updatedAt FROM dense_label_settings WHERE id = 1`,
  ).first() as { positionsJson: string; excludedElementIdsJson: string; updatedAt: string } | null;
  if (!row) return json({ positions: [], excludedElementIds: [], persistent: true, canEdit, updatedAt: null });
  try {
    const positions = JSON.parse(row.positionsJson) as unknown;
    const excludedElementIds = JSON.parse(row.excludedElementIdsJson) as unknown;
    return json({
      positions: Array.isArray(positions) ? positions.filter(validPosition) : [],
      excludedElementIds: validExcludedIds(excludedElementIds) ? excludedElementIds : [],
      persistent: true,
      canEdit,
      updatedAt: row.updatedAt,
    });
  } catch {
    return json({ positions: [], excludedElementIds: [], persistent: true, canEdit, updatedAt: row.updatedAt });
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
  const positions = (payload as { positions?: unknown })?.positions;
  const excludedElementIds = (payload as { excludedElementIds?: unknown })?.excludedElementIds;
  if (!Array.isArray(positions) || positions.length > 500 || !positions.every(validPosition) || !validExcludedIds(excludedElementIds)) {
    return json({ error: "valid dense label settings required" }, 400);
  }
  if (new Set(positions.map((position) => position.key)).size !== positions.length) {
    return json({ error: "duplicate dense label key" }, 400);
  }
  await runtime.DB.prepare(TABLE_SQL).run();
  const updatedAt = new Date().toISOString();
  await runtime.DB.prepare(
    `INSERT INTO dense_label_settings
      (id, positions_json, excluded_element_ids_json, updated_at, updated_by)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       positions_json = excluded.positions_json,
       excluded_element_ids_json = excluded.excluded_element_ids_json,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).bind(JSON.stringify(positions), JSON.stringify(excludedElementIds), updatedAt, currentEmail).run();
  return json({ positions, excludedElementIds, persistent: true, canEdit: true, updatedAt });
}
