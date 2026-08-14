import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("the soft edge fade sits between the unchanged base map and every interactive map layer", () => {
  assert.match(pageSource, /<img ref=\{baseMapImgRef\} className="base-map"[\s\S]{0,400}<div className="base-map-edge-fade" data-south-edge-fade="on" aria-hidden="true" \/>[\s\S]{0,220}className="calibration-layer"/);
  assert.match(cssSource, /\.base-map-edge-fade \{[^}]*position: absolute;[^}]*inset: 0;[^}]*z-index: 0;[^}]*pointer-events: none/);
  assert.match(cssSource, /\.calibration-layer \{[^}]*z-index: 1/);
  assert.match(cssSource, /\.connector-layer \{[^}]*z-index: 1/);
  assert.match(cssSource, /\.element-layer \{[^}]*z-index: 2/);
  assert.match(cssSource, /\.dense-label-layer \{[^}]*z-index: 50/);
});

test("the east and optional south fades stay inside the requested responsive edge bands", () => {
  assert.match(cssSource, /\.base-map-edge-fade::before \{[^}]*right: 0;[^}]*width: 5\.5%;[^}]*linear-gradient\(90deg,[^}]*#e8e8e8 100%/);
  assert.match(cssSource, /\.base-map-edge-fade::after \{[^}]*bottom: 0;[^}]*height: 3\.5%;[^}]*linear-gradient\(180deg/);
  assert.match(cssSource, /\.base-map-edge-fade\[data-south-edge-fade="off"\]::after \{ display: none; \}/);
  assert.doesNotMatch(cssSource, /\.base-map-edge-fade[^}]*filter:\s*blur/);
  assert.doesNotMatch(cssSource, /\.base-map-edge-fade[^}]*mask-image/);
});

test("map geometry, normalized coordinates and device transforms remain unchanged", () => {
  assert.match(pageSource, /const MAP_ASPECT = 8944 \/ 7324;/);
  assert.match(pageSource, /transform: `translate\(calc\(-50% \+ \$\{pan\.x\}px\), calc\(-50% \+ \$\{pan\.y\}px\)\)`/);
  assert.match(pageSource, /style=\{\{ aspectRatio: `\$\{MAP_ASPECT\}`, width: `\$\{zoom \* 100\}%` \}\}/);
  assert.match(pageSource, /style=\{\{ left: `\$\{element\.x\}%`, top: `\$\{element\.y\}%`, width: `\$\{displaySize\}%`/);
  assert.match(cssSource, /\.base-map \{[^}]*inset: 0;[^}]*width: 100%;[^}]*height: 100%;[^}]*object-fit: fill;[^}]*pointer-events: none/);
});
