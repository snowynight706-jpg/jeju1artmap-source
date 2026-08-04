import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [sourcePath] = process.argv.slice(2);
if (!sourcePath) {
  throw new Error("Usage: node scripts/update-master-directory.mjs <master-db.json>");
}

const root = process.cwd();
const outputPath = path.join(root, "app/master-directory.ts");
const previousSource = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
const previousIds = new Map();
const retainedRetiredIds = new Set(["master-place-7"]);
let previousIndex = 0;

for (const match of previousSource.matchAll(/\{\s*(?:id:\s*"([^"]+)",\s*)?name:\s*"([^"]+)"/g)) {
  previousIndex += 1;
  previousIds.set(match[2], match[1] || `master-place-${previousIndex}`);
}

const sourceBytes = fs.readFileSync(sourcePath);
const backup = JSON.parse(sourceBytes.toString("utf8"));
const sourceVersion = "v10-음파온차-음식점분류";
const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
const includedSheets = new Set(["문화공간", "카페·음식점·소품샵", "역사·산책·관광"]);
const walkCategories = /^(도보코스|마을산책|상권·산책|수변산책|시장·산책|자연·산책|해안산책)$/;
const shopCategories = /^(소품샵|제주 기념품|캐릭터|작가 협업)/;
const foodCategories = /(음식점|주류|식음|떡·간식)/;

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function categoryFor(sheetName, subtype) {
  if (sheetName === "문화공간") return "culture";
  if (sheetName === "역사·산책·관광") return walkCategories.test(subtype) ? "park" : "culture";
  if (shopCategories.test(subtype)) return "shop";
  if (foodCategories.test(subtype)) return "food";
  return "cafe";
}

function joinNotes(parts) {
  return parts.filter((part) => part[1]).map(([label, value]) => `${label}: ${value}`).join(" · ");
}

function stableId(name) {
  const previous = previousIds.get(name);
  if (previous) return previous;
  const suffix = createHash("sha1").update(name).digest("hex").slice(0, 12);
  return `master-v10-${suffix}`;
}

const rows = backup.sheets
  .filter((sheet) => includedSheets.has(sheet.sheet_name))
  .flatMap((sheet) => sheet.records.map((record) => {
    const name = clean(record["장소명"]);
    const subtype = clean(record["분류"]);
    const officialUrl = clean(record["공식 홈페이지·안내"]);
    const snsUrl = clean(record.SNS);
    return {
      id: stableId(name),
      name,
      address: clean(record["주소"]),
      area: clean(record["세부지역"]),
      subtype,
      priority: clean(record["우선도"]),
      description: clean(record["설명"]),
      operatingInfo: joinNotes([
        ["운영시간", clean(record["운영시간"])],
        ["휴무일", clean(record["휴무일"])],
        ["비용", clean(record["비용"])],
      ]),
      notes: joinNotes([
        ["거리", clean(record["거리"])],
        ["이용·참고", clean(record["이용·참고"] ?? record["사진·이용 참고"])],
        ["문화향유", clean(record["문화향유"])],
        ["운영 상태", clean(record["운영 상태"])],
        ["SNS", snsUrl],
      ]),
      sourceUrl: officialUrl || snsUrl,
      mapUrl: clean(record["지도"]),
      checkedAt: clean(record["최종 확인일"]),
      sourceSheet: sheet.sheet_name,
      category: categoryFor(sheet.sheet_name, subtype),
    };
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "ko-KR"));

const duplicateNames = rows.filter((row, index) => rows.findIndex((candidate) => candidate.name === row.name) !== index);
if (duplicateNames.length) throw new Error(`Duplicate place names: ${duplicateNames.map((row) => row.name).join(", ")}`);
if (rows.length !== 160) throw new Error(`Expected 160 place rows, received ${rows.length}`);
const currentNames = new Set(rows.map((row) => row.name));
for (const [name, id] of previousIds) {
  if (!currentNames.has(name) && id.startsWith("master-place-")) retainedRetiredIds.add(id);
}

const typeHeader = `export type MasterDirectoryRow = {
  id: string;
  name: string;
  address: string;
  area: string;
  subtype: string;
  priority: string;
  description: string;
  operatingInfo: string;
  notes: string;
  sourceUrl: string;
  mapUrl: string;
  checkedAt: string;
  sourceSheet: "문화공간" | "카페·음식점·소품샵" | "역사·산책·관광";
  category: "culture" | "cafe" | "food" | "shop" | "park";
};`;

const output = `${typeHeader}

export const masterDirectorySource = ${JSON.stringify({
  version: sourceVersion,
  sourceFile: backup.source_file,
  sourceSha256: backup.source_sha256,
  backupSha256: sourceHash,
  restoredAtUtc: backup.restored_at_utc,
  workbookVersion: backup.source_workbook_version_label,
  placeCount: rows.length,
}, null, 2)} as const;

export const retiredMasterDirectoryIds = ${JSON.stringify([...retainedRetiredIds].sort(), null, 2)} as const;

export const masterDirectoryRows: MasterDirectoryRow[] = ${JSON.stringify(rows, null, 2)};
`;

fs.writeFileSync(outputPath, output);

const counts = Object.fromEntries(Object.entries(Object.groupBy(rows, (row) => row.category)).map(([key, value]) => [key, value.length]));
console.log(JSON.stringify({ outputPath, sourceVersion, sourceHash, rows: rows.length, counts }, null, 2));
