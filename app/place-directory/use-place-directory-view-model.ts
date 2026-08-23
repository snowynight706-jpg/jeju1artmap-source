"use client";

import { useMemo } from "react";
import { geocodedPlaces } from "../geocoded-places";
import { normalizePlaceName } from "../core-landmarks";
import {
  PRIMARY_CALIBRATION_NAMES,
  buildEffectiveCalibrationPoints,
  type CalibrationPoint,
} from "../map/calibration/model";
import {
  categories,
  categoryOf,
  placeContentKey,
  type CategoryId,
} from "../map/core/model";
import type {
  DirectoryPlace,
  LandmarkDefaultPosition,
  MapAsset,
  MapElement,
  ReviewNote,
  ViewMode,
} from "../map/core/types";
import { printSettingKey, type PrintPlaceSetting } from "../map/print/settings";
import {
  ART_PLATFORM_FACILITY_NAMES,
  MAIN_HUB_ROLE,
  additionalCategoryDefinitions,
  convenienceAttributeDefinitions,
  isPrimaryPublicCategory,
  publicDisplayName,
  sanitizeAdditionalCategories,
  sanitizeConvenienceAttributes,
} from "../place-taxonomy";
import {
  databaseEditorCategoryForPlace,
  directoryCategory,
} from "./model";
import type { DatabaseEditorCategoryFilter } from "../admin-database-editor";
import type { PlaceStory } from "../content/types";

export type CoordinateLockFilter = "all" | "unlocked" | "locked";
export type PlacementFilter = "all" | "placed" | "unplaced";
export type RecommendationFilter = "all" | "recommended" | "standard";

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

type DirectoryTaxonomySync = {
  placeId: string | null;
  state: "ready" | "saving" | "saved" | "error";
};

type PublicCategoryMeta = {
  id: string;
  name: string;
  color: string;
  iconSrc: string;
};

type UsePlaceDirectoryViewModelOptions = {
  elements: MapElement[];
  assets: MapAsset[];
  reviewNotes: ReviewNote[];
  directoryPlaces: DirectoryPlace[];
  calibrationPoints: CalibrationPoint[];
  landmarkDefaultPositions: LandmarkDefaultPosition[];
  selectedId: string | null;
  selectedFacilityId: string | null;
  selectedNoteId: string | null;
  directoryTaxonomySync: DirectoryTaxonomySync;
  placeDirectoryCanEdit: boolean;
  placeStories: PlaceStory[];
  placeQuery: string;
  coordinateLockFilter: CoordinateLockFilter;
  placementFilter: PlacementFilter;
  recommendationFilter: RecommendationFilter;
  printSettings: PrintPlaceSetting[];
  viewMode: ViewMode;
  screenRecommendedOnly: boolean;
  databaseDraftPlaces: DirectoryPlace[];
  databaseEditorSelectedId: string | null;
  databaseEditorCategory: DatabaseEditorCategoryFilter;
  databaseEditorQuery: string;
  publicCategoryMetaForPlace: (place: DirectoryPlace, anchor: MapElement) => PublicCategoryMeta;
};

export function usePlaceDirectoryViewModel({
  elements,
  assets,
  reviewNotes,
  directoryPlaces,
  calibrationPoints,
  landmarkDefaultPositions,
  selectedId,
  selectedFacilityId,
  selectedNoteId,
  directoryTaxonomySync,
  placeDirectoryCanEdit,
  placeStories,
  placeQuery,
  coordinateLockFilter,
  placementFilter,
  recommendationFilter,
  printSettings,
  viewMode,
  screenRecommendedOnly,
  databaseDraftPlaces,
  databaseEditorSelectedId,
  databaseEditorCategory,
  databaseEditorQuery,
  publicCategoryMetaForPlace,
}: UsePlaceDirectoryViewModelOptions) {
  const elementsById = useMemo(() => new Map(elements.map((element) => [element.id, element])), [elements]);
  const elementsByNormalizedName = useMemo(() => {
    const index = new Map<string, MapElement>();
    elements.forEach((element) => {
      const name = normalizePlaceName(element.name);
      if (!index.has(name)) index.set(name, element);
    });
    return index;
  }, [elements]);
  const requestMarkerByRequestId = useMemo(() => {
    const index = new Map<string, MapElement>();
    elements.forEach((element) => {
      if (element.placeRequestId && !element.directoryId && !index.has(element.placeRequestId)) {
        index.set(element.placeRequestId, element);
      }
    });
    return index;
  }, [elements]);
  const directoryPlacesById = useMemo(() => new Map(directoryPlaces.map((place) => [place.id, place])), [directoryPlaces]);
  const directoryPlacesByNormalizedName = useMemo(() => {
    const index = new Map<string, DirectoryPlace>();
    directoryPlaces.forEach((place) => {
      const name = normalizePlaceName(place.name);
      if (!index.has(name)) index.set(name, place);
    });
    return index;
  }, [directoryPlaces]);
  const directoryPlacesByGroup = useMemo(() => {
    const groups = new Map<string, DirectoryPlace[]>();
    directoryPlaces.forEach((place) => {
      if (!place.locationGroupId) return;
      const group = groups.get(place.locationGroupId) ?? [];
      group.push(place);
      groups.set(place.locationGroupId, group);
    });
    groups.forEach((group) => group.sort((a, b) => {
      const order = (ART_PLATFORM_FACILITY_NAMES as readonly string[]).indexOf(normalizePlaceName(a.name));
      const otherOrder = (ART_PLATFORM_FACILITY_NAMES as readonly string[]).indexOf(normalizePlaceName(b.name));
      return (order < 0 ? 99 : order) - (otherOrder < 0 ? 99 : otherOrder) || a.name.localeCompare(b.name, "ko");
    }));
    return groups;
  }, [directoryPlaces]);

  const selected = selectedId ? elementsById.get(selectedId) ?? null : null;
  const selectedNote = reviewNotes.find((note) => note.id === selectedNoteId) ?? null;
  const selectedAnchorDirectoryPlace = selected
    ? (selected.directoryId ? directoryPlacesById.get(selected.directoryId) : undefined)
      ?? directoryPlacesByNormalizedName.get(normalizePlaceName(selected.name))
      ?? null
    : null;
  const selectedFacilityPlace = selectedFacilityId
    ? directoryPlacesById.get(selectedFacilityId) ?? null
    : null;
  const selectedDirectoryPlace = selectedFacilityPlace?.locationGroupId
    && selectedFacilityPlace.locationGroupId === selectedAnchorDirectoryPlace?.locationGroupId
    ? selectedFacilityPlace
    : selectedAnchorDirectoryPlace;
  const selectedUnlinkedPrimaryCategory = selected && isPrimaryPublicCategory(directoryCategory(selected.category))
    ? directoryCategory(selected.category)
    : null;
  const selectedUnlinkedTaxonomySaving = Boolean(selected)
    && directoryTaxonomySync.placeId === selected?.id
    && directoryTaxonomySync.state === "saving";
  const selectedBasicInfoMeta = selected && directoryTaxonomySync.placeId === (selectedDirectoryPlace?.id ?? selected.id)
    ? directoryTaxonomySync.state === "saving"
      ? "DB 저장 중…"
      : directoryTaxonomySync.state === "saved"
        ? "DB 저장됨"
        : directoryTaxonomySync.state === "error"
          ? "DB 저장 실패"
          : selectedDirectoryPlace ? "DB 연결" : "DB 미연결"
    : selectedDirectoryPlace
      ? placeDirectoryCanEdit ? "DB 연결" : "DB 읽기 전용"
      : selected?.placeRequestId ? "승인 대기" : "DB 미연결";
  const selectedStoryKey = selectedDirectoryPlace
    ? `directory:${selectedDirectoryPlace.id}`
    : selected
      ? placeContentKey(selected)
      : null;
  const selectedUsesMapDisplayName = Boolean(selected && selectedDirectoryPlace && (
    selectedDirectoryPlace.id === selected.directoryId
    || (!selected.directoryId && normalizePlaceName(selectedDirectoryPlace.name) === normalizePlaceName(selected.name))
  ));
  const selectedDisplayName = selectedDirectoryPlace && !selectedUsesMapDisplayName
    ? publicDisplayName(selectedDirectoryPlace.name, selectedDirectoryPlace.featuredRole)
    : selected?.name ?? "";
  const selectedLocationGroupId = selectedDirectoryPlace?.locationGroupId ?? null;
  const selectedLocationGroupPlaces = selectedLocationGroupId
    ? directoryPlacesByGroup.get(selectedLocationGroupId) ?? []
    : [];
  const selectedPublicCategory = selected
    ? selectedDirectoryPlace ? publicCategoryMetaForPlace(selectedDirectoryPlace, selected) : categoryOf(selected.category)
    : null;
  const selectedPublicCategoryName = selectedDirectoryPlace?.featuredRole === MAIN_HUB_ROLE
    ? "워크케이션 메인 거점"
    : selectedPublicCategory?.name ?? "";

  const effectiveCalibrationPoints = useMemo(
    () => buildEffectiveCalibrationPoints(calibrationPoints, landmarkDefaultPositions, elements, directoryPlaces),
    [calibrationPoints, directoryPlaces, elements, landmarkDefaultPositions],
  );
  const secondaryCalibrationPoints = useMemo(
    () => effectiveCalibrationPoints.filter((point) => point.tier === "secondary"),
    [effectiveCalibrationPoints],
  );
  const tertiaryCalibrationPoints = useMemo(
    () => effectiveCalibrationPoints.filter((point) => point.tier === "tertiary"),
    [effectiveCalibrationPoints],
  );
  const calibrationReferenceNames = useMemo(
    () => new Set(effectiveCalibrationPoints.map((point) => point.name)),
    [effectiveCalibrationPoints],
  );
  const selectedPrimaryCalibrationPoint = selected
    ? calibrationPoints.find((point) => point.name === normalizePlaceName(selected.name)) ?? null
    : null;
  const selectedSecondaryCalibrationPoint = selected
    ? secondaryCalibrationPoints.find((point) => point.name === normalizePlaceName(selected.name)) ?? null
    : null;
  const selectedTertiaryCalibrationPoint = selected
    ? tertiaryCalibrationPoints.find((point) => point.name === normalizePlaceName(selected.name)) ?? null
    : null;
  const selectedCalibrationPoint = selectedPrimaryCalibrationPoint
    ?? selectedSecondaryCalibrationPoint
    ?? selectedTertiaryCalibrationPoint;
  const selectedLandmarkDefault = selected?.category === "landmark"
    ? landmarkDefaultPositions.find((position) => (
      position.elementId === selected.id || position.name === normalizePlaceName(selected.name)
    )) ?? {
      elementId: selected.id,
      name: normalizePlaceName(selected.name),
      x: selected.anchorX,
      y: selected.anchorY,
      confirmed: false,
    }
    : null;
  const selectedDisplayOffset = selected ? { x: selected.x - selected.anchorX, y: selected.y - selected.anchorY } : null;
  const selectedIsPrimaryCalibration = selected ? PRIMARY_CALIBRATION_NAMES.has(normalizePlaceName(selected.name)) : false;
  const selectedHasGeocodedSource = selected ? Boolean(geocodedPlaces[normalizePlaceName(selected.name)]) : false;

  const compatibleAssets = selected ? assets.filter((asset) => (
    asset.placeName ? asset.placeName === selected.name : asset.category === selected.category
  )) : assets;
  const landmarkAssetGroups = useMemo(() => {
    const groups = new Map<string, MapAsset[]>();
    assets.filter((asset) => asset.category === "landmark" && asset.placeName).forEach((asset) => {
      const group = groups.get(asset.placeName!) ?? [];
      group.push(asset);
      groups.set(asset.placeName!, group);
    });
    return [...groups.entries()].map(([placeName, candidates]) => ({ placeName, candidates }));
  }, [assets]);
  const generalMarkerAssets = useMemo(() => assets.filter((asset) => asset.category !== "landmark"), [assets]);
  const customLandmarkAssets = useMemo(() => assets.filter((asset) => asset.category === "landmark" && !asset.placeName), [assets]);
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const publishedPlaceStories = useMemo(() => placeStories.filter((story) => story.status === "published"), [placeStories]);

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
    elementsByNormalizedName,
    requestMarkerByRequestId,
    directoryPlacesById,
    directoryPlacesByNormalizedName,
    directoryPlacesByGroup,
    selected,
    selectedNote,
    selectedDirectoryPlace,
    selectedUnlinkedPrimaryCategory,
    selectedUnlinkedTaxonomySaving,
    selectedBasicInfoMeta,
    selectedStoryKey,
    selectedDisplayName,
    selectedLocationGroupPlaces,
    selectedPublicCategory,
    selectedPublicCategoryName,
    secondaryCalibrationPoints,
    tertiaryCalibrationPoints,
    calibrationReferenceNames,
    selectedPrimaryCalibrationPoint,
    selectedSecondaryCalibrationPoint,
    selectedTertiaryCalibrationPoint,
    selectedCalibrationPoint,
    selectedLandmarkDefault,
    selectedDisplayOffset,
    selectedIsPrimaryCalibration,
    selectedHasGeocodedSource,
    compatibleAssets,
    landmarkAssetGroups,
    generalMarkerAssets,
    customLandmarkAssets,
    assetsById,
    publishedPlaceStories,
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
  };
}
