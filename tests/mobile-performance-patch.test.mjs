import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const serviceWorkerSource = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");

test("touch pan and pinch stay on a requestAnimationFrame composited path until commit", () => {
  assert.match(pageSource, /queueTouchMapTransform\(nextZoom, nextPan\)/);
  assert.match(pageSource, /touchTransformFrameRef\.current = window\.requestAnimationFrame/);
  assert.match(pageSource, /stage\.style\.transform = `translateX\(-50%\) scale\(\$\{scale\}\)`/);
  assert.match(pageSource, /commitTouchMapTransform\(\)/);
  assert.match(pageSource, /applyTouchMapTransform\(zoomRef\.current, panRef\.current\)/);
  assert.doesNotMatch(pageSource, /queueTouchMapTransform\(nextZoom, nextPan\);\s*setZoom\(nextZoom\)/);
  assert.match(pageSource, /panInteractionRef = useRef/);
  assert.match(pageSource, /panInteractionRef\.current = \{[\s\S]{0,240}viewportRef\.current\?\.classList\.add\("is-panning"\)/);
  assert.doesNotMatch(pageSource, /setInteraction\(\{ type: "pan"/);
  assert.doesNotMatch(pageSource, /const \[pan, setPan\] = useState/);
});

test("mobile map manipulation avoids layout-heavy effects per frame", () => {
  assert.match(pageSource, /translate3d\(calc\(-50% \+ \$\{nextPan\.x\}px\), calc\(-50% \+ \$\{nextPan\.y\}px\), 0\)/);
  assert.match(cssSource, /\.map-viewport\.is-direct-manipulation \.map-stage[\s\S]{0,80}will-change: transform/);
  assert.match(cssSource, /is-direct-manipulation\) \.placed-asset \{ filter: none; \}/);
});

test("map labels leave the paint path only after drag or zoom actually starts", () => {
  assert.match(pageSource, /pendingTouchTransformRef\.current = \{ zoom: nextZoom, pan: nextPan \};\s*viewportRef\.current\?\.classList\.add\("is-map-labels-suspended"\)/);
  assert.match(pageSource, /classList\.remove\("is-direct-manipulation", "is-map-labels-suspended"\)/);
  assert.match(pageSource, /viewportElement\.classList\.add\("is-map-labels-suspended"\)/);
  assert.match(cssSource, /\.label, \.dense-label-layer, \.dense-label-connector \{ transition: opacity \.18s/);
  assert.match(cssSource, /\.map-viewport:is\(\.is-map-labels-suspended, \.is-zooming\) :is\(\.label, \.dense-label-layer, \.dense-label-connector\) \{ visibility: hidden; opacity: 0; pointer-events: none; transition-duration: 0s; \}/);
  assert.doesNotMatch(pageSource, /beginTouchMapTransform[\s\S]{0,500}classList\.add\("is-map-labels-suspended"\)/);
});

test("touch transform handoff keeps the compositor layer through the settled frame", () => {
  assert.match(pageSource, /touchLayerReleaseFrameRef\.current = window\.requestAnimationFrame/);
  assert.match(pageSource, /touchLayerReleaseTimerRef\.current = window\.setTimeout/);
  assert.match(pageSource, /activeTouchPointersRef\.current\.size > 0 \|\| pinchGestureRef\.current/);
  assert.match(pageSource, /panInteractionRef\.current = null;[\s\S]{0,180}scheduleTouchLayerRelease\(\)/);
  assert.match(pageSource, /setMapLayoutZoom\(committedZoom\)[\s\S]{0,180}stageRef\.current\?\.style\.removeProperty\("transform"\)/);
  assert.match(pageSource, /startTransition\(\(\) => \{\s*setZoom\(committedZoom\);\s*\}\)/);
  assert.doesNotMatch(pageSource, /restartMapLabelHandoff|labelHandoffScaleRef/);
});

test("programmatic focus animates compositor transforms and commits layout once", () => {
  assert.match(cssSource, /\.map-stage \{[^}]*width: var\(--map-stage-width, 72%\)/);
  assert.match(pageSource, /stageWrap\.style\.transition = "transform \.3s/);
  assert.match(pageSource, /stage\.style\.transition = "transform \.3s/);
  assert.match(pageSource, /stage\.style\.transform = `translateX\(-50%\) scale\(\$\{targetZoom \/ currentLayoutZoom\}\)`/);
  assert.match(pageSource, /setMapLayoutZoom\(target\.zoom\)/);
  assert.doesNotMatch(cssSource, /\.map-viewport\.is-programmatic-focus \.map-stage \{ transition: width/);
  assert.doesNotMatch(pageSource, /style=\{\{ aspectRatio: `\$\{MAP_ASPECT\}`, width:/);
});

test("label density work is deferred from the map layout commit", () => {
  assert.match(pageSource, /labelDetailRatio = settledLabelZoom \/ Math\.max\(fitZoom, 0\.22\)/);
  assert.match(pageSource, /labelBudgetForScale\(settledLabelZoom, fitZoom/);
  assert.match(pageSource, /startTransition\(\(\) => setSettledLabelZoom\(zoom\)\)/);
  assert.match(pageSource, /<MapElementLayer[\s\S]*?visibleElements=\{renderedMapElements\}\s+zoom=\{settledLabelZoom\}/);
});

test("mobile high-resolution map switching and startup reveal wait for settled work only", () => {
  assert.match(pageSource, /uploadedBaseMapDisplaySource\(uploadedBaseMap\) \|\| MAP_SVG/);
  assert.doesNotMatch(pageSource, /uploadedBaseMapDisplaySource\(uploadedBaseMap,[^)]*settledLabelZoom/);
  assert.doesNotMatch(pageSource, /setTimeout\(\(\) => setStartupRevealReady\(true\), 320\)/);
  assert.match(pageSource, /requestAnimationFrame\(\(\) => setStartupRevealReady\(true\)\)/);
});

test("public mobile map culls only far-offscreen render nodes after a settled gesture", () => {
  assert.match(pageSource, /const \[mapRenderPan, setMapRenderPan\] = useState\(\{ x: 0, y: 0 \}\)/);
  assert.match(pageSource, /setMapRenderPan\(\(current\) => \([\s\S]{0,160}current\.x === committedPan\.x && current\.y === committedPan\.y \? current : committedPan/);
  assert.match(pageSource, /publicLayoutAccess !== "viewer"[\s\S]{0,180}viewportDimensions\.width > 760/);
  assert.match(pageSource, /const overscanX = Math\.max\(120, viewportDimensions\.width \* 0\.72\)/);
  assert.match(pageSource, /const renderedMapElements = useMemo/);
  assert.match(pageSource, /<MapElementLayer[\s\S]*?visibleElements=\{renderedMapElements\}/);
  assert.match(pageSource, /const publicPlaceItems = useMemo<[\s\S]{0,900}visibleElements\.forEach/);
});

test("versioned immutable images use cache-first without caching mutable APIs", () => {
  assert.match(serviceWorkerSource, /CACHE_VERSION = "2026-08-20-v16"/);
  assert.match(serviceWorkerSource, /url\.searchParams\.has\("v"\)[\s\S]{0,160}cacheFirstVersionedImage/);
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/api\/"\)\) return/);
  assert.match(serviceWorkerSource, /IMAGE_TRIM_INTERVAL = 12/);
  assert.match(serviceWorkerSource, /trimImageCachePeriodically/);
});
