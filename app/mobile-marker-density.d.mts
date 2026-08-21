export type MobileRenderTier = "low" | "standard" | "high";

export type MobileMarkerDensityCandidate = {
  id: string;
  name?: string;
  category?: string;
  x?: number;
  y?: number;
  z?: number;
};

export function mobileOverviewIsSimplified(
  zoom: number,
  fitZoom: number,
): boolean;

export function mobileMarkerBudgetForScale(
  zoom: number,
  fitZoom: number,
  total: number,
  tier?: MobileRenderTier,
): number;

export function mobileLabelBudgetForScale(
  zoom: number,
  fitZoom: number,
  baseLimit: number,
  total: number,
  tier?: MobileRenderTier,
): number;

export function chooseMobileMarkerRenderIds<T extends MobileMarkerDensityCandidate>(
  candidates: T[],
  options?: {
    limit?: number;
    selectedId?: string | null;
    mainHubIds?: string[];
    centerX?: number;
    centerY?: number;
  },
): string[];
