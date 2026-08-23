import { normalizePlaceName } from "../../core-landmarks";

export const markerCategoryColors = {
  culture: "#58AEB0",
  cafe: "#D49A55",
  food: "#E36B58",
  shop: "#9A6DAE",
  parking: "#557AA8",
  park: "#69A56D",
  utility: "#8F7EA7",
} as const;

export const categories = [
  { id: "landmark", name: "핵심 랜드마크", color: markerCategoryColors.culture, glyph: "景" },
  { id: "culture", name: "일반 문화시설", color: markerCategoryColors.culture, glyph: "文" },
  { id: "cafe", name: "카페", color: markerCategoryColors.cafe, glyph: "珈" },
  { id: "food", name: "음식점", color: markerCategoryColors.food, glyph: "食" },
  { id: "shop", name: "소품샵", color: markerCategoryColors.shop, glyph: "物" },
  { id: "parking", name: "주차장", color: markerCategoryColors.parking, glyph: "P" },
  { id: "park", name: "공원·광장", color: markerCategoryColors.park, glyph: "休" },
  { id: "utility", name: "기타 편의시설", color: markerCategoryColors.utility, glyph: "＋" },
] as const;

export type CategoryId = (typeof categories)[number]["id"];

export const EXPORT_CANONICAL_WIDTH = 1180;

const GENERAL_MARKER_DISPLAY_SCALE = 1.25;

export function mapElementDisplaySize(element: { category: CategoryId; size: number }) {
  return element.category === "landmark" ? element.size : element.size * GENERAL_MARKER_DISPLAY_SCALE;
}

export function categoryOf(id: CategoryId) {
  return categories.find((category) => category.id === id) ?? categories[categories.length - 1];
}

export function mobileMarkerPlaceholderColor(id: CategoryId) {
  return categoryOf(id).color;
}

export function isPrimaryHubLabel(name: string) {
  return normalizePlaceName(name) === "제주시소통협력센터";
}

export function placeContentKey(element: { id: string; directoryId?: string }) {
  return element.directoryId?.trim() ? `directory:${element.directoryId.trim()}` : `element:${element.id}`;
}
