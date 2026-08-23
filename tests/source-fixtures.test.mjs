import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  APP_CLIENT_SOURCE_GROUPS,
  APP_CLIENT_SOURCE_PATHS,
  readAppClientSource,
} from "./source-fixtures.mjs";

test("client source regression checks follow explicit extraction boundaries", async () => {
  assert.deepEqual(APP_CLIENT_SOURCE_PATHS, [...new Set(APP_CLIENT_SOURCE_PATHS)]);
  assert.ok(APP_CLIENT_SOURCE_PATHS.includes("../app/page.tsx"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.publicUi.includes("../app/public/explorer-panel.tsx"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.editorDocument.includes("../app/editor/document/rules.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.editorPersistence.includes("../app/editor/persistence/use-map-settings-persistence.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.mapLabels.includes("../app/map/labels/clusters.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.mapInteraction.includes("../app/map/interaction/use-map-transform-controller.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.mapPrint.includes("../app/map/print/export.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.mapRendering.includes("../app/map/rendering/mobile-render.ts"));

  await Promise.all(
    APP_CLIENT_SOURCE_PATHS.map((path) => access(new URL(path, import.meta.url))),
  );

  const source = await readAppClientSource();
  assert.match(source, /^"use client";/);
});

test("map settings and autosave persistence stay outside the route component", async () => {
  const [pageSource, settingsSource, autosaveSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/editor/persistence/use-map-settings-persistence.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/editor/persistence/use-local-autosave.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /useMapSettingsPersistence\(\{/);
  assert.match(pageSource, /useLocalAutosave\(\{/);
  assert.doesNotMatch(pageSource, /fetch\(CALIBRATION_SETTINGS_API/);
  assert.doesNotMatch(pageSource, /requestIdleCallback\(save/);
  assert.match(settingsSource, /remoteUpdatedAt >= localCalibrationUpdatedAtRef\.current/);
  assert.match(settingsSource, /applyLockedCoordinateSettings\(/);
  assert.match(autosaveSource, /schemaVersion: 4/);
  assert.match(autosaveSource, /baseRevision: publishedRevisionRef\.current/);
});

test("page and public shells keep heavyweight panels behind lazy import boundaries", async () => {
  const [pageSource, explorerSource, placeSheetSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/public/explorer-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/public/place-sheet.tsx", import.meta.url), "utf8"),
  ]);
  const lazyBoundaries = [
    [pageSource, "./admin-database-editor"],
    [pageSource, "./admin-place-event-dialog"],
    [explorerSource, "../admin-diagnostics-panel"],
    [explorerSource, "../admin-place-request-list"],
    [explorerSource, "./explorer-activity-content"],
    [placeSheetSource, "./place-detail-content"],
  ];

  for (const [source, modulePath] of lazyBoundaries) {
    assert.match(
      source,
      new RegExp(`import\\(\\s*["']${modulePath.replace(".", "\\.")}["']\\s*\\)`),
    );
  }
});

test("public place and explorer markup stay behind public display components", async () => {
  const [pageSource, explorerSource, placeSheetSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/public/explorer-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/public/place-sheet.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /<PublicExplorerPanel/);
  assert.match(pageSource, /<PublicPlaceSheet/);
  assert.doesNotMatch(pageSource, /<section className="public-place-explorer">/);
  assert.doesNotMatch(pageSource, /<aside[^>]+className=\{`public-place-sheet/);
  assert.match(explorerSource, /<section className="public-place-explorer">/);
  assert.match(placeSheetSource, /className=\{`public-place-sheet/);
});

test("dense label persistence stays behind its client hook boundary", async () => {
  const [pageSource, hookSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/map/labels/use-settings-persistence.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /useDenseLabelSettingsPersistence\(\{/);
  assert.match(pageSource, /readLocalDenseLabelSettings\(\)/);
  assert.doesNotMatch(pageSource, /DENSE_LABEL_SETTINGS_(?:API|KEY)/);
  assert.match(hookSource, /remoteUpdatedAt >= localUpdatedAtRef\.current/);
  assert.match(hookSource, /window\.setTimeout\(\(\) => \{/);
  assert.match(hookSource, /\}, 650\);/);
});

test("label, print, and mobile rendering calculations stay outside the route component", async () => {
  const [pageSource, clusterSource, auditSource, exportSource, mobileRenderSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/map/labels/clusters.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/map/print/audit.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/map/print/export.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/map/rendering/mobile-render.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /buildDenseLabelClusters\(/);
  assert.match(pageSource, /renderHighResolutionMapPng\(\{/);
  assert.match(pageSource, /calculateMobileMapRenderBounds\(\{/);
  assert.doesNotMatch(pageSource, /function buildDenseLabelClusters\(/);
  assert.doesNotMatch(pageSource, /function buildPrintAudit\(/);
  assert.match(clusterSource, /export function buildDenseLabelClusters\(/);
  assert.match(auditSource, /export function buildPrintAudit\(/);
  assert.match(exportSource, /export async function renderHighResolutionMapPng\(/);
  assert.match(mobileRenderSource, /export function calculateMobileMapRenderBounds\(/);
});

test("map transform animation refs and cleanup stay behind the interaction controller", async () => {
  const [pageSource, controllerSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/map/interaction/use-map-transform-controller.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /useMapTransformController\(\{/);
  assert.doesNotMatch(pageSource, /const touchTransformFrameRef = useRef/);
  assert.doesNotMatch(pageSource, /const wheelCommitTimerRef = useRef/);
  assert.match(pageSource, /const \[zoom, setZoom\] = useState\(0\.72\)/);
  assert.match(controllerSource, /const touchTransformFrameRef = useRef<number \| null>\(null\)/);
  assert.match(controllerSource, /const wheelCommitTimerRef = useRef<number \| null>\(null\)/);
  assert.match(controllerSource, /useEffect\(\(\) => \(\) => \{/);
});
