export const LABEL_SCALE_STEPS = Object.freeze([
  { maximumRatio: 1.05, limit: 30 },
  { maximumRatio: 1.5, limit: 50 },
  { maximumRatio: 2.2, limit: 80 },
]);

export function labelBudgetForScale(zoom, fitZoom, total, enabled = true) {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  if (!enabled || safeTotal === 0) return safeTotal;
  const ratio = Math.max(0.01, Number.isFinite(zoom) ? zoom : 0.22)
    / Math.max(0.22, Number.isFinite(fitZoom) ? fitZoom : 0.22);
  const step = LABEL_SCALE_STEPS.find((candidate) => ratio <= candidate.maximumRatio);
  return Math.min(safeTotal, step?.limit ?? safeTotal);
}

export function chooseScaleAwareLabelIds(candidates, {
  limit,
  selectedId = null,
  mainHubIds = [],
} = {}) {
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
  const mainHubs = new Set(mainHubIds);
  const safeLimit = Math.min(uniqueCandidates.length, Math.max(0, Math.floor(Number.isFinite(limit) ? limit : uniqueCandidates.length)));
  const mandatory = uniqueCandidates.filter((candidate) => (
    candidate.id === selectedId
    || candidate.category === "landmark"
    || mainHubs.has(candidate.id)
  ));
  const mandatoryIds = new Set(mandatory.map((candidate) => candidate.id));
  const optional = uniqueCandidates
    .filter((candidate) => !mandatoryIds.has(candidate.id))
    .sort((a, b) => (
      Number(Boolean(b.labelLocked)) - Number(Boolean(a.labelLocked))
      || (b.z ?? 0) - (a.z ?? 0)
      || String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko")
    ));
  const selected = [
    ...mandatory,
    ...optional.slice(0, Math.max(0, safeLimit - mandatory.length)),
  ];
  return {
    ids: selected.map((candidate) => candidate.id),
    limit: safeLimit,
    limited: selected.length < uniqueCandidates.length,
  };
}
