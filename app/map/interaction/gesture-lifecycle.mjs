export function touchReleaseDecision({
  trackedTouch,
  pinchMember,
  remainingTouchCount,
  hadPan,
}) {
  if ((trackedTouch || pinchMember) && remainingTouchCount > 0) return "continue-pan";
  if (trackedTouch || pinchMember || hadPan) return "commit";
  return "none";
}

export function transformInterruptionPolicy(intent) {
  if (intent === "pan") return { wheel: "commit", programmaticFocus: "commit", touch: "continue" };
  if (intent === "programmatic-focus") return { wheel: "discard", programmaticFocus: "commit", touch: "discard" };
  if (intent === "reset" || intent === "restore") {
    return { wheel: "discard", programmaticFocus: "discard", touch: "discard" };
  }
  return { wheel: "continue", programmaticFocus: "continue", touch: "continue" };
}

export function touchLayersCanRelease({ activeTouchCount, pinchActive, committedZoom, expectedZoom }) {
  return activeTouchCount === 0
    && !pinchActive
    && Math.abs(committedZoom - expectedZoom) <= 0.002;
}
