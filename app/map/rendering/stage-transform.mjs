export function mapStageGestureTransform(scale, viewportWidth) {
  const safeScale = Number.isFinite(scale) ? Math.max(0.01, scale) : 1;
  return viewportWidth > 760
    ? `scale3d(${safeScale}, ${safeScale}, 1)`
    : `translateX(-50%) scale(${safeScale})`;
}

export function horizontalMapFitZoom(viewportWidth, stageWidth, horizontalPadding = 0) {
  const safeViewportWidth = Number.isFinite(viewportWidth) ? Math.max(1, viewportWidth) : 1;
  const safeStageWidth = Number.isFinite(stageWidth) ? Math.max(1, stageWidth) : 1;
  const safePadding = Number.isFinite(horizontalPadding) ? Math.max(0, horizontalPadding) : 0;
  return Math.min(4, Math.max(0.22, (safeViewportWidth - safePadding) / safeStageWidth));
}
