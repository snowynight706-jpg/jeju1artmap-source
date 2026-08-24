import { adminAccess, type AdminRuntimeEnv } from "../../admin-auth";
import {
  validDenseLabelExcludedIds,
  validDenseLabelPosition,
  validateDenseLabelSettingsPayload,
} from "../../map/labels/settings-contract.mjs";
import {
  expectedSettingsRevision,
  readSettingsRevision,
  settingsConflictResponse,
  withSettingsWriteLock,
} from "../settings-concurrency";

export const runtime = "edge";

type RuntimeEnv = AdminRuntimeEnv & {
  DB?: D1Database;
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

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  const { canEdit } = ownerAccess(request, runtime);
  if (!runtime.DB) return json({ positions: [], excludedElementIds: [], persistent: false, canEdit, updatedAt: null, revision: 0 }, 503);
  await runtime.DB.prepare(TABLE_SQL).run();
  const [row, revision] = await Promise.all([
    runtime.DB.prepare(
      `SELECT positions_json AS positionsJson, excluded_element_ids_json AS excludedElementIdsJson,
        updated_at AS updatedAt FROM dense_label_settings WHERE id = 1`,
    ).first() as Promise<{ positionsJson: string; excludedElementIdsJson: string; updatedAt: string } | null>,
    readSettingsRevision(runtime.DB, "dense-label-settings"),
  ]);
  if (!row) return json({ positions: [], excludedElementIds: [], persistent: true, canEdit, updatedAt: null, revision });
  try {
    const positions = JSON.parse(row.positionsJson) as unknown;
    const excludedElementIds = JSON.parse(row.excludedElementIdsJson) as unknown;
    return json({
      positions: Array.isArray(positions) ? positions.filter(validDenseLabelPosition) : [],
      excludedElementIds: validDenseLabelExcludedIds(excludedElementIds) ? excludedElementIds : [],
      persistent: true,
      canEdit,
      updatedAt: row.updatedAt,
      revision,
    });
  } catch {
    return json({ positions: [], excludedElementIds: [], persistent: true, canEdit, updatedAt: row.updatedAt, revision });
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
  const validation = validateDenseLabelSettingsPayload(payload);
  if (!validation.ok) return json(validation, 400);
  const { positions, excludedElementIds } = validation;
  const expectedRevision = expectedSettingsRevision(payload);
  if (expectedRevision === null) return json({ error: "settings revision required" }, 400);
  await runtime.DB.prepare(TABLE_SQL).run();
  try {
    return json(await withSettingsWriteLock({
      db: runtime.DB,
      resource: "dense-label-settings",
      expectedRevision,
      actor: currentEmail,
      buildStatements: (_revision, updatedAt) => [runtime.DB!.prepare(
        `INSERT INTO dense_label_settings
          (id, positions_json, excluded_element_ids_json, updated_at, updated_by)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           positions_json = excluded.positions_json,
           excluded_element_ids_json = excluded.excluded_element_ids_json,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`,
      ).bind(JSON.stringify(positions), JSON.stringify(excludedElementIds), updatedAt, currentEmail)],
      result: (revision, updatedAt) => ({ positions, excludedElementIds, persistent: true, canEdit: true, updatedAt, revision }),
    }));
  } catch (error) {
    return settingsConflictResponse(error) ?? json({ error: "dense label settings save failed" }, 500);
  }
}
