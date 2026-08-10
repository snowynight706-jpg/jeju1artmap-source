import {
  adminAccess,
  clearSharedAdminSessionCookie,
  sharedAdminSessionCookie,
  sharedPasswordMatches,
  type AdminRuntimeEnv,
} from "../../admin-auth";

export const runtime = "edge";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

type RuntimeEnv = AdminRuntimeEnv & {
  DB?: D1Database;
};

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS admin_login_attempts (
  actor_hash TEXT PRIMARY KEY NOT NULL,
  failure_count INTEGER NOT NULL,
  window_started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

async function runtimeEnv() {
  const workers = await import("cloudflare:workers");
  return workers.env as unknown as RuntimeEnv;
}

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...(headers ?? {}) },
  });
}

async function actorHash(request: Request) {
  const source = [
    "jfac-map-admin-login-v1",
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown-ip",
    request.headers.get("user-agent") ?? "unknown-agent",
  ].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  const access = adminAccess(request, runtime);
  return json({ canManage: access.allowed, method: access.method });
}

export async function POST(request: Request) {
  const runtime = await runtimeEnv();
  const sessionToken = runtime.SHARED_ADMIN_SESSION_TOKEN?.trim() ?? "";
  if (!runtime.SHARED_ADMIN_PASSWORD || sessionToken.length < 32) {
    return json({ error: "shared admin login unavailable" }, 503);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid request" }, 400);
  }
  const password = typeof (payload as { password?: unknown })?.password === "string"
    ? (payload as { password: string }).password.slice(0, 200)
    : "";
  if (!password) return json({ error: "password required" }, 400);

  const hash = await actorHash(request);
  const now = new Date();
  if (runtime.DB) {
    await runtime.DB.prepare(TABLE_SQL).run();
    const attempt = await runtime.DB.prepare(
      "SELECT failure_count AS failureCount, window_started_at AS windowStartedAt FROM admin_login_attempts WHERE actor_hash = ?",
    ).bind(hash).first() as { failureCount: number; windowStartedAt: string } | null;
    const inWindow = Boolean(attempt && now.getTime() - Date.parse(attempt.windowStartedAt) < WINDOW_MS);
    if (inWindow && attempt && attempt.failureCount >= MAX_ATTEMPTS) {
      return json({ error: "too many attempts" }, 429);
    }
  }

  if (!sharedPasswordMatches(password, runtime)) {
    if (runtime.DB) {
      const attempt = await runtime.DB.prepare(
        "SELECT failure_count AS failureCount, window_started_at AS windowStartedAt FROM admin_login_attempts WHERE actor_hash = ?",
      ).bind(hash).first() as { failureCount: number; windowStartedAt: string } | null;
      const inWindow = Boolean(attempt && now.getTime() - Date.parse(attempt.windowStartedAt) < WINDOW_MS);
      const failureCount = inWindow && attempt ? attempt.failureCount + 1 : 1;
      const windowStartedAt = inWindow && attempt ? attempt.windowStartedAt : now.toISOString();
      await runtime.DB.prepare(
        `INSERT INTO admin_login_attempts (actor_hash, failure_count, window_started_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(actor_hash) DO UPDATE SET failure_count = excluded.failure_count,
           window_started_at = excluded.window_started_at, updated_at = excluded.updated_at`,
      ).bind(hash, failureCount, windowStartedAt, now.toISOString()).run();
    }
    return json({ error: "invalid password" }, 401);
  }

  if (runtime.DB) {
    await runtime.DB.prepare("DELETE FROM admin_login_attempts WHERE actor_hash = ?").bind(hash).run();
  }
  return json(
    { canManage: true, method: "shared" },
    200,
    { "set-cookie": sharedAdminSessionCookie(request, sessionToken) },
  );
}

export async function DELETE(request: Request) {
  return json(
    { canManage: false },
    200,
    { "set-cookie": clearSharedAdminSessionCookie(request) },
  );
}
