import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  APP_CLIENT_SOURCE_PATHS,
  readAppClientSource,
} from "./source-fixtures.mjs";

test("client source regression checks follow explicit extraction boundaries", async () => {
  assert.deepEqual(APP_CLIENT_SOURCE_PATHS, [...new Set(APP_CLIENT_SOURCE_PATHS)]);
  assert.ok(APP_CLIENT_SOURCE_PATHS.includes("../app/page.tsx"));

  await Promise.all(
    APP_CLIENT_SOURCE_PATHS.map((path) => access(new URL(path, import.meta.url))),
  );

  const source = await readAppClientSource();
  assert.match(source, /^"use client";/);
});

test("page keeps heavyweight panels behind lazy import boundaries", async () => {
  const pageSource = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const lazyModules = [
    "./admin-database-editor",
    "./admin-diagnostics-panel",
    "./admin-place-event-dialog",
    "./admin-place-request-list",
    "./public-explorer-activity-content",
    "./public-place-detail-content",
  ];

  for (const modulePath of lazyModules) {
    assert.match(
      pageSource,
      new RegExp(`import\\(\\s*["']${modulePath.replace(".", "\\.")}["']\\s*\\)`),
    );
  }
});

test("dense label persistence stays behind its client hook boundary", async () => {
  const [pageSource, hookSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/use-dense-label-settings-persistence.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /useDenseLabelSettingsPersistence\(\{/);
  assert.match(pageSource, /readLocalDenseLabelSettings\(\)/);
  assert.doesNotMatch(pageSource, /DENSE_LABEL_SETTINGS_(?:API|KEY)/);
  assert.match(hookSource, /remoteUpdatedAt >= localUpdatedAtRef\.current/);
  assert.match(hookSource, /window\.setTimeout\(\(\) => \{/);
  assert.match(hookSource, /\}, 650\);/);
});
