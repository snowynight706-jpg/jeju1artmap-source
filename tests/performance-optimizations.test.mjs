import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const publicLayoutRoute = await readFile(new URL("../app/api/public-layout/route.ts", import.meta.url), "utf8");
const baseMapRoute = await readFile(new URL("../app/api/base-map/route.ts", import.meta.url), "utf8");
const placeEventsRoute = await readFile(new URL("../app/api/place-events/route.ts", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");

test("uploaded base maps use versioned screen derivatives while exports retain the original", () => {
  assert.match(pageSource, /uploadedBaseMapDisplaySource\(uploadedBaseMap/);
  assert.match(pageSource, /uploadedBaseMapOriginalSource\(uploadedBaseMap\) \|\| MAP_SVG/);
  assert.match(pageSource, /prepareBaseMapScreenVariant\(image, 2048, 0\.86\)/);
  assert.match(pageSource, /prepareBaseMapScreenVariant\(image, 4096, 0\.88\)/);
  assert.match(baseMapRoute, /bundledScreenResponse/);
  assert.match(baseMapRoute, /headers\.set\("content-type", "image\/webp"\)/);
  assert.match(baseMapRoute, /max-age=31536000, immutable/);
  assert.match(baseMapRoute, /if \(etagMatches\(request, object\.httpEtag\)\) return new Response\(null, \{ status: 304/);
});

test("public bootstrap includes map metadata and event-linked places with conditional validation", () => {
  assert.match(publicLayoutRoute, /readUploadedBaseMapMetadata\(runtime\.BUCKET, canEdit\)/);
  assert.match(publicLayoutRoute, /eventLinkedPlaces/);
  assert.match(publicLayoutRoute, /cache-control": "private, no-cache"/);
  assert.match(publicLayoutRoute, /status: 304/);
  assert.match(pageSource, /fetch\(PUBLIC_LAYOUT_API, \{ cache: "no-cache" \}\)/);
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
  assert.match(workerSource, /max-age=31536000, immutable/);
  const map2048 = await stat(new URL("../public/maps/wondosim-base-map-v20-screen-2048.webp", import.meta.url));
  const map4096 = await stat(new URL("../public/maps/wondosim-base-map-v20-screen-4096.webp", import.meta.url));
  const mainHub = await stat(new URL("../public/landmarks-screen/jeju-communication-center-a02.webp", import.meta.url));
  assert.ok(map2048.size < 300_000);
  assert.ok(map4096.size < 700_000);
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
