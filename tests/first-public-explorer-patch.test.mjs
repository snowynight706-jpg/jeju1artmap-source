import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readAppClientSource } from "./source-fixtures.mjs";

const pageSource = await readAppClientSource();
const adminDatabaseSource = await readFile(new URL("../app/admin-database-editor.tsx", import.meta.url), "utf8");
const taxonomySource = await readFile(new URL("../app/place-taxonomy.ts", import.meta.url), "utf8");
const directoryRouteSource = await readFile(new URL("../app/api/place-directory/route.ts", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const metadataMigration = await readFile(new URL("../drizzle/0016_zippy_swordsman.sql", import.meta.url), "utf8");
const convenienceMigration = await readFile(new URL("../drizzle/0017_jittery_lilandra.sql", import.meta.url), "utf8");

test("place taxonomy keeps four primary categories and granular unlimited additions", () => {
  for (const category of ["culture", "cafe", "food", "shop"]) {
    assert.match(taxonomySource, new RegExp(`PrimaryPublicCategoryId[^;]+${category}`, "s"));
  }
  for (const label of ["복합문화", "전시", "공연", "창작", "창업", "행사", "대관", "체험", "교육", "산책", "휴식", "소품샵", "독서", "관광", "시장&상가"]) {
    assert.match(taxonomySource, new RegExp(`name: "${label}"`));
  }
  assert.doesNotMatch(taxonomySource, /\.slice\(0, 3\)/);
  assert.doesNotMatch(pageSource, /selected\.size >= 3|추가분류는 장소별로 최대 3개/);
  assert.match(taxonomySource, /"exhibition-performance": \["exhibition", "performance"\]/);
  assert.match(taxonomySource, /"experience-education": \["experience", "education"\]/);
  assert.match(taxonomySource, /"walk-rest": \["walk", "rest"\]/);
  assert.match(adminDatabaseSource, /추가분류 · 선택 제한 없음/);
});

test("same-building facilities share one anchor but remain separate selectable records", () => {
  assert.match(taxonomySource, /ART_PLATFORM_GROUP_ID = "jeju-art-platform-building"/);
  assert.match(taxonomySource, /"제주아트플랫폼"[\s\S]+"아르코공연연습센터@제주"[\s\S]+"제주예술인복지센터"/);
  assert.match(pageSource, /selectedLocationGroupPlaces\.map/);
  assert.match(pageSource, /const candidates = ownPlace\?\.locationGroupId[\s\S]+directoryPlacesByGroup\.get\(ownPlace\.locationGroupId\)/);
  assert.doesNotMatch(pageSource, /location-group-badge/);
  assert.doesNotMatch(cssSource, /\.location-group-badge/);
  assert.match(metadataMigration, /map_anchor_id` = 'jeju-art-platform'/);
});

test("general markers render 25 percent larger while landmark scale stays unchanged", () => {
  assert.match(pageSource, /GENERAL_MARKER_DISPLAY_SCALE = 1\.25/);
  assert.match(pageSource, /return element\.category === "landmark" \? element\.size : element\.size \* GENERAL_MARKER_DISPLAY_SCALE/);
  assert.match(pageSource, /className=\{`map-element \$\{element\.category !== "landmark" \? "general-marker"/);
  assert.match(pageSource, /width: `\$\{displaySize\}%`/);
  assert.match(pageSource, /boxWidth = exportWidth \* mapElementDisplaySize\(element\) \/ 100/);
});

test("communication center is the persisted and visible workation main hub", () => {
  assert.match(taxonomySource, /MAIN_HUB_CANONICAL_NAME = "제주시소통협력센터"/);
  assert.match(taxonomySource, /\? "제주소통협력센터"\s*:\s*name/);
  assert.match(pageSource, /publicElementName = isMainHub \? "제주소통협력센터" : element\.name/);
  assert.match(pageSource, /className=\{`map-focus-pointer \$\{isMainHub \? "main-hub-badge" : "located-place-badge"\}/);
  assert.match(pageSource, /<article className=\{`\$\{selectedItem \? "selected" : ""\} \$\{item\.isMainHub \? "main-hub" : ""\} \$\{eventListedInCulture \? "event-linked" : ""\}`\}/);
  assert.doesNotMatch(pageSource, /<img src=\{meta\.iconSrc\}/);
  assert.match(pageSource, /const initialElements: MapElement\[\] = ensureMainHubMapElement/);
  assert.match(metadataMigration, /featured_role` = 'workation-main-hub'/);
  assert.match(metadataMigration, /\["creative-startup","event-rental","experience-education"\]/);
});

test("public marker selection reuses the red main-hub pointer instead of a yellow ring", () => {
  assert.match(pageSource, /\(isMainHub \|\| isPublicSelected\)/);
  assert.match(pageSource, /isPublicSelected \? "현재 찾은 장소 ▼" : "주요 거점 ▼"/);
  assert.match(pageSource, /className="map-focus-pointer-label">찾은 장소<\/span>/);
  assert.match(pageSource, /publicSelectedMarkerZIndex = useMemo\([\s\S]+visibleElements\.reduce\(\(highest, element\) => Math\.max\(highest, element\.z\), 0\) \+ 1/);
  assert.match(pageSource, /zIndex: isPublicSelected \? publicSelectedMarkerZIndex : element\.z/);
  assert.match(cssSource, /\.main-hub-badge \{[^}]*width: 24px[^}]*height: 22px/);
  assert.match(cssSource, /\.map-focus-pointer\.located \{[^}]*top: -36px[^}]*width: 30px[^}]*height: 28px[^}]*located-place-arrival/);
  assert.match(cssSource, /\.map-element\.public-active::after \{[^}]*linear-gradient\(#c83b36, #c83b36\)[^}]*12px 4px[^}]*drop-shadow\(0 4px 9px[^}]*located-target-arrival/);
  assert.match(cssSource, /\.map-element\.public-active \.label \{[^}]*border: 1\.5px solid #c83b36[^}]*0 6px 15px[^}]*font-weight: 850/);
  assert.doesNotMatch(cssSource, /\.map-focus-pointer\.located::after/);
  assert.doesNotMatch(cssSource, /#e6a926|border-radius: 50%[^\n]*public-active/);
  assert.doesNotMatch(cssSource, /\.map-element\.main-hub \.icon-visual::after/);
  assert.match(cssSource, /\.public-place-list article\.selected[^}]+border-color: #d9ad45/);
});

test("convenience information is stored independently from category tags", () => {
  assert.match(taxonomySource, /export type ConvenienceAttributeId/);
  assert.match(adminDatabaseSource, /className="database-convenience-attributes"/);
  assert.match(directoryRouteSource, /convenience_attributes_json AS convenienceAttributesJson/);
  assert.match(convenienceMigration, /ADD `convenience_attributes_json`/);
});

test("right marker properties update the linked directory taxonomy", () => {
  assert.match(pageSource, /className="compact-basic-information" title="기본 정보"/);
  assert.match(pageSource, /분류 <em>연결 DB 즉시 반영<\/em>/);
  assert.match(pageSource, /updateSelectedDirectoryTaxonomy\(selectedDirectoryPlace/);
  assert.match(pageSource, /toggleSelectedDirectoryAdditionalCategory\(selectedDirectoryPlace/);
  assert.match(pageSource, /method: "PATCH"/);
  assert.match(directoryRouteSource, /export async function PATCH/);
  assert.match(directoryRouteSource, /UPDATE place_directory[\s\S]+additional_categories_json/);
});

test("right properties can create and classify a DB record for an unlinked map asset", () => {
  assert.match(pageSource, /첫 변경 시 DB 항목 생성/);
  assert.match(pageSource, /connectUnlinkedElementTaxonomy\(selected/);
  assert.match(pageSource, /method: "POST"/);
  assert.match(pageSource, /DB 연결 후 선택/);
  assert.match(directoryRouteSource, /export async function POST/);
  assert.match(directoryRouteSource, /id: `map-\$\{crypto\.randomUUID\(\)\}`/);
  assert.match(directoryRouteSource, /지도 자산 연결/);
});

test("communication-center DB aliases converge on one canonical directory row", () => {
  assert.match(directoryRouteSource, /MAIN_HUB_DIRECTORY_ID = "place-sotong-center"/);
  assert.match(directoryRouteSource, /mainHubDirectoryDrift/);
  assert.match(directoryRouteSource, /mainHubStoredRows\.length !== 1/);
  assert.match(directoryRouteSource, /id: isMainHub \|\| retiredIds\.has\(existing\.id\) \? row\.id : existing\.id/);
});

test("directory source sync binds one value for every insert column", () => {
  const insert = directoryRouteSource.match(
    /INSERT INTO place_directory\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/,
  );
  assert.ok(insert, "place_directory insert statement should exist");
  const columns = insert[1].split(",").map((value) => value.trim()).filter(Boolean);
  const placeholders = insert[2].match(/\?/g) ?? [];
  assert.equal(placeholders.length, columns.length);
});

test("mobile explorer opens large and folds to the map when a place is selected", () => {
  assert.match(pageSource, /장소 · 리뷰 · 행사/);
  assert.match(pageSource, /globalContentTab === "places"/);
  assert.match(cssSource, /global-story-panel\.public-explorer-panel[^}]+height: min\(38dvh, 360px\)/);
  assert.match(cssSource, /public-place-sheet[^}]+height: min\(34dvh, 310px\)/);
  assert.match(cssSource, /public-place-sheet\.expanded[^}]+100dvh - 96px/);
  assert.match(cssSource, /global-story-panel\.public-explorer-panel\.expanded[^}]+100dvh - 96px/);
  assert.match(pageSource, /setPublicPanelExpanded\(publicLayoutAccess === "viewer" && viewportDimensions\.width <= 760\)/);
  assert.match(pageSource, /setPublicPlaceExpanded\(showDetails && viewportDimensions\.width <= 760\);\s*setGlobalStoriesOpen\(false\)/);
});
