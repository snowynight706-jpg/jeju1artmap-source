import { categoryForPlace, isCoreLandmarkName, normalizePlaceName } from "../../core-landmarks";
import { geocodedPlaces } from "../../geocoded-places";
import { bundledLandmarkAssets } from "../../landmark-assets";
import { bundledMarkerAssets, recommendedMarkerStyle } from "../../marker-assets";
import { calibratedPlaceCoordinates, initialCalibrationPoints, type CalibrationPoint } from "../../map/calibration/model";
import { isPrimaryHubLabel, type CategoryId } from "../../map/core/model";
import { elementDefaults } from "../../map/core/element-defaults";
import {
  DENSE_LABEL_MAX_ITEMS,
  DENSE_LABEL_MIN_ITEMS,
} from "../../map/labels/settings-contract.mjs";
import type {
  DirectoryPlace,
  DocumentState,
  LandmarkDefaultPosition,
  MapAsset,
  MapElement,
  PlacementOverride,
} from "../../map/core/types";
import {
  createDirectoryMarkerPolicy,
  defaultMarkerAssetId,
  directoryCategory,
  withDirectoryMetadata,
} from "../../place-directory/model";
import {
  LPP_CANONICAL_NAME,
  MAIN_HUB_CANONICAL_NAME,
  MAIN_HUB_ROLE,
  sanitizeAdditionalCategories,
  sanitizeConvenienceAttributes,
} from "../../place-taxonomy";
import {
  ensureIndependentElementIdentity,
  sanitizePlacementOverrides,
  uniqueRuntimeId,
} from "./rules";
import {
  isMainHubPersistenceTarget,
  stableMainHubResourceSize,
} from "./main-hub-persistence.mjs";

export type LandmarkLocation = {
  readonly name: string;
  readonly address: string;
  readonly addressSourceUrl: string;
  readonly assetId: string;
  readonly x: number;
  readonly y: number;
};

type MapDocumentModelOptions = {
  landmarkLocations: readonly LandmarkLocation[];
  defaultDirectoryPlaces: DirectoryPlace[];
  supportDirectoryPlaces: DirectoryPlace[];
  ensureSystemDirectoryPlaces: (places: DirectoryPlace[]) => DirectoryPlace[];
  deletedPlaceNames: ReadonlySet<string>;
  mainHubLandmarkAssetId: string;
  landmarkResourceSize: number;
  landmarkLabelGap: number;
  legacyMainHubMemo: string;
  standardMainHubMemo: string;
  latestRedesignedLandmarkAssets: ReadonlyMap<string, string>;
  supersededRedesignedLandmarkAssets: ReadonlyMap<string, ReadonlySet<string>>;
};

export function createMapDocumentModel({
  landmarkLocations,
  defaultDirectoryPlaces,
  supportDirectoryPlaces,
  ensureSystemDirectoryPlaces,
  deletedPlaceNames,
  mainHubLandmarkAssetId,
  landmarkResourceSize,
  landmarkLabelGap,
  legacyMainHubMemo,
  standardMainHubMemo,
  latestRedesignedLandmarkAssets,
  supersededRedesignedLandmarkAssets,
}: MapDocumentModelOptions) {
  const directoryByName = new Map(defaultDirectoryPlaces.map((place) => [normalizePlaceName(place.name), place]));
  const addressByPlace = new Map(landmarkLocations.map((location) => [location.name, location]));
  const landmarkLocationByName = new Map(landmarkLocations.map((location) => [normalizePlaceName(location.name), location]));

  const builtInLandmarkAssets: MapAsset[] = bundledLandmarkAssets.map((asset) => {
    const location = addressByPlace.get(asset.placeName);
    return {
      ...asset,
      category: "landmark",
      fileType: "image",
      address: location?.address ?? "",
      addressSourceUrl: location?.addressSourceUrl ?? "",
      sourceLabel: asset.id === mainHubLandmarkAssetId
        ? `Google Drive A-02 외곽선보강 최종검수안 · 투명 배경 정리 · 1024px WebP 최적화 · ${asset.fileName}`
        : asset.sourceUrl
          ? `Google Drive 원본 · 1024px WebP 최적화 · ${asset.fileName}`
          : `사이트 내장 최신 승인 자산 · 투명 배경 · 1024px WebP 최적화 · ${asset.fileName}`,
      builtIn: true,
    };
  });

  const builtInMarkerAssets: MapAsset[] = bundledMarkerAssets.map((asset) => ({
    ...asset,
    fileType: "svg",
    sourceLabel: asset.status === "approved"
      ? `Google Drive 사용중 자산 · 범용마커 리뉴얼 최종 · ${asset.fileName}`
      : `Google Drive · 범용마커 시안 · ${asset.fileName}`,
    builtIn: true,
  }));

  const builtInAssets: MapAsset[] = [...builtInLandmarkAssets, ...builtInMarkerAssets];
  const builtInAssetIds = new Set(builtInAssets.map((asset) => asset.id));
  const canonicalMarkerAssetIds = new Set(builtInMarkerAssets.map((asset) => asset.id));
  const assetIdAfterDirectoryCategoryChange = createDirectoryMarkerPolicy(
    canonicalMarkerAssetIds,
    new Map([...landmarkLocationByName].map(([name, location]) => [name, location.assetId])),
  );

  function ensureMainHubMapElement(elements: MapElement[], places: DirectoryPlace[]) {
    const hubPlace = places.find((place) => isPrimaryHubLabel(place.name)) ?? withDirectoryMetadata({
      id: "place-sotong-center",
      name: MAIN_HUB_CANONICAL_NAME,
      category: "culture",
      area: "관덕로·목관아",
      address: "제주특별자치도 제주시 관덕로 44",
      x: 45,
      y: 59,
      coordinateStatus: "review",
      sourceLabel: "시스템 메인 거점 폴백 · DB 좌표 우선",
      featuredRole: MAIN_HUB_ROLE,
    });
    const existingHub = elements.find((element) => isPrimaryHubLabel(element.name) || isMainHubPersistenceTarget(element));
    if (existingHub) {
      const migrateLegacyPresentation = existingHub.memo === legacyMainHubMemo;
      let inserted = false;
      return elements.flatMap((element) => {
        if (!isPrimaryHubLabel(element.name) && !isMainHubPersistenceTarget(element)) return [element];
        if (inserted) return [];
        inserted = true;
        return [{
          ...element,
          directoryId: hubPlace.id,
          name: MAIN_HUB_CANONICAL_NAME,
          category: "landmark" as const,
          size: stableMainHubResourceSize(element.size),
          labelVisible: true,
          labelLocked: migrateLegacyPresentation ? false : element.labelLocked,
          labelPosition: migrateLegacyPresentation ? "bottom" as const : element.labelPosition,
          labelGap: migrateLegacyPresentation ? landmarkLabelGap : element.labelGap,
          labelOffsetX: migrateLegacyPresentation ? 0 : element.labelOffsetX,
          labelOffsetY: migrateLegacyPresentation ? 0 : element.labelOffsetY,
          assetId: mainHubLandmarkAssetId,
          status: "approved" as const,
          mapVisible: true,
          address: hubPlace.address,
          addressSourceUrl: hubPlace.sourceUrl ?? "https://www.jejusotong.kr/",
          memo: standardMainHubMemo,
        }];
      });
    }
    const requestedId = "system-main-hub-sotong";
    const id = elements.some((element) => element.id === requestedId)
      ? uniqueRuntimeId("element", elements.map((element) => element.id))
      : requestedId;
    return [...elements, {
      ...elementDefaults,
      id,
      directoryId: hubPlace.id,
      name: normalizePlaceName(hubPlace.name),
      category: "landmark" as const,
      x: hubPlace.x,
      y: hubPlace.y,
      anchorX: hubPlace.x,
      anchorY: hubPlace.y,
      size: landmarkResourceSize,
      z: Math.max(0, ...elements.map((element) => element.z)) + 1,
      labelVisible: true,
      labelLocked: false,
      labelPosition: "bottom" as const,
      labelGap: landmarkLabelGap,
      labelOffsetX: 0,
      labelOffsetY: 0,
      assetId: mainHubLandmarkAssetId,
      status: "approved" as const,
      mapVisible: true,
      address: hubPlace.address,
      addressSourceUrl: hubPlace.sourceUrl ?? "",
      memo: standardMainHubMemo,
    }];
  }

  const initialLandmarkElements: MapElement[] = landmarkLocations.map((location, index) => {
    const directoryPlace = directoryByName.get(normalizePlaceName(location.name));
    const geocoded = geocodedPlaces[location.name];
    const calibrated = calibratedPlaceCoordinates(location.name, geocoded?.latitude, geocoded?.longitude, initialCalibrationPoints);
    const x = calibrated?.x ?? location.x;
    const y = calibrated?.y ?? location.y;
    return {
      ...elementDefaults,
      id: `default-landmark-${index + 1}`,
      name: location.name,
      category: "landmark",
      x,
      y,
      anchorX: x,
      anchorY: y,
      size: landmarkResourceSize,
      z: index + 1,
      labelVisible: true,
      assetId: location.assetId,
      status: "unchecked",
      address: location.address,
      addressSourceUrl: location.addressSourceUrl,
      memo: geocoded ? "주소·장소명 검색 결과를 6개 기준점 보정망으로 v15 지도에 반영한 기본 위치. 필요하면 화면상 위치를 직접 보정하세요." : "주소 검색 미확정 · 직접 위치 검수 필요",
      directoryId: directoryPlace?.id,
    };
  });

  const starterPlaceNames = new Set([
    LPP_CANONICAL_NAME,
    "갤러리 레미콘 산지천", "고요산책", "나이롱책방", "비아아트·대동호텔 아트센터",
    "사진예술공간 큰바다영", "스튜디오126", "아트스페이스 빈공간", "종이잡지클럽 제주",
    "THE BARN BERLIN JEJU", "내음커피바", "리듬앤브루스", "마음에온[溫]", "마일스 탑동점",
    "먼슬리 제주", "무화과한입", "아일랜드팩토리 풍류", "어반브루잉", "카페단단",
    "D&DEPARTMENT JEJU 식음공간", "산지키친", "연호제 구내식당", "웰컴버거",
    "자양식당", "적점", "진아떡집", "첨목",
    ...supportDirectoryPlaces.map((place) => place.name),
  ]);

  const starterOffsets = [
    { x: -5.4, y: -4.2 }, { x: 4.8, y: -4.5 }, { x: -7.2, y: 0.5 }, { x: 7.1, y: 0.6 },
    { x: -4.8, y: 4.8 }, { x: 4.9, y: 4.7 }, { x: 0, y: -7.1 }, { x: 0.2, y: 7.2 },
    { x: -9.2, y: -3.1 }, { x: 9.1, y: -2.8 }, { x: -8.8, y: 4.2 }, { x: 8.8, y: 4.1 },
  ] as const;

  function buildStarterMarkers(places: DirectoryPlace[]): MapElement[] {
    const areaCounts = new Map<string, number>();
    return places.filter((place) => starterPlaceNames.has(place.name) && !landmarkLocations.some((item) => item.name === place.name)).map((place, index) => {
      const occurrence = areaCounts.get(place.area) ?? 0;
      areaCounts.set(place.area, occurrence + 1);
      const offset = starterOffsets[occurrence % starterOffsets.length];
      const x = place.coordinateStatus === "geocoded" ? place.x : clamp(place.x + offset.x, 3, 97);
      const y = place.coordinateStatus === "geocoded" ? place.y : clamp(place.y + offset.y, 3, 97);
      const assetId = defaultMarkerAssetId(place.category, recommendedMarkerStyle, `${place.name} ${place.subtype ?? ""}`);
      return {
        ...elementDefaults,
        id: `starter-marker-${index + 1}`,
        directoryId: place.id,
        name: place.name,
        category: place.category,
        x,
        y,
        anchorX: place.x,
        anchorY: place.y,
        size: place.category === "culture" ? 2.5 : 1.65,
        z: landmarkLocations.length + index + 1,
        labelVisible: place.category === "culture" || place.category === "parking",
        labelGap: 4,
        assetId,
        status: "unchecked",
        address: place.address,
        addressSourceUrl: place.sourceUrl ?? "",
        memo: `${place.sourceLabel} · 초기 구성용 시각 배치. 실제 위치 앵커와 화면상 위치를 검수해 주세요.`,
      };
    });
  }

  function ensureLppMapElement(
    elements: MapElement[],
    places: DirectoryPlace[],
    placementOverrides: PlacementOverride[] | undefined,
    calibrationPoints: CalibrationPoint[] | undefined,
  ) {
    if (elements.some((element) => normalizePlaceName(element.name) === LPP_CANONICAL_NAME)) return elements;
    const lppPlace = places.find((place) => normalizePlaceName(place.name) === LPP_CANONICAL_NAME);
    if (!lppPlace) return elements;
    const placementKey = `directory:${lppPlace.id}`;
    if (sanitizePlacementOverrides(placementOverrides).some((override) => override.key === placementKey)) return elements;
    const mapped = calibratedPlaceCoordinates(
      lppPlace.name,
      lppPlace.latitude,
      lppPlace.longitude,
      calibrationPoints?.length ? calibrationPoints : initialCalibrationPoints,
    );
    const marker = buildStarterMarkers([{ ...lppPlace, ...(mapped ?? {}) }])[0];
    if (!marker) return elements;
    return [...elements, {
      ...marker,
      id: elements.some((element) => element.id === "system-lpp-local-player-platform")
        ? uniqueRuntimeId("element", elements.map((element) => element.id))
        : "system-lpp-local-player-platform",
      z: Math.max(0, ...elements.map((element) => element.z)) + 1,
      status: "approved" as const,
      memo: "LPP 공식 주소·카카오맵 좌표 확인 · 2차 공개 탐색 패치",
    }];
  }

  const initialElements: MapElement[] = ensureMainHubMapElement(
    [...initialLandmarkElements, ...buildStarterMarkers(defaultDirectoryPlaces)],
    defaultDirectoryPlaces,
  );

  const factoryLandmarkDefaultPositions: LandmarkDefaultPosition[] = initialLandmarkElements.map((element) => ({
    elementId: element.id,
    name: normalizePlaceName(element.name),
    x: element.x,
    y: element.y,
    confirmed: false,
  }));

  function sanitizeDocument(document: DocumentState): DocumentState {
    const storedAssetStatuses = new Map(document.assets.map((asset) => [asset.id, asset.status]));
    const sanitizedElements = document.elements
      .filter((element) => !deletedPlaceNames.has(element.name.trim()))
      .map((element) => {
        const normalized = {
          ...elementDefaults,
          ...element,
          locked: Boolean(element.locked),
          status: element.locked ? "approved" as const : "unchecked" as const,
          labelLocked: Boolean(element.labelLocked),
          mapVisible: element.mapVisible !== false,
        };
        const name = normalizePlaceName(normalized.name);
        const category = isPrimaryHubLabel(name) ? "landmark" : categoryForPlace(name, normalized.category) as CategoryId;
        const landmarkAssetId = landmarkLocationByName.get(name)?.assetId;
        const redesignedAssetId = latestRedesignedLandmarkAssets.get(name);
        const supersededAssetIds = supersededRedesignedLandmarkAssets.get(name);
        const preferredAssetId = category === "landmark" && redesignedAssetId
          && (!normalized.assetId || supersededAssetIds?.has(normalized.assetId))
          ? redesignedAssetId
          : normalized.assetId;
        const assetId = category === "landmark" && (!preferredAssetId || canonicalMarkerAssetIds.has(preferredAssetId))
          ? landmarkAssetId ?? normalized.assetId
          : preferredAssetId;
        const canonical = { ...normalized, name, category, assetId };
        const defaultAssetId = defaultMarkerAssetId(category, recommendedMarkerStyle, name);
        const needsCanonicalMarker = category !== "landmark"
          && (!canonical.assetId || !canonicalMarkerAssetIds.has(canonical.assetId));
        return needsCanonicalMarker && defaultAssetId
          ? { ...canonical, assetId: defaultAssetId }
          : canonical;
      });
    const sanitizedDirectoryPlaces = document.directoryPlaces
      ? ensureSystemDirectoryPlaces(document.directoryPlaces
        .filter((place) => !deletedPlaceNames.has(place.name.trim()))
        .map((place) => {
          const name = normalizePlaceName(place.name);
          return {
            ...place,
            name,
            category: directoryCategory(place.category),
            ...(Object.prototype.hasOwnProperty.call(place, "additionalCategories")
              ? { additionalCategories: sanitizeAdditionalCategories(place.additionalCategories) }
              : {}),
            ...(Object.prototype.hasOwnProperty.call(place, "convenienceAttributes")
              ? { convenienceAttributes: sanitizeConvenienceAttributes(place.convenienceAttributes) }
              : {}),
            ...(isCoreLandmarkName(name) ? { coordinateStatus: "landmark" as const } : {}),
          };
        }))
      : undefined;
    const ensuredMainHubElements = ensureMainHubMapElement(sanitizedElements, sanitizedDirectoryPlaces ?? defaultDirectoryPlaces);
    const ensuredElements = ensureLppMapElement(
      ensuredMainHubElements,
      sanitizedDirectoryPlaces ?? defaultDirectoryPlaces,
      document.placementOverrides,
      document.calibrationPoints,
    );
    return {
      ...document,
      elements: ensureIndependentElementIdentity(ensuredElements),
      assets: [
        ...builtInAssets.map((asset) => ({ ...asset, status: storedAssetStatuses.get(asset.id) ?? asset.status })),
        ...document.assets.filter((asset) => !builtInAssetIds.has(asset.id)
          && (asset.category === "landmark" || canonicalMarkerAssetIds.has(asset.id) || asset.builtIn === false)),
      ],
      directoryPlaces: sanitizedDirectoryPlaces,
      denseLabelPositions: [...new Map((document.denseLabelPositions ?? [])
        .filter((position) => position
          && typeof position.key === "string"
          && position.key.length > 0
          && Array.isArray(position.elementIds)
          && position.elementIds.length >= DENSE_LABEL_MIN_ITEMS
          && position.elementIds.length <= DENSE_LABEL_MAX_ITEMS)
        .map((position) => [position.key, {
          key: position.key,
          elementIds: [...new Set(position.elementIds.filter((id) => typeof id === "string" && id.length > 0))].sort(),
          x: clamp(position.x, 0, 100),
          y: clamp(position.y, 0, 100),
        }])).values()].filter((position) => position.elementIds.length >= DENSE_LABEL_MIN_ITEMS),
      denseLabelExcludedIds: [...new Set((document.denseLabelExcludedIds ?? []).filter((id) => typeof id === "string" && id.length > 0))],
      placementOverrides: sanitizePlacementOverrides(document.placementOverrides),
    };
  }

  return {
    assetIdAfterDirectoryCategoryChange,
    buildStarterMarkers,
    builtInAssets,
    canonicalMarkerAssetIds,
    ensureMainHubMapElement,
    factoryLandmarkDefaultPositions,
    initialElements,
    landmarkLocationByName,
    sanitizeDocument,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
