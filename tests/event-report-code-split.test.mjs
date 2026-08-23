import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readAppClientSource } from "./source-fixtures.mjs";

const pageSource = await readAppClientSource();
const eventDialogSource = await readFile(new URL("../app/admin-place-event-dialog.tsx", import.meta.url), "utf8");
const explorerActivitySource = await readFile(new URL("../app/public/explorer-activity-content.tsx", import.meta.url), "utf8");
const eventRouteSource = await readFile(new URL("../app/api/place-events/route.ts", import.meta.url), "utf8");
const storyRouteSource = await readFile(new URL("../app/api/place-stories/route.ts", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../drizzle/0019_late_morph.sql", import.meta.url), "utf8");

test("event schedule and public visibility are stored and validated independently", () => {
  assert.match(migrationSource, /ADD `starts_at` text DEFAULT '' NOT NULL/);
  assert.match(migrationSource, /ADD `ends_at` text DEFAULT '' NOT NULL/);
  assert.match(migrationSource, /SET `starts_at` = `visible_from`, `ends_at` = `visible_until`/);
  assert.match(eventRouteSource, /const startsAt = validIsoDate\(cleanText\(form\.get\("startsAt"\), 60\)\)/);
  assert.match(eventRouteSource, /const endsAt = validIsoDate\(cleanText\(form\.get\("endsAt"\), 60\)\)/);
  assert.match(eventRouteSource, /starts_at, ends_at, visible_from, visible_until/);
  assert.match(eventRouteSource, /e\.status = 'active' AND e\.visible_from <= \? AND e\.visible_until > \?/);
  assert.match(eventDialogSource, /실제 행사 일시/);
  assert.match(eventDialogSource, /화면 노출 기간/);
  assert.match(pageSource, /eventScheduleLabel\(event\.startsAt, event\.endsAt\)/);
  assert.match(pageSource, /form\.set\("startsAt", startsAtDate\.toISOString\(\)\)/);
  assert.match(pageSource, /form\.set\("visibleFrom", visibleFromDate\.toISOString\(\)\)/);
});

test("public visitors can report a review or photo once without automatic deletion", () => {
  assert.match(migrationSource, /CREATE TABLE `place_story_reports`/);
  assert.match(migrationSource, /CREATE UNIQUE INDEX `place_story_reports_story_actor_idx`/);
  assert.match(storyRouteSource, /payload\?\.action !== "report"/);
  assert.match(storyRouteSource, /REPORT_REASONS = new Set\(\["inappropriate", "privacy", "copyright", "spam", "other"\]\)/);
  assert.match(storyRouteSource, /VALUES \(\?, \?, \?, \?, \?, 'open', \?, NULL, NULL\)/);
  assert.match(storyRouteSource, /already reported/);
  assert.match(storyRouteSource, /AS reportSummary/);
  assert.doesNotMatch(storyRouteSource.match(/if \(request\.headers\.get\("content-type"\)\?\.includes\("application\/json"\)\) \{[\s\S]*?return json\(\{ reported: true, storyId \}, 201\);/)?.[0] ?? "", /UPDATE place_stories SET status = 'hidden'/);
  assert.match(pageSource, /후기·사진 신고/);
  assert.match(pageSource, /action: "report"/);
  assert.match(explorerActivitySource, /신고 \{story\.reportCount\}건/);
  assert.match(explorerActivitySource, /신고 내용 보기/);
  assert.match(pageSource, /관리자가 확인한 뒤 조치합니다/);
});

test("the admin database editor is emitted behind a lazy-loaded code boundary", () => {
  assert.match(pageSource, /const AdminDatabaseEditor = lazy\(\(\) => import\("\.\/admin-database-editor"\)\)/);
  assert.match(pageSource, /publicLayoutAccess === "editor" && databaseEditorOpen && <Suspense/);
  assert.match(pageSource, /관리자 DB 편집 도구를 불러오는 중입니다/);
});
