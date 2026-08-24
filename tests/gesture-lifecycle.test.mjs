import test from "node:test";
import assert from "node:assert/strict";

import {
  touchLayersCanRelease,
  touchReleaseDecision,
  transformInterruptionPolicy,
} from "../app/map/interaction/gesture-lifecycle.mjs";

test("pointercancel during pinch rebases the remaining touch without committing", () => {
  assert.equal(touchReleaseDecision({
    trackedTouch: true,
    pinchMember: true,
    remainingTouchCount: 1,
    hadPan: false,
  }), "continue-pan");
});

test("pinch to one-finger pan commits only after the final release", () => {
  assert.equal(touchReleaseDecision({ trackedTouch: true, pinchMember: true, remainingTouchCount: 1, hadPan: false }), "continue-pan");
  assert.equal(touchReleaseDecision({ trackedTouch: true, pinchMember: false, remainingTouchCount: 0, hadPan: true }), "commit");
});

test("reset and restore discard stale wheel and focus work", () => {
  assert.deepEqual(transformInterruptionPolicy("reset"), {
    wheel: "discard",
    programmaticFocus: "discard",
    touch: "discard",
  });
  assert.deepEqual(transformInterruptionPolicy("restore"), transformInterruptionPolicy("reset"));
});

test("starting pan commits pending wheel work before taking ownership", () => {
  assert.deepEqual(transformInterruptionPolicy("pan"), {
    wheel: "commit",
    programmaticFocus: "commit",
    touch: "continue",
  });
});

test("labels remain suspended until pointers finish and committed zoom converges", () => {
  assert.equal(touchLayersCanRelease({ activeTouchCount: 1, pinchActive: false, committedZoom: 2, expectedZoom: 2 }), false);
  assert.equal(touchLayersCanRelease({ activeTouchCount: 0, pinchActive: false, committedZoom: 1.8, expectedZoom: 2 }), false);
  assert.equal(touchLayersCanRelease({ activeTouchCount: 0, pinchActive: false, committedZoom: 2, expectedZoom: 2 }), true);
});
