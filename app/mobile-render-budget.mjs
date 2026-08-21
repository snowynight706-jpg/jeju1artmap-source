export const LOW_MOBILE_RENDER_BUDGET = Object.freeze({
  tier: "low",
  overscanRatio: 0.5,
  minimumOverscan: 96,
});

export const STANDARD_MOBILE_RENDER_BUDGET = Object.freeze({
  tier: "standard",
  overscanRatio: 0.68,
  minimumOverscan: 112,
});

export const HIGH_MOBILE_RENDER_BUDGET = Object.freeze({
  tier: "high",
  overscanRatio: 0.82,
  minimumOverscan: 140,
});

export function mobileRenderBudgetForDevice(deviceMemory, hardwareConcurrency) {
  const memory = Number.isFinite(deviceMemory) && deviceMemory > 0 ? deviceMemory : null;
  const cores = Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0 ? hardwareConcurrency : null;
  if ((memory !== null && memory <= 4) || (cores !== null && cores <= 4)) return LOW_MOBILE_RENDER_BUDGET;
  if (memory !== null && memory >= 8 && cores !== null && cores >= 8) return HIGH_MOBILE_RENDER_BUDGET;
  return STANDARD_MOBILE_RENDER_BUDGET;
}
