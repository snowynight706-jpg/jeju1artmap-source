const PUBLIC_PLACE_QUERY_KEY = "place";

export const publicPanelIsPlace = (panel) => panel === "place" || panel === "place-expanded";
export const publicPanelIsExplorer = (panel) => panel === "explorer" || panel === "explorer-expanded";
export const publicPanelIsExpanded = (panel) => panel === "place-expanded" || panel === "explorer-expanded";

export function publicPanelAfterDrag(target, startExpanded, deltaY, threshold = 44) {
  if (deltaY <= -Math.abs(threshold)) return `${target}-expanded`;
  if (deltaY >= Math.abs(threshold)) return target;
  return startExpanded ? `${target}-expanded` : target;
}

export function publicUrlWithPlace(href, placeId) {
  const url = new URL(href, "https://local.invalid");
  if (placeId) url.searchParams.set(PUBLIC_PLACE_QUERY_KEY, placeId);
  else url.searchParams.delete(PUBLIC_PLACE_QUERY_KEY);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function publicPlaceDirectionsUrl(name, address, mapUrl) {
  const directUrl = typeof mapUrl === "string" ? mapUrl.trim() : "";
  try {
    const parsed = new URL(directUrl);
    if (parsed.protocol === "https:" && parsed.hostname === "place.map.kakao.com" && /^\/\d+\/?$/.test(parsed.pathname)) {
      return directUrl;
    }
  } catch {
    // Old search links and non-map URLs are intentionally replaced below.
  }
  const query = String(address ?? "").trim() || String(name ?? "").trim();
  return `https://map.kakao.com/?q=${encodeURIComponent(query)}`;
}
