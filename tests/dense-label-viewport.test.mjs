import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { fitDenseLabelCenter, publicDenseLabelViewport } from "../app/dense-label-viewport.mjs";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("public dense-label viewport follows the settled map pan and zoom", () => {
  const centered = publicDenseLabelViewport({
    panX: 0,
    panY: 0,
    zoom: 2,
    stageWidth: 1000,
    stageHeight: 800,
    viewportWidth: 500,
    viewportHeight: 400,
    paddingX: 20,
    paddingY: 20,
  });
  const pannedRight = publicDenseLabelViewport({
    panX: 100,
    panY: 0,
    zoom: 2,
    stageWidth: 1000,
    stageHeight: 800,
    viewportWidth: 500,
    viewportHeight: 400,
    paddingX: 20,
    paddingY: 20,
  });
  assert.ok(pannedRight.left < centered.left);
  assert.ok(pannedRight.right < centered.right);
  assert.equal(centered.right - centered.left, pannedRight.right - pannedRight.left);
});

test("dense labels are clamped inside the current visible map area", () => {
  assert.deepEqual(fitDenseLabelCenter({
    x: 8,
    y: 95,
    width: 24,
    height: 18,
    bounds: { left: 10, right: 70, top: 20, bottom: 80 },
  }), { x: 22, y: 71 });
});

test("mobile public and administrator dense labels use a single vertical column and expose live counts", () => {
  assert.match(pageSource, /maximumItems: mobileSingleColumn \? 10 : 18/);
  assert.match(pageSource, /singleColumn: mobileSingleColumn/);
  assert.match(pageSource, /publicLayoutAccess === "editor"[\s\S]{0,180}singleColumn: true/);
  assert.match(pageSource, /publicLayoutAccess === "editor"[\s\S]{0,220}compactSingleColumn: true/);
  assert.match(pageSource, /className=\{`dense-label \$\{cluster\.columnCount === 1 \? "single-column" : ""\}/);
  assert.match(pageSource, /mobileSingleColumn=\{Boolean\(denseLabelLayoutOptions\?\.singleColumn\)\}/);
  assert.match(pageSource, /현재 화면 · 개별 \{renderedIndividualLabelCount\}개 · 통합 \{renderedDenseLabelClusters\.length\}묶음/);
  assert.match(cssSource, /\.public-readonly-shell \.dense-label\.mobile-single-column \{[^}]*max-width: calc\(100vw - 24px\)/);
  assert.match(cssSource, /\.dense-label\.single-column strong span\.dense-row-dot-right > i \{ order: 4; \}/);
  assert.match(cssSource, /\.map-viewport\.editor-label-motion \.dense-label\.single-column strong span > \.dense-row-name \{ text-align: left; \}/);
  assert.match(cssSource, /\.map-viewport\.editor-label-motion \.dense-label\.single-column strong span\.dense-row-dot-right > i \{ margin-left: auto; \}/);
  assert.match(pageSource, /const DENSE_LABEL_SINGLE_COLUMN_CONNECTOR_INSET_X = 0\.46/);
  assert.match(pageSource, /layoutOptions\.compactSingleColumn && layout\.columnCount === 1/);
});
