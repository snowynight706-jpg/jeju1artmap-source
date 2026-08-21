export function mapStageGestureTransform(scale, viewportWidth) {
  const safeScale = Number.isFinite(scale) ? Math.max(0.01, scale) : 1;
  return viewportWidth > 760
    ? `scale3d(${safeScale}, ${safeScale}, 1)`
    : `translateX(-50%) scale(${safeScale})`;
}
