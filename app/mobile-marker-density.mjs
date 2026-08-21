const MOBILE_MARKER_SCALE_STEPS = Object.freeze([
  { maximumRatio: 1.05, limits: { low: 24, standard: 34, high: 44 } },
  { maximumRatio: 1.5, limits: { low: 38, standard: 52, high: 68 } },
  { maximumRatio: 2.2, limits: { low: 58, standard: 76, high: 96 } },
  { maximumRatio: Number.POSITIVE_INFINITY, limits: { low: 78, standard: 104, high: Number.POSITIVE_INFINITY } },
]);

const MOBILE_LABEL_TIER_RATIOS = Object.freeze({
  low: 0.72,
  standard: 0.88,
  high: 1,
});

export function mobileMarkerBudgetForScale(zoom, fitZoom, total, tier = "standard") {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  if (safeTotal === 0) return 0;
  const ratio = Math.max(0.01, Number.isFinite(zoom) ? zoom : 0.22)
    / Math.max(0.22, Number.isFinite(fitZoom) ? fitZoom : 0.22);
  const step = MOBILE_MARKER_SCALE_STEPS.find((candidate) => ratio <= candidate.maximumRatio)
    ?? MOBILE_MARKER_SCALE_STEPS[MOBILE_MARKER_SCALE_STEPS.length - 1];
  const limit = step.limits[tier] ?? step.limits.standard;
  return Math.min(safeTotal, Number.isFinite(limit) ? limit : safeTotal);
}

export function mobileLabelBudgetForTier(baseLimit, total, tier = "standard") {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const safeBaseLimit = Math.min(safeTotal, Math.max(0, Math.floor(Number.isFinite(baseLimit) ? baseLimit : safeTotal)));
  const ratio = MOBILE_LABEL_TIER_RATIOS[tier] ?? MOBILE_LABEL_TIER_RATIOS.standard;
  return Math.min(safeTotal, Math.max(0, Math.floor(safeBaseLimit * ratio)));
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
  const mainHubs = new Set(mainHubIds);
  const recommended = new Set(recommendedIds);
  const safeLimit = Math.min(uniqueCandidates.length, Math.max(0, Math.floor(Number.isFinite(limit) ? limit : uniqueCandidates.length)));
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
