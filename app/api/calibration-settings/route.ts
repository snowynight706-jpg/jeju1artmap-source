import { adminAccess, type AdminRuntimeEnv } from "../../admin-auth";

export const runtime = "edge";

const PRIMARY_NAMES = new Set([
  "관덕정",
  "제주아트플랫폼",
  "탑동해변공연장",
  "탑동광장",
  "김만덕객주",
  "김만덕기념관",
]);

type RuntimeEnv = AdminRuntimeEnv & {
  DB?: D1Database;
};

type CalibrationInput = {
  name: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
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

function validPoint(value: unknown): value is CalibrationInput {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<CalibrationInput>;
  return typeof point.name === "string"
    && PRIMARY_NAMES.has(point.name)
    && finiteCoordinate(point.sourceX)
    && finiteCoordinate(point.sourceY)
    && finiteCoordinate(point.targetX)
    && finiteCoordinate(point.targetY);
}

export async function GET() {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ points: [], persistent: false }, 503);
  const result = await runtime.DB.prepare(
    "SELECT name, source_x AS sourceX, source_y AS sourceY, target_x AS targetX, target_y AS targetY, updated_at AS updatedAt FROM primary_calibration_settings ORDER BY name",
  ).all() as { results: Array<CalibrationInput & { updatedAt: string }> };
  const rows = result.results.filter(validPoint);
  const updatedAt = rows.reduce((latest, point) => typeof point.updatedAt === "string" && point.updatedAt > latest ? point.updatedAt : latest, "");
  return json({ points: rows, persistent: true, updatedAt: updatedAt || null });
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
  const points = (payload as { points?: unknown })?.points;
  if (!Array.isArray(points) || points.length !== PRIMARY_NAMES.size || !points.every(validPoint)) {
    return json({ error: "six valid primary calibration points required" }, 400);
  }
  if (new Set(points.map((point) => point.name)).size !== PRIMARY_NAMES.size) {
    return json({ error: "duplicate primary calibration point" }, 400);
  }

  const updatedAt = new Date().toISOString();
  await runtime.DB.batch(points.map((point) => runtime.DB!.prepare(
    `INSERT INTO primary_calibration_settings
      (name, source_x, source_y, target_x, target_y, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
      source_x = excluded.source_x,
      source_y = excluded.source_y,
      target_x = excluded.target_x,
      target_y = excluded.target_y,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by`,
  ).bind(point.name, point.sourceX, point.sourceY, point.targetX, point.targetY, updatedAt, access.actor)));
  return json({ points, persistent: true, updatedAt });
}
