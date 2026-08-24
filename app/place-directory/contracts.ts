import type { CategoryId } from "../map/core/model";
import type { DirectoryPlace, MapElement } from "../map/core/types";

export type CoordinateLockFilter = "all" | "unlocked" | "locked";
export type PlacementFilter = "all" | "placed" | "unplaced";
export type RecommendationFilter = "all" | "recommended" | "standard";
export type DatabaseEditorCategoryFilter = "all" | "culture" | "food" | "cafe" | "shop" | "other";
export type DirectoryStorage = "loading" | "persistent" | "bundled";

export type DirectoryTaxonomySync = {
  placeId: string | null;
  state: "ready" | "saving" | "saved" | "error";
};

export type UnifiedPlaceRow = {
  id: string;
  name: string;
  category: CategoryId;
  address: string;
  area: string;
  sourceLabel: string;
  place?: DirectoryPlace;
  element?: MapElement;
};
