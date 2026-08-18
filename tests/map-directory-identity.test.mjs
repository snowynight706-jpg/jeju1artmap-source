import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ensureIndependentMapElementIdentity,
  sameMapPlaceIdentity,
} from "../app/map-element-identity.mjs";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const adminDatabaseSource = await readFile(new URL("../app/admin-database-editor.tsx", import.meta.url), "utf8");
const masterDirectorySource = await readFile(new URL("../app/master-directory.ts", import.meta.url), "utf8");
const directoryRouteSource = await readFile(new URL("../app/api/place-directory/route.ts", import.meta.url), "utf8");

test("a persisted DB binding and its former name-only marker are the same map place", () => {
  const normalizeName = (name) => name.trim().replace("제주해변공연장", "탑동해변공연장");
  assert.equal(sameMapPlaceIdentity(
    { directoryId: "map-new", name: "탑동해변공연장" },
    { name: "제주해변공연장" },
    normalizeName,
  ), true);
  assert.equal(sameMapPlaceIdentity(
    { directoryId: "map-new", name: "서로 다른 이름" },
    { directoryId: "map-new", name: "다른 표시명" },
    normalizeName,
  ), true);
});

test("duplicate DB bindings collapse to the original placed marker", () => {
  const original = {
    id: "placed-marker",
    directoryId: "place-1",
    name: "기존 장소",
    x: 31,
    y: 42,
    size: 7.2,
    assetId: "custom-resource",
  };
  const duplicate = {
    id: "factory-marker",
    directoryId: "place-1",
    name: "기존 장소",
    x: 50,
    y: 50,
    size: 1.7,
    assetId: "factory-resource",
  };
  const result = ensureIndependentMapElementIdentity([original, duplicate], {
    recoverId: (_element, index) => `recovered-${index}`,
  });
  assert.deepEqual(result, [original]);
});

test("unlinked decorative markers are not removed solely for sharing a name", () => {
  const result = ensureIndependentMapElementIdentity([
    { id: "one", name: "장식" },
    { id: "two", name: "장식" },
  ], { recoverId: (_element, index) => `recovered-${index}` });
  assert.equal(result.length, 2);
});

test("restore and DB connection paths reuse the existing map marker", () => {
  assert.match(pageSource, /!parsedElements\.some\(\(item\) => isSameMapPlace\(item, defaultItem\)\)/);
  assert.match(pageSource, /\.filter\(\(item\) => item\.id === element\.id \|\| !isSameMapPlace\(item, linkedElement\)\)/);
  assert.match(pageSource, /\.map\(\(item\) => item\.id === element\.id \? linkedElement : item\)/);
});

test("every formerly missing current landmark has an exact bundled DB row", () => {
  for (const name of ["칠성로", "동문시장", "북수구광장", "탑동광장", "탑동해변공연장"]) {
    assert.match(masterDirectorySource, new RegExp(`"name": "${name}"`));
  }
  assert.match(masterDirectorySource, /"version": "v14-칠성로상점가-통합"/);
  assert.doesNotMatch(masterDirectorySource, /"name": "탑동해변공연장·탑동광장"/);
});

test("DB area editing selects an existing region value from a visible dropdown", () => {
  assert.match(pageSource, /const databaseAreaOptions = useMemo/);
  assert.match(adminDatabaseSource, /<label>권역·세부지역 <em>기존 값 선택<\/em><select/);
  assert.match(adminDatabaseSource, /aria-label="권역·세부지역 선택"/);
  assert.match(adminDatabaseSource, /areaOptions\.map/);
});

test("bundled DB refresh upserts in bounded batches before removing stale rows", () => {
  assert.match(directoryRouteSource, /DIRECTORY_SYNC_BATCH_SIZE = 50/);
  assert.match(directoryRouteSource, /ON CONFLICT\(id\) DO UPDATE SET/);
  assert.match(directoryRouteSource, /for \(let offset = 0; offset < desiredRows\.length; offset \+= DIRECTORY_SYNC_BATCH_SIZE\)/);
  assert.match(directoryRouteSource, /const staleIds = existingRows\.map/);
  assert.doesNotMatch(directoryRouteSource, /const statements = \[db\.prepare\("DELETE FROM place_directory"\)\]/);
});
