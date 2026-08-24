export const DENSE_LABEL_MIN_ITEMS = 2;
export const DENSE_LABEL_MAX_ITEMS = 18;
export const DENSE_LABEL_MAX_POSITIONS = 500;
export const DENSE_LABEL_MAX_EXCLUDED_IDS = 500;

function finiteCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function validDenseLabelPosition(value) {
  if (!value || typeof value !== "object") return false;
  return typeof value.key === "string"
    && value.key.length > 0
    && value.key.length <= 1200
    && Array.isArray(value.elementIds)
    && value.elementIds.length >= DENSE_LABEL_MIN_ITEMS
    && value.elementIds.length <= DENSE_LABEL_MAX_ITEMS
    && value.elementIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 220)
    && new Set(value.elementIds).size === value.elementIds.length
    && finiteCoordinate(value.x)
    && finiteCoordinate(value.y);
}

export function validDenseLabelExcludedIds(value) {
  return Array.isArray(value)
    && value.length <= DENSE_LABEL_MAX_EXCLUDED_IDS
    && value.every((id) => typeof id === "string" && id.length > 0 && id.length <= 220)
    && new Set(value).size === value.length;
}

export function validateDenseLabelSettingsPayload(payload) {
  const positions = payload?.positions;
  const excludedElementIds = payload?.excludedElementIds;
  if (!Array.isArray(positions)) {
    return { ok: false, error: "positions must be an array", field: "positions" };
  }
  if (positions.length > DENSE_LABEL_MAX_POSITIONS) {
    return { ok: false, error: `positions cannot exceed ${DENSE_LABEL_MAX_POSITIONS} entries`, field: "positions" };
  }
  const invalidIndex = positions.findIndex((position) => !validDenseLabelPosition(position));
  if (invalidIndex >= 0) {
    const count = Array.isArray(positions[invalidIndex]?.elementIds)
      ? positions[invalidIndex].elementIds.length
      : null;
    return {
      ok: false,
      error: `dense label groups must contain ${DENSE_LABEL_MIN_ITEMS}-${DENSE_LABEL_MAX_ITEMS} unique places and valid coordinates`,
      field: `positions[${invalidIndex}]`,
      itemCount: count,
      minimumItems: DENSE_LABEL_MIN_ITEMS,
      maximumItems: DENSE_LABEL_MAX_ITEMS,
    };
  }
  if (!validDenseLabelExcludedIds(excludedElementIds)) {
    return { ok: false, error: "excludedElementIds contains invalid or duplicate values", field: "excludedElementIds" };
  }
  if (new Set(positions.map((position) => position.key)).size !== positions.length) {
    return { ok: false, error: "duplicate dense label key", field: "positions" };
  }
  return { ok: true, positions, excludedElementIds };
}
