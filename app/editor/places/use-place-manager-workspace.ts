"use client";

import { useMemo, useState } from "react";
import { normalizePlaceName } from "../../core-landmarks";
import { categories } from "../../map/core/model";
import type { DirectoryPlace, MapElement, ViewMode } from "../../map/core/types";
import { printSettingKey, type PrintPlaceSetting } from "../../map/print/settings";
import {
  additionalCategoryDefinitions,
  convenienceAttributeDefinitions,
  sanitizeAdditionalCategories,
  sanitizeConvenienceAttributes,
} from "../../place-taxonomy";
import { databaseEditorCategoryForPlace } from "../../place-directory/model";
import type {
  CoordinateLockFilter,
  DatabaseEditorCategoryFilter,
  DirectoryStorage,
  DirectoryTaxonomySync,
  PlacementFilter,
  RecommendationFilter,
  UnifiedPlaceRow,
} from "../../place-directory/contracts";

type UsePlaceManagerWorkspaceOptions = {
  elements: MapElement[];
  directoryPlaces: DirectoryPlace[];
  printSettings: PrintPlaceSetting[];
  viewMode: ViewMode;
  screenRecommendedOnly: boolean;
};

export function usePlaceManagerWorkspace({
  elements,
  directoryPlaces,
  printSettings,
  viewMode,
  screenRecommendedOnly,
}: UsePlaceManagerWorkspaceOptions) {
  const [placeQuery, setPlaceQuery] = useState("");
  const [coordinateLockFilter, setCoordinateLockFilter] = useState<CoordinateLockFilter>("all");
  const [placementFilter, setPlacementFilter] = useState<PlacementFilter>("all");
  const [recommendationFilter, setRecommendationFilter] = useState<RecommendationFilter>("all");
  const [placeDirectoryStorage, setPlaceDirectoryStorage] = useState<DirectoryStorage>("loading");
  const [placeDirectoryCanEdit, setPlaceDirectoryCanEdit] = useState(false);
  const [placeDirectoryUpdatedAt, setPlaceDirectoryUpdatedAt] = useState<string | null>(null);
  const [databaseEditorOpen, setDatabaseEditorOpen] = useState(false);
  const [databaseEditorSaving, setDatabaseEditorSaving] = useState(false);
  const [databaseEditorDirty, setDatabaseEditorDirty] = useState(false);
  const [databaseEditorQuery, setDatabaseEditorQuery] = useState("");
  const [databaseEditorCategory, setDatabaseEditorCategory] = useState<DatabaseEditorCategoryFilter>("all");
  const [databaseEditorSelectedId, setDatabaseEditorSelectedId] = useState<string | null>(null);
  const [databaseDraftPlaces, setDatabaseDraftPlaces] = useState<DirectoryPlace[]>([]);
  const [directoryTaxonomySync, setDirectoryTaxonomySync] = useState<DirectoryTaxonomySync>({ placeId: null, state: "ready" });

  const allUnifiedPlaceRows = useMemo<UnifiedPlaceRow[]>(() => {
    const elementsByDirectoryId = new Map(elements.filter((element) => element.directoryId).map((element) => [element.directoryId!, element]));
    const elementsByName = new Map(elements.map((element) => [normalizePlaceName(element.name), element]));
    const claimedElementIds = new Set<string>();
    const rows: UnifiedPlaceRow[] = directoryPlaces.map((place) => {
      const element = elementsByDirectoryId.get(place.id) ?? elementsByName.get(normalizePlaceName(place.name));
      if (element) claimedElementIds.add(element.id);
      return {
        id: `place-row-${place.id}`,
        name: place.name,
        category: element?.category ?? place.category,
        address: place.address,
        area: place.area,
        sourceLabel: place.sourceLabel,
        place,
        element,
      };
    });
    elements.forEach((element) => {
      if (claimedElementIds.has(element.id)) return;
      rows.push({
        id: `element-row-${element.id}`,
        name: element.name,
        category: element.category,
        address: element.address,
        area: element.category === "landmark" ? "랜드마크" : "사용자 배치",
        sourceLabel: element.memo || "지도 배치 요소",
        element,
      });
    });
    return rows.sort((a, b) => (
      Number(b.category === "landmark") - Number(a.category === "landmark")
      || a.name.localeCompare(b.name, "ko")
    ));
  }, [directoryPlaces, elements]);
  const searchedUnifiedPlaceRows = useMemo(() => {
    const query = placeQuery.trim().toLocaleLowerCase("ko-KR");
    return allUnifiedPlaceRows.filter((row) => (
      !query || `${row.name} ${row.address} ${row.area}`.toLocaleLowerCase("ko-KR").includes(query)
    ));
  }, [allUnifiedPlaceRows, placeQuery]);
  const coordinateLockCounts = useMemo(() => searchedUnifiedPlaceRows.reduce((counts, row) => {
    if (!row.element) return counts;
    counts[row.element.locked ? "locked" : "unlocked"] += 1;
    return counts;
  }, { locked: 0, unlocked: 0 }), [searchedUnifiedPlaceRows]);
  const unifiedPlaceRows = useMemo(() => searchedUnifiedPlaceRows.filter((row) => {
    const lockMatches = coordinateLockFilter === "all"
      || (coordinateLockFilter === "locked" ? Boolean(row.element?.locked) : Boolean(row.element && !row.element.locked));
    const placed = Boolean(row.element?.mapVisible);
    const placementMatches = placementFilter === "all" || (placementFilter === "placed" ? placed : !placed);
    const target = row.element ?? { directoryId: row.place?.id ?? row.id, category: row.category, name: row.name };
    const setting = printSettings.find((item) => item.key === printSettingKey(target));
    const recommended = row.category === "landmark"
      || setting?.recommended === true
      || (!setting && /추천|우선/.test(row.place?.priority ?? ""));
    const recommendationMatches = recommendationFilter === "all"
      || (recommendationFilter === "recommended" ? recommended : !recommended);
    return lockMatches && placementMatches && recommendationMatches;
  }), [coordinateLockFilter, placementFilter, printSettings, recommendationFilter, searchedUnifiedPlaceRows]);
  const unifiedPlaceGroups = useMemo(() => categories.map((category) => ({
    category,
    rows: unifiedPlaceRows.filter((row) => row.category === category.id),
  })).filter((group) => group.rows.length > 0), [unifiedPlaceRows]);
  const placeFiltersActive = Boolean(placeQuery.trim())
    || coordinateLockFilter !== "all"
    || placementFilter !== "all"
    || recommendationFilter !== "all"
    || viewMode !== "all"
    || screenRecommendedOnly;
  const placedUnifiedPlaceCount = allUnifiedPlaceRows.filter((row) => row.element?.mapVisible).length;

  const selectedDatabasePlace = useMemo(
    () => databaseDraftPlaces.find((place) => place.id === databaseEditorSelectedId) ?? null,
    [databaseDraftPlaces, databaseEditorSelectedId],
  );
  const databaseAreaOptions = useMemo(() => [...new Set(databaseDraftPlaces
    .map((place) => place.area.trim())
    .filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")), [databaseDraftPlaces]);
  const placeRequestAreaOptions = useMemo(() => [...new Set(directoryPlaces
    .map((place) => place.area.trim())
    .filter((area) => Boolean(area) && area !== "등록 요청"))]
    .sort((a, b) => a.localeCompare(b, "ko")), [directoryPlaces]);
  const databaseEditorCategoryCounts = useMemo(() => databaseDraftPlaces.reduce<Record<DatabaseEditorCategoryFilter, number>>((counts, place) => {
    counts.all += 1;
    counts[databaseEditorCategoryForPlace(place)] += 1;
    return counts;
  }, { all: 0, culture: 0, food: 0, cafe: 0, shop: 0, other: 0 }), [databaseDraftPlaces]);
  const filteredDatabaseDraftPlaces = useMemo(() => {
    const query = databaseEditorQuery.trim().toLocaleLowerCase("ko-KR");
    return databaseDraftPlaces
      .filter((place) => databaseEditorCategory === "all" || databaseEditorCategoryForPlace(place) === databaseEditorCategory)
      .filter((place) => {
        const tagNames = additionalCategoryDefinitions
          .filter((definition) => sanitizeAdditionalCategories(place.additionalCategories).includes(definition.id))
          .map((definition) => definition.name)
          .join(" ");
        const convenienceNames = convenienceAttributeDefinitions
          .filter((definition) => sanitizeConvenienceAttributes(place.convenienceAttributes).includes(definition.id))
          .map((definition) => definition.name)
          .join(" ");
        return !query || `${place.name} ${(place.aliases ?? []).join(" ")} ${place.address} ${place.area} ${place.subtype ?? ""} ${tagNames} ${convenienceNames}`.toLocaleLowerCase("ko-KR").includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [databaseDraftPlaces, databaseEditorCategory, databaseEditorQuery]);

  return {
    placeQuery,
    coordinateLockFilter,
    placementFilter,
    recommendationFilter,
    placeDirectoryStorage,
    placeDirectoryCanEdit,
    placeDirectoryUpdatedAt,
    databaseEditorOpen,
    databaseEditorSaving,
    databaseEditorDirty,
    databaseEditorQuery,
    databaseEditorCategory,
    databaseEditorSelectedId,
    databaseDraftPlaces,
    directoryTaxonomySync,
    allUnifiedPlaceRows,
    searchedUnifiedPlaceRows,
    coordinateLockCounts,
    unifiedPlaceRows,
    unifiedPlaceGroups,
    placeFiltersActive,
    placedUnifiedPlaceCount,
    selectedDatabasePlace,
    databaseAreaOptions,
    placeRequestAreaOptions,
    databaseEditorCategoryCounts,
    filteredDatabaseDraftPlaces,
    setPlaceQuery,
    setCoordinateLockFilter,
    setPlacementFilter,
    setRecommendationFilter,
    setPlaceDirectoryStorage,
    setPlaceDirectoryCanEdit,
    setPlaceDirectoryUpdatedAt,
    setDatabaseEditorOpen,
    setDatabaseEditorSaving,
    setDatabaseEditorDirty,
    setDatabaseEditorQuery,
    setDatabaseEditorCategory,
    setDatabaseEditorSelectedId,
    setDatabaseDraftPlaces,
    setDirectoryTaxonomySync,
  };
}
