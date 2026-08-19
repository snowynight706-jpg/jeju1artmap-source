import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/api/public-layout/route.ts", import.meta.url), "utf8");
const schemaSource = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../drizzle/0020_curved_microbe.sql", import.meta.url), "utf8");
const landmarkSource = await readFile(new URL("../app/landmark-assets/index.ts", import.meta.url), "utf8");

test("Ctrl+S appends an immutable public-layout record without publishing", () => {
  assert.match(pageSource, /key === "s"[\s\S]+adminShortcutActionsRef\.current\.saveDraft\(\)/);
  assert.match(pageSource, /action: "save-history"/);
  assert.match(pageSource, /method: "POST"[\s\S]{0,220}action: "save-history"/);
  assert.match(pageSource, /현재 편집 상태를 공개본 기록에 저장했습니다\. 공개 화면은 변경되지 않았습니다/);
  assert.match(pageSource, />공개본 기록 <span>\{publicHistory\.length\}<\/span>/);
  assert.match(pageSource, /기록을 불러와도 공개 화면은 바뀌지 않습니다/);
  assert.doesNotMatch(pageSource, />초안 저장<|>이전 초안<|>공개본 불러오기<|>이전 공개본</);
});

test("public publishes and manual records share a persistent history table", () => {
  assert.match(schemaSource, /sqliteTable\("public_map_layout_history"/);
  assert.match(migrationSource, /CREATE TABLE `public_map_layout_history`/);
  assert.match(migrationSource, /`kind` text NOT NULL/);
  assert.match(routeSource, /payload\?\.action === "save-history"/);
  assert.match(routeSource, /VALUES \(\?, 'snapshot'/);
  assert.match(routeSource, /VALUES \(\?, 'published'/);
  assert.match(routeSource, /VALUES \(\?, 'restored'/);
  assert.match(routeSource, /requestedHistoryId/);
  assert.match(routeSource, /ORDER BY created_at DESC, id DESC/);
});

test("the administrator separates screen visibility, placement, and print inclusion", () => {
  assert.match(pageSource, /화면 가시성, 지도 배치, 출력 포함 여부는 서로 독립적으로 유지됩니다/);
  assert.match(pageSource, /type PlacementFilter = "all" \| "placed" \| "unplaced"/);
  assert.match(pageSource, /type RecommendationFilter = "all" \| "recommended" \| "standard"/);
  assert.match(pageSource, /row-label-toggle/);
  assert.match(pageSource, /markerMode: event\.target\.value as PrintMode/);
  assert.match(pageSource, /labelMode: event\.target\.value as PrintMode/);
});

test("today's approved Mokgwana and Gwandeokjeong assets retain Drive originals", () => {
  assert.match(landmarkSource, /asset\("mokgwana-v06"[^\n]+"1ryhDEaIZTCcokVxDOqE86gu48BnKH2GT"[^\n]+"approved"\)/);
  assert.match(landmarkSource, /asset\("gwandeokjeong-v07"[^\n]+"1-6UaFKFZOWcuFa57IIXP-8xNWUkLOI-L"[^\n]+"approved"\)/);
});
