const REVISION_TABLE_SQL = `CREATE TABLE IF NOT EXISTS settings_resource_revisions (
  resource TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
)`;

const LOCK_TABLE_SQL = `CREATE TABLE IF NOT EXISTS settings_resource_locks (
  resource TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at TEXT NOT NULL
)`;

type D1Statement = ReturnType<D1Database["prepare"]>;

export class SettingsConflictError extends Error {
  constructor(
    message: string,
    readonly currentRevision: number,
  ) {
    super(message);
  }
}

export async function ensureSettingsConcurrencyStorage(db: D1Database) {
  await db.batch([
    db.prepare(REVISION_TABLE_SQL),
    db.prepare(LOCK_TABLE_SQL),
  ]);
}

export async function readSettingsRevision(db: D1Database, resource: string) {
  await ensureSettingsConcurrencyStorage(db);
  const row = await db.prepare(
    "SELECT revision FROM settings_resource_revisions WHERE resource = ?",
  ).bind(resource).first() as { revision?: number } | null;
  return Number.isInteger(row?.revision) ? Number(row?.revision) : 0;
}

export function expectedSettingsRevision(payload: unknown) {
  const revision = (payload as { revision?: unknown } | null)?.revision;
  return typeof revision === "number" && Number.isInteger(revision) && revision >= 0
    ? revision
    : null;
}

export async function acquireNamedWriteLock(db: D1Database, resource: string) {
  await ensureSettingsConcurrencyStorage(db);
  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15_000).toISOString();
  const lock = await db.prepare(
    `INSERT INTO settings_resource_locks (resource, token, expires_at)
     VALUES (?, ?, ?)
     ON CONFLICT(resource) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at
     WHERE settings_resource_locks.expires_at <= ?`,
  ).bind(resource, token, expiresAt, now.toISOString()).run();
  if (!lock.meta.changes) throw new SettingsConflictError("resource is being changed by another request", 0);
  return async () => {
    await db.prepare(
      "DELETE FROM settings_resource_locks WHERE resource = ? AND token = ?",
    ).bind(resource, token).run().catch(() => undefined);
  };
}

export async function withSettingsWriteLock<T>(options: {
  db: D1Database;
  resource: string;
  expectedRevision: number;
  actor: string;
  buildStatements: (revision: number, updatedAt: string) => D1Statement[];
  result: (revision: number, updatedAt: string) => T;
}) {
  const { db, resource, expectedRevision, actor, buildStatements, result } = options;
  await ensureSettingsConcurrencyStorage(db);
  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15_000).toISOString();
  const lock = await db.prepare(
    `INSERT INTO settings_resource_locks (resource, token, expires_at)
     VALUES (?, ?, ?)
     ON CONFLICT(resource) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at
     WHERE settings_resource_locks.expires_at <= ?`,
  ).bind(resource, token, expiresAt, now.toISOString()).run();
  if (!lock.meta.changes) {
    const currentRevision = await readSettingsRevision(db, resource);
    throw new SettingsConflictError("settings are being changed by another administrator", currentRevision);
  }

  try {
    const currentRevision = await readSettingsRevision(db, resource);
    if (currentRevision !== expectedRevision) {
      throw new SettingsConflictError("settings revision conflict", currentRevision);
    }
    const nextRevision = currentRevision + 1;
    const updatedAt = new Date().toISOString();
    const statements = buildStatements(nextRevision, updatedAt);
    statements.push(db.prepare(
      `INSERT INTO settings_resource_revisions (resource, revision, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(resource) DO UPDATE SET
         revision = excluded.revision,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    ).bind(resource, nextRevision, updatedAt, actor));
    await db.batch(statements);
    return result(nextRevision, updatedAt);
  } finally {
    await db.prepare(
      "DELETE FROM settings_resource_locks WHERE resource = ? AND token = ?",
    ).bind(resource, token).run().catch(() => undefined);
  }
}

export function settingsConflictResponse(error: unknown) {
  if (!(error instanceof SettingsConflictError)) return null;
  return Response.json({
    error: error.message,
    conflict: true,
    revision: error.currentRevision,
  }, { status: 409, headers: { "cache-control": "no-store" } });
}
