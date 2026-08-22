const MOBILE_LABEL_SCALE_STEPS = Object.freeze([
  { maximumRatio: 1.05, limits: { low: 14, standard: 18, high: 22 } },
  { maximumRatio: 1.45, limits: { low: 22, standard: 30, high: 38 } },
  { maximumRatio: 1.9, limits: { low: 32, standard: 44, high: 58 } },
  { maximumRatio: 2.2, limits: { low: 44, standard: 60, high: 78 } },
  { maximumRatio: Number.POSITIVE_INFINITY, limits: { low: Number.POSITIVE_INFINITY, standard: Number.POSITIVE_INFINITY, high: Number.POSITIVE_INFINITY } },
]);

const MOBILE_FULL_MARKER_MIN_RATIO = 2;

function zoomRatio(zoom, fitZoom) {
  return Math.max(0.01, Number.isFinite(zoom) ? zoom : 0.22)
    / Math.max(0.22, Number.isFinite(fitZoom) ? fitZoom : 0.22);
}

export function mobileOverviewIsSimplified(zoom, fitZoom) {
  return zoomRatio(zoom, fitZoom) < MOBILE_FULL_MARKER_MIN_RATIO;
}

export function mobileLabelBudgetForScale(zoom, fitZoom, baseLimit, total, tier = "standard") {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const safeBaseLimit = Math.min(safeTotal, Math.max(0, Math.floor(Number.isFinite(baseLimit) ? baseLimit : safeTotal)));
  if (safeBaseLimit === 0) return 0;
  const ratio = zoomRatio(zoom, fitZoom);
  const step = MOBILE_LABEL_SCALE_STEPS.find((candidate) => ratio <= candidate.maximumRatio)
    ?? MOBILE_LABEL_SCALE_STEPS[MOBILE_LABEL_SCALE_STEPS.length - 1];
  const limit = step.limits[tier] ?? step.limits.standard;
  return Math.min(safeBaseLimit, Number.isFinite(limit) ? limit : safeBaseLimit);
}
