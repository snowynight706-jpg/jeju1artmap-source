import { adminAccess, type AdminRuntimeEnv } from "../../admin-auth";
import {
  expectedSettingsRevision,
  readSettingsRevision,
  settingsConflictResponse,
  withSettingsWriteLock,
} from "../settings-concurrency";

export const runtime = "edge";

const STATES = new Set(["unplaced", "deleted"]);
const MAX_SETTINGS = 800;

type RuntimeEnv = AdminRuntimeEnv & {
  DB?: D1Database;
};

type PlacementSettingInput = {
  key: string;
  directoryId?: string;
  name: string;
  state: "unplaced" | "deleted";
};

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

function normalizeSetting(value: unknown): PlacementSettingInput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PlacementSettingInput>;
  const key = cleanText(raw.key, 220);
  const directoryId = cleanText(raw.directoryId, 180);
  const name = cleanText(raw.name, 160);
  const state = cleanText(raw.state, 20);
  if (!key || !name || !STATES.has(state)) return null;
  return { key, ...(directoryId ? { directoryId } : {}), name, state: state as PlacementSettingInput["state"] };
}

export async function GET() {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ settings: [], persistent: false, updatedAt: null, revision: 0 }, 503);
  const [settingsResult, legacyRevision, revision] = await Promise.all([
    runtime.DB.prepare(
      `SELECT place_key AS key, directory_id AS directoryId, name, state
       FROM placement_settings ORDER BY name COLLATE NOCASE`,
    ).all() as Promise<{ results: PlacementSettingInput[] }>,
    runtime.DB.prepare("SELECT updated_at AS updatedAt FROM placement_revision WHERE id = 1")
      .first() as Promise<{ updatedAt: string } | null>,
    readSettingsRevision(runtime.DB, "placement-settings"),
  ]);
  return json({ settings: settingsResult.results, persistent: true, updatedAt: legacyRevision?.updatedAt ?? null, revision });
}

export async function PUT(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const access = adminAccess(request, runtime);
  if (!access.allowed || !access.actor) return json({ error: "admin authentication required" }, 403);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const rawSettings = (payload as { settings?: unknown })?.settings;
  if (!Array.isArray(rawSettings) || rawSettings.length > MAX_SETTINGS) {
    return json({ error: "valid placement settings required" }, 400);
  }
  const normalized = rawSettings.map(normalizeSetting);
  if (normalized.some((setting) => setting === null)) return json({ error: "invalid placement setting" }, 400);
  const settings = normalized as PlacementSettingInput[];
  if (new Set(settings.map((setting) => setting.key)).size !== settings.length) {
    return json({ error: "duplicate placement key" }, 400);
  }
  const expectedRevision = expectedSettingsRevision(payload);
  if (expectedRevision === null) return json({ error: "settings revision required" }, 400);

  try {
    return json(await withSettingsWriteLock({
      db: runtime.DB,
      resource: "placement-settings",
      expectedRevision,
      actor: access.actor,
      buildStatements: (_revision, updatedAt) => {
        const statements = [runtime.DB!.prepare("DELETE FROM placement_settings")];
        settings.forEach((setting) => {
          statements.push(runtime.DB!.prepare(
            `INSERT INTO placement_settings
              (place_key, directory_id, name, state, updated_at, updated_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
          ).bind(setting.key, setting.directoryId ?? null, setting.name, setting.state, updatedAt, access.actor));
        });
        statements.push(runtime.DB!.prepare(
          `INSERT INTO placement_revision (id, updated_at, updated_by)
           VALUES (1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        ).bind(updatedAt, access.actor));
        return statements;
      },
      result: (revision, updatedAt) => ({ settings, persistent: true, updatedAt, revision }),
    }));
  } catch (error) {
    return settingsConflictResponse(error) ?? json({ error: "placement settings save failed" }, 500);
  }
}
