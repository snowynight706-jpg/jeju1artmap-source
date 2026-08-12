import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const taxonomySource = await readFile(new URL("../app/place-taxonomy.ts", import.meta.url), "utf8");
const directoryRouteSource = await readFile(new URL("../app/api/place-directory/route.ts", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const metadataMigration = await readFile(new URL("../drizzle/0016_zippy_swordsman.sql", import.meta.url), "utf8");
const convenienceMigration = await readFile(new URL("../drizzle/0017_jittery_lilandra.sql", import.meta.url), "utf8");

test("place taxonomy keeps four primary categories and seven activity-based additions", () => {
  for (const category of ["culture", "cafe", "food", "shop"]) {
    assert.match(taxonomySource, new RegExp(`PrimaryPublicCategoryId[^;]+${category}`, "s"));
  }
  for (const label of ["전시·공연", "복합문화", "창작·창업", "행사·대관", "체험·교육", "소품·로컬상품", "산책·휴식"]) {
    assert.match(taxonomySource, new RegExp(`name: "${label}"`));
  }
  assert.match(taxonomySource, /\.slice\(0, 3\)/);
  assert.match(pageSource, /selected\.size >= 3/);
  assert.match(pageSource, /추가분류는 장소별로 최대 3개/);
});

test("same-building facilities share one anchor but remain separate selectable records", () => {
  assert.match(taxonomySource, /ART_PLATFORM_GROUP_ID = "jeju-art-platform-building"/);
  assert.match(taxonomySource, /"제주아트플랫폼"[\s\S]+"아르코공연연습센터@제주"[\s\S]+"제주예술인복지센터"/);
  assert.match(pageSource, /selectedLocationGroupPlaces\.map/);
  assert.match(pageSource, /locationGroupCountByAnchorId/);
  assert.match(metadataMigration, /map_anchor_id` = 'jeju-art-platform'/);
});

test("communication center is the persisted and visible workation main hub", () => {
  assert.match(taxonomySource, /MAIN_HUB_CANONICAL_NAME = "제주시소통협력센터"/);
  assert.match(taxonomySource, /\? "제주소통협력센터"\s*:\s*name/);
  assert.match(pageSource, /publicElementName = isMainHub \? "제주소통협력센터" : element\.name/);
  assert.match(pageSource, /className="main-hub-badge" aria-label="주요 거점">▼/);
  assert.match(pageSource, /item\.isMainHub \? "▼" : meta\.glyph/);
  assert.match(pageSource, /const initialElements: MapElement\[\] = ensureMainHubMapElement/);
  assert.match(metadataMigration, /featured_role` = 'workation-main-hub'/);
  assert.match(metadataMigration, /\["creative-startup","event-rental","experience-education"\]/);
});

test("public marker selection uses a yellow ring only while active", () => {
  assert.match(cssSource, /\.map-element\.public-active::after[^}]+border: 2px solid #e6a926/);
  assert.match(cssSource, /\.map-element\.main-hub\.public-active::after/);
  assert.doesNotMatch(cssSource, /\.map-element\.main-hub \.icon-visual::after/);
  assert.match(cssSource, /\.public-place-list article\.selected[^}]+border-color: #d9ad45/);
});

test("convenience information is stored independently from category tags", () => {
  assert.match(taxonomySource, /export type ConvenienceAttributeId/);
  assert.match(pageSource, /className="database-convenience-attributes"/);
  assert.match(directoryRouteSource, /convenience_attributes_json AS convenienceAttributesJson/);
  assert.match(convenienceMigration, /ADD `convenience_attributes_json`/);
});

test("right marker properties update the linked directory taxonomy", () => {
  assert.match(pageSource, /className="marker-taxonomy-section" aria-label="DB 연동 장소 분류"/);
  assert.match(pageSource, /updateSelectedDirectoryTaxonomy\(selectedDirectoryPlace/);
  assert.match(pageSource, /toggleSelectedDirectoryAdditionalCategory\(selectedDirectoryPlace/);
  assert.match(pageSource, /method: "PATCH"/);
  assert.match(directoryRouteSource, /export async function PATCH/);
  assert.match(directoryRouteSource, /UPDATE place_directory[\s\S]+additional_categories_json/);
});

test("mobile explorer and detail sheets preserve the map-first default", () => {
  assert.match(pageSource, /장소 · 리뷰 · 행사/);
  assert.match(pageSource, /globalContentTab === "places"/);
  assert.match(cssSource, /global-story-panel\.public-explorer-panel[^}]+height: min\(38dvh, 360px\)/);
  assert.match(cssSource, /public-place-sheet[^}]+height: min\(34dvh, 310px\)/);
  assert.match(cssSource, /public-place-sheet\.expanded[^}]+68dvh/);
});
