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
  assert.doesNotMatch(pageSource, /queueTouchMapTransform\(nextZoom, nextPan\);\s*setZoom\(nextZoom\)/);
});

test("mobile map manipulation avoids layout-heavy effects per frame", () => {
  assert.match(pageSource, /translate3d\(calc\(-50% \+ \$\{pan\.x\}px\), calc\(-50% \+ \$\{pan\.y\}px\), 0\)/);
  assert.match(cssSource, /\.map-viewport\.is-direct-manipulation \.map-stage[\s\S]{0,80}will-change: transform/);
  assert.match(cssSource, /is-direct-manipulation\) \.placed-asset \{ filter: none; \}/);
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
