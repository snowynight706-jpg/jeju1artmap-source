import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { horizontalMapFitZoom, mapStageGestureTransform } from "../app/map-stage-transform.mjs";
import {
  HIGH_MOBILE_RENDER_BUDGET,
  LOW_MOBILE_RENDER_BUDGET,
  STANDARD_MOBILE_RENDER_BUDGET,
  mobileRenderBudgetForDevice,
} from "../app/mobile-render-budget.mjs";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("public desktop scaling stays composited while admin restores direct wheel scaling", () => {
  assert.equal(mapStageGestureTransform(1.25, 1280), "scale3d(1.25, 1.25, 1)");
  assert.equal(mapStageGestureTransform(1.25, 760), "translateX(-50%) scale(1.25)");
  assert.match(cssSource, /@media \(min-width: 761px\) \{\s*\.map-stage \{ left: auto; margin-inline: auto; transform: none; \}/);
  assert.match(pageSource, /stage\.style\.transform = mapStageGestureTransform\(scale, viewport\.clientWidth\)/);
  assert.match(pageSource, /stage\.style\.transform = mapStageGestureTransform\(targetZoom \/ currentLayoutZoom, viewportWidth\)/);
  assert.doesNotMatch(pageSource, /stage\.style\.transform = `translateX\(-50%\) scale\(\$\{scale\}\)`/);
  assert.ok(Math.abs(horizontalMapFitZoom(1200, 1180, 34) - (1200 - 34) / 1180) < 1e-9);
  assert.ok(Math.abs(horizontalMapFitZoom(360, 1120, 18) - (360 - 18) / 1120) < 1e-9);
  assert.equal(horizontalMapFitZoom(100, 1180, 34), 0.22);
  assert.ok(Math.abs(horizontalMapFitZoom(2000, 1180, 0) - 2000 / 1180) < 1e-9);
  assert.equal(horizontalMapFitZoom(6000, 1180, 0), 4);
  assert.match(pageSource, /return horizontalMapFitZoom\(viewportDimensions\.width, stageDimensions\.width, horizontalPadding\)/);
  assert.match(pageSource, /pinch\.startZoom \* distance \/ pinch\.startDistance, fitZoom, 4/);
  assert.match(pageSource, /currentZoom \* Math\.exp\(-next\.deltaY \* 0\.0012\), fitZoom, 4/);
  assert.match(pageSource, /if \(publicLayoutAccess === "editor"\) \{[\s\S]{0,220}currentZoom \* Math\.exp\(-event\.deltaY \* 0\.0012\), 0\.22, 4/);
  assert.match(pageSource, /type: "pan"; startX: number; startY: number; panX: number; panY: number/);
  assert.match(pageSource, /if \(publicLayoutAccess === "editor"\) \{[\s\S]{0,200}const targetZoom = 1\.55[\s\S]{0,400}setEditorMapPan\(targetPan\);[\s\S]{0,60}setZoom\(targetZoom\)/);
  assert.match(pageSource, /fitZoom, Math\.max\(fitZoom, 1\.32\)/);
  assert.match(pageSource, /fitZoom, Math\.max\(fitZoom, 1\.42\)/);
});

test("mobile offscreen overscan follows device capacity and runtime settle cost", () => {
  assert.equal(mobileRenderBudgetForDevice(4, 8), LOW_MOBILE_RENDER_BUDGET);
  assert.equal(mobileRenderBudgetForDevice(8, 4), LOW_MOBILE_RENDER_BUDGET);
  assert.equal(mobileRenderBudgetForDevice(8, 8), HIGH_MOBILE_RENDER_BUDGET);
  assert.equal(mobileRenderBudgetForDevice(undefined, 8), STANDARD_MOBILE_RENDER_BUDGET);
  assert.match(pageSource, /return mobileRenderBudgetForDevice\(/);
  assert.match(pageSource, /durationMs >= 80[\s\S]{0,360}mobileSlowSettleSamplesRef\.current >= 2/);
  assert.match(pageSource, /current\.tier === "low" \? current : LOW_MOBILE_RENDER_BUDGET/);
  assert.match(pageSource, /mobileRenderBudget\.minimumOverscan, viewportDimensions\.width \* mobileRenderBudget\.overscanRatio/);
});
