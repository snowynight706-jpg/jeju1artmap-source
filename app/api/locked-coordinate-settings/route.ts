export const runtime = "edge";

const CATEGORIES = new Set(["landmark", "culture", "cafe", "food", "shop", "parking", "park", "utility"]);
const PRIMARY_NAMES = new Set([
  "관덕정",
  "제주아트플랫폼",
  "탑동해변공연장",
  "탑동광장",
  "김만덕객주",
  "김만덕기념관",
]);

type RuntimeEnv = {
  DB?: D1Database;
  BASE_MAP_OWNER_EMAIL?: string;
};

type LockedCoordinateInput = {
  key: string;
  directoryId?: string;
  name: string;
  category: string;
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
};

async function runtimeEnv() {
  const workers = await import("cloudflare:workers");
  return workers.env as unknown as RuntimeEnv;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function finiteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function validSetting(value: unknown): value is LockedCoordinateInput {
  if (!value || typeof value !== "object") return false;
  const setting = value as Partial<LockedCoordinateInput>;
  return typeof setting.key === "string"
    && setting.key.length > 0
    && setting.key.length <= 180
    && typeof setting.name === "string"
    && setting.name.length > 0
    && setting.name.length <= 120
    && !PRIMARY_NAMES.has(setting.name.trim())
    && typeof setting.category === "string"
    && CATEGORIES.has(setting.category)
    && (setting.directoryId === undefined || (typeof setting.directoryId === "string" && setting.directoryId.length <= 180))
    && finiteCoordinate(setting.anchorX)
    && finiteCoordinate(setting.anchorY)
    && finiteCoordinate(setting.x)
    && finiteCoordinate(setting.y);
}

export async function GET() {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ settings: [], persistent: false, updatedAt: null }, 503);
  const [settingsResult, revision] = await Promise.all([
    runtime.DB.prepare(
      `SELECT element_key AS key, directory_id AS directoryId, name, category,
        anchor_x AS anchorX, anchor_y AS anchorY, output_x AS x, output_y AS y
       FROM locked_coordinate_settings ORDER BY name`,
    ).all() as Promise<{ results: LockedCoordinateInput[] }>,
    runtime.DB.prepare("SELECT updated_at AS updatedAt FROM locked_coordinate_revision WHERE id = 1").first() as Promise<{ updatedAt: string } | null>,
  ]);
  return json({
    settings: settingsResult.results.filter(validSetting),
    persistent: true,
    updatedAt: revision?.updatedAt ?? null,
  });
}

export async function PUT(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ error: "storage unavailable" }, 503);
  const ownerEmail = runtime.BASE_MAP_OWNER_EMAIL?.trim().toLowerCase();
  const currentEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!ownerEmail || currentEmail !== ownerEmail) return json({ error: "owner authentication required" }, 403);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const settings = (payload as { settings?: unknown })?.settings;
  if (!Array.isArray(settings) || settings.length > 500 || !settings.every(validSetting)) {
    return json({ error: "valid locked coordinate settings required" }, 400);
  }
  if (new Set(settings.map((setting) => setting.key)).size !== settings.length) {
    return json({ error: "duplicate locked coordinate key" }, 400);
  }

  const updatedAt = new Date().toISOString();
  const statements = [runtime.DB.prepare("DELETE FROM locked_coordinate_settings")];
  settings.forEach((setting) => {
    statements.push(runtime.DB!.prepare(
      `INSERT INTO locked_coordinate_settings
        (element_key, directory_id, name, category, anchor_x, anchor_y, output_x, output_y, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      setting.key,
      setting.directoryId ?? null,
      setting.name.trim(),
      setting.category,
      setting.anchorX,
      setting.anchorY,
      setting.x,
      setting.y,
      updatedAt,
      currentEmail,
    ));
  });
  statements.push(runtime.DB.prepare(
    `INSERT INTO locked_coordinate_revision (id, updated_at, updated_by)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).bind(updatedAt, currentEmail));
  await runtime.DB.batch(statements);
  return json({ settings, persistent: true, updatedAt });
}
