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
  assert.ok(APP_CLIENT_SOURCE_GROUPS.publicUi.includes("../app/public/use-public-place-workspace.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.contentClient.includes("../app/content/client.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.contentClient.includes("../app/content/types.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.contentClient.includes("../app/content/use-explorer-content.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.media.includes("../app/media/photo-processing.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.placeDirectory.includes("../app/place-directory/model.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.editorDocument.includes("../app/editor/document/bootstrap.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.editorDocument.includes("../app/editor/document/rules.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.editorPlaces.includes("../app/editor/places/actions.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.editorPersistence.includes("../app/editor/persistence/use-application-bootstrap.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.editorPersistence.includes("../app/editor/persistence/use-map-settings-persistence.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.mapLabels.includes("../app/map/labels/clusters.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.mapInteraction.includes("../app/map/interaction/use-map-transform-controller.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.mapPrint.includes("../app/map/print/export.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.mapRendering.includes("../app/map/rendering/mobile-render.ts"));
  assert.ok(APP_CLIENT_SOURCE_GROUPS.mapWorkspace.includes("../app/map/workspace/use-map-workspace-model.ts"));

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

test("public layout and editor recovery bootstrap stay behind one persistence workspace", async () => {
  const [pageSource, bootstrapSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/editor/persistence/use-application-bootstrap.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /useApplicationBootstrap\(\{/);
  assert.doesNotMatch(pageSource, /loadPublicLayout\("no-cache"\)/);
  assert.doesNotMatch(pageSource, /chooseEditorRestoreSource\(\{/);
  assert.doesNotMatch(pageSource, /const applyBundledDirectory = async/);
  assert.match(bootstrapSource, /loadPublicLayout\("no-cache"\)/);
  assert.match(bootstrapSource, /chooseEditorRestoreSource\(\{/);
  assert.match(bootstrapSource, /const applyBundledDirectory = async/);
  assert.match(bootstrapSource, /localStorage\.setItem\(MAP_VIEW_SETTINGS_KEY/);
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

test("public catalog and panel navigation stay behind the public place workspace", async () => {
  const [pageSource, workspaceSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/public/use-public-place-workspace.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /usePublicPlaceWorkspace\(\{/);
  assert.doesNotMatch(pageSource, /const publicPlaceItems = useMemo/);
  assert.doesNotMatch(pageSource, /const writePublicHistory = useCallback/);
  assert.doesNotMatch(pageSource, /const startPublicPanelDrag = useCallback/);
  assert.doesNotMatch(pageSource, /const selectPublicMarker = useCallback/);
  assert.match(workspaceSource, /const publicPlaceItems = useMemo/);
  assert.match(workspaceSource, /const writePublicHistory = useCallback/);
  assert.match(workspaceSource, /const startPublicPanelDrag = useCallback/);
  assert.match(workspaceSource, /const selectPublicMarker = useCallback/);
  assert.match(workspaceSource, /selected: selectedId === item\.anchor\.id && selectedDirectoryPlaceId === item\.place\.id/);
});

test("browser content storage, diagnostics, and photo processing stay outside the route component", async () => {
  const [pageSource, clientSource, photoSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/content/client.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/media/photo-processing.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /from "\.\/content\/client"/);
  assert.match(pageSource, /from "\.\/media\/photo-processing"/);
  assert.doesNotMatch(pageSource, /function persistentVisitorId\(/);
  assert.doesNotMatch(pageSource, /function prepareStoryPhotoInWorker\(/);
  assert.match(clientSource, /export function persistentVisitorId\(/);
  assert.match(clientSource, /export function sendPerformanceDiagnostic\(/);
  assert.match(photoSource, /export async function prepareStoryPhoto\(/);
  assert.match(photoSource, /new Worker\("\/story-photo-worker\.js"\)/);
});

test("explorer content models and read-only loading stay behind the content boundary", async () => {
  const [pageSource, typesSource, hookSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/content/types.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/content/use-explorer-content.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /useExplorerStories\(\{/);
  assert.match(pageSource, /useExplorerDiagnostics\(\{/);
  assert.match(pageSource, /useExplorerEvents\(\{/);
  assert.match(pageSource, /usePlaceRequests\(\{/);
  assert.doesNotMatch(pageSource, /setUploadDiagnosticsLoading/);
  assert.doesNotMatch(pageSource, /setPerformanceDiagnosticsLoading/);
  assert.doesNotMatch(pageSource, /setGlobalStoriesLoading/);
  assert.doesNotMatch(pageSource, /setGlobalEventsLoading/);
  assert.doesNotMatch(pageSource, /setPlaceRequestsLoading/);
  assert.doesNotMatch(pageSource, /scope=all&page=\$\{global(?:Stories|Events)Page\}/);
  assert.match(typesSource, /export type PlaceStory =/);
  assert.match(typesSource, /export type PlaceEvent =/);
  assert.match(typesSource, /export type PlaceRegistrationRequest =/);
  assert.match(hookSource, /scope=upload-diagnostics/);
  assert.match(hookSource, /scope=performance-diagnostics/);
  assert.match(hookSource, /scope=all&page=\$\{globalStoriesPage\}/);
  assert.match(hookSource, /scope=all&page=\$\{globalEventsPage\}/);
});

test("place catalog building, merging, classification, and marker policy stay in one domain boundary", async () => {
  const [pageSource, modelSource, bootstrapSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/place-directory/model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/editor/document/bootstrap.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /createDirectoryCatalog\(\{/);
  assert.match(pageSource, /createDirectoryRecordMerger\(defaultDirectoryPlaces, ensureSystemDirectoryPlaces\)/);
  assert.match(pageSource, /createMapDocumentModel\(\{/);
  assert.doesNotMatch(pageSource, /function buildDirectoryPlaces\(/);
  assert.doesNotMatch(pageSource, /function mergeDirectoryRecords\(/);
  assert.doesNotMatch(pageSource, /function publicCategoryIdForPlace\(/);
  assert.match(modelSource, /export function createDirectoryCatalog\(/);
  assert.match(modelSource, /export function createDirectoryRecordMerger\(/);
  assert.match(modelSource, /export function publicCategoryIdForPlace\(/);
  assert.match(modelSource, /export function createDirectoryMarkerPolicy\(/);
  assert.match(bootstrapSource, /createDirectoryMarkerPolicy\(/);
});

test("initial assets, system places, and stored document normalization stay behind one document boundary", async () => {
  const [pageSource, bootstrapSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/editor/document/bootstrap.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /createMapDocumentModel\(\{/);
  assert.doesNotMatch(pageSource, /const builtInLandmarkAssets/);
  assert.doesNotMatch(pageSource, /function buildStarterMarkers\(/);
  assert.doesNotMatch(pageSource, /function ensureMainHubMapElement\(/);
  assert.doesNotMatch(pageSource, /function ensureLppMapElement\(/);
  assert.doesNotMatch(pageSource, /function sanitizeDocument\(/);
  assert.match(bootstrapSource, /export function createMapDocumentModel\(/);
  assert.match(bootstrapSource, /const builtInLandmarkAssets/);
  assert.match(bootstrapSource, /function buildStarterMarkers\(/);
  assert.match(bootstrapSource, /function ensureMainHubMapElement\(/);
  assert.match(bootstrapSource, /function ensureLppMapElement\(/);
  assert.match(bootstrapSource, /function sanitizeDocument\(/);
});

test("admin place coordinates, placement, taxonomy, and database editing stay behind one workspace boundary", async () => {
  const [pageSource, actionsSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/editor/places/actions.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /usePlaceEditorActions\(\{/);
  assert.doesNotMatch(pageSource, /const updateLandmarkDefault =/);
  assert.doesNotMatch(pageSource, /const runAddressLookup =/);
  assert.doesNotMatch(pageSource, /const openDirectoryPlace =/);
  assert.doesNotMatch(pageSource, /const updateSelectedDirectoryTaxonomy =/);
  assert.doesNotMatch(pageSource, /const openDatabaseEditor =/);
  assert.match(actionsSource, /export function usePlaceEditorActions\(/);
  assert.match(actionsSource, /const updateLandmarkDefault =/);
  assert.match(actionsSource, /const runAddressLookup =/);
  assert.match(actionsSource, /const openDirectoryPlace =/);
  assert.match(actionsSource, /const updateSelectedDirectoryTaxonomy =/);
  assert.match(actionsSource, /const openDatabaseEditor =/);
});

test("dense label persistence stays behind its client hook boundary", async () => {
  const [pageSource, hookSource, bootstrapSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/map/labels/use-settings-persistence.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/editor/persistence/use-application-bootstrap.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /useDenseLabelSettingsPersistence\(\{/);
  assert.doesNotMatch(pageSource, /readLocalDenseLabelSettings\(\)/);
  assert.match(bootstrapSource, /readLocalDenseLabelSettings\(\)/);
  assert.doesNotMatch(pageSource, /DENSE_LABEL_SETTINGS_(?:API|KEY)/);
  assert.match(hookSource, /remoteUpdatedAt >= localUpdatedAtRef\.current/);
  assert.match(hookSource, /window\.setTimeout\(\(\) => \{/);
  assert.match(hookSource, /\}, 650\);/);
});

test("the map workspace composes label, print, and mobile rendering calculations outside the route component", async () => {
  const [pageSource, workspaceSource, clusterSource, auditSource, exportSource, mobileRenderSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/map/workspace/use-map-workspace-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/map/labels/clusters.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/map/print/audit.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/map/print/export.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/map/rendering/mobile-render.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /useMapWorkspaceModel\(\{/);
  assert.match(pageSource, /renderHighResolutionMapPng\(\{/);
  assert.doesNotMatch(pageSource, /buildDenseLabelClusters\(/);
  assert.doesNotMatch(pageSource, /buildPrintAudit\(/);
  assert.doesNotMatch(pageSource, /calculateMobileMapRenderBounds\(\{/);
  assert.match(workspaceSource, /buildDenseLabelClusters\(/);
  assert.match(workspaceSource, /buildPrintAudit\(/);
  assert.match(workspaceSource, /calculateMobileMapRenderBounds\(\{/);
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
