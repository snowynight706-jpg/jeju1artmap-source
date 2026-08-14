const finitePositive = (value, fallback) => (
  Number.isFinite(value) && value > 0 ? value : fallback
);

/**
 * Returns a consistent, device-aware close zoom for moving from a directory
 * row to its map marker. The result is intentionally independent of the
 * viewer's current zoom so every lookup lands with the same amount of context.
 */
export function publicPlaceFocusZoom({
  fitZoom,
  viewportWidth,
  viewportHeight,
  stageWidth,
  stageHeight,
}) {
  const safeFitZoom = Math.max(0.22, finitePositive(fitZoom, 0.72));
  const safeViewportWidth = finitePositive(viewportWidth, 390);
  const safeViewportHeight = finitePositive(viewportHeight, 700);
  const safeStageWidth = finitePositive(stageWidth, safeViewportWidth);
  const safeStageHeight = finitePositive(stageHeight, safeViewportHeight);
  const compact = safeViewportWidth <= 760;
  const viewportFillZoom = Math.max(
    safeViewportWidth / safeStageWidth,
    safeViewportHeight / safeStageHeight,
  );
  const desiredZoom = compact
    ? Math.max(safeFitZoom * 2.45, viewportFillZoom * 1.36)
    : Math.max(safeFitZoom * 1.9, viewportFillZoom * 1.16);
  const ceiling = Math.max(safeFitZoom, compact ? 1.62 : 1.72);
  return Math.min(ceiling, Math.max(safeFitZoom, desiredZoom));
}
