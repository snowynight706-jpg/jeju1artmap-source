import type { Dispatch, SetStateAction } from "react";
import { isCoreLandmarkName, normalizePlaceName } from "../../core-landmarks";
import { markerAssetStatus, recommendedMarkerStyle } from "../../marker-assets";
import {
  buildEffectiveCalibrationPoints,
  canonicalAnchorForElement,
  coordinatesToMap,
  type CalibrationPoint,
} from "../../map/calibration/model";
import { type CategoryId } from "../../map/core/model";
import { elementDefaults } from "../../map/core/element-defaults";
import type {
  DirectoryPlace,
  LandmarkDefaultPosition,
  MapElement,
  PlacementState,
  ViewMode,
} from "../../map/core/types";
import { isSameMapPlace, uniqueRuntimeId } from "../document/rules";
import { isMainHubPersistenceTarget } from "../document/main-hub-persistence.mjs";
import type { LandmarkLocation } from "../document/bootstrap";
import {
  additionalCategoryDefinitions,
  convenienceAttributeDefinitions,
  isPrimaryPublicCategory,
  publicDisplayName,
  sanitizeAdditionalCategories,
  sanitizeConvenienceAttributes,
  type AdditionalCategoryId,
  type ConvenienceAttributeId,
} from "../../place-taxonomy";
import {
  databaseEditorCategoryForPlace,
  defaultMarkerAssetId,
  directoryCategory,
  directoryRecordFromPlace,
  mapCategoryForDirectoryPlace,
  withDirectoryMetadata,
} from "../../place-directory/model";
import type { DatabaseEditorCategoryFilter } from "../../admin-database-editor";
import type { PlaceDirectoryRecord } from "../../content/types";

type MutableRef<T> = { current: T };
type StateSetter<T> = Dispatch<SetStateAction<T>>;
type CollectionUpdater<T> = (updater: (current: T[]) => T[]) => void;
type LeftPanelMode = "assets" | "places" | "calibration" | "print";
type DirectoryStorage = "loading" | "persistent" | "bundled";
type DirectoryTaxonomySync = {
  placeId: string | null;
  state: "ready" | "saving" | "saved" | "error";
};
type GeocodeProgress = {
  active: boolean;
  done: number;
  total: number;
  found: number;
  failed: number;
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

type PlaceEditorActionOptions = {
  geocodeCacheKey: string;
  landmarkResourceSize: number;
  placeDirectoryApi: string;
  autoArrangeLabels: (record?: boolean, notify?: boolean) => void;
  buildStarterMarkers: (places: DirectoryPlace[]) => MapElement[];
  calibrationPoints: CalibrationPoint[];
  calibrationPointsRef: MutableRef<CalibrationPoint[]>;
  elementsRef: MutableRef<MapElement[]>;
  focusMapPosition: (
    x: number,
    y: number,
    elementId: string,
    options?: { publicNavigation?: boolean; showDetails?: boolean },
  ) => void;
  geocodeRunRef: MutableRef<number>;
  landmarkDefaultsRef: MutableRef<LandmarkDefaultPosition[]>;
  landmarkLocationByName: ReadonlyMap<string, LandmarkLocation>;
  leftPanelRef: MutableRef<HTMLElement | null>;
  markerGroupSize: number;
  placesRef: MutableRef<DirectoryPlace[]>;
  printPanelRef: MutableRef<HTMLElement | null>;
  pushHistory: () => void;
  replaceDirectoryPlaces: CollectionUpdater<DirectoryPlace>;
  replaceElements: CollectionUpdater<MapElement>;
  replaceLandmarkDefaults: CollectionUpdater<LandmarkDefaultPosition>;
  setActiveCategory: StateSetter<CategoryId | "all">;
  setCalibrationDirty: StateSetter<boolean>;
  setCalibrationMode: StateSetter<boolean>;
  setCalibrationPoints: StateSetter<CalibrationPoint[]>;
  setGeocodeProgress: StateSetter<GeocodeProgress>;
  setLeftOpen: StateSetter<boolean>;
  setLeftPanelMode: StateSetter<LeftPanelMode>;
  setMarkerLabelsVisible: StateSetter<boolean>;
  setPlacementOverride: (target: MapElement | DirectoryPlace, state: PlacementState | null) => void;
  setPrintFolderOpenRequest: StateSetter<number>;
  setRightOpen: StateSetter<boolean>;
  setSelectedId: StateSetter<string | null>;
  setSelectedNoteId: StateSetter<string | null>;
  setToast: StateSetter<string>;
  setViewMode: StateSetter<ViewMode>;
  updateElement: (id: string, patch: Partial<MapElement>, record?: boolean) => void;
  assetIdAfterDirectoryCategoryChange: (element: MapElement, category: CategoryId) => string | null;
  canonicalMarkerAssetIds: ReadonlySet<string>;
  databaseDraftPlaces: DirectoryPlace[];
  databaseEditorCategory: DatabaseEditorCategoryFilter;
  databaseEditorDirty: boolean;
  databaseEditorSaving: boolean;
  databaseEditorSelectedId: string | null;
  directoryTaxonomySaveQueueRef: MutableRef<Promise<void>>;
  directoryTaxonomySaveRunRef: MutableRef<number>;
  directoryTaxonomySync: DirectoryTaxonomySync;
  ensureMainHubMapElement: (elements: MapElement[], places: DirectoryPlace[]) => MapElement[];
  ensureSystemDirectoryPlaces: (places: DirectoryPlace[]) => DirectoryPlace[];
  mergeDirectoryRecords: (records: PlaceDirectoryRecord[], current: DirectoryPlace[]) => DirectoryPlace[];
  placeDirectoryCanEdit: boolean;
  placeDirectoryUpdatedAt: string | null;
  setDatabaseDraftPlaces: StateSetter<DirectoryPlace[]>;
  setDatabaseEditorCategory: StateSetter<DatabaseEditorCategoryFilter>;
  setDatabaseEditorDirty: StateSetter<boolean>;
  setDatabaseEditorOpen: StateSetter<boolean>;
  setDatabaseEditorQuery: StateSetter<string>;
  setDatabaseEditorSaving: StateSetter<boolean>;
  setDatabaseEditorSelectedId: StateSetter<string | null>;
  setDirectoryTaxonomySync: StateSetter<DirectoryTaxonomySync>;
  setPlaceDirectoryStorage: StateSetter<DirectoryStorage>;
  setPlaceDirectoryUpdatedAt: StateSetter<string | null>;
  setSelectedFacilityId: StateSetter<string | null>;
};

export function usePlaceEditorActions({
  geocodeCacheKey: GEOCODE_CACHE_KEY,
  landmarkResourceSize: LANDMARK_RESOURCE_SIZE,
  placeDirectoryApi: PLACE_DIRECTORY_API,
  autoArrangeLabels,
  buildStarterMarkers,
  calibrationPoints,
  calibrationPointsRef,
  elementsRef,
  focusMapPosition,
  geocodeRunRef,
  landmarkDefaultsRef,
  landmarkLocationByName,
  leftPanelRef,
  markerGroupSize,
  placesRef,
  printPanelRef,
  pushHistory,
  replaceDirectoryPlaces,
  replaceElements,
  replaceLandmarkDefaults,
  setActiveCategory,
  setCalibrationDirty,
  setCalibrationMode,
  setCalibrationPoints,
  setGeocodeProgress,
  setLeftOpen,
  setLeftPanelMode,
  setMarkerLabelsVisible,
  setPlacementOverride,
  setPrintFolderOpenRequest,
  setRightOpen,
  setSelectedId,
  setSelectedNoteId,
  setToast,
  setViewMode,
  updateElement,
  assetIdAfterDirectoryCategoryChange,
  canonicalMarkerAssetIds,
  databaseDraftPlaces,
  databaseEditorCategory,
  databaseEditorDirty,
  databaseEditorSaving,
  databaseEditorSelectedId,
  directoryTaxonomySaveQueueRef,
  directoryTaxonomySaveRunRef,
  directoryTaxonomySync,
  ensureMainHubMapElement,
  ensureSystemDirectoryPlaces,
  mergeDirectoryRecords,
  placeDirectoryCanEdit,
  placeDirectoryUpdatedAt,
  setDatabaseDraftPlaces,
  setDatabaseEditorCategory,
  setDatabaseEditorDirty,
  setDatabaseEditorOpen,
  setDatabaseEditorQuery,
  setDatabaseEditorSaving,
  setDatabaseEditorSelectedId,
  setDirectoryTaxonomySync,
  setPlaceDirectoryStorage,
  setPlaceDirectoryUpdatedAt,
  setSelectedFacilityId,
}: PlaceEditorActionOptions) {
  const updateLandmarkDefault = (element: MapElement, patch: Partial<Pick<LandmarkDefaultPosition, "x" | "y" | "confirmed">>) => {
    if (element.category !== "landmark") return;
    pushHistory();
    replaceLandmarkDefaults((current) => {
      const existing = current.find((position) => position.elementId === element.id || position.name === normalizePlaceName(element.name));
      const nextPosition: LandmarkDefaultPosition = {
        elementId: existing?.elementId ?? element.id,
        name: existing?.name ?? normalizePlaceName(element.name),
        x: clamp(patch.x ?? existing?.x ?? element.anchorX, 0, 100),
        y: clamp(patch.y ?? existing?.y ?? element.anchorY, 0, 100),
        confirmed: patch.confirmed ?? existing?.confirmed ?? false,
      };
      return existing
        ? current.map((position) => position === existing ? nextPosition : position)
        : [...current, nextPosition];
    });
    if (patch.confirmed !== undefined || patch.x !== undefined || patch.y !== undefined) setCalibrationDirty(true);
  };

  const saveLandmarkAsDefault = (element: MapElement) => {
    updateLandmarkDefault(element, { x: element.anchorX, y: element.anchorY });
    setToast(`${element.name}의 앵커를 기본 위치로 저장했습니다.`);
  };

  const saveAllLandmarksAsDefault = () => {
    const landmarkElements = elementsRef.current.filter((element) => element.category === "landmark");
    pushHistory();
    replaceLandmarkDefaults((current) => landmarkElements.map((element) => {
      const existing = current.find((position) => position.elementId === element.id || position.name === normalizePlaceName(element.name));
      return { elementId: existing?.elementId ?? element.id, name: existing?.name ?? normalizePlaceName(element.name), x: element.anchorX, y: element.anchorY, confirmed: existing?.confirmed ?? false };
    }));
    setCalibrationDirty(true);
    setToast(`랜드마크 ${landmarkElements.length}곳의 현재 앵커를 기본 위치로 저장했습니다.`);
  };

  const moveLandmarkToDefault = (element: MapElement) => {
    if (element.locked) {
      setToast(`${element.name}은(는) 좌표가 고정되어 있습니다.`);
      return;
    }
    const position = canonicalAnchorForElement(element, calibrationPointsRef.current, landmarkDefaultsRef.current);
    pushHistory();
    const nextPoints = calibrationPointsRef.current.map((point) => point.name === normalizePlaceName(element.name)
      ? { ...point, targetX: position.x, targetY: position.y }
      : point);
    calibrationPointsRef.current = nextPoints;
    setCalibrationPoints(nextPoints);
    if (nextPoints.some((point, index) => point.targetX !== calibrationPoints[index]?.targetX || point.targetY !== calibrationPoints[index]?.targetY)) setCalibrationDirty(true);
    replaceElements((current) => current.map((item) => item.id === element.id
      ? { ...item, x: position.x, y: position.y, anchorX: position.x, anchorY: position.y }
      : item));
    setToast(`${element.name}을(를) 일괄 이동과 동일한 기본 앵커로 이동했습니다.`);
  };

  const resetLandmarkPositions = () => {
    const defaultsById = new Map(landmarkDefaultsRef.current.map((position) => [position.elementId, position]));
    const defaultsByName = new Map(landmarkDefaultsRef.current.map((position) => [position.name, position]));
    pushHistory();
    const lockedNames = new Set(elementsRef.current.filter((element) => element.locked).map((element) => normalizePlaceName(element.name)));
    const nextPoints = calibrationPointsRef.current.map((point) => {
      if (lockedNames.has(point.name)) return point;
      const position = defaultsByName.get(point.name);
      return position ? { ...point, targetX: position.x, targetY: position.y } : point;
    });
    calibrationPointsRef.current = nextPoints;
    setCalibrationPoints(nextPoints);
    setCalibrationDirty(true);
    replaceElements((current) => current.map((element) => {
      if (element.category !== "landmark" || element.locked) return element;
      const position = defaultsById.get(element.id) ?? defaultsByName.get(normalizePlaceName(element.name));
      if (!position) return element;
      return { ...element, x: clamp(position.x + element.x - element.anchorX, 0, 100), y: clamp(position.y + element.y - element.anchorY, 0, 100), anchorX: position.x, anchorY: position.y };
    }));
    window.setTimeout(() => autoArrangeLabels(false, true), 0);
    setToast(`랜드마크 ${landmarkDefaultsRef.current.length}곳의 앵커를 저장된 기본 위치로 초기화했습니다.`);
  };

  // 이하는 주소로 지도 위치를 찾고 장소·라벨 배치를 편집하는 코드입니다.
  const runAddressLookup = async (places: DirectoryPlace[], movePlacedElements = false) => {
    const runId = ++geocodeRunRef.current;
    const targets = places.filter((place) => place.coordinateStatus !== "landmark" && place.address);
    setGeocodeProgress({ active: true, done: 0, total: targets.length, found: 0, failed: 0 });
    let cache: Record<string, { latitude: number; longitude: number } | null> = {};
    try { cache = JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) ?? "{}"); } catch { cache = {}; }
    let found = 0;
    let failed = 0;
    for (let index = 0; index < targets.length; index += 1) {
      if (geocodeRunRef.current !== runId) return;
      const place = targets[index];
      let result = Object.prototype.hasOwnProperty.call(cache, place.address) ? cache[place.address] : undefined;
      if (result === undefined) {
        try {
          const params = new URLSearchParams({ q: `${place.address}, 대한민국`, format: "jsonv2", limit: "1", countrycodes: "kr", "accept-language": "ko" });
          const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, { headers: { Accept: "application/json" } });
          if (!response.ok) throw new Error(`geocoder ${response.status}`);
          const data = await response.json() as Array<{ lat?: string; lon?: string }>;
          const latitude = Number(data[0]?.lat);
          const longitude = Number(data[0]?.lon);
          result = Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
          cache[place.address] = result;
          localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
        } catch {
          result = null;
        }
        if (index < targets.length - 1) await new Promise((resolve) => window.setTimeout(resolve, 1100));
      }
      const mapped = result ? coordinatesToMap(result.latitude, result.longitude, buildEffectiveCalibrationPoints(calibrationPointsRef.current, landmarkDefaultsRef.current, elementsRef.current, placesRef.current)) : null;
      if (mapped) {
        found += 1;
        replaceDirectoryPlaces((current) => current.map((item) => item.id === place.id ? {
          ...item, ...mapped, coordinateStatus: "geocoded", latitude: result!.latitude, longitude: result!.longitude,
        } : item));
        replaceElements((current) => current.map((element) => (
          (element.directoryId === place.id || element.name === place.name) && !element.locked
            ? {
              ...element,
              anchorX: mapped.x,
              anchorY: mapped.y,
              ...(movePlacedElements ? {
                x: clamp(mapped.x + element.x - element.anchorX, 0, 100),
                y: clamp(mapped.y + element.y - element.anchorY, 0, 100),
              } : {}),
            }
            : elemen
        )));
      } else {
        failed += 1;
        replaceDirectoryPlaces((current) => current.map((item) => item.id === place.id ? { ...item, coordinateStatus: "unresolved" } : item));
      }
      setGeocodeProgress({ active: true, done: index + 1, total: targets.length, found, failed });
    }
    setGeocodeProgress({ active: false, done: targets.length, total: targets.length, found, failed });
    setToast(`주소 위치 찾기 완료 · 지도 반영 ${found}곳, 미확정 ${failed}곳`);
  };

  const applyStarterComposition = () => {
    const existingNames = new Set(elementsRef.current.map((element) => normalizePlaceName(element.name)));
    const missing = buildStarterMarkers(placesRef.current).filter((element) => !existingNames.has(normalizePlaceName(element.name)));
    if (!missing.length) {
      setToast("핵심 구성요소가 이미 모두 배치되어 있습니다.");
      return;
    }
    pushHistory();
    const maxZ = Math.max(0, ...elementsRef.current.map((element) => element.z));
    const usedIds = new Set(elementsRef.current.map((element) => element.id));
    const restored = missing.map((element, index) => {
      const id = uniqueRuntimeId("element", usedIds);
      usedIds.add(id);
      return { ...element, id, z: maxZ + index + 1 };
    });
    replaceElements((current) => [...current, ...restored]);
    setActiveCategory("all");
    setViewMode("all");
    setToast(`초기 구성요소 ${restored.length}곳을 추가했습니다. 기존 배치 위치는 유지했습니다.`);
  };

  const alignPlacedMarkersByAddress = () => {
    const placedIds = new Set(elementsRef.current.map((element) => element.directoryId).filter(Boolean));
    const placedNames = new Set(elementsRef.current.map((element) => normalizePlaceName(element.name)));
    const targets = placesRef.current.filter((place) => placedIds.has(place.id) || placedNames.has(normalizePlaceName(place.name)));
    if (!targets.length) {
      setToast("주소로 정렬할 일반 장소가 없습니다.");
      return;
    }
    pushHistory();
    setToast(`배치된 일반 장소 ${targets.length}곳의 주소 위치를 찾기 시작합니다.`);
    void runAddressLookup(targets, true);
  };

  const switchLeftPanel = (mode: "assets" | "places" | "calibration" | "print") => {
    setLeftPanelMode(mode);
    setCalibrationMode(mode === "calibration");
    if (mode === "calibration") {
      setActiveCategory("all");
      setViewMode("anchors");
    }
    window.requestAnimationFrame(() => leftPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const openPrintSettings = () => {
    setLeftOpen(true);
    setLeftPanelMode("print");
    setCalibrationMode(false);
    setPrintFolderOpenRequest((current) => current + 1);
    window.requestAnimationFrame(() => printPanelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  const openDirectoryPlace = (place: DirectoryPlace) => {
    setActiveCategory("all");
    setViewMode("all");
    setRightOpen(true);
    setSelectedNoteId(null);
    const existing = elementsRef.current.find((item) => item.directoryId === place.id || item.name === place.name);
    if (existing) {
      setPlacementOverride(existing, null);
      if (!existing.mapVisible) updateElement(existing.id, { mapVisible: true });
      setSelectedId(existing.id);
      focusMapPosition(existing.x, existing.y, existing.id);
      setToast(`${place.name} 위치로 이동했습니다.`);
      return;
    }
    pushHistory();
    setPlacementOverride(place, null);
    const mapCategory = mapCategoryForDirectoryPlace(place);
    const preferredLandmarkAssetId = landmarkLocationByName.get(normalizePlaceName(place.name))?.assetId;
    const placeAssetId = mapCategory === "landmark"
      ? preferredLandmarkAssetId ?? null
      : defaultMarkerAssetId(mapCategory, recommendedMarkerStyle, `${place.name} ${place.subtype ?? ""}`);
    const next: MapElement = {
      ...elementDefaults,
      id: uniqueRuntimeId("element", elementsRef.current.map((item) => item.id)),
      directoryId: place.id,
      name: place.name,
      category: mapCategory,
      x: place.x,
      y: place.y,
      anchorX: place.x,
      anchorY: place.y,
      size: mapCategory === "landmark" ? LANDMARK_RESOURCE_SIZE : markerGroupSize,
      z: Math.max(0, ...elementsRef.current.map((item) => item.z)) + 1,
      labelVisible: true,
      assetId: placeAssetId,
      status: placeAssetId ? markerAssetStatus(recommendedMarkerStyle) : "unchecked",
      address: place.address,
      memo: `${place.sourceLabel} · ${place.coordinateStatus === "landmark" ? "기본 앵커" : place.coordinateStatus === "geocoded" ? "주소 자동탐색 앵커(검수 필요)" : "권역 기준 임시 좌표"}`,
      addressSourceUrl: place.sourceUrl ?? "",
    };
    replaceElements((current) => [...current, next]);
    setSelectedId(next.id);
    focusMapPosition(next.x, next.y, next.id);
    setToast(`${place.name} 마커를 추가하고 위치로 이동했습니다.`);
  };

  const toggleElementMapVisibility = (element: MapElement, visible: boolean) => {
    if (!visible && isMainHubPersistenceTarget(element)) {
      setPlacementOverride(element, null);
      updateElement(element.id, { mapVisible: true });
      setToast("제주소통협력센터는 주요 거점이므로 지도에서 미배치할 수 없습니다.");
      return;
    }
    setPlacementOverride(element, visible ? null : "unplaced");
    updateElement(element.id, { mapVisible: visible });
    setToast(`${element.name} 마커를 ${visible ? "배치" : "미배치"} 상태로 변경했습니다.`);
  };

  const setPlacedElementLabelVisibility = (element: MapElement, visible: boolean) => {
    updateElement(element.id, { labelVisible: visible });
    if (visible && element.category !== "landmark") setMarkerLabelsVisible(true);
    setToast(`${element.name} 라벨을 ${visible ? "표시" : "숨김"}으로 변경했습니다.`);
  };

  const setPlacedLabelsVisibility = (visible: boolean, scope: "all" | "landmark" | "marker" = "all") => {
    const targets = elementsRef.current.filter((element) => (
      element.mapVisible
      && (scope === "all" || (scope === "landmark" ? element.category === "landmark" : element.category !== "landmark"))
    ));
    if (!targets.length) {
      setToast("조건에 맞는 배치 마커가 없습니다.");
      return;
    }
    pushHistory();
    const targetIds = new Set(targets.map((element) => element.id));
    replaceElements((current) => current.map((element) => targetIds.has(element.id) ? { ...element, labelVisible: visible } : element));
    if (visible && scope !== "landmark") setMarkerLabelsVisible(true);
    const scopeLabel = scope === "landmark" ? "랜드마크" : scope === "marker" ? "일반 마커" : "전체 배치 마커";
    setToast(`${scopeLabel} ${targets.length}곳의 라벨을 ${visible ? "표시" : "숨김"}으로 변경했습니다.`);
  };

  const selectPlacedElement = (element: MapElement) => {
    setActiveCategory("all");
    setViewMode("all");
    setSelectedId(element.id);
    setSelectedNoteId(null);
    setRightOpen(true);
    focusMapPosition(element.x, element.y, element.id);
  };

  const setUnifiedPlacePlacement = (row: UnifiedPlaceRow, placed: boolean) => {
    if (row.element) {
      toggleElementMapVisibility(row.element, placed);
      if (placed) {
        setSelectedId(row.element.id);
        setSelectedNoteId(null);
        setRightOpen(true);
        focusMapPosition(row.element.x, row.element.y, row.element.id);
      }
      return;
    }
    if (placed && row.place) openDirectoryPlace(row.place);
  };

  const selectUnifiedPlace = (row: UnifiedPlaceRow) => {
    if (row.element) {
      if (!row.element.mapVisible) toggleElementMapVisibility(row.element, true);
      setSelectedId(row.element.id);
      setSelectedNoteId(null);
      setRightOpen(true);
      focusMapPosition(row.element.x, row.element.y, row.element.id);
      return;
    }
    if (row.place) openDirectoryPlace(row.place);
  };

  const applyDirectoryTaxonomyLocally = (
    placeId: string,
    category: CategoryId,
    additionalCategories: AdditionalCategoryId[],
  ) => {
    const currentPlace = placesRef.current.find((place) => place.id === placeId);
    if (!currentPlace) return null;
    const nextPlace = withDirectoryMetadata({
      ...currentPlace,
      category: directoryCategory(category),
      additionalCategories: sanitizeAdditionalCategories(additionalCategories),
    });
    replaceDirectoryPlaces((current) => current.map((place) => place.id === placeId ? nextPlace : place));
    setDatabaseDraftPlaces((current) => current.map((place) => place.id === placeId ? nextPlace : place));
    replaceElements((current) => current.map((element) => {
      const attached = element.directoryId === placeId
        || (!element.directoryId && normalizePlaceName(element.name) === normalizePlaceName(nextPlace.name));
      if (!attached) return element;
      const directoryMapCategory = mapCategoryForDirectoryPlace(nextPlace);
      const keepsCustomLandmarkResource = element.category === "landmark"
        && Boolean(element.assetId)
        && !canonicalMarkerAssetIds.has(element.assetId ?? "");
      const mapCategory = keepsCustomLandmarkResource ? "landmark" : directoryMapCategory;
      return {
        ...element,
        category: mapCategory,
        assetId: assetIdAfterDirectoryCategoryChange(element, mapCategory),
      };
    }));
    return nextPlace;
  };

  const applyDirectoryAddressLocally = (placeId: string, address: string) => {
    const currentPlace = placesRef.current.find((place) => place.id === placeId);
    if (!currentPlace) return null;
    const nextPlace: DirectoryPlace = {
      ...currentPlace,
      address,
      ...(currentPlace.coordinateStatus !== "landmark" && currentPlace.address.trim() !== address.trim() ? {
        coordinateStatus: "unresolved" as const,
        latitude: undefined,
        longitude: undefined,
      } : {}),
    };
    replaceDirectoryPlaces((current) => current.map((place) => place.id === placeId ? nextPlace : place));
    setDatabaseDraftPlaces((current) => current.map((place) => place.id === placeId ? nextPlace : place));
    replaceElements((current) => current.map((element) => {
      const attached = element.directoryId === placeId
        || (!element.directoryId && normalizePlaceName(element.name) === normalizePlaceName(currentPlace.name));
      return attached ? { ...element, address } : element;
    }));
    return nextPlace;
  };

  const saveSelectedDirectoryAddress = (place: DirectoryPlace, addressValue: string) => {
    if (!placeDirectoryCanEdit) {
      setToast("장소 주소 수정은 관리자 권한으로만 저장할 수 있습니다.");
      return;
    }
    const currentPlace = placesRef.current.find((item) => item.id === place.id) ?? place;
    const address = addressValue.trim();
    if (address === currentPlace.address.trim()) return;
    const previousAddress = currentPlace.address;
    if (!applyDirectoryAddressLocally(currentPlace.id, address)) return;

    const runId = ++directoryTaxonomySaveRunRef.current;
    setDirectoryTaxonomySync({ placeId: currentPlace.id, state: "saving" });
    const queuedSave = directoryTaxonomySaveQueueRef.curren
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch(PLACE_DIRECTORY_API, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: currentPlace.id, address }),
        });
        const payload = await response.json().catch(() => null) as {
          row?: PlaceDirectoryRecord;
          updatedAt?: string | null;
          error?: string;
        } | null;
        if (!response.ok || !payload?.row) throw new Error(payload?.error ?? "address save failed");
        return payload;
      });
    directoryTaxonomySaveQueueRef.current = queuedSave.then(() => undefined, () => undefined);
    void queuedSave.then((payload) => {
      if (runId !== directoryTaxonomySaveRunRef.current || !payload.row) return;
      applyDirectoryAddressLocally(payload.row.id, payload.row.address);
      setPlaceDirectoryUpdatedAt(payload.updatedAt ?? null);
      setPlaceDirectoryStorage("persistent");
      setDirectoryTaxonomySync({ placeId: currentPlace.id, state: "saved" });
      setToast(`${publicDisplayName(currentPlace.name, currentPlace.featuredRole)} 주소를 DB에 저장했습니다.`);
    }).catch(() => {
      if (runId !== directoryTaxonomySaveRunRef.current) return;
      applyDirectoryAddressLocally(currentPlace.id, previousAddress);
      setDirectoryTaxonomySync({ placeId: currentPlace.id, state: "error" });
      setToast("주소 저장에 실패했습니다. 관리자 로그인과 DB 연결 상태를 확인해 주세요.");
    });
  };

  const updateSelectedDirectoryTaxonomy = (
    place: DirectoryPlace,
    patch: { category?: CategoryId; additionalCategories?: AdditionalCategoryId[] },
  ) => {
    if (!placeDirectoryCanEdit) {
      setToast("장소 분류 수정은 관리자 권한으로만 저장할 수 있습니다.");
      return;
    }
    const currentPlace = placesRef.current.find((item) => item.id === place.id) ?? place;
    const category = directoryCategory(patch.category ?? currentPlace.category);
    if (!isPrimaryPublicCategory(category)) {
      setToast("기본분류는 문화공간·카페·음식점·소품샵 중 하나를 선택해 주세요.");
      return;
    }
    const additionalCategories = sanitizeAdditionalCategories(
      patch.additionalCategories ?? currentPlace.additionalCategories,
    );
    const nextPlace = applyDirectoryTaxonomyLocally(currentPlace.id, category, additionalCategories);
    if (!nextPlace) return;

    const runId = ++directoryTaxonomySaveRunRef.current;
    setDirectoryTaxonomySync({ placeId: currentPlace.id, state: "saving" });
    const queuedSave = directoryTaxonomySaveQueueRef.curren
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch(PLACE_DIRECTORY_API, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: nextPlace.id,
            category: nextPlace.category,
            additionalCategories: nextPlace.additionalCategories,
          }),
        });
        const payload = await response.json().catch(() => null) as {
          row?: PlaceDirectoryRecord;
          updatedAt?: string | null;
          error?: string;
        } | null;
        if (!response.ok || !payload?.row) throw new Error(payload?.error ?? "taxonomy save failed");
        return payload;
      });
    directoryTaxonomySaveQueueRef.current = queuedSave.then(() => undefined, () => undefined);
    void queuedSave.then((payload) => {
      if (runId !== directoryTaxonomySaveRunRef.current) return;
      const savedCategory = directoryCategory(payload.row!.category);
      applyDirectoryTaxonomyLocally(
        payload.row!.id,
        savedCategory,
        sanitizeAdditionalCategories(payload.row!.additionalCategories),
      );
      setPlaceDirectoryUpdatedAt(payload.updatedAt ?? null);
      setPlaceDirectoryStorage("persistent");
      setDirectoryTaxonomySync({ placeId: currentPlace.id, state: "saved" });
      setToast(`${publicDisplayName(currentPlace.name, currentPlace.featuredRole)} 분류를 DB에 저장했습니다.`);
    }).catch(() => {
      if (runId !== directoryTaxonomySaveRunRef.current) return;
      applyDirectoryTaxonomyLocally(
        currentPlace.id,
        directoryCategory(currentPlace.category),
        sanitizeAdditionalCategories(currentPlace.additionalCategories),
      );
      setDirectoryTaxonomySync({ placeId: currentPlace.id, state: "error" });
      setToast("분류 저장에 실패했습니다. 관리자 로그인과 DB 연결 상태를 확인해 주세요.");
    });
  };

  const toggleSelectedDirectoryAdditionalCategory = (place: DirectoryPlace, categoryId: AdditionalCategoryId) => {
    const selected = new Set(sanitizeAdditionalCategories(place.additionalCategories));
    if (selected.has(categoryId)) selected.delete(categoryId);
    else selected.add(categoryId);
    updateSelectedDirectoryTaxonomy(place, {
      additionalCategories: additionalCategoryDefinitions
        .map((definition) => definition.id)
        .filter((id) => selected.has(id)),
    });
  };

  const connectUnlinkedElementTaxonomy = (
    element: MapElement,
    patch: { category: CategoryId; additionalCategories?: AdditionalCategoryId[] },
  ) => {
    if (!placeDirectoryCanEdit) {
      setToast("장소 분류 수정은 관리자 권한으로만 저장할 수 있습니다.");
      return;
    }
    if (element.placeRequestId) {
      setToast("등록 요청 마커는 먼저 승인한 뒤 장소 분류를 수정해 주세요.");
      return;
    }
    const category = directoryCategory(patch.category);
    if (!isPrimaryPublicCategory(category)) {
      setToast("기본분류는 문화공간·카페·음식점·소품샵 중 하나를 선택해 주세요.");
      return;
    }
    const additionalCategories = sanitizeAdditionalCategories(patch.additionalCategories);
    if (directoryTaxonomySync.placeId === element.id && directoryTaxonomySync.state === "saving") return;

    const runId = ++directoryTaxonomySaveRunRef.current;
    setDirectoryTaxonomySync({ placeId: element.id, state: "saving" });
    const queuedSave = directoryTaxonomySaveQueueRef.curren
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch(PLACE_DIRECTORY_API, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: element.name,
            category,
            address: element.address,
            addressSourceUrl: element.addressSourceUrl,
            additionalCategories,
          }),
        });
        const payload = await response.json().catch(() => null) as {
          row?: PlaceDirectoryRecord;
          created?: boolean;
          updatedAt?: string | null;
          error?: string;
        } | null;
        if (!response.ok || !payload?.row) throw new Error(payload?.error ?? "directory connection failed");
        return payload;
      });
    directoryTaxonomySaveQueueRef.current = queuedSave.then(() => undefined, () => undefined);
    void queuedSave.then((payload) => {
      if (runId !== directoryTaxonomySaveRunRef.current || !payload.row) return;
      const record = payload.row;
      const createdPlace = withDirectoryMetadata({
        ...record,
        category: directoryCategory(record.category),
        x: element.anchorX,
        y: element.anchorY,
        coordinateStatus: element.address.trim() ? "review" : "unresolved",
        sourceLabel: "내부 DB · 지도 자산 연결",
      });
      const nextPlaces = ensureSystemDirectoryPlaces([
        ...placesRef.current.filter((place) => (
          place.id !== createdPlace.id
          && normalizePlaceName(place.name) !== normalizePlaceName(createdPlace.name)
        )),
        createdPlace,
      ]);
      replaceDirectoryPlaces(() => nextPlaces);
      setDatabaseDraftPlaces((current) => [
        ...current.filter((place) => (
          place.id !== createdPlace.id
          && normalizePlaceName(place.name) !== normalizePlaceName(createdPlace.name)
        )),
        createdPlace,
      ]);
      const directoryMapCategory = mapCategoryForDirectoryPlace(createdPlace);
      const keepsCustomLandmarkResource = element.category === "landmark"
        && Boolean(element.assetId)
        && !canonicalMarkerAssetIds.has(element.assetId ?? "");
      const mapCategory = keepsCustomLandmarkResource ? "landmark" : directoryMapCategory;
      const linkedElement: MapElement = {
        ...element,
        directoryId: createdPlace.id,
        name: createdPlace.name,
        category: mapCategory,
        assetId: assetIdAfterDirectoryCategoryChange(element, mapCategory),
        address: createdPlace.address || element.address,
        addressSourceUrl: createdPlace.sourceUrl || element.addressSourceUrl,
      };
      replaceElements((current) => ensureMainHubMapElement(
        curren
          .filter((item) => item.id === element.id || !isSameMapPlace(item, linkedElement))
          .map((item) => item.id === element.id ? linkedElement : item),
        nextPlaces,
      ));
      setSelectedFacilityId(null);
      setPlaceDirectoryUpdatedAt(payload.updatedAt ?? null);
      setPlaceDirectoryStorage("persistent");
      setDirectoryTaxonomySync({ placeId: createdPlace.id, state: "saved" });
      setToast(payload.created
        ? `${publicDisplayName(createdPlace.name, createdPlace.featuredRole)} DB 항목을 만들고 분류를 저장했습니다.`
        : `${publicDisplayName(createdPlace.name, createdPlace.featuredRole)} 기존 DB 항목에 연결했습니다.`);
    }).catch(() => {
      if (runId !== directoryTaxonomySaveRunRef.current) return;
      setDirectoryTaxonomySync({ placeId: element.id, state: "error" });
      setToast("DB 미연결 자산의 분류를 저장하지 못했습니다. 관리자 로그인과 DB 연결 상태를 확인해 주세요.");
    });
  };

  const toggleUnlinkedElementAdditionalCategory = (element: MapElement, categoryId: AdditionalCategoryId) => {
    const primaryCategory = directoryCategory(element.category);
    if (!isPrimaryPublicCategory(primaryCategory)) {
      setToast("추가분류를 선택하기 전에 기본분류를 먼저 지정해 주세요.");
      return;
    }
    connectUnlinkedElementTaxonomy(element, {
      category: primaryCategory,
      additionalCategories: [categoryId],
    });
  };

  // 이하는 관리자 장소 DB 편집기를 열고 내용을 저장하는 코드입니다.
  const openDatabaseEditor = () => {
    if (!placeDirectoryCanEdit) {
      setToast("내부 DB 수정은 소유자 로그인 후 사용할 수 있습니다.");
      return;
    }
    const draft = placesRef.current.map((place) => ({ ...place }));
    setDatabaseDraftPlaces(draft);
    setDatabaseEditorSelectedId(draft[0]?.id ?? null);
    setDatabaseEditorQuery("");
    setDatabaseEditorCategory("all");
    setDatabaseEditorDirty(false);
    setDatabaseEditorOpen(true);
  };

  const selectDatabaseEditorCategory = (category: DatabaseEditorCategoryFilter) => {
    setDatabaseEditorCategory(category);
    if (category === "all") return;
    const selected = databaseDraftPlaces.find((place) => place.id === databaseEditorSelectedId);
    if (selected && databaseEditorCategoryForPlace(selected) === category) return;
    const firstMatch = databaseDraftPlaces
      .filter((place) => databaseEditorCategoryForPlace(place) === category)
      .sort((a, b) => a.name.localeCompare(b.name, "ko"))[0];
    setDatabaseEditorSelectedId(firstMatch?.id ?? null);
  };

  const closeDatabaseEditor = () => {
    if (databaseEditorDirty && !window.confirm("저장하지 않은 DB 편집 내용을 닫을까요?")) return;
    setDatabaseEditorOpen(false);
    setDatabaseEditorDirty(false);
  };

  const updateDatabaseDraftPlace = (id: string, patch: Partial<DirectoryPlace>) => {
    setDatabaseDraftPlaces((current) => current.map((place) => {
      if (place.id !== id) return place;
      const next = { ...place, ...patch };
      const name = normalizePlaceName(next.name);
      return withDirectoryMetadata({
        ...next,
        name,
        category: directoryCategory(next.category),
        ...(isCoreLandmarkName(name) ? { coordinateStatus: "landmark" as const } : {}),
      });
    }));
    if (patch.category && databaseEditorCategory !== "all") {
      const nextCategory = directoryCategory(patch.category);
      setDatabaseEditorCategory(isPrimaryPublicCategory(nextCategory) ? nextCategory : "other");
    }
    setDatabaseEditorDirty(true);
  };

  const toggleDatabaseAdditionalCategory = (placeId: string, categoryId: AdditionalCategoryId) => {
    const place = databaseDraftPlaces.find((item) => item.id === placeId);
    if (!place) return;
    const selected = new Set(sanitizeAdditionalCategories(place.additionalCategories));
    if (selected.has(categoryId)) selected.delete(categoryId);
    else selected.add(categoryId);
    updateDatabaseDraftPlace(placeId, {
      additionalCategories: additionalCategoryDefinitions
        .map((item) => item.id)
        .filter((id) => selected.has(id)),
    });
  };

  const toggleDatabaseConvenienceAttribute = (placeId: string, attributeId: ConvenienceAttributeId) => {
    const place = databaseDraftPlaces.find((item) => item.id === placeId);
    if (!place) return;
    const selected = new Set(sanitizeConvenienceAttributes(place.convenienceAttributes));
    if (selected.has(attributeId)) selected.delete(attributeId);
    else selected.add(attributeId);
    updateDatabaseDraftPlace(placeId, {
      convenienceAttributes: convenienceAttributeDefinitions
        .map((item) => item.id)
        .filter((id) => selected.has(id)),
    });
  };

  const addDatabaseDraftPlace = () => {
    const id = uniqueRuntimeId("db-place", databaseDraftPlaces.map((place) => place.id));
    const next: DirectoryPlace = {
      id,
      name: "새 장소",
      category: "culture",
      area: "",
      address: "",
      x: 50,
      y: 50,
      coordinateStatus: "unresolved",
      sourceLabel: "내부 DB · 신규",
      subtype: "",
      priority: "",
      description: "",
      operatingInfo: "",
      notes: "",
      sourceUrl: "",
      mapUrl: "",
      checkedAt: "",
      additionalCategories: [],
      convenienceAttributes: [],
      locationGroupId: "",
      mapAnchorId: "",
      featuredRole: "",
      aliases: [],
    };
    setDatabaseDraftPlaces((current) => [next, ...current]);
    setDatabaseEditorSelectedId(id);
    setDatabaseEditorQuery("");
    setDatabaseEditorCategory("culture");
    setDatabaseEditorDirty(true);
  };

  const removeDatabaseDraftPlace = (place: DirectoryPlace) => {
    const attached = elementsRef.current.find((element) => element.directoryId === place.id || normalizePlaceName(element.name) === normalizePlaceName(place.name));
    if (attached) {
      setToast(`${place.name}은(는) 지도 요소가 남아 있습니다. 요소를 먼저 삭제한 뒤 DB에서 제거해 주세요.`);
      return;
    }
    setDatabaseDraftPlaces((current) => current.filter((item) => item.id !== place.id));
    setDatabaseEditorSelectedId((current) => current === place.id ? null : current);
    setDatabaseEditorDirty(true);
  };

  const applyPersistentDirectoryRows = (rows: PlaceDirectoryRecord[], updatedAt: string | null) => {
    const merged = mergeDirectoryRecords(rows, placesRef.current);
    const byId = new Map(merged.map((place) => [place.id, place]));
    const byName = new Map(merged.map((place) => [normalizePlaceName(place.name), place]));
    replaceDirectoryPlaces(() => merged);
    replaceElements((current) => current.map((element) => {
      const place = (element.directoryId ? byId.get(element.directoryId) : undefined)
        ?? byName.get(normalizePlaceName(element.name));
      if (!place) return element;
      const mapCategory = mapCategoryForDirectoryPlace(place);
      return {
        ...element,
        directoryId: place.id,
        name: place.name,
        category: mapCategory,
        address: place.address,
        addressSourceUrl: place.sourceUrl ?? "",
        assetId: assetIdAfterDirectoryCategoryChange(element, mapCategory),
      };
    }));
    setPlaceDirectoryUpdatedAt(updatedAt);
    setPlaceDirectoryStorage("persistent");
  };

  const saveDatabaseEditor = async () => {
    if (!placeDirectoryCanEdit || databaseEditorSaving) return;
    const records = databaseDraftPlaces.map(directoryRecordFromPlace);
    const normalizedNames = records.map((row) => normalizePlaceName(row.name).toLocaleLowerCase("ko-KR"));
    if (records.some((row) => !row.name || !row.category)) {
      setToast("장소명과 분류는 필수입니다.");
      return;
    }
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      setToast("같은 장소명이 두 번 등록되어 있습니다. 중복 항목을 정리해 주세요.");
      return;
    }
    if (records.length < placesRef.current.length && !window.confirm(`DB 항목 ${placesRef.current.length - records.length}개를 영구 삭제합니다. 계속할까요?`)) return;
    setDatabaseEditorSaving(true);
    try {
      const response = await fetch(PLACE_DIRECTORY_API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: records, baseUpdatedAt: placeDirectoryUpdatedAt ?? "" }),
      });
      const payload = await response.json().catch(() => null) as { rows?: PlaceDirectoryRecord[]; updatedAt?: string | null; error?: string } | null;
      if (response.status === 409) {
        setToast("다른 작업에서 DB가 먼저 변경되었습니다. 새로고침 후 다시 편집해 주세요.");
        return;
      }
      if (!response.ok || !Array.isArray(payload?.rows)) throw new Error(payload?.error ?? "save failed");
      applyPersistentDirectoryRows(payload.rows, payload.updatedAt ?? null);
      setDatabaseDraftPlaces(mergeDirectoryRecords(payload.rows, databaseDraftPlaces));
      setDatabaseEditorDirty(false);
      setToast(`내부 장소 DB ${payload.rows.length}곳을 영구 저장했습니다.`);
    } catch {
      setToast("내부 DB 저장에 실패했습니다. 소유자 로그인과 저장소 상태를 확인해 주세요.");
    } finally {
      setDatabaseEditorSaving(false);
    }
  };

  return {
    addDatabaseDraftPlace,
    alignPlacedMarkersByAddress,
    applyStarterComposition,
    closeDatabaseEditor,
    connectUnlinkedElementTaxonomy,
    moveLandmarkToDefault,
    openDatabaseEditor,
    openPrintSettings,
    removeDatabaseDraftPlace,
    resetLandmarkPositions,
    saveAllLandmarksAsDefault,
    saveDatabaseEditor,
    saveLandmarkAsDefault,
    saveSelectedDirectoryAddress,
    selectDatabaseEditorCategory,
    selectPlacedElement,
    selectUnifiedPlace,
    setPlacedElementLabelVisibility,
    setPlacedLabelsVisibility,
    setUnifiedPlacePlacement,
    switchLeftPanel,
    toggleDatabaseAdditionalCategory,
    toggleDatabaseConvenienceAttribute,
    toggleElementMapVisibility,
    toggleSelectedDirectoryAdditionalCategory,
    toggleUnlinkedElementAdditionalCategory,
    updateDatabaseDraftPlace,
    updateLandmarkDefault,
    updateSelectedDirectoryTaxonomy,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
