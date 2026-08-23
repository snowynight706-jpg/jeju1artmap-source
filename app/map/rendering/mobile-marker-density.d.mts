export type MobileRenderTier = "low" | "standard" | "high";

export function mobileOverviewIsSimplified(
  zoom: number,
  fitZoom: number,
): boolean;

export function mobileLabelBudgetForScale(
  zoom: number,
  fitZoom: number,
  baseLimit: number,
  total: number,
  tier?: MobileRenderTier,
): number;
