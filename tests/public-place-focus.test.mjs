import assert from "node:assert/strict";
import test from "node:test";

import { publicPlaceFocusZoom } from "../app/public/place-focus.mjs";

test("public place focus zoom is close, bounded, and based on the device fit", () => {
  const mobilePortrait = publicPlaceFocusZoom({
    fitZoom: 0.94,
    viewportWidth: 390,
    viewportHeight: 700,
    stageWidth: 390,
    stageHeight: 320,
  });
  const mobileLandscape = publicPlaceFocusZoom({
    fitZoom: 0.62,
    viewportWidth: 700,
    viewportHeight: 390,
    stageWidth: 700,
    stageHeight: 573,
  });
  const desktop = publicPlaceFocusZoom({
    fitZoom: 0.72,
    viewportWidth: 1280,
    viewportHeight: 800,
    stageWidth: 1280,
    stageHeight: 1049,
  });

  assert.equal(mobilePortrait, 1.62 * 1.3);
  assert.ok(mobileLandscape >= 1.95 && mobileLandscape <= 1.62 * 1.3);
  assert.ok(desktop >= 1.75 && desktop <= 1.72 * 1.3);
});

test("public place focus zoom safely handles incomplete early layout measurements", () => {
  const zoom = publicPlaceFocusZoom({
    fitZoom: Number.NaN,
    viewportWidth: 0,
    viewportHeight: 0,
    stageWidth: 0,
    stageHeight: 0,
  });

  assert.ok(Number.isFinite(zoom));
  assert.ok(zoom >= 0.72 && zoom <= 1.62 * 1.3);
});
