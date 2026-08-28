export const DEFAULT_SITE_DISPLAY_NAME = "제주 원도심 아트맵";
export const SITE_DISPLAY_NAME_MAX_LENGTH = 40;

export type SiteIdentitySettings = {
  displayName: string;
  updatedAt: string | null;
  revision: number;
};

export const DEFAULT_SITE_IDENTITY: SiteIdentitySettings = {
  displayName: DEFAULT_SITE_DISPLAY_NAME,
  updatedAt: null,
  revision: 0,
};

export function normalizeSiteDisplayName(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length < 2 || normalized.length > SITE_DISPLAY_NAME_MAX_LENGTH) return null;
  return normalized;
}
