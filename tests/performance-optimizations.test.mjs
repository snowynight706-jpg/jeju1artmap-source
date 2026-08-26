import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import { readAppClientSource } from "./source-fixtures.mjs";

const pageSource = await readAppClientSource();
const routeSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const globalStyles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const publicLayoutRoute = await readFile(new URL("../app/api/public-layout/route.ts", import.meta.url), "utf8");
const baseMapRoute = await readFile(new URL("../app/api/base-map/route.ts", import.meta.url), "utf8");
const baseMapStorage = await readFile(new URL("../app/base-map-storage.ts", import.meta.url), "utf8");
const placeEventsRoute = await readFile(new URL("../app/api/place-events/route.ts", import.meta.url), "utf8");
const placeStoriesRoute = await readFile(new URL("../app/api/place-stories/route.ts", import.meta.url), "utf8");
const adminDiagnosticsSource = await readFile(new URL("../app/admin-diagnostics-panel.tsx", import.meta.url), "utf8");
const publicPlaceDetailSource = await readFile(new URL("../app/public/place-detail-content.tsx", import.meta.url), "utf8");
const publicExplorerActivitySource = await readFile(new URL("../app/public/explorer-activity-content.tsx", import.meta.url), "utf8");
const publicExplorerPanelSource = await readFile(new URL("../app/public/explorer-panel.tsx", import.meta.url), "utf8");
const publicPlaceSheetSource = await readFile(new URL("../app/public/place-sheet.tsx", import.meta.url), "utf8");
const publicViewerDialogsSource = await readFile(new URL("../app/public/viewer-dialogs.tsx", import.meta.url), "utf8");
const contentClientSource = await readFile(new URL("../app/content/client.ts", import.meta.url), "utf8");
const adminPlaceRequestSource = await readFile(new URL("../app/admin-place-request-list.tsx", import.meta.url), "utf8");
const performanceMigration = await readFile(new URL("../drizzle/0021_deep_galactus.sql", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");

test("uploaded base maps use stable layered screen derivatives while exports retain the original", () => {
  assert.match(pageSource, /const uploadedBaseMapLayers = baseMapDisplayLayers\(\{/);
  assert.match(pageSource, /baseMapResolutionUpgradeSrc/);
  assert.match(pageSource, /metadata\.screen2048Url \?\? metadata\.screen4096Url/);
  assert.match(pageSource, /return metadata\.screen4096Url \?\? metadata\.screen2048Url \?\?/);
  assert.match(pageSource, /lowTierBaseMapNeedsHighResolution/);
  assert.match(pageSource, /decodedHighResolutionBaseMapSource/);
  assert.match(pageSource, /mapSvg: MAP_SVG/);
  assert.match(pageSource, /uploadedBaseMapOriginalSource\(uploadedBaseMap\) \|\| mapSvg/);
  assert.match(pageSource, /prepareBaseMapScreenVariant\(image, 2048, 0\.86\)/);
  assert.match(pageSource, /prepareBaseMapScreenVariant\(image, 4096, 0\.88\)/);
  assert.match(baseMapRoute, /bundledScreenResponse/);
  assert.match(baseMapRoute, /bundledOriginalResponse/);
  assert.match(baseMapRoute, /wondosim-base-map-v20-print-lossless\.webp/);
  assert.match(baseMapStorage, /originalUrl: `\/api\/base-map\?bundled=original&v=\$\{BUNDLED_V20_PRINT_REVISION\}`/);
  assert.match(baseMapRoute, /headers\.set\("content-type", "image\/webp"\)/);
  assert.match(baseMapRoute, /max-age=31536000, immutable/);
  assert.match(baseMapRoute, /if \(etagMatches\(request, object\.httpEtag\)\) return new Response\(null, \{ status: 304/);
});

test("public bootstrap includes map metadata and event-linked places with conditional validation", () => {
  assert.match(publicLayoutRoute, /readUploadedBaseMapMetadata\(runtime\.BUCKET, canEdit\)/);
  assert.match(publicLayoutRoute, /eventLinkedPlaces/);
  assert.match(publicLayoutRoute, /cache-control": "private, no-cache"/);
  assert.match(publicLayoutRoute, /status: 304/);
  assert.match(pageSource, /loadPublicLayout\("no-cache"\)/);
  assert.match(pageSource, /eventPlaceIndexBootstrappedRef\.current = true/);
  assert.match(publicLayoutRoute, /item\.builtIn !== true/);
});

test("event list reads skip runtime schema maintenance and batch page metadata with rows", () => {
  assert.doesNotMatch(placeEventsRoute, /ensureStorage|PRAGMA table_info\(place_events\)|CREATE TABLE IF NOT EXISTS place_events/);
  assert.doesNotMatch(placeEventsRoute, /INSERT OR IGNORE INTO place_event_places/);
  assert.match(placeEventsRoute, /await runtime\.DB\.batch\(canManage/);
  assert.match(placeEventsRoute, /\[countStatement, pageStatement\.bind\(GLOBAL_PAGE_SIZE, requestedOffset\)\]/);
});

test("screen landmarks and build assets use lightweight, immutable delivery paths", async () => {
  assert.match(pageSource, /asset\.screenSrc \?\? asset\.src/);
  assert.doesNotMatch(layoutSource, /next\/font\/google|Geist_Mono|geistSans/);
  assert.match(workerSource, /url\.pathname\.startsWith\("\/assets\/"\)/);
  assert.match(workerSource, /url\.pathname === "\/jfac-signature-b\.svg"/);
  assert.match(workerSource, /url\.pathname === "\/jfac-symbol\.svg"/);
  assert.match(workerSource, /image\/svg\+xml; charset=utf-8/);
  assert.match(workerSource, /max-age=31536000, immutable/);
  const map2048 = await stat(new URL("../public/maps/wondosim-base-map-v20-screen-2048.webp", import.meta.url));
  const map4096 = await stat(new URL("../public/maps/wondosim-base-map-v20-screen-4096.webp", import.meta.url));
  const mapPrint = await stat(new URL("../public/maps/wondosim-base-map-v20-print-lossless.webp", import.meta.url));
  const mainHub = await stat(new URL("../public/landmarks-screen/jeju-communication-center-a02.webp", import.meta.url));
  assert.ok(map2048.size < 300_000);
  assert.ok(map4096.size < 700_000);
  assert.ok(mapPrint.size < 2_100_000);
  assert.ok(mainHub.size < 100_000);
});

test("map markers, connectors, and dense labels are isolated from unrelated panel renders", () => {
  assert.match(pageSource, /const MapElementMarker = memo\(/);
  assert.match(pageSource, /const MapElementLayer = memo\(/);
  assert.match(pageSource, /const MapConnectorLayer = memo\(/);
  assert.match(pageSource, /const DenseLabelLayer = memo\(/);
  assert.match(pageSource, /const mapRenderActionsRef = useRef<MapRenderActions \| null>\(null\)/);
  assert.match(pageSource, /data-render-isolation="marker-layer"/);
  assert.match(pageSource, /data-render-isolation="connector-layer"/);
  assert.match(pageSource, /data-render-isolation="dense-label-layer"/);
});

test("pinch and wheel zoom share one deferred visual transform before layout commit", () => {
  assert.match(pageSource, /const wheelCommitTimerRef = useRef<number \| null>\(null\)/);
  assert.match(pageSource, /const wheelGestureAnchorRef = useRef<\{ x: number; y: number \} \| null>\(null\)/);
  assert.match(pageSource, /if \(wheelCommitTimerRef\.current === null\) \{[\s\S]{0,140}wheelGestureAnchorRef\.current = \{ x: cursorX, y: cursorY \}/);
  assert.match(pageSource, /cursorX: wheelAnchor\.x,[\s\S]{0,60}cursorY: wheelAnchor\.y/);
  assert.match(pageSource, /queueTouchMapTransform\(nextZoom, nextPan\)/);
  assert.match(pageSource, /wheelCommitTimerRef\.current = window\.setTimeout\(\(\) => \{/);
  assert.match(pageSource, /const nextZoom = zoomRef\.current \+ \(rawZoom - zoomRef\.current\) \* 0\.82/);
  assert.match(globalStyles, /\.element-layer \{[^}]*contain: layout style/);
  assert.match(globalStyles, /\.dense-label-layer \{[^}]*contain: layout style/);
});

test("administrator diagnostics are code-split while anonymous performance samples stay content-free", () => {
  const performanceTable = placeStoriesRoute.match(/const PERFORMANCE_DIAGNOSTICS_TABLE_SQL = `([\s\S]*?)`;/)?.[1] ?? "";
  assert.match(publicExplorerPanelSource, /const AdminDiagnosticsPanel = lazy\(\(\) => import\("\.\.\/admin-diagnostics-panel"\)\)/);
  assert.match(pageSource, /sendPerformanceDiagnostic\(\{/);
  assert.match(contentClientSource, /export function sendPerformanceDiagnostic/);
  assert.match(pageSource, /metric: "startup"/);
  assert.match(pageSource, /recordMapSettle\("pan-settle"\)/);
  assert.match(pageSource, /recordMapSettle\("pinch-settle"\)/);
  assert.match(adminDiagnosticsSource, /PWA 성능 기록/);
  assert.match(placeStoriesRoute, /map_performance_diagnostics/);
  assert.match(placeStoriesRoute, /payload\?\.action === "performance-diagnostic"/);
  assert.match(placeStoriesRoute, /scope === "performance-diagnostics"/);
  assert.match(performanceMigration, /CREATE TABLE `map_performance_diagnostics`/);
  assert.match(performanceMigration, /map_performance_diagnostics_actor_created_idx/);
  assert.doesNotMatch(performanceTable, /place_key|user_agent|photo|review_text|author_name/);
});

test("administrator place request cards load only when their management tab is opened", () => {
  assert.match(publicExplorerPanelSource, /const AdminPlaceRequestList = lazy\(\(\) => import\("\.\.\/admin-place-request-list"\)\)/);
  assert.match(publicExplorerPanelSource, /<Suspense fallback=\{<div className="global-story-state"><span className="global-story-spinner" \/><strong>장소 요청 관리 화면을 준비하는 중입니다\.<\/strong><\/div>\}>/);
  assert.match(publicExplorerPanelSource, /<AdminPlaceRequestList/);
  assert.match(adminPlaceRequestSource, /place-request-admin-card/);
  assert.doesNotMatch(pageSource, /className=\{`place-request-admin-card/);
});

test("public place details, events, and review UI load only after a place is opened", () => {
  assert.match(pageSource, /const PublicPlaceSheet = lazy\(\(\) => import\("\.\/public\/place-sheet"\)\)/);
  assert.match(pageSource, /selected && !globalStoriesOpen && <Suspense fallback=/);
  assert.match(publicPlaceSheetSource, /const PublicPlaceDetailContent = lazy\(\(\) => import\("\.\/place-detail-content"\)\)/);
  assert.match(publicPlaceSheetSource, /<Suspense fallback=\{<div className="public-place-detail-loading"/);
  assert.match(publicPlaceSheetSource, /<PublicPlaceDetailContent/);
  assert.match(publicPlaceDetailSource, /className="public-place-summary"/);
  assert.match(publicPlaceDetailSource, /className="public-place-events"/);
  assert.match(publicPlaceDetailSource, /className="public-place-archive"/);
});

test("mobile panel motion avoids height animation and explorer activity tabs are code-split", () => {
  assert.match(pageSource, /const PublicExplorerPanel = lazy\(\(\) => import\("\.\/public\/explorer-panel"\)\)/);
  assert.match(pageSource, /globalStoriesOpen && <Suspense fallback=/);
  assert.match(publicExplorerPanelSource, /const PublicExplorerActivityContent = lazy\(\(\) => import\("\.\/explorer-activity-content"\)\)/);
  assert.match(pageSource, /panel\.animate\(\[[\s\S]+duration: PUBLIC_PANEL_MOTION_MS/);
  assert.match(globalStyles, /--motion-standard: \.24s/);
  assert.match(globalStyles, /\.public-place-sheet \{[^}]+transition: none/);
  assert.match(globalStyles, /\.global-story-panel\.public-explorer-panel \{[^}]+transition: none/);
  assert.match(globalStyles, /\.app-shell \.public-place-sheet,[\s\S]+backdrop-filter: none/);
  assert.match(globalStyles, /\.global-activity-tab \{[^}]+global-activity-reveal/);
  assert.match(publicExplorerActivitySource, /data-tab="reviews"/);
  assert.match(publicExplorerActivitySource, /data-tab="events"/);
  assert.match(publicExplorerActivitySource, /global-story-card/);
});

test("viewer forms stay out of the map-first initial bundle", () => {
  assert.match(routeSource, /const PublicViewerDialogs = lazy\(\(\) => import\("\.\/public\/viewer-dialogs"\)\)/);
  assert.match(routeSource, /storyReportTarget \|\| placeRequestFormOpen \|\| adminLoginOpen/);
  assert.doesNotMatch(routeSource, /className="place-request-dialog"|className="story-report-dialog"|className="admin-login-dialog"/);
  assert.match(publicViewerDialogsSource, /className="place-request-dialog"/);
  assert.match(publicViewerDialogsSource, /className="story-report-dialog"/);
  assert.match(publicViewerDialogsSource, /className="admin-login-dialog"/);
});
