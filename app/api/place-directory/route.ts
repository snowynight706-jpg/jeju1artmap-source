import { masterDirectoryRows, masterDirectorySource, retiredMasterDirectoryIds } from "../../master-directory";
import { categoryForPlace, normalizePlaceName } from "../../core-landmarks";
import { adminAccess, type AdminRuntimeEnv } from "../../admin-auth";

export const runtime = "edge";

const CATEGORIES = new Set(["landmark", "culture", "cafe", "food", "shop", "parking", "park", "utility"]);
const MAX_ROWS = 600;

type RuntimeEnv = AdminRuntimeEnv & {
  DB?: D1Database;
};

type PlaceDirectoryInput = {
  id: string;
  name: string;
  category: string;
  area: string;
  address: string;
  subtype: string;
  priority: string;
  description: string;
  operatingInfo: string;
  notes: string;
  sourceUrl: string;
  mapUrl: string;
  checkedAt: string;
};

const SOURCE_STATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS place_directory_source_state (
  id INTEGER PRIMARY KEY,
  source_version TEXT NOT NULL,
  imported_at TEXT NOT NULL
)`;

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

function normalizeRow(value: unknown): PlaceDirectoryInput | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PlaceDirectoryInput>;
  const name = normalizePlaceName(cleanText(row.name, 160));
  const normalized = {
    id: cleanText(row.id, 180),
    name,
    category: categoryForPlace(name, cleanText(row.category, 32)),
    area: cleanText(row.area, 160),
    address: cleanText(row.address, 260),
    subtype: cleanText(row.subtype, 160),
    priority: cleanText(row.priority, 80),
    description: cleanText(row.description, 1600),
    operatingInfo: cleanText(row.operatingInfo, 1000),
    notes: cleanText(row.notes, 1600),
    sourceUrl: cleanText(row.sourceUrl, 1200),
    mapUrl: cleanText(row.mapUrl, 1200),
    checkedAt: cleanText(row.checkedAt, 40),
  };
  return normalized.id && normalized.name && CATEGORIES.has(normalized.category) ? normalized : null;
}

function ownerAccess(request: Request, runtime: RuntimeEnv) {
  const access = adminAccess(request, runtime);
  return { canEdit: access.allowed, currentEmail: access.actor };
}

function bundledRows(): PlaceDirectoryInput[] {
  return masterDirectoryRows.map((row) => {
    const name = normalizePlaceName(row.name);
    return {
      id: row.id,
      name,
      category: categoryForPlace(name, row.category),
      area: row.area,
      address: row.address,
      subtype: row.subtype,
      priority: row.priority,
      description: row.description,
      operatingInfo: row.operatingInfo,
      notes: row.notes,
      sourceUrl: row.sourceUrl,
      mapUrl: row.mapUrl,
      checkedAt: row.checkedAt,
    };
  });
}

function insertDirectoryStatement(db: D1Database, row: PlaceDirectoryInput, updatedAt: string, updatedBy: string) {
  return db.prepare(
    `INSERT INTO place_directory
      (id, name, category, area, address, subtype, priority, description, operating_info,
       notes, source_url, map_url, checked_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    row.id, row.name, row.category, row.area, row.address, row.subtype, row.priority,
    row.description, row.operatingInfo, row.notes, row.sourceUrl, row.mapUrl, row.checkedAt,
    updatedAt, updatedBy,
  );
}

async function syncBundledDirectory(db: D1Database) {
  await db.prepare(SOURCE_STATE_TABLE_SQL).run();
  const sourceState = await db.prepare(
    "SELECT source_version AS sourceVersion FROM place_directory_source_state WHERE id = 1",
  ).first() as { sourceVersion: string } | null;
  if (sourceState?.sourceVersion === masterDirectorySource.version) return;

  const existingResult = await db.prepare(
    `SELECT id, name, category, area, address, subtype, priority, description,
      operating_info AS operatingInfo, notes, source_url AS sourceUrl,
      map_url AS mapUrl, checked_at AS checkedAt
     FROM place_directory ORDER BY name COLLATE NOCASE`,
  ).all() as { results: PlaceDirectoryInput[] };
  const existingByName = new Map(
    existingResult.results.map((row) => [normalizePlaceName(row.name).toLocaleLowerCase("ko-KR"), row]),
  );
  const sourceRows = bundledRows().map((row) => {
    const existing = existingByName.get(row.name.toLocaleLowerCase("ko-KR"));
    return existing ? { ...row, id: existing.id } : row;
  });
  const sourceNames = new Set(sourceRows.map((row) => row.name.toLocaleLowerCase("ko-KR")));
  const retiredIds = new Set<string>(retiredMasterDirectoryIds);
  const retainedRows = existingResult.results.filter((row) => (
    !sourceNames.has(normalizePlaceName(row.name).toLocaleLowerCase("ko-KR")) && !retiredIds.has(row.id)
  ));
  const updatedAt = new Date().toISOString();
  const updatedBy = `source:${masterDirectorySource.version}`;
  const statements = [db.prepare("DELETE FROM place_directory")];
  [...sourceRows, ...retainedRows].forEach((row) => {
    statements.push(insertDirectoryStatement(db, row, updatedAt, updatedBy));
  });
  statements.push(db.prepare(
    `INSERT INTO place_directory_revision (id, updated_at, updated_by)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).bind(updatedAt, updatedBy));
  statements.push(db.prepare(
    `INSERT INTO place_directory_source_state (id, source_version, imported_at)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET source_version = excluded.source_version, imported_at = excluded.imported_at`,
  ).bind(masterDirectorySource.version, updatedAt));
  await db.batch(statements);
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  const { canEdit } = ownerAccess(request, runtime);
  if (!runtime.DB) return json({ rows: [], persistent: false, canEdit, updatedAt: null }, 503);
  await syncBundledDirectory(runtime.DB);
  const [rowsResult, revision] = await Promise.all([
    runtime.DB.prepare(
      `SELECT id, name, category, area, address, subtype, priority, description,
        operating_info AS operatingInfo, notes, source_url AS sourceUrl,
        map_url AS mapUrl, checked_at AS checkedAt
       FROM place_directory ORDER BY name COLLATE NOCASE`,
    ).all() as Promise<{ results: PlaceDirectoryInput[] }>,
    runtime.DB.prepare("SELECT updated_at AS updatedAt FROM place_directory_revision WHERE id = 1")
      .first() as Promise<{ updatedAt: string } | null>,
  ]);
  const rows = rowsResult.results.map((row) => ({
    ...row,
    name: normalizePlaceName(row.name),
    category: categoryForPlace(row.name, row.category),
  }));
  return json({ rows, persistent: true, canEdit, updatedAt: revision?.updatedAt ?? null });
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
  const rawRows = (payload as { rows?: unknown })?.rows;
  if (!Array.isArray(rawRows) || rawRows.length > MAX_ROWS) return json({ error: "valid directory rows required" }, 400);
  const rows = rawRows.map(normalizeRow);
  if (rows.some((row) => row === null)) return json({ error: "invalid directory row" }, 400);
  const validRows = rows as PlaceDirectoryInput[];
  const ids = new Set(validRows.map((row) => row.id));
  const names = new Set(validRows.map((row) => row.name.toLocaleLowerCase("ko-KR")));
  if (ids.size !== validRows.length) return json({ error: "duplicate directory id" }, 400);
  if (names.size !== validRows.length) return json({ error: "duplicate place name" }, 400);

  const revision = await runtime.DB.prepare("SELECT updated_at AS updatedAt FROM place_directory_revision WHERE id = 1")
    .first() as { updatedAt: string } | null;
  const baseUpdatedAt = cleanText((payload as { baseUpdatedAt?: unknown })?.baseUpdatedAt, 80);
  if (revision?.updatedAt && baseUpdatedAt !== revision.updatedAt) {
    return json({ error: "directory changed", updatedAt: revision.updatedAt }, 409);
  }

  const updatedAt = new Date().toISOString();
  const statements = [runtime.DB.prepare("DELETE FROM place_directory")];
  validRows.forEach((row) => {
    statements.push(insertDirectoryStatement(runtime.DB!, row, updatedAt, currentEmail));
  });
  statements.push(runtime.DB.prepare(
    `INSERT INTO place_directory_revision (id, updated_at, updated_by)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).bind(updatedAt, currentEmail));
  await runtime.DB.batch(statements);
  return json({ rows: validRows, persistent: true, canEdit: true, updatedAt });
}
