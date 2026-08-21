import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mapStageGestureTransform } from "../app/map-stage-transform.mjs";
import {
  HIGH_MOBILE_RENDER_BUDGET,
  LOW_MOBILE_RENDER_BUDGET,
  STANDARD_MOBILE_RENDER_BUDGET,
  mobileRenderBudgetForDevice,
} from "../app/mobile-render-budget.mjs";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("desktop map scaling separates centering from the composited scale", () => {
  assert.equal(mapStageGestureTransform(1.25, 1280), "scale3d(1.25, 1.25, 1)");
  assert.equal(mapStageGestureTransform(1.25, 760), "translateX(-50%) scale(1.25)");
  assert.match(cssSource, /@media \(min-width: 761px\) \{\s*\.map-stage \{ left: auto; margin-inline: auto; transform: none; \}/);
  assert.match(pageSource, /stage\.style\.transform = mapStageGestureTransform\(scale, viewport\.clientWidth\)/);
  assert.match(pageSource, /stage\.style\.transform = mapStageGestureTransform\(targetZoom \/ currentLayoutZoom, viewportWidth\)/);
  assert.doesNotMatch(pageSource, /stage\.style\.transform = `translateX\(-50%\) scale\(\$\{scale\}\)`/);
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
