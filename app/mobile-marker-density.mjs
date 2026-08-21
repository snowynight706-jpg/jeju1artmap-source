const MOBILE_MARKER_SCALE_STEPS = Object.freeze([
  { maximumRatio: 1.05, limits: { low: 18, standard: 24, high: 30 } },
  { maximumRatio: 1.45, limits: { low: 28, standard: 40, high: 52 } },
  { maximumRatio: 1.9, limits: { low: 46, standard: 64, high: 82 } },
  { maximumRatio: Number.POSITIVE_INFINITY, limits: { low: 64, standard: 88, high: 112 } },
]);

const MOBILE_LABEL_SCALE_STEPS = Object.freeze([
  { maximumRatio: 1.05, limits: { low: 14, standard: 18, high: 22 } },
  { maximumRatio: 1.45, limits: { low: 22, standard: 30, high: 38 } },
  { maximumRatio: 1.9, limits: { low: 32, standard: 44, high: 58 } },
  { maximumRatio: 2.5, limits: { low: 44, standard: 60, high: 78 } },
  { maximumRatio: Number.POSITIVE_INFINITY, limits: { low: 60, standard: 84, high: Number.POSITIVE_INFINITY } },
]);

const MOBILE_SIMPLIFIED_OVERVIEW_MAX_RATIO = 1.45;

function zoomRatio(zoom, fitZoom) {
  return Math.max(0.01, Number.isFinite(zoom) ? zoom : 0.22)
    / Math.max(0.22, Number.isFinite(fitZoom) ? fitZoom : 0.22);
}

export function mobileOverviewIsSimplified(zoom, fitZoom) {
  return zoomRatio(zoom, fitZoom) <= MOBILE_SIMPLIFIED_OVERVIEW_MAX_RATIO;
}

export function mobileMarkerBudgetForScale(zoom, fitZoom, total, tier = "standard", fullFromZoom = null) {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  if (safeTotal === 0) return 0;
  if (Number.isFinite(fullFromZoom) && zoom >= fullFromZoom - 0.002) return safeTotal;
  const ratio = zoomRatio(zoom, fitZoom);
  const step = MOBILE_MARKER_SCALE_STEPS.find((candidate) => ratio <= candidate.maximumRatio)
    ?? MOBILE_MARKER_SCALE_STEPS[MOBILE_MARKER_SCALE_STEPS.length - 1];
  const limit = step.limits[tier] ?? step.limits.standard;
  return Math.min(safeTotal, Number.isFinite(limit) ? limit : safeTotal);
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

export function chooseMobileMarkerRenderIds(candidates, {
  limit,
  selectedId = null,
  mainHubIds = [],
  recommendedIds = [],
  centerX = 50,
  centerY = 50,
} = {}) {
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
  const safeLimit = Math.min(uniqueCandidates.length, Math.max(0, Math.floor(Number.isFinite(limit) ? limit : uniqueCandidates.length)));
  if (safeLimit >= uniqueCandidates.length) return uniqueCandidates.map((candidate) => candidate.id);
  const mainHubs = new Set(mainHubIds);
  const recommended = new Set(recommendedIds);
  const mandatory = uniqueCandidates.filter((candidate) => (
    candidate.category === "landmark"
    || candidate.id === selectedId
    || mainHubs.has(candidate.id)
  ));
  const mandatoryIds = new Set(mandatory.map((candidate) => candidate.id));
  const optional = uniqueCandidates
    .filter((candidate) => !mandatoryIds.has(candidate.id))
    .sort((a, b) => {
      const recommendationDifference = Number(recommended.has(b.id)) - Number(recommended.has(a.id));
      if (recommendationDifference) return recommendationDifference;
      const aDistance = Math.hypot((a.x ?? 50) - centerX, (a.y ?? 50) - centerY);
      const bDistance = Math.hypot((b.x ?? 50) - centerX, (b.y ?? 50) - centerY);
      return aDistance - bDistance
        || (b.z ?? 0) - (a.z ?? 0)
        || String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko");
    });
  return [
    ...mandatory,
    ...optional.slice(0, Math.max(0, safeLimit - mandatory.length)),
  ].map((candidate) => candidate.id);
}
