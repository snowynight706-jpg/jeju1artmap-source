export const LOW_TIER_BASE_MAP_PRELOAD_PIXEL_WIDTH = 1840;

export function lowTierBaseMapNeedsHighResolution({
  tier,
  viewportWidth,
  stageWidth,
  zoom,
  devicePixelRatio,
}) {
  if (tier !== "low" || viewportWidth <= 0 || viewportWidth > 760 || stageWidth <= 0 || zoom <= 0) return false;
  const effectivePixelRatio = Math.min(3, Math.max(1, Number(devicePixelRatio) || 1));
  return stageWidth * zoom * effectivePixelRatio >= LOW_TIER_BASE_MAP_PRELOAD_PIXEL_WIDTH;
}
