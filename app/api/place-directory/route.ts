import { masterDirectoryRows, masterDirectorySource, retiredMasterDirectoryIds } from "../../master-directory";
import { normalizePlaceName } from "../../core-landmarks";
import { adminAccess, type AdminRuntimeEnv } from "../../admin-auth";
import {
  MAIN_HUB_CANONICAL_NAME,
  MAIN_HUB_ROLE,
  directoryMetadataDefaults,
  isPrimaryPublicCategory,
  mergeDirectoryMetadata,
  normalizeDirectoryCategory,
  sanitizeAdditionalCategories,
  sanitizeConvenienceAttributes,
  type AdditionalCategoryId,
  type ConvenienceAttributeId,
} from "../../place-taxonomy";

export const runtime = "edge";

const CATEGORIES = new Set(["landmark", "culture", "cafe", "food", "shop", "parking", "park", "utility"]);
const MAX_ROWS = 600;
const MAIN_HUB_DIRECTORY_ID = "place-sotong-center";
const DIRECTORY_SYNC_BATCH_SIZE = 50;

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
  additionalCategories: AdditionalCategoryId[];
  convenienceAttributes: ConvenienceAttributeId[];
  locationGroupId: string;
  mapAnchorId: string;
  featuredRole: string;
  aliases: string[];
};

type StoredDirectoryRow = Omit<PlaceDirectoryInput, "additionalCategories" | "convenienceAttributes" | "aliases"> & {
  additionalCategoriesJson: string;
  convenienceAttributesJson: string;
  aliasesJson: string;
  updatedAt?: string;
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
  const normalizedBase = {
    id: cleanText(row.id, 180),
    name,
    category: normalizeDirectoryCategory(cleanText(row.category, 32)),
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
  const defaults = directoryMetadataDefaults(name, normalizedBase.category, normalizedBase.subtype, normalizedBase.description);
  const metadata = mergeDirectoryMetadata({
    additionalCategories: sanitizeAdditionalCategories(row.additionalCategories),
    convenienceAttributes: sanitizeConvenienceAttributes(row.convenienceAttributes),
    locationGroupId: cleanText(row.locationGroupId, 180),
    mapAnchorId: cleanText(row.mapAnchorId, 180),
    featuredRole: cleanText(row.featuredRole, 120),
    aliases: Array.isArray(row.aliases) ? row.aliases.map((item) => cleanText(item, 180)).filter(Boolean).slice(0, 12) : [],
  }, defaults);
  const normalized = { ...normalizedBase, ...metadata };
  return normalized.id && normalized.name && CATEGORIES.has(normalized.category) ? normalized : null;
}

function storedRowToInput(row: StoredDirectoryRow): PlaceDirectoryInput {
  const name = normalizePlaceName(row.name);
  const category = normalizeDirectoryCategory(row.category);
  const defaults = directoryMetadataDefaults(name, category, row.subtype, row.description);
  let additionalCategoriesSource: unknown = row.additionalCategoriesJson;
  let hasExplicitAdditionalCategories = false;
  try {
    const parsed = JSON.parse(row.additionalCategoriesJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray((parsed as { values?: unknown }).values)) {
      additionalCategoriesSource = (parsed as { values: unknown }).values;
      hasExplicitAdditionalCategories = true;
    } else {
      additionalCategoriesSource = parsed;
    }
  } catch {
    additionalCategoriesSource = row.additionalCategoriesJson;
  }
  const additionalCategories = sanitizeAdditionalCategories(additionalCategoriesSource);
  let convenienceAttributesSource: unknown = row.convenienceAttributesJson;
  let hasExplicitConvenienceAttributes = false;
  try {
    const parsed = JSON.parse(row.convenienceAttributesJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray((parsed as { values?: unknown }).values)) {
      convenienceAttributesSource = (parsed as { values: unknown }).values;
      hasExplicitConvenienceAttributes = true;
    } else {
      convenienceAttributesSource = parsed;
    }
  } catch {
    convenienceAttributesSource = row.convenienceAttributesJson;
  }
  const convenienceAttributes = sanitizeConvenienceAttributes(convenienceAttributesSource);
  let aliases: string[] = [];
  try {
    const parsed = JSON.parse(row.aliasesJson) as unknown;
    aliases = Array.isArray(parsed) ? parsed.map((item) => cleanText(item, 180)).filter(Boolean).slice(0, 12) : [];
  } catch {
    aliases = [];
  }
  const metadata = mergeDirectoryMetadata({
    ...(hasExplicitAdditionalCategories || additionalCategories.length ? { additionalCategories } : {}),
    ...(hasExplicitConvenienceAttributes || convenienceAttributes.length ? { convenienceAttributes } : {}),
    locationGroupId: row.locationGroupId,
    mapAnchorId: row.mapAnchorId,
    featuredRole: row.featuredRole,
    ...(aliases.length ? { aliases } : {}),
  }, defaults);
  const {
    additionalCategoriesJson: _additionalCategoriesJson,
    convenienceAttributesJson: _convenienceAttributesJson,
    aliasesJson: _aliasesJson,
    updatedAt: _updatedAt,
    ...rest
  } = row;
  void _additionalCategoriesJson;
  void _convenienceAttributesJson;
  void _aliasesJson;
  void _updatedAt;
  return { ...rest, name, category, ...metadata };
}

function ownerAccess(request: Request, runtime: RuntimeEnv) {
  const access = adminAccess(request, runtime);
  return { canEdit: access.allowed, currentEmail: access.actor };
}

function bundledRows(): PlaceDirectoryInput[] {
  return masterDirectoryRows.map((row) => {
    const name = normalizePlaceName(row.name);
    const base = {
      id: name === MAIN_HUB_CANONICAL_NAME ? MAIN_HUB_DIRECTORY_ID : row.id,
      name,
      category: normalizeDirectoryCategory(row.category),
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
    return { ...base, ...directoryMetadataDefaults(name, base.category, row.subtype, row.description) };
  });
}

function insertDirectoryStatement(db: D1Database, row: PlaceDirectoryInput, updatedAt: string, updatedBy: string) {
  return db.prepare(
    `INSERT INTO place_directory
      (id, name, category, area, address, subtype, priority, description, operating_info,
       notes, source_url, map_url, checked_at, additional_categories_json, convenience_attributes_json, location_group_id,
       map_anchor_id, featured_role, aliases_json, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       category = excluded.category,
       area = excluded.area,
       address = excluded.address,
       subtype = excluded.subtype,
       priority = excluded.priority,
       description = excluded.description,
       operating_info = excluded.operating_info,
       notes = excluded.notes,
       source_url = excluded.source_url,
       map_url = excluded.map_url,
       checked_at = excluded.checked_at,
       additional_categories_json = excluded.additional_categories_json,
       convenience_attributes_json = excluded.convenience_attributes_json,
       location_group_id = excluded.location_group_id,
       map_anchor_id = excluded.map_anchor_id,
       featured_role = excluded.featured_role,
       aliases_json = excluded.aliases_json,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).bind(
    row.id, row.name, row.category, row.area, row.address, row.subtype, row.priority,
    row.description, row.operatingInfo, row.notes, row.sourceUrl, row.mapUrl, row.checkedAt,
    JSON.stringify({ values: row.additionalCategories }), JSON.stringify({ values: row.convenienceAttributes }),
    row.locationGroupId, row.mapAnchorId, row.featuredRole,
    JSON.stringify(row.aliases),
    updatedAt, updatedBy,
  );
}

async function syncBundledDirectory(db: D1Database) {
  await db.prepare(SOURCE_STATE_TABLE_SQL).run();
  const sourceState = await db.prepare(
    "SELECT source_version AS sourceVersion FROM place_directory_source_state WHERE id = 1",
  ).first() as { sourceVersion: string } | null;
  const existingResult = await db.prepare(
    `SELECT id, name, category, area, address, subtype, priority, description,
      operating_info AS operatingInfo, notes, source_url AS sourceUrl,
      map_url AS mapUrl, checked_at AS checkedAt, additional_categories_json AS additionalCategoriesJson,
      convenience_attributes_json AS convenienceAttributesJson,
      location_group_id AS locationGroupId, map_anchor_id AS mapAnchorId,
      featured_role AS featuredRole, aliases_json AS aliasesJson, updated_at AS updatedAt
     FROM place_directory ORDER BY name COLLATE NOCASE`,
  ).all() as { results: StoredDirectoryRow[] };
  const existingRows = existingResult.results.map(storedRowToInput);
  const mainHubStoredRows = existingResult.results.filter((row) => (
    normalizePlaceName(row.name) === MAIN_HUB_CANONICAL_NAME || row.featuredRole === MAIN_HUB_ROLE
  ));
  const mainHubDirectoryDrift = mainHubStoredRows.length !== 1
    || mainHubStoredRows[0]?.id !== MAIN_HUB_DIRECTORY_ID
    || normalizePlaceName(mainHubStoredRows[0]?.name ?? "") !== MAIN_HUB_CANONICAL_NAME;
  if (sourceState?.sourceVersion === masterDirectorySource.version && !mainHubDirectoryDrift) return;

  const preferredMainHubId = [...mainHubStoredRows]
    .sort((left, right) => Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? ""))[0]?.id;
  const preferredMainHub = existingRows.find((row) => row.id === preferredMainHubId)
    ?? existingRows.find((row) => normalizePlaceName(row.name) === MAIN_HUB_CANONICAL_NAME);
  const existingByName = new Map(
    existingRows.map((row) => [normalizePlaceName(row.name).toLocaleLowerCase("ko-KR"), row]),
  );
  const retiredIds = new Set<string>(retiredMasterDirectoryIds);
  const sourceRows = bundledRows().map((row) => {
    const isMainHub = normalizePlaceName(row.name) === MAIN_HUB_CANONICAL_NAME;
    const existing = isMainHub
      ? preferredMainHub
      : existingByName.get(row.name.toLocaleLowerCase("ko-KR"));
    return existing ? {
      ...row,
      id: isMainHub || retiredIds.has(existing.id) ? row.id : existing.id,
      additionalCategories: existing.additionalCategories,
      convenienceAttributes: existing.convenienceAttributes,
      locationGroupId: existing.locationGroupId,
      mapAnchorId: existing.mapAnchorId,
      featuredRole: isMainHub ? MAIN_HUB_ROLE : existing.featuredRole,
      aliases: [...new Set([...row.aliases, ...existing.aliases])].slice(0, 12),
    } : row;
  });
  const sourceNames = new Set(sourceRows.map((row) => row.name.toLocaleLowerCase("ko-KR")));
  const retainedRows = existingRows.filter((row) => (
    !sourceNames.has(normalizePlaceName(row.name).toLocaleLowerCase("ko-KR")) && !retiredIds.has(row.id)
  ));
  const updatedAt = new Date().toISOString();
  const updatedBy = `source:${masterDirectorySource.version}`;
  const desiredRows = [...sourceRows, ...retainedRows];
  for (let offset = 0; offset < desiredRows.length; offset += DIRECTORY_SYNC_BATCH_SIZE) {
    await db.batch(desiredRows
      .slice(offset, offset + DIRECTORY_SYNC_BATCH_SIZE)
      .map((row) => insertDirectoryStatement(db, row, updatedAt, updatedBy)));
  }

  const desiredIds = new Set(desiredRows.map((row) => row.id));
  const staleIds = existingRows.map((row) => row.id).filter((id) => !desiredIds.has(id));
  for (let offset = 0; offset < staleIds.length; offset += DIRECTORY_SYNC_BATCH_SIZE) {
    await db.batch(staleIds
      .slice(offset, offset + DIRECTORY_SYNC_BATCH_SIZE)
      .map((id) => db.prepare("DELETE FROM place_directory WHERE id = ?").bind(id)));
  }

  await db.batch([db.prepare(
    `INSERT INTO place_directory_revision (id, updated_at, updated_by)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).bind(updatedAt, updatedBy),
  db.prepare(
    `INSERT INTO place_directory_source_state (id, source_version, imported_at)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET source_version = excluded.source_version, imported_at = excluded.imported_at`,
  ).bind(masterDirectorySource.version, updatedAt)]);
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
        map_url AS mapUrl, checked_at AS checkedAt, additional_categories_json AS additionalCategoriesJson,
        convenience_attributes_json AS convenienceAttributesJson,
        location_group_id AS locationGroupId, map_anchor_id AS mapAnchorId,
        featured_role AS featuredRole, aliases_json AS aliasesJson
       FROM place_directory ORDER BY name COLLATE NOCASE`,
    ).all() as Promise<{ results: StoredDirectoryRow[] }>,
    runtime.DB.prepare("SELECT updated_at AS updatedAt FROM place_directory_revision WHERE id = 1")
      .first() as Promise<{ updatedAt: string } | null>,
  ]);
  const rows = rowsResult.results.map(storedRowToInput);
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

export async function POST(request: Request) {
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
  const body = payload as {
    name?: unknown;
    category?: unknown;
    address?: unknown;
    addressSourceUrl?: unknown;
    additionalCategories?: unknown;
  };
  const name = normalizePlaceName(cleanText(body.name, 160));
  const category = normalizeDirectoryCategory(cleanText(body.category, 32));
  const additionalCategories = sanitizeAdditionalCategories(body.additionalCategories);
  if (!name || !isPrimaryPublicCategory(category) || !Array.isArray(body.additionalCategories)) {
    return json({ error: "valid unlinked place taxonomy required" }, 400);
  }

  await syncBundledDirectory(runtime.DB);
  const stored = await runtime.DB.prepare(
    `SELECT id, name, category, area, address, subtype, priority, description,
      operating_info AS operatingInfo, notes, source_url AS sourceUrl,
      map_url AS mapUrl, checked_at AS checkedAt, additional_categories_json AS additionalCategoriesJson,
      convenience_attributes_json AS convenienceAttributesJson,
      location_group_id AS locationGroupId, map_anchor_id AS mapAnchorId,
      featured_role AS featuredRole, aliases_json AS aliasesJson
     FROM place_directory WHERE name = ? LIMIT 1`,
  ).bind(name).first() as StoredDirectoryRow | null;
  const updatedAt = new Date().toISOString();

  if (stored) {
    const current = storedRowToInput(stored);
    const next = normalizeRow({ ...current, category, additionalCategories });
    if (!next) return json({ error: "invalid place taxonomy" }, 400);
    await runtime.DB.batch([
      runtime.DB.prepare(
        `UPDATE place_directory
         SET category = ?, additional_categories_json = ?, updated_at = ?, updated_by = ?
         WHERE id = ?`,
      ).bind(
        next.category,
        JSON.stringify({ values: next.additionalCategories }),
        updatedAt,
        currentEmail,
        next.id,
      ),
      runtime.DB.prepare(
        `INSERT INTO place_directory_revision (id, updated_at, updated_by)
         VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      ).bind(updatedAt, currentEmail),
    ]);
    return json({ row: next, created: false, persistent: true, canEdit: true, updatedAt });
  }

  const row = normalizeRow({
    id: `map-${crypto.randomUUID()}`,
    name,
    category,
    area: "지도 편집 등록",
    address: cleanText(body.address, 260),
    subtype: "지도 자산 연결",
    priority: "검토",
    description: "",
    operatingInfo: "",
    notes: "관리자 우측 속성에서 DB 미연결 지도 자산을 연결하여 생성",
    sourceUrl: cleanText(body.addressSourceUrl, 1200),
    mapUrl: "",
    checkedAt: "",
    additionalCategories,
    convenienceAttributes: [],
    locationGroupId: "",
    mapAnchorId: "",
    featuredRole: "",
    aliases: [],
  });
  if (!row) return json({ error: "invalid unlinked place" }, 400);

  await runtime.DB.batch([
    insertDirectoryStatement(runtime.DB, row, updatedAt, currentEmail),
    runtime.DB.prepare(
      `INSERT INTO place_directory_revision (id, updated_at, updated_by)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    ).bind(updatedAt, currentEmail),
  ]);
  return json({ row, created: true, persistent: true, canEdit: true, updatedAt }, 201);
}

export async function PATCH(request: Request) {
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
  const body = payload as { id?: unknown; category?: unknown; additionalCategories?: unknown; address?: unknown };
  const id = cleanText(body.id, 180);
  const updatesTaxonomy = body.category !== undefined || body.additionalCategories !== undefined;
  const updatesAddress = typeof body.address === "string";
  const category = normalizeDirectoryCategory(cleanText(body.category, 32));
  const additionalCategories = sanitizeAdditionalCategories(body.additionalCategories);
  if (!id || (!updatesTaxonomy && !updatesAddress)) {
    return json({ error: "place update required" }, 400);
  }
  if (updatesTaxonomy && (!isPrimaryPublicCategory(category) || !Array.isArray(body.additionalCategories))) {
    return json({ error: "valid place taxonomy required" }, 400);
  }

  const stored = await runtime.DB.prepare(
    `SELECT id, name, category, area, address, subtype, priority, description,
      operating_info AS operatingInfo, notes, source_url AS sourceUrl,
      map_url AS mapUrl, checked_at AS checkedAt, additional_categories_json AS additionalCategoriesJson,
      convenience_attributes_json AS convenienceAttributesJson,
      location_group_id AS locationGroupId, map_anchor_id AS mapAnchorId,
      featured_role AS featuredRole, aliases_json AS aliasesJson
     FROM place_directory WHERE id = ? LIMIT 1`,
  ).bind(id).first() as StoredDirectoryRow | null;
  if (!stored) return json({ error: "place not found" }, 404);

  const current = storedRowToInput(stored);
  const next = normalizeRow({
    ...current,
    ...(updatesTaxonomy ? { category, additionalCategories } : {}),
    ...(updatesAddress ? { address: cleanText(body.address, 260) } : {}),
  });
  if (!next) return json({ error: "invalid place update" }, 400);

  const updatedAt = new Date().toISOString();
  await runtime.DB.batch([
    runtime.DB.prepare(
      `UPDATE place_directory
       SET category = ?, additional_categories_json = ?, address = ?, updated_at = ?, updated_by = ?
       WHERE id = ?`,
    ).bind(
      next.category,
      JSON.stringify({ values: next.additionalCategories }),
      next.address,
      updatedAt,
      currentEmail,
      next.id,
    ),
    runtime.DB.prepare(
      `INSERT INTO place_directory_revision (id, updated_at, updated_by)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    ).bind(updatedAt, currentEmail),
  ]);
  return json({ row: next, persistent: true, canEdit: true, updatedAt });
}
