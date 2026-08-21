export const OPTIONAL_LABEL_SCALE_STEPS = Object.freeze([
  { maximumRatio: 1.25, limit: 0 },
  { maximumRatio: 1.7, limit: 2 },
  { maximumRatio: 2.1, limit: 4 },
  { maximumRatio: 2.5, limit: 6 },
  { maximumRatio: 3, limit: 18 },
  { maximumRatio: 3.6, limit: 34 },
  { maximumRatio: 4.5, limit: 68 },
]);

const MAX_OPTIONAL_LABEL_LIMIT = 1200;

export function normalizeOptionalLabelScaleSteps(value) {
  const source = Array.isArray(value) ? value : [];
  return OPTIONAL_LABEL_SCALE_STEPS.map((fallback, index) => {
    const candidate = source[index];
    const limit = candidate && typeof candidate === "object" && Number.isFinite(candidate.limit)
      ? Math.min(MAX_OPTIONAL_LABEL_LIMIT, Math.max(0, Math.floor(candidate.limit)))
      : fallback.limit;
    return { maximumRatio: fallback.maximumRatio, limit };
  });
}

export function optionalLabelBudgetForScale(
  zoom,
  fitZoom,
  total,
  enabled = true,
  steps = OPTIONAL_LABEL_SCALE_STEPS,
) {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  if (!enabled || safeTotal === 0) return safeTotal;
  const ratio = Math.max(0.01, Number.isFinite(zoom) ? zoom : 0.22)
    / Math.max(0.22, Number.isFinite(fitZoom) ? fitZoom : 0.22);
  const step = normalizeOptionalLabelScaleSteps(steps).find((candidate) => ratio <= candidate.maximumRatio);
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
