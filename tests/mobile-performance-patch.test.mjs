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
});

test("mobile map manipulation avoids layout-heavy effects per frame", () => {
  assert.match(pageSource, /translate3d\(calc\(-50% \+ \$\{pan\.x\}px\), calc\(-50% \+ \$\{pan\.y\}px\), 0\)/);
  assert.match(cssSource, /\.map-viewport\.is-direct-manipulation \.map-stage[\s\S]{0,80}will-change: transform/);
  assert.match(cssSource, /is-direct-manipulation\) \.placed-asset \{ filter: none; \}/);
});

test("touch transform handoff keeps the compositor layer through the settled frame", () => {
  assert.match(pageSource, /touchLayerReleaseFrameRef\.current = window\.requestAnimationFrame/);
  assert.match(pageSource, /touchLayerReleaseTimerRef\.current = window\.setTimeout/);
  assert.match(pageSource, /activeTouchPointersRef\.current\.size > 0 \|\| pinchGestureRef\.current/);
  assert.match(pageSource, /panGestureRef\.current[\s\S]{0,180}scheduleTouchLayerRelease\(\)/);
});

test("single pointer pan avoids React state renders and keeps the viewer layer warm", () => {
  assert.match(pageSource, /const panGestureRef = useRef/);
  assert.match(pageSource, /panGestureRef\.current = \{ startX: event\.clientX/);
  assert.match(pageSource, /const settleTouchPanTransform = useCallback/);
  assert.doesNotMatch(pageSource, /setInteraction\(\{ type: "pan"/);
  assert.match(pageSource, /publicLayoutAccess === "viewer" \? "is-gpu-pan-ready"/);
  assert.match(cssSource, /\.map-viewport\.is-gpu-pan-ready \.map-stage-wrap,[\s\S]{0,140}will-change: transform/);
  assert.match(cssSource, /@media \(max-width: 760px\), \(pointer: coarse\)[\s\S]{0,140}\.placed-asset \{ filter: none; \}/);
});

test("mobile high-resolution map switching and startup reveal wait for settled work only", () => {
  assert.match(pageSource, /uploadedBaseMapDisplaySource\(uploadedBaseMap,[\s\S]{0,180}settledLabelZoom \/ Math\.max\(fitZoom, 0\.22\)/);
  assert.doesNotMatch(pageSource, /setTimeout\(\(\) => setStartupRevealReady\(true\), 320\)/);
  assert.match(pageSource, /requestAnimationFrame\(\(\) => setStartupRevealReady\(true\)\)/);
});

test("versioned immutable images use cache-first without caching mutable APIs", () => {
  assert.match(serviceWorkerSource, /CACHE_VERSION = "2026-08-19-v3"/);
  assert.match(serviceWorkerSource, /url\.searchParams\.has\("v"\)[\s\S]{0,160}cacheFirstVersionedImage/);
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/api\/"\)\) return/);
});
