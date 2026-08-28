import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readAppClientSource } from "./source-fixtures.mjs";

const pageSource = await readAppClientSource();
const eventRouteSource = await readFile(new URL("../app/api/place-events/route.ts", import.meta.url), "utf8");
const explorerActivitySource = await readFile(new URL("../app/public/explorer-activity-content.tsx", import.meta.url), "utf8");
const schemaSource = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../drizzle/0024_minor_rogue.sql", import.meta.url), "utf8");

test("event pin state is stored durably and returned by the API", () => {
  assert.match(schemaSource, /isPinned: integer\("is_pinned", \{ mode: "boolean" \}\)\.notNull\(\)\.default\(false\)/);
  assert.match(migrationSource, /ADD `is_pinned` integer DEFAULT false NOT NULL/);
  assert.match(migrationSource, /CREATE INDEX `place_events_pinned_created_idx` ON `place_events` \(`is_pinned`,`created_at`\)/);
  assert.match(eventRouteSource, /e\.is_pinned AS isPinned/);
  assert.match(eventRouteSource, /isPinned: Boolean\(row\.isPinned\)/);
  assert.match(eventRouteSource, /UPDATE place_events SET is_pinned = \?, updated_at = \?, updated_by = \? WHERE id = \?/);
});

test("pinned events sort before newer unpinned events in public lists", () => {
  assert.match(eventRouteSource, /const EVENT_PRIORITY_ORDER = "e\.is_pinned DESC, e\.created_at DESC, e\.id DESC"/);
  assert.equal((eventRouteSource.match(/ORDER BY \$\{EVENT_PRIORITY_ORDER\}/g) ?? []).length, 3);
});

test("the admin event tab exposes an accessible pin toggle and refreshes page one", () => {
  assert.match(explorerActivitySource, /className=\{`event-pin-toggle \$\{event\.isPinned \? "active" : ""\}`\}/);
  assert.match(explorerActivitySource, /aria-pressed=\{event\.isPinned\}/);
  assert.match(explorerActivitySource, /event\.isPinned \? "고정 해제" : "상단 고정"/);
  assert.match(pageSource, /body: JSON\.stringify\(\{ id: event\.id, isPinned \}\)/);
  assert.match(pageSource, /setGlobalEventsPage\(1\)/);
  assert.match(pageSource, /onToggleEventPin: togglePlaceEventPin/);
});
