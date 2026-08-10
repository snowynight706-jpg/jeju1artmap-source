"use client";
/* eslint-disable @next/next/no-img-element */

import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { bundledLandmarkAssets } from "./landmark-assets";
import {
  bundledMarkerAssets,
  markerAssetId,
  recommendedMarkerStyle,
  type BundledMarkerCategory,
  type BundledMarkerStyle,
} from "./marker-assets";
import { masterDirectoryRows, type MasterDirectoryRow } from "./master-directory";
import { geocodedPlaces, projectGeographicCoordinates } from "./geocoded-places";
import { categoryForPlace, isCoreLandmarkName, normalizePlaceName } from "./core-landmarks";

const MAP_ASPECT = 8944 / 7324;
const MAP_SVG = "/maps/제주원도심_랜드마크탐색_베이스맵_v15_골목추가정리_검수본_마스터벡터.svg";
const MAP_PNG = "/maps/제주원도심_랜드마크탐색_베이스맵_v15_골목추가정리_검수본_초고해상도.png";
const UPLOADED_MAP_API = "/api/base-map";
const CALIBRATION_SETTINGS_API = "/api/calibration-settings";
const LOCKED_COORDINATE_SETTINGS_API = "/api/locked-coordinate-settings";
const PLACE_DIRECTORY_API = "/api/place-directory";
const PRINT_SETTINGS_API = "/api/print-settings";
const EXPORT_CANONICAL_WIDTH = 1180;
const AUTOSAVE_KEY = "jeju-wondosim-map-review:autosave:v3";
const LAYOUTS_KEY = "jeju-wondosim-map-review:layouts:v3";
const CALIBRATION_SETTINGS_KEY = "jeju-wondosim-map-review:calibration-settings:v1";
const LOCKED_COORDINATE_SETTINGS_KEY = "jeju-wondosim-map-review:locked-coordinate-settings:v1";
const GEOCODE_CACHE_KEY = "jeju-wondosim-map-review:geocode-cache:v1";
const VISIBILITY_GROUPS_KEY = "jeju-wondosim-map-review:visibility-groups:v1";
const CALIBRATION_GROUPS_KEY = "jeju-wondosim-map-review:calibration-groups:v1";
const MAP_VIEW_SETTINGS_KEY = "jeju-wondosim-map-review:map-view-settings:v1";
const DELETED_PLACE_NAMES = new Set(["산짓물공원", "산짓물 공원"]);

const categories = [
  { id: "landmark", name: "핵심 랜드마크", color: "#df745c", glyph: "景" },
  { id: "culture", name: "일반 문화시설", color: "#4d9a91", glyph: "文" },
  { id: "cafe", name: "카페", color: "#b7835b", glyph: "珈" },
  { id: "food", name: "음식점", color: "#d8974f", glyph: "食" },
  { id: "shop", name: "소품샵", color: "#9a6dae", glyph: "物" },
  { id: "parking", name: "주차장", color: "#667f8b", glyph: "P" },
  { id: "park", name: "공원·광장", color: "#69a56d", glyph: "休" },
  { id: "utility", name: "기타 편의시설", color: "#8f7ea7", glyph: "＋" },
] as const;

type CategoryId = (typeof categories)[number]["id"];
type AssetStatus = "approved" | "review" | "unchecked";
type LabelPosition = "top" | "bottom" | "left" | "right";
type ReviewStatus = "delete" | "weaken" | "keep" | "hierarchy";
type ViewMode = "all" | "landmarks" | "markers" | "labels" | "anchors" | "clearance" | "collisions" | "dim" | "gray" | "nomap";
type BaseMapMode = "svg" | "png" | "uploaded";
type CoordinateLockFilter = "all" | "unlocked" | "locked";
type CalibrationGroupId = "primary" | "secondary" | "tertiary";
type PrintMode = "auto" | "include" | "exclude";

type UploadedBaseMap = {
  available: boolean;
  canUpload?: boolean;
  name: string;
  width: number;
  height: number;
  uploadedAt: string;
  size: number;
  contentType: string;
};

type MapAsset = {
  id: string;
  name: string;
  category: CategoryId;
  status: AssetStatus;
  src: string;
  fileType: "png" | "svg" | "image";
  placeName?: string;
  address?: string;
  addressSourceUrl?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  builtIn?: boolean;
};

type MapElement = {
  id: string;
  name: string;
  category: CategoryId;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  size: number;
  z: number;
  labelVisible: boolean;
  labelLocked: boolean;
  labelPosition: LabelPosition;
  labelGap: number;
  labelOffsetX: number;
  labelOffsetY: number;
  opacity: number;
  connectorVisible: boolean;
  connectorColor: string;
  connectorWidth: number;
  assetId: string | null;
  status: AssetStatus;
  locked: boolean;
  mapVisible: boolean;
  memo: string;
  address: string;
  addressSourceUrl: string;
  directoryId?: string;
};

type DirectoryPlace = {
  id: string;
  name: string;
  category: CategoryId;
  area: string;
  address: string;
  x: number;
  y: number;
  coordinateStatus: "landmark" | "review" | "geocoded" | "unresolved";
  sourceLabel: string;
  sourceUrl?: string;
  subtype?: string;
  priority?: string;
  description?: string;
  operatingInfo?: string;
  notes?: string;
  mapUrl?: string;
  checkedAt?: string;
  latitude?: number;
  longitude?: number;
};

type PlaceDirectoryRecord = {
  id: string;
  name: string;
  category: CategoryId;
  area: string;
  address: string;
  subtype: string;
  priority: string;
  description: string;
  operatingInfo: string;
  notes: string;
  sourceUrl: string;
  mapUrl: string;
  checkedAt: string;
};

type UnifiedPlaceRow = {
  id: string;
  name: string;
  category: CategoryId;
  address: string;
  area: string;
  sourceLabel: string;
  place?: DirectoryPlace;
  element?: MapElement;
};

type ReviewNote = {
  id: string;
  x: number;
  y: number;
  status: ReviewStatus;
  text: string;
};

type CalibrationPoint = {
  id: string;
  name: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  tier?: "primary" | "secondary" | "tertiary";
};

type LandmarkDefaultPosition = {
  elementId: string;
  name: string;
  x: number;
  y: number;
  confirmed?: boolean;
};

type LockedCoordinateSetting = {
  key: string;
  directoryId?: string;
  name: string;
  category: CategoryId;
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
};

type PrintPlaceSetting = {
  key: string;
  directoryId?: string;
  name: string;
  recommended: boolean;
  markerMode: PrintMode;
  labelMode: PrintMode;
};

type DenseLabelPosition = {
  key: string;
  elementIds: string[];
  x: number;
  y: number;
};

type DenseLabelCluster = {
  id: string;
  elementIds: string[];
  names: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  manuallyPositioned: boolean;
  hasCollision: boolean;
};

type DocumentState = {
  elements: MapElement[];
  assets: MapAsset[];
  reviewNotes: ReviewNote[];
  directoryPlaces?: DirectoryPlace[];
  calibrationPoints?: CalibrationPoint[];
  landmarkDefaultPositions?: LandmarkDefaultPosition[];
  denseLabelPositions?: DenseLabelPosition[];
};

const elementDefaults: Omit<MapElement, "id" | "name" | "category" | "x" | "y" | "anchorX" | "anchorY" | "size" | "z"> = {
  labelVisible: false,
  labelLocked: false,
  labelPosition: "bottom",
  labelGap: 8,
  labelOffsetX: 0,
  labelOffsetY: 0,
  opacity: 100,
  connectorVisible: false,
  connectorColor: "#537b74",
  connectorWidth: 1.5,
  assetId: null,
  status: "unchecked",
  locked: false,
  mapVisible: true,
  memo: "",
  address: "",
  addressSourceUrl: "",
};

const landmarkLocations = [
  { name: "제주아트플랫폼", address: "제주특별자치도 제주시 중앙로14길 18", addressSourceUrl: "https://www.jfac.kr/", assetId: "jeju-art-platform-c01", x: 31, y: 62 },
  { name: "김만덕기념관", address: "제주특별자치도 제주시 산지로 7", addressSourceUrl: "https://www.mandukmuseum.or.kr/", assetId: "kim-memorial-front03", x: 74, y: 31 },
  { name: "예술공간 이아", address: "제주특별자치도 제주시 중앙로14길 21", addressSourceUrl: "https://www.jfac.kr/operatingSpace/artSpaceIAa/iAaGuide", assetId: "artspace-ia-01", x: 34, y: 57 },
  { name: "아라리오뮤지엄 탑동시네마", address: "제주특별자치도 제주시 탑동로 14", addressSourceUrl: "https://www.arariomuseum.org/", assetId: "arario-01", x: 18, y: 24 },
  { name: "김만덕객주", address: "제주특별자치도 제주시 임항로 68", addressSourceUrl: "https://www.visitjeju.net/kr/detail/view?contentsid=CNTS_000000000019652", assetId: "guesthouse-01", x: 75, y: 25 },
  { name: "산지천갤러리", address: "제주특별자치도 제주시 중앙로3길 36", addressSourceUrl: "https://www.jfac.kr/operatingSpace/sjcGallery/sjcGuide", assetId: "sanjicheon-01", x: 64, y: 40 },
  { name: "제주목 관아", address: "제주특별자치도 제주시 관덕로 25", addressSourceUrl: "https://www.jeju.go.kr/mokkwana/", assetId: "mokgwana-01", x: 39, y: 60 },
  { name: "관덕정", address: "제주특별자치도 제주시 관덕로 19", addressSourceUrl: "https://www.visitjeju.net/kr/detail/view?contentsid=CONT_000000000500057", assetId: "gwandeokjeong-01", x: 37, y: 58 },
  { name: "칠성로", address: "제주특별자치도 제주시 관덕로13길 12 일대", addressSourceUrl: "https://www.visitjeju.net/kr/detail/view?contentsid=CONT_000000000500750", assetId: "chilsungro", x: 58, y: 50 },
  { name: "동문시장", address: "제주특별자치도 제주시 관덕로14길 20", addressSourceUrl: "https://www.visitjeju.net/kr/detail/view?contentsid=CONT_000000000500745", assetId: "dongmun-01", x: 66, y: 55 },
  { name: "북수구광장", address: "제주특별자치도 제주시 일도일동 1232", addressSourceUrl: "https://www.facebook.com/wowjejusi/", assetId: "buksugu-01", x: 62, y: 45 },
  { name: "탑동광장", address: "제주특별자치도 제주시 중앙로 1", addressSourceUrl: "https://access.visitkorea.or.kr/ms/detail.do?cotId=2a115c66-9a01-4b59-bf17-ac2dd692ceea", assetId: "tapdong-square-03", x: 28, y: 20 },
  { name: "탑동해변공연장", address: "제주특별자치도 제주시 중앙로 2", addressSourceUrl: "https://access.visitkorea.or.kr/ms/detail.do?cotId=51ad702c-5321-45a0-8a03-316acb38336e", assetId: "tapdong-seaside-stage-02", x: 37, y: 20 },
] as const;

const CALIBRATION_LANDMARK_NAMES = [
  "관덕정",
  "제주아트플랫폼",
  "탑동해변공연장",
  "탑동광장",
  "김만덕객주",
  "김만덕기념관",
] as const;
const PRIMARY_CALIBRATION_NAMES = new Set<string>(CALIBRATION_LANDMARK_NAMES);

const persistedPrimaryCalibrationSeed: Record<(typeof CALIBRATION_LANDMARK_NAMES)[number], Omit<CalibrationPoint, "id" | "name" | "tier">> = {
  "관덕정": { sourceX: 32.74695652176581, sourceY: 34.92339449542698, targetX: 35.74958737983302, targetY: 59.189847489691005 },
  "제주아트플랫폼": { sourceX: 39.61521739129978, sourceY: 42.24770642203441, targetX: 41.70357577308721, targetY: 74.41225648694478 },
  "탑동해변공연장": { sourceX: 58.25, sourceY: 11.6, targetX: 51.61534016007473, targetY: 19.675915250183785 },
  "탑동광장": { sourceX: 57.098260869564854, sourceY: 12.513302752310512, targetX: 64.28211860238308, targetY: 15.970238020036858 },
  "김만덕객주": { sourceX: 81.05260869565093, sourceY: 19.982110091755693, targetX: 96.15791294866513, targetY: 27.816749269686078 },
  "김만덕기념관": { sourceX: 73.47217391303064, sourceY: 22.624770642198094, targetX: 89.3165328501865, targetY: 37.72972393275184 },
};

const initialCalibrationPoints: CalibrationPoint[] = CALIBRATION_LANDMARK_NAMES.map((name, index) => {
  const persisted = persistedPrimaryCalibrationSeed[name];
  return {
    id: `calibration-${index + 1}`,
    name,
    ...persisted,
    tier: "primary" as const,
  };
});

function buildEffectiveCalibrationPoints(
  primaryPoints: CalibrationPoint[],
  defaults: LandmarkDefaultPosition[],
  elements: MapElement[] = [],
  directoryPlaces: DirectoryPlace[] = [],
) {
  const primaryNames = new Set(primaryPoints.map((point) => point.name));
  const secondaryPoints: CalibrationPoint[] = defaults.flatMap((position, index) => {
    if (!position.confirmed || primaryNames.has(position.name)) return [];
    const geocoded = geocodedPlaces[position.name];
    if (!geocoded) return [];
    return [{
      id: `secondary-${position.elementId || index}`,
      name: position.name,
      sourceX: geocoded.x,
      sourceY: geocoded.y,
      targetX: position.x,
      targetY: position.y,
      tier: "secondary" as const,
    }];
  });
  const establishedNames = new Set([...primaryNames, ...secondaryPoints.map((point) => point.name)]);
  const placesById = new Map(directoryPlaces.map((place) => [place.id, place]));
  const placesByName = new Map(directoryPlaces.map((place) => [normalizePlaceName(place.name), place]));
  const tertiaryNames = new Set<string>();
  const tertiaryPoints: CalibrationPoint[] = elements.flatMap((element) => {
    const name = normalizePlaceName(element.name);
    if (!element.locked || !element.mapVisible || establishedNames.has(name) || tertiaryNames.has(name)) return [];
    const place = (element.directoryId ? placesById.get(element.directoryId) : undefined) ?? placesByName.get(name);
    const geocoded = geocodedPlaces[name];
    const source = geocoded
      ? { x: geocoded.x, y: geocoded.y }
      : Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude)
        ? projectGeographicCoordinates(place!.latitude!, place!.longitude!)
        : null;
    if (!source || !Number.isFinite(element.anchorX) || !Number.isFinite(element.anchorY)) return [];
    tertiaryNames.add(name);
    return [{
      id: `tertiary-${element.id}`,
      name,
      sourceX: source.x,
      sourceY: source.y,
      targetX: element.anchorX,
      targetY: element.anchorY,
      tier: "tertiary" as const,
    }];
  });
  return [...primaryPoints.map((point) => ({ ...point, tier: "primary" as const })), ...secondaryPoints, ...tertiaryPoints];
}

function canonicalAnchorForElement(
  element: MapElement,
  primaryPoints: CalibrationPoint[],
  defaults: LandmarkDefaultPosition[],
) {
  const normalizedName = normalizePlaceName(element.name);
  const primary = primaryPoints.find((point) => point.name === normalizedName);
  if (primary) return { x: primary.targetX, y: primary.targetY };
  if (element.category === "landmark") {
    const saved = defaults.find((position) => position.elementId === element.id || position.name === normalizedName);
    if (saved) return { x: saved.x, y: saved.y };
  }
  return { x: element.anchorX, y: element.anchorY };
}

function singleStageCalibratedCoordinates(sourceX: number, sourceY: number, points: CalibrationPoint[]) {
  if (!points.length) return { x: sourceX, y: sourceY };
  const exact = points.find((point) => Math.hypot(sourceX - point.sourceX, sourceY - point.sourceY) < 0.001);
  if (exact) return { x: exact.targetX, y: exact.targetY };
  let weightSum = 0;
  let dx = 0;
  let dy = 0;
  const localPoints = points.map((point) => {
    const distanceSquared = (sourceX - point.sourceX) ** 2 + ((sourceY - point.sourceY) / MAP_ASPECT) ** 2;
    return { point, distanceSquared };
  }).sort((a, b) => a.distanceSquared - b.distanceSquared).slice(0, Math.min(7, points.length));
  localPoints.forEach(({ point, distanceSquared }) => {
    const weight = 1 / Math.pow(Math.max(distanceSquared, 0.06), 1.22);
    weightSum += weight;
    dx += (point.targetX - point.sourceX) * weight;
    dy += (point.targetY - point.sourceY) * weight;
  });
  return {
    x: clamp(sourceX + dx / Math.max(weightSum, 1), 0, 100),
    y: clamp(sourceY + dy / Math.max(weightSum, 1), 0, 100),
  };
}

function applyLocalCalibrationStage(
  sourceX: number,
  sourceY: number,
  baseResult: { x: number; y: number },
  controls: CalibrationPoint[],
  projectControl: (point: CalibrationPoint) => { x: number; y: number },
  options: { radius: number; fadePower: number; maxControls: number; strength: number; maxCorrection: number },
) {
  if (!controls.length) return baseResult;
  const exact = controls.find((point) => Math.hypot(sourceX - point.sourceX, sourceY - point.sourceY) < 0.001);
  if (exact) return { x: exact.targetX, y: exact.targetY };

  const localControls = controls.map((point) => {
    const projected = projectControl(point);
    const distanceSquared = (baseResult.x - projected.x) ** 2 + ((baseResult.y - projected.y) / MAP_ASPECT) ** 2;
    return { distanceSquared, dx: point.targetX - projected.x, dy: point.targetY - projected.y };
  }).sort((a, b) => a.distanceSquared - b.distanceSquared).slice(0, options.maxControls);
  const nearestDistance = Math.sqrt(localControls[0]?.distanceSquared ?? Number.POSITIVE_INFINITY);
  const localFade = Math.pow(clamp(1 - nearestDistance / options.radius, 0, 1), options.fadePower);
  if (!localFade) return baseResult;
  let weightSum = 0;
  let dx = 0;
  let dy = 0;
  localControls.forEach((control) => {
    const weight = 1 / Math.pow(Math.max(control.distanceSquared, 0.05), 1.18);
    weightSum += weight;
    dx += control.dx * weight;
    dy += control.dy * weight;
  });
  const correctionX = clamp(dx / Math.max(weightSum, 1) * localFade * options.strength, -options.maxCorrection, options.maxCorrection);
  const correctionY = clamp(dy / Math.max(weightSum, 1) * localFade * options.strength, -options.maxCorrection, options.maxCorrection);
  return { x: clamp(baseResult.x + correctionX, 0, 100), y: clamp(baseResult.y + correctionY, 0, 100) };
}

function calibratedCoordinates(sourceX: number, sourceY: number, points: CalibrationPoint[]) {
  const primaryPoints = points.filter((point) => point.tier !== "secondary" && point.tier !== "tertiary");
  const secondaryPoints = points.filter((point) => point.tier === "secondary");
  const tertiaryPoints = points.filter((point) => point.tier === "tertiary");
  const primaryResult = singleStageCalibratedCoordinates(sourceX, sourceY, primaryPoints);
  const secondaryResult = applyLocalCalibrationStage(sourceX, sourceY, primaryResult, secondaryPoints, (point) => (
    singleStageCalibratedCoordinates(point.sourceX, point.sourceY, primaryPoints)
  ), { radius: 32, fadePower: 1.35, maxControls: 4, strength: 1, maxCorrection: 100 });
  return applyLocalCalibrationStage(sourceX, sourceY, secondaryResult, tertiaryPoints, (point) => {
    const projectedPrimary = singleStageCalibratedCoordinates(point.sourceX, point.sourceY, primaryPoints);
    return applyLocalCalibrationStage(point.sourceX, point.sourceY, projectedPrimary, secondaryPoints, (secondaryPoint) => (
      singleStageCalibratedCoordinates(secondaryPoint.sourceX, secondaryPoint.sourceY, primaryPoints)
    ), { radius: 32, fadePower: 1.35, maxControls: 4, strength: 1, maxCorrection: 100 });
  }, { radius: 18, fadePower: 1.65, maxControls: 3, strength: 0.72, maxCorrection: 4.5 });
}

function calibratedPlaceCoordinates(name: string, latitude: number | undefined, longitude: number | undefined, points: CalibrationPoint[]) {
  const reference = points.find((point) => point.name === normalizePlaceName(name));
  if (reference) return { x: reference.targetX, y: reference.targetY };
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const source = projectGeographicCoordinates(latitude!, longitude!);
  return calibratedCoordinates(source.x, source.y, points);
}

const legacyDirectoryPlaces: DirectoryPlace[] = [
  { id: "place-jeju-art-platform", name: "제주아트플랫폼", category: "culture", area: "중앙로", address: "제주특별자치도 제주시 중앙로14길 18", x: 31, y: 62, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-artspace-ia", name: "예술공간 이아", category: "culture", area: "중앙로", address: "제주특별자치도 제주시 중앙로14길 21", x: 34, y: 57, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-sanjicheon-gallery", name: "산지천갤러리", category: "culture", area: "산지천", address: "제주특별자치도 제주시 중앙로3길 36", x: 64, y: 40, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-kim-manduk-memorial", name: "김만덕기념관", category: "culture", area: "산지천", address: "제주특별자치도 제주시 산지로 7", x: 74, y: 31, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-arario-tapdong", name: "아라리오뮤지엄 탑동시네마", category: "culture", area: "탑동", address: "제주특별자치도 제주시 탑동로 14", x: 18, y: 24, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-tapdong-seaside-stage", name: "탑동해변공연장", category: "culture", area: "탑동", address: "제주특별자치도 제주시 중앙로 2", x: 37, y: 20, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB · 최종 자산 02" },
  { id: "place-mokgwana", name: "제주목 관아", category: "culture", area: "관덕로·목관아", address: "제주특별자치도 제주시 관덕로 25", x: 39, y: 60, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-gwandeokjeong", name: "관덕정", category: "culture", area: "관덕로·목관아", address: "제주특별자치도 제주시 관덕로 19", x: 37, y: 58, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-kim-manduk-guesthouse", name: "김만덕객주", category: "culture", area: "산지천", address: "제주특별자치도 제주시 임항로 68", x: 75, y: 25, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-sotong-center", name: "제주특별자치도 소통협력센터", category: "culture", area: "관덕로·목관아", address: "제주특별자치도 제주시 관덕로 44", x: 45, y: 59, coordinateStatus: "review", sourceLabel: "원도심 조사본 · 공식 주소 확인" },
  { id: "place-jeju-arts-center", name: "제주특별자치도 문예회관", category: "culture", area: "이도동", address: "제주특별자치도 제주시 동광로 69", x: 74, y: 84, coordinateStatus: "review", sourceLabel: "원도심 정보 v02" },
  { id: "place-folklore-museum", name: "제주특별자치도 민속자연사박물관", category: "culture", area: "이도동", address: "제주특별자치도 제주시 삼성로 40", x: 64, y: 78, coordinateStatus: "review", sourceLabel: "원도심 정보 v02" },
  { id: "place-triptea-sanji", name: "제주트립티 산지", category: "cafe", area: "산지천", address: "제주특별자치도 제주시 관덕로17길 29", x: 65, y: 43, coordinateStatus: "review", sourceLabel: "원도심 정보 v01" },
  { id: "place-coffee-finder", name: "커피파인더", category: "cafe", area: "이도동", address: "제주특별자치도 제주시 서광로32길 20", x: 61, y: 91, coordinateStatus: "review", sourceLabel: "원도심 정보 v02" },
  { id: "place-idongat", name: "이돈갓", category: "food", area: "칠성통", address: "제주특별자치도 제주시 칠성로길 27", x: 58, y: 51, coordinateStatus: "review", sourceLabel: "원도심 정보 v01" },
  { id: "place-chilseong-buffet", name: "칠성뷔페", category: "food", area: "칠성통", address: "제주특별자치도 제주시 관덕로11길 17", x: 54, y: 54, coordinateStatus: "review", sourceLabel: "원도심 정보 v01" },
];

const areaFallbacks: Record<string, { x: number; y: number }> = {
  "관덕로·목관아": { x: 40, y: 59 },
  "칠성로·탑동": { x: 43, y: 35 },
  "중앙로 남측": { x: 48, y: 72 },
  "동문시장·동문로": { x: 65, y: 55 },
  "산지천·탐라문화광장·서부두": { x: 68, y: 38 },
  "삼도동": { x: 33, y: 82 },
  "이도동": { x: 67, y: 84 },
};

const supportDirectoryPlaces: DirectoryPlace[] = [
  { id: "support-tapdong-parking-1", name: "탑동 제1공영주차장", category: "parking", area: "칠성로·탑동", address: "제주특별자치도 제주시 탑동로2길 4", x: 31, y: 28, coordinateStatus: "review", sourceLabel: "편의시설 조사 · 주소 검수 필요", sourceUrl: "https://app.modu.kr/p/157567", subtype: "공영주차장", priority: "추천" },
  { id: "support-chilseong-parking-1", name: "칠성제1공영주차장", category: "parking", area: "칠성로·탑동", address: "제주특별자치도 제주시 관덕로13길 12", x: 56, y: 48, coordinateStatus: "review", sourceLabel: "편의시설 조사 · 주소 검수 필요", sourceUrl: "https://thejade.kr/page.php?p=sub_1_2", subtype: "공영주차장", priority: "추천" },
  { id: "support-dongmun-parking", name: "동문재래시장 공영주차장", category: "parking", area: "동문시장·동문로", address: "제주특별자치도 제주시 중앙로13길 16-8", x: 68, y: 53, coordinateStatus: "review", sourceLabel: "편의시설 조사 · 주소 검수 필요", subtype: "공영주차장", priority: "추천" },
  { id: "support-buksugu-parking", name: "북수구공영주차장", category: "parking", area: "산지천·탐라문화광장·서부두", address: "제주특별자치도 제주시 일도일동 1230-5", x: 66, y: 43, coordinateStatus: "review", sourceLabel: "편의시설 조사 · 주소 검수 필요", subtype: "공영주차장", priority: "추천" },
  { id: "support-tapdong-info", name: "탑동관광안내소", category: "utility", area: "칠성로·탑동", address: "제주특별자치도 제주시 탑동로2길 4", x: 34, y: 29.5, coordinateStatus: "review", sourceLabel: "VISIT JEJU 관광안내소 정보", sourceUrl: "https://m.visitjeju.net/kr/knowledge/view?knwld_seq=396", subtype: "관광안내소", priority: "추천" },
  { id: "support-dongmun-center", name: "동문시장 고객지원센터·화장실", category: "utility", area: "동문시장·동문로", address: "제주특별자치도 제주시 관덕로14길 20", x: 66, y: 57, coordinateStatus: "review", sourceLabel: "동문시장 편의시설 조사 · 현장 검수 필요", sourceUrl: "https://easyjeju.net/pages.php?no=724&p=tourist", subtype: "고객지원·화장실", priority: "추천" },
  { id: "support-dongmun-public-toilet", name: "동문공설시장 공중화장실", category: "utility", area: "동문시장·동문로", address: "제주특별자치도 제주시 일도일동 1104", x: 71, y: 56, coordinateStatus: "review", sourceLabel: "동문시장 편의시설 조사 · 현장 검수 필요", subtype: "공중화장실", priority: "참고" },
  { id: "support-tapdong-toilet", name: "탑동광장 무장애 화장실", category: "utility", area: "칠성로·탑동", address: "제주특별자치도 제주시 중앙로 1", x: 26, y: 24, coordinateStatus: "review", sourceLabel: "탑동광장 무장애 편의정보 · 현장 검수 필요", sourceUrl: "https://access.visitkorea.or.kr/ms/detail.do?cotId=2a115c66-9a01-4b59-bf17-ac2dd692ceea", subtype: "무장애 화장실", priority: "추천" },
];

function buildDirectoryPlaces(rows: MasterDirectoryRow[]) {
  const legacyByName = new Map(legacyDirectoryPlaces.map((place) => [normalizePlaceName(place.name), place]));
  const built = rows
    .filter((row) => row.address && !DELETED_PLACE_NAMES.has(normalizePlaceName(row.name)))
    .map((row): DirectoryPlace => {
      const name = normalizePlaceName(row.name);
      const legacy = legacyByName.get(name);
      const geocoded = geocodedPlaces[name] ?? geocodedPlaces[row.name];
      const fallback = areaFallbacks[row.area] ?? { x: 50, y: 50 };
      return {
        id: legacy?.id ?? row.id,
        name,
        category: categoryForPlace(name, row.category),
        area: row.area,
        address: row.address,
        x: geocoded?.x ?? legacy?.x ?? fallback.x,
        y: geocoded?.y ?? legacy?.y ?? fallback.y,
        coordinateStatus: isCoreLandmarkName(name) ? "landmark" : geocoded ? "geocoded" : legacy?.coordinateStatus === "landmark" ? "landmark" : "unresolved",
        latitude: geocoded?.latitude,
        longitude: geocoded?.longitude,
        sourceLabel: `마스터DB · ${row.subtype}`,
        sourceUrl: row.sourceUrl,
        subtype: row.subtype,
        priority: row.priority,
        description: row.description,
        operatingInfo: row.operatingInfo,
        notes: row.notes,
        mapUrl: row.mapUrl,
        checkedAt: row.checkedAt,
      };
    });
  const names = new Set(built.map((place) => place.name));
  return [
    ...built,
    ...legacyDirectoryPlaces.filter((place) => !names.has(normalizePlaceName(place.name))).map((place) => {
      const geocoded = geocodedPlaces[normalizePlaceName(place.name)];
      const category = categoryForPlace(place.name, place.category) as CategoryId;
      return geocoded
        ? { ...place, ...geocoded, category, coordinateStatus: isCoreLandmarkName(place.name) ? "landmark" as const : "geocoded" as const }
        : { ...place, category, coordinateStatus: isCoreLandmarkName(place.name) ? "landmark" as const : place.coordinateStatus };
    }),
    ...supportDirectoryPlaces.filter((place) => !names.has(normalizePlaceName(place.name))).map((place) => {
      const geocoded = geocodedPlaces[place.name];
      return geocoded ? { ...place, ...geocoded, coordinateStatus: "geocoded" as const } : { ...place, coordinateStatus: "unresolved" as const };
    }),
  ];
}

const defaultDirectoryPlaces = buildDirectoryPlaces(masterDirectoryRows).map((place) => {
  const mapped = calibratedPlaceCoordinates(place.name, place.latitude, place.longitude, initialCalibrationPoints);
  return mapped ? { ...place, ...mapped } : place;
});

function directoryRecordFromPlace(place: DirectoryPlace): PlaceDirectoryRecord {
  const name = normalizePlaceName(place.name);
  return {
    id: place.id,
    name,
    category: categoryForPlace(name, place.category) as CategoryId,
    area: place.area ?? "",
    address: place.address ?? "",
    subtype: place.subtype ?? "",
    priority: place.priority ?? "",
    description: place.description ?? "",
    operatingInfo: place.operatingInfo ?? "",
    notes: place.notes ?? "",
    sourceUrl: place.sourceUrl ?? "",
    mapUrl: place.mapUrl ?? "",
    checkedAt: place.checkedAt ?? "",
  };
}

function mergeDirectoryRecords(records: PlaceDirectoryRecord[], current: DirectoryPlace[]): DirectoryPlace[] {
  const currentById = new Map(current.map((place) => [place.id, place]));
  const currentByName = new Map(current.map((place) => [normalizePlaceName(place.name), place]));
  const defaultById = new Map(defaultDirectoryPlaces.map((place) => [place.id, place]));
  const defaultByName = new Map(defaultDirectoryPlaces.map((place) => [normalizePlaceName(place.name), place]));
  return records.map((record) => {
    const name = normalizePlaceName(record.name);
    const category = categoryForPlace(name, record.category) as CategoryId;
    const base = currentById.get(record.id)
      ?? currentByName.get(name)
      ?? defaultById.get(record.id)
      ?? defaultByName.get(name);
    const addressChanged = Boolean(base && base.address.trim() !== record.address.trim());
    return {
      ...(base ?? {
        x: 50,
        y: 50,
        coordinateStatus: "unresolved" as const,
        sourceLabel: "내부 DB",
      }),
      ...record,
      name,
      category,
      sourceLabel: `내부 DB${record.subtype ? ` · ${record.subtype}` : ""}`,
      ...(addressChanged && base?.coordinateStatus !== "landmark" ? {
        coordinateStatus: "unresolved" as const,
        latitude: undefined,
        longitude: undefined,
      } : {}),
      ...(isCoreLandmarkName(name) ? { coordinateStatus: "landmark" as const } : {}),
    };
  });
}

const directoryByName = new Map(defaultDirectoryPlaces.map((place) => [place.name, place]));

const addressByPlace = new Map<string, (typeof landmarkLocations)[number]>(landmarkLocations.map((location) => [location.name, location]));
const landmarkLocationByName = new Map<string, (typeof landmarkLocations)[number]>(landmarkLocations.map((location) => [normalizePlaceName(location.name), location]));

const builtInLandmarkAssets: MapAsset[] = bundledLandmarkAssets.map((asset) => {
  const location = addressByPlace.get(asset.placeName);
  return {
    ...asset,
    category: "landmark",
    fileType: "image",
    address: location?.address ?? "",
    addressSourceUrl: location?.addressSourceUrl ?? "",
    sourceLabel: `Google Drive 원본 · 1024px WebP 최적화 · ${asset.fileName}`,
    builtIn: true,
  };
});

const builtInMarkerAssets: MapAsset[] = bundledMarkerAssets.map((asset) => ({
  ...asset,
  fileType: "svg",
  sourceLabel: `Google Drive · 범용마커 · ${asset.fileName}`,
  builtIn: true,
}));

const builtInAssets: MapAsset[] = [...builtInLandmarkAssets, ...builtInMarkerAssets];
const canonicalMarkerAssetIds = new Set(builtInMarkerAssets.map((asset) => asset.id));

function isBundledMarkerCategory(category: CategoryId): category is BundledMarkerCategory {
  return category !== "landmark";
}

function defaultMarkerAssetId(category: CategoryId, style: BundledMarkerStyle = recommendedMarkerStyle) {
  return isBundledMarkerCategory(category) ? markerAssetId(style, category) : null;
}

function assetIdAfterDirectoryCategoryChange(element: MapElement, category: CategoryId) {
  if (category === "landmark") {
    if (element.assetId && !canonicalMarkerAssetIds.has(element.assetId)) return element.assetId;
    return landmarkLocationByName.get(normalizePlaceName(element.name))?.assetId ?? null;
  }
  if (element.category === category) return element.assetId;
  if (element.category === "landmark" || canonicalMarkerAssetIds.has(element.assetId ?? "")) {
    return defaultMarkerAssetId(category);
  }
  return element.assetId;
}

const initialLandmarkElements: MapElement[] = landmarkLocations.map((location, index) => {
  const asset = builtInAssets.find((item) => item.id === location.assetId);
  const directoryPlace = directoryByName.get(location.name);
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
    size: 6.2,
    z: index + 1,
    labelVisible: true,
    assetId: location.assetId,
    status: asset?.status ?? "unchecked",
    address: location.address,
    addressSourceUrl: location.addressSourceUrl,
    memo: geocoded ? "주소·장소명 검색 결과를 6개 기준점 보정망으로 v15 지도에 반영한 기본 위치. 필요하면 화면상 위치를 직접 보정하세요." : "주소 검색 미확정 · 직접 위치 검수 필요",
    directoryId: directoryPlace?.id,
  };
});

const starterPlaceNames = new Set([
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
    const assetId = defaultMarkerAssetId(place.category);
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
      status: assetId ? "review" : "unchecked",
      address: place.address,
      addressSourceUrl: place.sourceUrl ?? "",
      memo: `${place.sourceLabel} · 초기 구성용 시각 배치. 실제 위치 앵커와 화면상 위치를 검수해 주세요.`,
    };
  });
}

const initialElements: MapElement[] = [...initialLandmarkElements, ...buildStarterMarkers(defaultDirectoryPlaces)];

const factoryLandmarkDefaultPositions: LandmarkDefaultPosition[] = initialLandmarkElements.map((element) => ({
  elementId: element.id,
  name: normalizePlaceName(element.name),
  x: element.x,
  y: element.y,
  confirmed: false,
}));

const statusText: Record<AssetStatus, string> = { approved: "승인 완료", review: "검수 중", unchecked: "미검수" };
const reviewStatusText: Record<ReviewStatus, string> = { delete: "삭제 검토", weaken: "약화 검토", keep: "유지", hierarchy: "도로 위계 조정" };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function categoryOf(id: CategoryId) {
  return categories.find((category) => category.id === id) ?? categories[categories.length - 1];
}

type VisualBounds = { left: number; top: number; right: number; bottom: number };

function labelStyle(position: LabelPosition, gap: number, offsetX: number, offsetY: number, zoom: number, bounds: VisualBounds = { left: 0, top: 0, right: 1, bottom: 1 }) {
  const centerX = ((bounds.left + bounds.right) / 2) * 100;
  const centerY = ((bounds.top + bounds.bottom) / 2) * 100;
  const crispScale = `scale(${(1 / Math.max(zoom, 0.22)).toFixed(4)})`;
  if (position === "top") return { left: `calc(${centerX}% + ${offsetX}px)`, bottom: `calc(${(1 - bounds.top) * 100}% + ${gap - offsetY}px)`, transform: `translateX(-50%) ${crispScale}` };
  if (position === "bottom") return { left: `calc(${centerX}% + ${offsetX}px)`, top: `calc(${bounds.bottom * 100}% + ${gap + offsetY}px)`, transform: `translateX(-50%) ${crispScale}` };
  if (position === "left") return { right: `calc(${(1 - bounds.left) * 100}% + ${gap - offsetX}px)`, top: `calc(${centerY}% + ${offsetY}px)`, transform: `translateY(-50%) ${crispScale}` };
  return { left: `calc(${bounds.right * 100}% + ${gap + offsetX}px)`, top: `calc(${centerY}% + ${offsetY}px)`, transform: `translateY(-50%) ${crispScale}` };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`image load failed: ${src}`));
    image.src = src;
  });
}

type NormalizedRect = { left: number; top: number; right: number; bottom: number };

function rectsOverlap(a: NormalizedRect, b: NormalizedRect, margin = 0.18) {
  return a.left < b.right + margin && a.right > b.left - margin && a.top < b.bottom + margin && a.bottom > b.top - margin;
}

function printSettingKey(target: Pick<MapElement, "directoryId" | "category" | "name">) {
  return target.directoryId?.trim()
    ? `directory:${target.directoryId.trim()}`
    : `name:${target.category}:${normalizePlaceName(target.name)}`;
}

function denseLabelKey(elements: Array<Pick<MapElement, "id">>) {
  return elements.map((element) => element.id).sort().join("|");
}

function buildDenseLabelClusters(
  labelElements: MapElement[],
  iconElements: MapElement[],
  positionOverrides: DenseLabelPosition[] = [],
): DenseLabelCluster[] {
  // A fixed label still belongs to its ordinary marker and can be represented by a
  // dense-label cluster. The lock protects the saved direction/gap/offset; it must
  // not opt the label out of the temporary screen/print presentation layer.
  const candidates = labelElements.filter((element) => element.category !== "landmark");
  if (candidates.length < 2) return [];
  const parent = candidates.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const unite = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  for (let index = 0; index < candidates.length; index += 1) {
    for (let other = index + 1; other < candidates.length; other += 1) {
      const dx = candidates[index].x - candidates[other].x;
      const dy = (candidates[index].y - candidates[other].y) / MAP_ASPECT;
      const labelReach = Math.min(6.2, 2.4 + (candidates[index].name.length + candidates[other].name.length) * 0.11);
      if (Math.hypot(dx, dy) <= labelReach) unite(index, other);
    }
  }
  const groups = new Map<number, MapElement[]>();
  candidates.forEach((element, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), element]);
  });
  const clusterGroups = [...groups.values()].filter((group) => group.length >= 2);
  const clusteredCandidateIds = new Set(clusterGroups.flatMap((group) => group.map((element) => element.id)));
  const iconRects = iconElements.map((element) => {
    const height = element.size * MAP_ASPECT / 1.12;
    return {
      category: element.category,
      rect: {
        left: element.x - element.size * 0.48,
        right: element.x + element.size * 0.48,
        top: element.y - height * 0.48,
        bottom: element.y + height * 0.48,
      },
    };
  });
  const labelRects = labelElements.filter((element) => !clusteredCandidateIds.has(element.id)).map((element) => {
    const width = clamp(element.name.length * 0.72 + 2.4, 3.6, 20);
    const height = 2.1;
    const elementHeight = element.size * MAP_ASPECT / 1.12;
    const offsetX = element.labelOffsetX / EXPORT_CANONICAL_WIDTH * 100;
    const offsetY = element.labelOffsetY / (EXPORT_CANONICAL_WIDTH / MAP_ASPECT) * 100;
    const gapX = 0.6 + element.labelGap / EXPORT_CANONICAL_WIDTH * 100;
    const gapY = 0.6 + element.labelGap / (EXPORT_CANONICAL_WIDTH / MAP_ASPECT) * 100;
    let x = element.x + offsetX;
    let y = element.y + offsetY;
    if (element.labelPosition === "top") y -= elementHeight / 2 + gapY + height / 2;
    if (element.labelPosition === "bottom") y += elementHeight / 2 + gapY + height / 2;
    if (element.labelPosition === "left") x -= element.size / 2 + gapX + width / 2;
    if (element.labelPosition === "right") x += element.size / 2 + gapX + width / 2;
    return { id: element.id, rect: { left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 } };
  });
  const overrideByKey = new Map(positionOverrides.map((position) => [position.key, position]));
  const placed: NormalizedRect[] = [];
  return clusterGroups
    .map((group) => ({ group, key: denseLabelKey(group), override: overrideByKey.get(denseLabelKey(group)) }))
    .sort((a, b) => Number(Boolean(b.override)) - Number(Boolean(a.override)) || b.group.length - a.group.length)
    .map(({ group, key, override }) => {
    const names = group.map((element) => element.name);
    const groupIds = new Set(group.map((element) => element.id));
    const minX = Math.min(...group.map((element) => element.x - element.size / 2));
    const maxX = Math.max(...group.map((element) => element.x + element.size / 2));
    const minY = Math.min(...group.map((element) => element.y - element.size * MAP_ASPECT / 2.24));
    const maxY = Math.max(...group.map((element) => element.y + element.size * MAP_ASPECT / 2.24));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const width = clamp(Math.max(...names.map((name) => name.length)) * 0.72 + 4.8, 10.5, 22);
    const height = clamp(2.8 + Math.min(4, names.length) * 2.2, 7.2, 11.2);
    const distance = Math.max(2.2, height / 2 + 1.2);
    const options = [1, 1.65, 2.4, 3.2, 4.5, 6].flatMap((ring) => [
      { x: centerX, y: minY - distance * ring },
      { x: centerX, y: maxY + distance * ring },
      { x: minX - width / 2 - 1.2 * ring, y: centerY },
      { x: maxX + width / 2 + 1.2 * ring, y: centerY },
      { x: minX - width / 2 - ring, y: minY - distance * ring },
      { x: maxX + width / 2 + ring, y: minY - distance * ring },
      { x: minX - width / 2 - ring, y: maxY + distance * ring },
      { x: maxX + width / 2 + ring, y: maxY + distance * ring },
    ]);
    const scoreOption = (option: { x: number; y: number }, optionIndex = 0) => {
      const rect = { left: option.x - width / 2, right: option.x + width / 2, top: option.y - height / 2, bottom: option.y + height / 2 };
      const iconPenalty = iconRects.reduce((score, icon) => score + (rectsOverlap(rect, icon.rect, 0.65) ? (icon.category === "landmark" ? 50000 : 18000) : 0), 0);
      const individualLabelPenalty = labelRects.reduce((score, label) => score + (!groupIds.has(label.id) && rectsOverlap(rect, label.rect, 0.45) ? 16000 : 0), 0);
      const labelPenalty = placed.reduce((score, item) => score + (rectsOverlap(rect, item, 0.45) ? 22000 : 0), 0);
      const overflow = Math.max(0, -rect.left) + Math.max(0, rect.right - 100) + Math.max(0, -rect.top) + Math.max(0, rect.bottom - 100);
      return {
        ...option,
        rect,
        hasCollision: iconPenalty > 0 || individualLabelPenalty > 0 || labelPenalty > 0 || overflow > 0,
        score: iconPenalty + individualLabelPenalty + labelPenalty + overflow * 12000 + optionIndex * 8,
      };
    };
    const best = override
      ? scoreOption({
          x: clamp(override.x, width / 2, 100 - width / 2),
          y: clamp(override.y, height / 2, 100 - height / 2),
        })
      : options.map(scoreOption).sort((a, b) => a.score - b.score)[0];
    placed.push(best.rect);
    return {
      id: key,
      elementIds: group.map((element) => element.id),
      names,
      x: clamp(best.x, width / 2, 100 - width / 2),
      y: clamp(best.y, height / 2, 100 - height / 2),
      width,
      height,
      manuallyPositioned: Boolean(override),
      hasCollision: best.hasCollision,
    };
  });
}

function cloneDocument(document: DocumentState): DocumentState {
  return JSON.parse(JSON.stringify(document)) as DocumentState;
}

function uniqueRuntimeId(prefix: "element" | "asset" | "review", existingIds: Iterable<string>) {
  const used = new Set(existingIds);
  let candidate = "";
  do {
    const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    candidate = `${prefix}-${token}`;
  } while (used.has(candidate));
  return candidate;
}

function recoveredElementId(element: MapElement, index: number, used: Set<string>) {
  const identity = (element.directoryId || `${element.category}-${normalizePlaceName(element.name)}`)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9가-힣_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52) || "marker";
  let candidate = `recovered-${identity}-${index + 1}`;
  let suffix = 2;
  while (used.has(candidate)) candidate = `recovered-${identity}-${index + 1}-${suffix++}`;
  return candidate;
}

function ensureIndependentElementIdentity(elements: MapElement[]) {
  const usedIds = new Set<string>();
  const usedDirectoryIds = new Set<string>();
  return elements.map((element, index) => {
    const requestedId = typeof element.id === "string" ? element.id.trim() : "";
    const id = requestedId && !usedIds.has(requestedId)
      ? requestedId
      : recoveredElementId(element, index, usedIds);
    usedIds.add(id);

    const directoryId = element.directoryId?.trim();
    const hasIndependentDirectoryBinding = Boolean(directoryId) && !usedDirectoryIds.has(directoryId!);
    if (hasIndependentDirectoryBinding) usedDirectoryIds.add(directoryId!);
    return {
      ...element,
      id,
      directoryId: hasIndependentDirectoryBinding ? directoryId : undefined,
    };
  });
}

function sanitizeDocument(document: DocumentState): DocumentState {
  const sanitizedElements = document.elements
    .filter((element) => !DELETED_PLACE_NAMES.has(element.name.trim()))
    .map((element) => {
      const normalized = {
        ...elementDefaults,
        ...element,
        locked: Boolean(element.locked),
        labelLocked: Boolean(element.labelLocked),
        mapVisible: element.mapVisible !== false,
      };
      const name = normalizePlaceName(normalized.name);
      const category = categoryForPlace(name, normalized.category) as CategoryId;
      const landmarkAssetId = landmarkLocationByName.get(name)?.assetId;
      const assetId = category === "landmark" && (!normalized.assetId || canonicalMarkerAssetIds.has(normalized.assetId))
        ? landmarkAssetId ?? normalized.assetId
        : normalized.assetId;
      const canonical = { ...normalized, name, category, assetId };
      const defaultAssetId = defaultMarkerAssetId(category);
      const needsCanonicalMarker = category !== "landmark"
        && (!canonical.assetId || !canonicalMarkerAssetIds.has(canonical.assetId));
      return needsCanonicalMarker && defaultAssetId
        ? { ...canonical, assetId: defaultAssetId, status: "review" as AssetStatus }
        : canonical;
    });
  return {
    ...document,
    elements: ensureIndependentElementIdentity(sanitizedElements),
    assets: document.assets.filter((asset) => asset.category === "landmark" || canonicalMarkerAssetIds.has(asset.id) || asset.builtIn === false),
    directoryPlaces: document.directoryPlaces
      ?.filter((place) => !DELETED_PLACE_NAMES.has(place.name.trim()))
      .map((place) => {
        const name = normalizePlaceName(place.name);
        return {
          ...place,
          name,
          category: categoryForPlace(name, place.category) as CategoryId,
          ...(isCoreLandmarkName(name) ? { coordinateStatus: "landmark" as const } : {}),
        };
      }),
    denseLabelPositions: [...new Map((document.denseLabelPositions ?? [])
      .filter((position) => position && typeof position.key === "string" && position.key.length > 0 && Array.isArray(position.elementIds) && position.elementIds.length >= 2)
      .map((position) => [position.key, {
        key: position.key,
        elementIds: [...new Set(position.elementIds.filter((id) => typeof id === "string" && id.length > 0))].sort(),
        x: clamp(position.x, 0, 100),
        y: clamp(position.y, 0, 100),
      }])).values()].filter((position) => position.elementIds.length >= 2),
  };
}

function lockedCoordinateKey(element: Pick<MapElement, "directoryId" | "category" | "name">) {
  const directoryId = element.directoryId?.trim();
  return directoryId
    ? `directory:${directoryId}`
    : `name:${element.category}:${normalizePlaceName(element.name)}`;
}

function lockedCoordinateSettingsFor(elements: MapElement[]): LockedCoordinateSetting[] {
  return elements
    .filter((element) => element.locked && !PRIMARY_CALIBRATION_NAMES.has(normalizePlaceName(element.name)))
    .map((element) => ({
      key: lockedCoordinateKey(element),
      ...(element.directoryId ? { directoryId: element.directoryId } : {}),
      name: normalizePlaceName(element.name),
      category: element.category,
      anchorX: clamp(element.anchorX, 0, 100),
      anchorY: clamp(element.anchorY, 0, 100),
      x: clamp(element.x, 0, 100),
      y: clamp(element.y, 0, 100),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function applyLockedCoordinateSettings(
  elements: MapElement[],
  settings: LockedCoordinateSetting[],
  places: DirectoryPlace[],
) {
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));
  const byName = new Map(settings.map((setting) => [normalizePlaceName(setting.name), setting]));
  const consumedSettingKeys = new Set<string>();
  const restored = elements.map((element) => {
    if (PRIMARY_CALIBRATION_NAMES.has(normalizePlaceName(element.name))) return element;
    const setting = byKey.get(lockedCoordinateKey(element)) ?? byName.get(normalizePlaceName(element.name));
    if (!setting) return { ...element, locked: false };
    consumedSettingKeys.add(setting.key);
    return {
      ...element,
      locked: true,
      anchorX: clamp(setting.anchorX, 0, 100),
      anchorY: clamp(setting.anchorY, 0, 100),
      x: clamp(setting.x, 0, 100),
      y: clamp(setting.y, 0, 100),
    };
  });
  let z = restored.reduce((highest, element) => Math.max(highest, element.z), 0);
  const placesById = new Map(places.map((place) => [place.id, place]));
  const placesByName = new Map(places.map((place) => [normalizePlaceName(place.name), place]));
  settings.forEach((setting) => {
    if (consumedSettingKeys.has(setting.key)) return;
    const place = (setting.directoryId ? placesById.get(setting.directoryId) : undefined) ?? placesByName.get(setting.name);
    const category = place?.category ?? setting.category;
    const assetId = defaultMarkerAssetId(category);
    z += 1;
    restored.push({
      ...elementDefaults,
      id: `synced-${setting.key.replace(/[^a-zA-Z0-9가-힣_-]+/g, "-").slice(0, 72)}`,
      ...(setting.directoryId ? { directoryId: setting.directoryId } : {}),
      name: place?.name ?? setting.name,
      category,
      anchorX: clamp(setting.anchorX, 0, 100),
      anchorY: clamp(setting.anchorY, 0, 100),
      x: clamp(setting.x, 0, 100),
      y: clamp(setting.y, 0, 100),
      size: category === "landmark" ? 6.2 : category === "culture" ? 2.5 : 1.65,
      z,
      locked: true,
      labelVisible: category === "landmark" || category === "culture" || category === "parking",
      assetId,
      status: assetId ? "review" : "unchecked",
      address: place?.address ?? "",
      addressSourceUrl: place?.sourceUrl ?? "",
      memo: "배포 사이트의 고정 좌표에서 동기화됨",
    });
  });
  return ensureIndependentElementIdentity(restored);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function coordinatesToMap(latitude: number, longitude: number, calibrationPoints: CalibrationPoint[] = initialCalibrationPoints) {
  const { x, y } = projectGeographicCoordinates(latitude, longitude);
  return calibratedCoordinates(x, y, calibrationPoints);
}

function parseMasterDatabase(value: unknown): MasterDirectoryRow[] {
  if (!value || typeof value !== "object") throw new Error("invalid database");
  const root = value as Record<string, unknown>;
  const operation = root.operation_status as { records?: Array<{ name?: string; status?: string }> } | undefined;
  const closed = new Set((operation?.records ?? []).filter((record) => record.status === "운영 종료").map((record) => record.name ?? ""));
  const rows: MasterDirectoryRow[] = [];
  const readSection = (section: "culture" | "food") => {
    const values = root[section];
    if (!Array.isArray(values)) return;
    values.forEach((raw) => {
      if (!Array.isArray(raw) || raw.length < 4) return;
      const name = normalizePlaceName(String(raw[1] ?? ""));
      const address = String(raw[2] ?? "");
      const subtype = String(raw[3] ?? "");
      if (!name || !address || closed.has(name) || DELETED_PLACE_NAMES.has(name)) return;
      const isShop = section === "food" && /소품샵|편집숍|기념품|굿즈숍|상업공간/.test(subtype) && !/식음|카페|커피|음식/.test(subtype);
      rows.push({
        name,
        address,
        area: String(raw[0] ?? "기타"),
        subtype,
        priority: String(raw[6] ?? ""),
        sourceUrl: String(raw[section === "culture" ? 11 : 10] ?? ""),
        category: section === "culture" ? "culture" : isShop ? "shop" : /카페|커피|로스터|티하우스|북카페|디저트/.test(subtype) ? "cafe" : "food",
      });
    });
  };
  readSection("culture");
  readSection("food");
  if (!rows.length) throw new Error("no supported rows");
  return [...new Map(rows.map((row) => [row.name, row])).values()];
}

export default function Home() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLElement>(null);
  const baseMapImgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const dbInputRef = useRef<HTMLInputElement>(null);
  const mapUploadInputRef = useRef<HTMLInputElement>(null);
  const geocodeRunRef = useRef(0);
  const elementsRef = useRef<MapElement[]>(initialElements);
  const assetsRef = useRef<MapAsset[]>(builtInAssets);
  const notesRef = useRef<ReviewNote[]>([]);
  const placesRef = useRef<DirectoryPlace[]>(defaultDirectoryPlaces);
  const calibrationPointsRef = useRef<CalibrationPoint[]>(initialCalibrationPoints);
  const landmarkDefaultsRef = useRef<LandmarkDefaultPosition[]>(factoryLandmarkDefaultPositions);
  const measuredAssetIdsRef = useRef(new Set<string>());
  const calibrationLiveApplyRef = useRef(false);
  const localCalibrationUpdatedAtRef = useRef(0);
  const localLockedCoordinatesUpdatedAtRef = useRef(0);
  const placeDirectoryLoadedRef = useRef(false);
  const printSettingsRef = useRef<PrintPlaceSetting[]>([]);
  const denseLabelPositionsRef = useRef<DenseLabelPosition[]>([]);

  const [elements, setElements] = useState(initialElements);
  const [assets, setAssets] = useState<MapAsset[]>(builtInAssets);
  const [reviewNotes, setReviewNotes] = useState<ReviewNote[]>([]);
  const [directoryPlaces, setDirectoryPlaces] = useState<DirectoryPlace[]>(defaultDirectoryPlaces);
  const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>(initialCalibrationPoints);
  const [landmarkDefaultPositions, setLandmarkDefaultPositions] = useState<LandmarkDefaultPosition[]>(factoryLandmarkDefaultPositions);
  const [selectedId, setSelectedId] = useState<string | null>(initialElements[0].id);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<DocumentState[]>([]);
  const [redoStack, setRedoStack] = useState<DocumentState[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState("자동 저장 준비");
  const [layoutName, setLayoutName] = useState("최근 자동복구");
  const [toast, setToast] = useState("");
  const [zoom, setZoom] = useState(0.72);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [baseMap, setBaseMap] = useState<BaseMapMode>("svg");
  const [uploadedBaseMap, setUploadedBaseMap] = useState<UploadedBaseMap | null>(null);
  const [baseMapCanUpload, setBaseMapCanUpload] = useState<boolean | null>(null);
  const [baseMapUploading, setBaseMapUploading] = useState(false);
  const [exportWidth, setExportWidth] = useState<8944 | 12000>(12000);
  const [exporting, setExporting] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryId | "all">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [screenRecommendedOnly, setScreenRecommendedOnly] = useState(false);
  const [markerLabelsVisible, setMarkerLabelsVisible] = useState(true);
  const [mergeDenseLabels, setMergeDenseLabels] = useState(true);
  const [printRecommendedOnly, setPrintRecommendedOnly] = useState(true);
  const [printLandmarks, setPrintLandmarks] = useState(true);
  const [printMarkers, setPrintMarkers] = useState(true);
  const [printLabels, setPrintLabels] = useState(true);
  const [printSettings, setPrintSettings] = useState<PrintPlaceSetting[]>([]);
  const [printSettingsCanEdit, setPrintSettingsCanEdit] = useState(false);
  const [printSettingsStorage, setPrintSettingsStorage] = useState<"loading" | "persistent" | "local">("loading");
  const [denseLabelPositions, setDenseLabelPositions] = useState<DenseLabelPosition[]>([]);
  const [selectedDenseLabelId, setSelectedDenseLabelId] = useState<string | null>(null);
  const [assetStatus, setAssetStatus] = useState<AssetStatus>("unchecked");
  const [assetCategory, setAssetCategory] = useState<CategoryId>("landmark");
  const [leftPanelMode, setLeftPanelMode] = useState<"assets" | "places" | "calibration">("assets");
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeCategory, setPlaceCategory] = useState<CategoryId | "all">("all");
  const [coordinateLockFilter, setCoordinateLockFilter] = useState<CoordinateLockFilter>("all");
  const [expandedVisibilityGroups, setExpandedVisibilityGroups] = useState<Record<CategoryId, boolean>>({
    landmark: true,
    culture: false,
    cafe: false,
    food: false,
    shop: false,
    parking: false,
    park: false,
    utility: false,
  });
  const [placedMarkerQuery, setPlacedMarkerQuery] = useState("");
  const [expandedPlacedMarkerGroups, setExpandedPlacedMarkerGroups] = useState<Record<CategoryId, boolean>>({
    landmark: true,
    culture: true,
    cafe: true,
    food: true,
    shop: true,
    parking: true,
    park: true,
    utility: true,
  });
  const [expandedCalibrationGroups, setExpandedCalibrationGroups] = useState<Record<CalibrationGroupId, boolean>>({
    primary: true,
    secondary: true,
    tertiary: true,
  });
  const [focusPulseId, setFocusPulseId] = useState<string | null>(null);
  const [geocodeProgress, setGeocodeProgress] = useState<{ active: boolean; done: number; total: number; found: number; failed: number }>({ active: false, done: 0, total: 0, found: 0, failed: 0 });
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [memoMode, setMemoMode] = useState(false);
  const [landmarkGroupSize, setLandmarkGroupSize] = useState(6.2);
  const [markerGroupSize, setMarkerGroupSize] = useState(1.7);
  const [markerStyle, setMarkerStyle] = useState<BundledMarkerStyle>(recommendedMarkerStyle);
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [calibrationLiveApply, setCalibrationLiveApply] = useState(false);
  const [calibrationDirty, setCalibrationDirty] = useState(false);
  const [showCalibrationSource, setShowCalibrationSource] = useState(true);
  const [assetVisualBounds, setAssetVisualBounds] = useState<Record<string, VisualBounds>>({});
  const [labelsRefreshing, setLabelsRefreshing] = useState(false);
  const [resourceOutputDragMode, setResourceOutputDragMode] = useState(false);
  const [primaryCalibrationStorage, setPrimaryCalibrationStorage] = useState<"loading" | "persistent" | "local">("loading");
  const [primaryCalibrationRemoteReady, setPrimaryCalibrationRemoteReady] = useState(false);
  const [lockedCoordinateStorage, setLockedCoordinateStorage] = useState<"loading" | "persistent" | "local">("loading");
  const [lockedCoordinatesRemoteReady, setLockedCoordinatesRemoteReady] = useState(false);
  const [placeDirectoryStorage, setPlaceDirectoryStorage] = useState<"loading" | "persistent" | "bundled">("loading");
  const [placeDirectoryCanEdit, setPlaceDirectoryCanEdit] = useState(false);
  const [placeDirectoryUpdatedAt, setPlaceDirectoryUpdatedAt] = useState<string | null>(null);
  const [databaseEditorOpen, setDatabaseEditorOpen] = useState(false);
  const [databaseEditorSaving, setDatabaseEditorSaving] = useState(false);
  const [databaseEditorDirty, setDatabaseEditorDirty] = useState(false);
  const [databaseEditorQuery, setDatabaseEditorQuery] = useState("");
  const [databaseEditorSelectedId, setDatabaseEditorSelectedId] = useState<string | null>(null);
  const [databaseDraftPlaces, setDatabaseDraftPlaces] = useState<DirectoryPlace[]>([]);
  const [interaction, setInteraction] = useState<
    | { type: "pan"; startX: number; startY: number; panX: number; panY: number }
    | { type: "resize"; id: string; startX: number; startSize: number }
    | { type: "drag"; id: string; startX: number; startY: number; elementX: number; elementY: number; anchorX: number; anchorY: number; mode: "anchor" | "output"; calibrationPointId?: string }
    | { type: "label"; id: string; startX: number; startY: number; offsetX: number; offsetY: number }
    | { type: "dense-label"; key: string; elementIds: string[]; startX: number; startY: number; x: number; y: number; halfWidth: number; halfHeight: number }
    | null
  >(null);

  const currentDocument = useCallback((): DocumentState => ({
    elements: elementsRef.current,
    assets: assetsRef.current,
    reviewNotes: notesRef.current,
    directoryPlaces: placesRef.current,
    calibrationPoints: calibrationPointsRef.current,
    landmarkDefaultPositions: landmarkDefaultsRef.current,
    denseLabelPositions: denseLabelPositionsRef.current,
  }), []);

  const setDocument = useCallback((document: DocumentState) => {
    const clean = sanitizeDocument(cloneDocument(document));
    const hadCalibration = clean.calibrationPoints?.length === initialCalibrationPoints.length;
    const restoredCalibrationPoints = hadCalibration ? clean.calibrationPoints! : initialCalibrationPoints;
    const restoredLandmarkDefaults = Array.isArray(clean.landmarkDefaultPositions) && clean.landmarkDefaultPositions.length
      ? clean.landmarkDefaultPositions.map((position) => {
          const matchingLandmark = clean.elements.find((element) => (
            element.category === "landmark" && normalizePlaceName(element.name) === normalizePlaceName(position.name)
          ));
          return {
            ...position,
            elementId: matchingLandmark?.id ?? position.elementId,
            x: clamp(position.x, 0, 100),
            y: clamp(position.y, 0, 100),
            confirmed: Boolean(position.confirmed),
          };
        })
      : factoryLandmarkDefaultPositions.map((position) => ({ ...position }));
    const restoredPlaces = clean.directoryPlaces?.length ? clean.directoryPlaces : defaultDirectoryPlaces;
    const restoredNames = new Set(restoredPlaces.map((place) => normalizePlaceName(place.name)));
    const restoredPlaceSet = [...restoredPlaces, ...supportDirectoryPlaces.filter((place) => !restoredNames.has(normalizePlaceName(place.name)))];
    const restoredEffectivePoints = buildEffectiveCalibrationPoints(restoredCalibrationPoints, restoredLandmarkDefaults, clean.elements, restoredPlaceSet);
    const mergedPlaces = restoredPlaceSet.map((place) => {
      if (hadCalibration) return place;
      const mapped = calibratedPlaceCoordinates(place.name, place.latitude, place.longitude, restoredEffectivePoints);
      return mapped ? { ...place, ...mapped } : place;
    });
    const migratedPlacesByName = new Map(mergedPlaces.map((place) => [normalizePlaceName(place.name), place]));
    const migratedElements = hadCalibration ? clean.elements : clean.elements.map((element) => {
      const reference = restoredEffectivePoints.find((point) => point.name === normalizePlaceName(element.name));
      const place = migratedPlacesByName.get(normalizePlaceName(element.name));
      const mapped = reference ? { x: reference.targetX, y: reference.targetY } : place ? { x: place.x, y: place.y } : null;
      if (!mapped) return element;
      const followsAnchor = Math.hypot(element.x - element.anchorX, element.y - element.anchorY) < 0.18;
      const isDefaultPlacement = /^(default-landmark|starter-marker)-/.test(element.id) || /초기 구성용|초기 배치/.test(element.memo ?? "");
      return { ...element, anchorX: mapped.x, anchorY: mapped.y, ...((reference || followsAnchor || isDefaultPlacement) ? { x: mapped.x, y: mapped.y } : {}) };
    });
    elementsRef.current = migratedElements;
    assetsRef.current = clean.assets;
    notesRef.current = clean.reviewNotes;
    placesRef.current = mergedPlaces;
    calibrationPointsRef.current = restoredCalibrationPoints;
    landmarkDefaultsRef.current = restoredLandmarkDefaults;
    const restoredDenseLabelPositions = clean.denseLabelPositions ?? [];
    denseLabelPositionsRef.current = restoredDenseLabelPositions;
    setElements(migratedElements);
    setAssets(clean.assets);
    setReviewNotes(clean.reviewNotes);
    setDirectoryPlaces(placesRef.current);
    setCalibrationPoints(restoredCalibrationPoints);
    setLandmarkDefaultPositions(restoredLandmarkDefaults);
    setDenseLabelPositions(restoredDenseLabelPositions);
    setCalibrationDirty(false);
    setSelectedId(null);
    setSelectedNoteId(null);
    setSelectedDenseLabelId(null);
  }, []);

  const pushHistory = useCallback(() => {
    const snapshot = cloneDocument(currentDocument());
    setUndoStack((current) => [...current.slice(-59), snapshot]);
    setRedoStack([]);
  }, [currentDocument]);

  const replaceElements = useCallback((updater: (current: MapElement[]) => MapElement[]) => {
    setElements((current) => {
      const next = ensureIndependentElementIdentity(updater(current));
      elementsRef.current = next;
      return next;
    });
  }, []);

  const replaceAssets = useCallback((updater: (current: MapAsset[]) => MapAsset[]) => {
    setAssets((current) => {
      const next = updater(current);
      assetsRef.current = next;
      return next;
    });
  }, []);

  const replaceNotes = useCallback((updater: (current: ReviewNote[]) => ReviewNote[]) => {
    setReviewNotes((current) => {
      const next = updater(current);
      notesRef.current = next;
      return next;
    });
  }, []);

  const replaceDirectoryPlaces = useCallback((updater: (current: DirectoryPlace[]) => DirectoryPlace[]) => {
    setDirectoryPlaces((current) => {
      const next = updater(current);
      placesRef.current = next;
      return next;
    });
  }, []);

  const replaceLandmarkDefaults = useCallback((updater: (current: LandmarkDefaultPosition[]) => LandmarkDefaultPosition[]) => {
    setLandmarkDefaultPositions((current) => {
      const next = updater(current);
      landmarkDefaultsRef.current = next;
      return next;
    });
  }, []);

  const replaceDenseLabelPositions = useCallback((updater: (current: DenseLabelPosition[]) => DenseLabelPosition[]) => {
    setDenseLabelPositions((current) => {
      const next = updater(current);
      denseLabelPositionsRef.current = next;
      return next;
    });
  }, []);

  const updateDenseLabelPosition = useCallback((key: string, elementIds: string[], x: number, y: number) => {
    replaceDenseLabelPositions((current) => {
      const position: DenseLabelPosition = {
        key,
        elementIds: [...elementIds].sort(),
        x: clamp(x, 0, 100),
        y: clamp(y, 0, 100),
      };
      const existingIndex = current.findIndex((item) => item.key === key);
      if (existingIndex < 0) return [...current, position];
      return current.map((item, index) => index === existingIndex ? position : item);
    });
  }, [replaceDenseLabelPositions]);

  const resetDenseLabelPosition = useCallback((key: string) => {
    replaceDenseLabelPositions((current) => current.filter((position) => position.key !== key));
  }, [replaceDenseLabelPositions]);

  const applyCalibrationPoints = useCallback((nextPoints: CalibrationPoint[], _moveAllVisual = false, record = true) => {
    void _moveAllVisual;
    if (record) pushHistory();
    const lockedNames = new Set(elementsRef.current.filter((element) => element.locked).map((element) => normalizePlaceName(element.name)));
    const appliedPoints = nextPoints.map((point) => lockedNames.has(point.name)
      ? calibrationPointsRef.current.find((current) => current.id === point.id) ?? point
      : point);
    calibrationPointsRef.current = appliedPoints;
    setCalibrationPoints(appliedPoints);
    replaceLandmarkDefaults((current) => current.map((position) => {
      const primary = appliedPoints.find((point) => point.name === position.name);
      return primary ? { ...position, x: primary.targetX, y: primary.targetY } : position;
    }));
    setCalibrationDirty(false);
    const effectivePoints = buildEffectiveCalibrationPoints(appliedPoints, landmarkDefaultsRef.current, elementsRef.current, placesRef.current);

    const mappedPlaces = placesRef.current.map((place) => {
      const mapped = calibratedPlaceCoordinates(place.name, place.latitude, place.longitude, effectivePoints);
      return mapped ? { ...place, ...mapped } : place;
    });
    const placesById = new Map(mappedPlaces.map((place) => [place.id, place]));
    const placesByName = new Map(mappedPlaces.map((place) => [normalizePlaceName(place.name), place]));
    replaceDirectoryPlaces(() => mappedPlaces);
    replaceElements((current) => current.map((element) => {
      if (element.locked) return element;
      const reference = effectivePoints.find((point) => point.name === normalizePlaceName(element.name));
      const place = (element.directoryId ? placesById.get(element.directoryId) : undefined) ?? placesByName.get(normalizePlaceName(element.name));
      let mapped = reference ? { x: reference.targetX, y: reference.targetY } : place ? { x: place.x, y: place.y } : null;
      if (!mapped && element.category === "landmark") {
        const geocoded = geocodedPlaces[normalizePlaceName(element.name)];
        mapped = calibratedPlaceCoordinates(element.name, geocoded?.latitude, geocoded?.longitude, effectivePoints);
      }
      if (!mapped) return element;
      const offsetX = element.x - element.anchorX;
      const offsetY = element.y - element.anchorY;
      return {
        ...element,
        anchorX: mapped.x,
        anchorY: mapped.y,
        x: clamp(mapped.x + offsetX, 0, 100),
        y: clamp(mapped.y + offsetY, 0, 100),
      };
    }));
  }, [pushHistory, replaceDirectoryPlaces, replaceElements, replaceLandmarkDefaults]);

  const updateCalibrationPoint = useCallback((id: string, patch: Partial<Pick<CalibrationPoint, "targetX" | "targetY">>, record = true) => {
    const currentPoint = calibrationPointsRef.current.find((point) => point.id === id);
    const lockedReference = currentPoint && elementsRef.current.find((element) => normalizePlaceName(element.name) === currentPoint.name && element.locked);
    if (lockedReference) {
      setToast(`${lockedReference.name}은(는) 좌표가 고정되어 있습니다.`);
      return;
    }
    const nextPoints = calibrationPointsRef.current.map((point) => point.id === id ? {
      ...point,
      ...(patch.targetX === undefined ? {} : { targetX: clamp(patch.targetX, 0, 100) }),
      ...(patch.targetY === undefined ? {} : { targetY: clamp(patch.targetY, 0, 100) }),
    } : point);
    if (calibrationLiveApplyRef.current) {
      applyCalibrationPoints(nextPoints, false, record);
      return;
    }
    if (record) pushHistory();
    calibrationPointsRef.current = nextPoints;
    setCalibrationPoints(nextPoints);
    setCalibrationDirty(true);
    const changed = nextPoints.find((point) => point.id === id);
    if (!changed) return;
    replaceLandmarkDefaults((current) => current.map((position) => position.name === changed.name ? {
      ...position,
      x: changed.targetX,
      y: changed.targetY,
    } : position));
    replaceElements((current) => current.map((element) => normalizePlaceName(element.name) === changed.name && !element.locked ? {
      ...element,
      x: clamp(changed.targetX + element.x - element.anchorX, 0, 100),
      y: clamp(changed.targetY + element.y - element.anchorY, 0, 100),
      anchorX: changed.targetX,
      anchorY: changed.targetY,
    } : element));
  }, [applyCalibrationPoints, pushHistory, replaceElements, replaceLandmarkDefaults]);

  const resetCalibrationPoints = () => {
    applyCalibrationPoints(initialCalibrationPoints.map((point) => ({ ...point })), true);
    setToast("1차 기준점 6곳을 v15 기준으로 복원하고 저장된 2차 기준점을 다시 적용했습니다.");
  };

  const applyCalibrationToAll = () => {
    applyCalibrationPoints(calibrationPointsRef.current.map((point) => ({ ...point })), true);
    window.setTimeout(() => autoArrangeLabels(false, true), 0);
  };

  const moveAllResourcesToAnchors = () => {
    const targets = elementsRef.current.filter((element) => !element.locked && Number.isFinite(element.anchorX) && Number.isFinite(element.anchorY));
    if (!targets.length) {
      setToast("기준좌표가 설정된 마커가 없습니다.");
      return;
    }
    pushHistory();
    const targetIds = new Set(targets.map((element) => element.id));
    replaceElements((current) => current.map((element) => {
      if (!targetIds.has(element.id)) return element;
      const canonical = canonicalAnchorForElement(element, calibrationPointsRef.current, landmarkDefaultsRef.current);
      return { ...element, anchorX: canonical.x, anchorY: canonical.y, x: canonical.x, y: canonical.y };
    }));
    window.setTimeout(() => autoArrangeLabels(false, true), 0);
    setToast(`리소스 ${targets.length}개를 저장된 기본 앵커로 이동했습니다.`);
  };

  const updateElement = useCallback((id: string, patch: Partial<MapElement>, record = true) => {
    if (record) pushHistory();
    replaceElements((current) => current.map((element) => {
      if (element.id !== id) return element;
      const next = { ...element, ...patch };
      const name = normalizePlaceName(next.name);
      if (!isCoreLandmarkName(name)) return next;
      const preferredAssetId = landmarkLocationByName.get(name)?.assetId;
      return {
        ...next,
        name,
        category: "landmark",
        assetId: !next.assetId || canonicalMarkerAssetIds.has(next.assetId) ? preferredAssetId ?? next.assetId : next.assetId,
      };
    }));
  }, [pushHistory, replaceElements]);

  const updateElementAnchor = useCallback((element: MapElement, nextAnchorX: number, nextAnchorY: number, record = true) => {
    if (element.locked) {
      setToast(`${element.name}은(는) 좌표가 고정되어 있습니다.`);
      return;
    }
    const anchorX = clamp(nextAnchorX, 0, 100);
    const anchorY = clamp(nextAnchorY, 0, 100);
    updateElement(element.id, {
      anchorX,
      anchorY,
      x: clamp(anchorX + element.x - element.anchorX, 0, 100),
      y: clamp(anchorY + element.y - element.anchorY, 0, 100),
    }, record);
  }, [updateElement]);

  const moveAnchorToResource = useCallback((element: MapElement) => {
    if (element.locked) {
      setToast(`${element.name}은(는) 좌표가 고정되어 있습니다.`);
      return;
    }
    const anchorX = clamp(element.x, 0, 100);
    const anchorY = clamp(element.y, 0, 100);
    if (Math.abs(anchorX - element.anchorX) < 0.001 && Math.abs(anchorY - element.anchorY) < 0.001) {
      setToast(`${element.name}의 앵커가 이미 리소스 위치와 같습니다.`);
      return;
    }

    pushHistory();
    const normalizedName = normalizePlaceName(element.name);
    const primaryPoint = calibrationPointsRef.current.find((point) => point.name === normalizedName);
    const confirmedDefault = landmarkDefaultsRef.current.find((position) =>
      (position.elementId === element.id || position.name === normalizedName) && position.confirmed,
    );

    if (primaryPoint) {
      const nextPoints = calibrationPointsRef.current.map((point) => point.id === primaryPoint.id
        ? { ...point, targetX: anchorX, targetY: anchorY }
        : point);
      if (calibrationLiveApplyRef.current) {
        applyCalibrationPoints(nextPoints, false, false);
      } else {
        calibrationPointsRef.current = nextPoints;
        setCalibrationPoints(nextPoints);
        setCalibrationDirty(true);
        replaceLandmarkDefaults((current) => {
          const existing = current.find((position) => position.elementId === element.id || position.name === normalizedName);
          if (!existing) return [...current, { elementId: element.id, name: normalizedName, x: anchorX, y: anchorY, confirmed: false }];
          return current.map((position) => position === existing ? { ...position, x: anchorX, y: anchorY } : position);
        });
      }
    } else if (confirmedDefault) {
      replaceLandmarkDefaults((current) => current.map((position) => position === confirmedDefault
        ? { ...position, x: anchorX, y: anchorY }
        : position));
      setCalibrationDirty(true);
    }

    replaceElements((current) => current.map((item) => item.id === element.id
      ? { ...item, anchorX, anchorY, x: anchorX, y: anchorY }
      : item));
    setToast(`${element.name}의 앵커를 현재 리소스 위치로 이동했습니다.`);
  }, [applyCalibrationPoints, pushHistory, replaceElements, replaceLandmarkDefaults]);

  const updateNote = useCallback((id: string, patch: Partial<ReviewNote>) => {
    pushHistory();
    replaceNotes((current) => current.map((note) => note.id === id ? { ...note, ...patch } : note));
  }, [pushHistory, replaceNotes]);

  const measureAssetBounds = useCallback((assetId: string, image: HTMLImageElement) => {
    if (measuredAssetIdsRef.current.has(assetId) || !image.naturalWidth || !image.naturalHeight) return;
    measuredAssetIdsRef.current.add(assetId);
    try {
      const size = 192;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.clearRect(0, 0, size, size);
      context.drawImage(image, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size).data;
      let minX = size; let minY = size; let maxX = -1; let maxY = -1;
      for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
        if (pixels[(y * size + x) * 4 + 3] < 32) continue;
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      if (maxX < minX || maxY < minY) return;
      setAssetVisualBounds((current) => ({ ...current, [assetId]: { left: minX / size, top: minY / size, right: (maxX + 1) / size, bottom: (maxY + 1) / size } }));
    } catch {
      measuredAssetIdsRef.current.delete(assetId);
    }
  }, []);

  const selected = elements.find((element) => element.id === selectedId) ?? null;
  const selectedNote = reviewNotes.find((note) => note.id === selectedNoteId) ?? null;
  const effectiveCalibrationPoints = useMemo(() => buildEffectiveCalibrationPoints(calibrationPoints, landmarkDefaultPositions, elements, directoryPlaces), [calibrationPoints, directoryPlaces, elements, landmarkDefaultPositions]);
  const secondaryCalibrationPoints = useMemo(() => effectiveCalibrationPoints.filter((point) => point.tier === "secondary"), [effectiveCalibrationPoints]);
  const tertiaryCalibrationPoints = useMemo(() => effectiveCalibrationPoints.filter((point) => point.tier === "tertiary"), [effectiveCalibrationPoints]);
  const selectedPrimaryCalibrationPoint = selected ? calibrationPoints.find((point) => point.name === normalizePlaceName(selected.name)) ?? null : null;
  const selectedSecondaryCalibrationPoint = selected ? secondaryCalibrationPoints.find((point) => point.name === normalizePlaceName(selected.name)) ?? null : null;
  const selectedTertiaryCalibrationPoint = selected ? tertiaryCalibrationPoints.find((point) => point.name === normalizePlaceName(selected.name)) ?? null : null;
  const selectedCalibrationPoint = selectedPrimaryCalibrationPoint ?? selectedSecondaryCalibrationPoint ?? selectedTertiaryCalibrationPoint;
  const selectedLandmarkDefault = selected?.category === "landmark" ? landmarkDefaultPositions.find((position) =>
    position.elementId === selected.id || position.name === normalizePlaceName(selected.name)
  ) ?? { elementId: selected.id, name: normalizePlaceName(selected.name), x: selected.anchorX, y: selected.anchorY, confirmed: false } : null;
  const selectedDisplayOffset = selected ? { x: selected.x - selected.anchorX, y: selected.y - selected.anchorY } : null;
  const selectedIsPrimaryCalibration = selected ? PRIMARY_CALIBRATION_NAMES.has(normalizePlaceName(selected.name)) : false;
  const selectedHasGeocodedSource = selected ? Boolean(geocodedPlaces[normalizePlaceName(selected.name)]) : false;
  const selectedAsset = selected ? assets.find((asset) => asset.id === selected.assetId) ?? null : null;
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
    return rows.sort((a, b) => Number(b.category === "landmark") - Number(a.category === "landmark") || a.name.localeCompare(b.name, "ko"));
  }, [directoryPlaces, elements]);

  const searchedUnifiedPlaceRows = useMemo(() => {
    const query = placeQuery.trim().toLocaleLowerCase("ko-KR");
    return allUnifiedPlaceRows
      .filter((row) => placeCategory === "all" || row.category === placeCategory)
      .filter((row) => !query || `${row.name} ${row.address} ${row.area}`.toLocaleLowerCase("ko-KR").includes(query));
  }, [allUnifiedPlaceRows, placeCategory, placeQuery]);

  const coordinateLockCounts = useMemo(() => searchedUnifiedPlaceRows.reduce((counts, row) => {
    if (!row.element) return counts;
    counts[row.element.locked ? "locked" : "unlocked"] += 1;
    return counts;
  }, { locked: 0, unlocked: 0 }), [searchedUnifiedPlaceRows]);

  const unifiedPlaceRows = useMemo(() => searchedUnifiedPlaceRows.filter((row) => (
    coordinateLockFilter === "all"
      || (coordinateLockFilter === "locked" ? Boolean(row.element?.locked) : Boolean(row.element && !row.element.locked))
  )), [coordinateLockFilter, searchedUnifiedPlaceRows]);

  const unifiedPlaceGroups = useMemo(() => categories.map((category) => ({
    category,
    rows: unifiedPlaceRows.filter((row) => row.category === category.id),
  })).filter((group) => group.rows.length > 0), [unifiedPlaceRows]);

  const selectedDatabasePlace = useMemo(
    () => databaseDraftPlaces.find((place) => place.id === databaseEditorSelectedId) ?? null,
    [databaseDraftPlaces, databaseEditorSelectedId],
  );
  const filteredDatabaseDraftPlaces = useMemo(() => {
    const query = databaseEditorQuery.trim().toLocaleLowerCase("ko-KR");
    return databaseDraftPlaces
      .filter((place) => !query || `${place.name} ${place.address} ${place.area} ${place.subtype ?? ""}`.toLocaleLowerCase("ko-KR").includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [databaseDraftPlaces, databaseEditorQuery]);

  const placedCategoryCounts = useMemo(() => categories.reduce<Record<CategoryId, number>>((counts, category) => {
    counts[category.id] = elements.filter((element) => element.category === category.id && element.mapVisible).length;
    return counts;
  }, { landmark: 0, culture: 0, cafe: 0, food: 0, shop: 0, parking: 0, park: 0, utility: 0 }), [elements]);

  const placedMarkerElements = useMemo(() => {
    const query = placedMarkerQuery.trim().toLocaleLowerCase("ko-KR");
    return [...elements]
      .filter((element) => element.mapVisible)
      .filter((element) => !query || `${element.name} ${element.address} ${categoryOf(element.category).name}`.toLocaleLowerCase("ko-KR").includes(query))
      .sort((a, b) => Number(b.category === "landmark") - Number(a.category === "landmark") || a.name.localeCompare(b.name, "ko"));
  }, [elements, placedMarkerQuery]);

  const placedMarkerGroups = useMemo(() => categories.map((category) => ({
    category,
    elements: placedMarkerElements.filter((element) => element.category === category.id),
  })).filter((group) => group.elements.length > 0), [placedMarkerElements]);

  const placedLabelCount = useMemo(
    () => elements.filter((element) => element.mapVisible && element.labelVisible).length,
    [elements],
  );

  const printSettingsByKey = useMemo(() => new Map(printSettings.map((setting) => [setting.key, setting])), [printSettings]);
  const directoryPriorityById = useMemo(() => new Map(directoryPlaces.map((place) => [place.id, place.priority ?? ""])), [directoryPlaces]);
  const directoryPriorityByName = useMemo(() => new Map(directoryPlaces.map((place) => [normalizePlaceName(place.name), place.priority ?? ""])), [directoryPlaces]);
  const printPolicyFor = useCallback((element: MapElement) => {
    const setting = printSettingsByKey.get(printSettingKey(element));
    const priority = (element.directoryId ? directoryPriorityById.get(element.directoryId) : undefined)
      ?? directoryPriorityByName.get(normalizePlaceName(element.name))
      ?? "";
    const recommended = element.category === "landmark" || setting?.recommended === true || (!setting && /추천|우선/.test(priority));
    const markerAllowed = element.category === "landmark" ? printLandmarks : printMarkers;
    const automaticMarker = markerAllowed && (element.category === "landmark" || !printRecommendedOnly || recommended);
    const automaticLabel = printLabels && element.labelVisible && (element.category === "landmark" ? printLandmarks : !printRecommendedOnly || recommended);
    return {
      recommended,
      marker: markerAllowed && (setting?.markerMode === "include" ? true : setting?.markerMode === "exclude" ? false : automaticMarker),
      label: printLabels && (setting?.labelMode === "include" ? true : setting?.labelMode === "exclude" ? false : automaticLabel),
      setting,
    };
  }, [directoryPriorityById, directoryPriorityByName, printLabels, printLandmarks, printMarkers, printRecommendedOnly, printSettingsByKey]);

  const recommendedPlaceCount = useMemo(() => elements.filter((element) => element.mapVisible && element.category !== "landmark" && printPolicyFor(element).recommended).length, [elements, printPolicyFor]);
  const screenHiddenMarkerCount = useMemo(() => elements.filter((element) => element.mapVisible && element.category !== "landmark" && !printPolicyFor(element).recommended).length, [elements, printPolicyFor]);

  const visibleElements = useMemo(() => [...elements]
    .filter((element) => element.mapVisible)
    .filter((element) => activeCategory === "all" || element.category === activeCategory)
    .filter((element) => !screenRecommendedOnly || element.category === "landmark" || printPolicyFor(element).recommended)
    .filter((element) => viewMode !== "landmarks" || element.category === "landmark")
    .filter((element) => viewMode !== "markers" || element.category !== "landmark")
    .sort((a, b) => a.z - b.z), [activeCategory, elements, printPolicyFor, screenRecommendedOnly, viewMode]);
  const visibleElementIds = useMemo(() => new Set(visibleElements.map((element) => element.id)), [visibleElements]);
  const visibleElementsById = useMemo(() => new Map(visibleElements.map((element) => [element.id, element])), [visibleElements]);

  const denseLabelClusters = useMemo(() => mergeDenseLabels
    ? buildDenseLabelClusters(
        visibleElements.filter((element) => element.labelVisible && (element.category === "landmark" || markerLabelsVisible)),
        visibleElements,
        denseLabelPositions,
      )
    : [], [denseLabelPositions, markerLabelsVisible, mergeDenseLabels, visibleElements]);
  const clusteredLabelElementIds = useMemo(() => new Set(denseLabelClusters.flatMap((cluster) => cluster.elementIds)), [denseLabelClusters]);
  const selectedDenseLabel = useMemo(
    () => denseLabelClusters.find((cluster) => cluster.id === selectedDenseLabelId) ?? null,
    [denseLabelClusters, selectedDenseLabelId],
  );
  const denseLabelCollisionCount = useMemo(() => denseLabelClusters.filter((cluster) => cluster.hasCollision).length, [denseLabelClusters]);

  const collisions = useMemo(() => {
    const hard = new Set<string>();
    const clearance = new Set<string>();
    for (let index = 0; index < visibleElements.length; index += 1) {
      for (let other = index + 1; other < visibleElements.length; other += 1) {
        const a = visibleElements[index];
        const b = visibleElements[other];
        const dx = Math.abs(a.x - b.x);
        const dyAsWidth = Math.abs(a.y - b.y) / MAP_ASPECT;
        const halfWidth = (a.size + b.size) / 2;
        const halfHeight = halfWidth / 1.12;
        if (dx < halfWidth && dyAsWidth < halfHeight) {
          hard.add(a.id); hard.add(b.id);
        } else if (dx < halfWidth * 1.3 && dyAsWidth < halfHeight * 1.3) {
          clearance.add(a.id); clearance.add(b.id);
        }
      }
    }
    return { hard, clearance };
  }, [visibleElements]);

  const clientToMap = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return {
      x: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedLayouts = JSON.parse(localStorage.getItem(LAYOUTS_KEY) ?? "{}") as Record<string, { updatedAt: string; document: DocumentState }>;
        let layoutsChanged = false;
        Object.values(savedLayouts).forEach((saved) => {
          if (!saved?.document?.elements?.some((element) => DELETED_PLACE_NAMES.has(element.name.trim()))) return;
          saved.document = sanitizeDocument(saved.document);
          layoutsChanged = true;
        });
        if (layoutsChanged) localStorage.setItem(LAYOUTS_KEY, JSON.stringify(savedLayouts));

        try {
          const savedVisibilityGroups = JSON.parse(localStorage.getItem(VISIBILITY_GROUPS_KEY) ?? "null") as Partial<Record<CategoryId, boolean>> | null;
          if (savedVisibilityGroups) {
            setExpandedVisibilityGroups((current) => categories.reduce<Record<CategoryId, boolean>>((next, category) => {
              next[category.id] = typeof savedVisibilityGroups[category.id] === "boolean" ? savedVisibilityGroups[category.id]! : current[category.id];
              return next;
            }, { ...current }));
          }
        } catch {}

        try {
          const savedCalibrationGroups = JSON.parse(localStorage.getItem(CALIBRATION_GROUPS_KEY) ?? "null") as Partial<Record<CalibrationGroupId, boolean>> | null;
          if (savedCalibrationGroups) {
            setExpandedCalibrationGroups((current) => ({
              primary: typeof savedCalibrationGroups.primary === "boolean" ? savedCalibrationGroups.primary : current.primary,
              secondary: typeof savedCalibrationGroups.secondary === "boolean" ? savedCalibrationGroups.secondary : current.secondary,
              tertiary: typeof savedCalibrationGroups.tertiary === "boolean" ? savedCalibrationGroups.tertiary : current.tertiary,
            }));
          }
        } catch {}

        try {
          const savedMapView = JSON.parse(localStorage.getItem(MAP_VIEW_SETTINGS_KEY) ?? "null") as {
            markerLabelsVisible?: boolean;
            mergeDenseLabels?: boolean;
            expandedPlacedMarkerGroups?: Partial<Record<CategoryId, boolean>>;
          } | null;
          if (savedMapView) {
            if (typeof savedMapView.markerLabelsVisible === "boolean") setMarkerLabelsVisible(savedMapView.markerLabelsVisible);
            if (typeof savedMapView.mergeDenseLabels === "boolean") setMergeDenseLabels(savedMapView.mergeDenseLabels);
            if (savedMapView.expandedPlacedMarkerGroups) {
              setExpandedPlacedMarkerGroups((current) => categories.reduce<Record<CategoryId, boolean>>((next, category) => {
                const saved = savedMapView.expandedPlacedMarkerGroups?.[category.id];
                next[category.id] = typeof saved === "boolean" ? saved : current[category.id];
                return next;
              }, { ...current }));
            }
          }
        } catch {}

        const persistentCalibration = (() => {
          try {
            return JSON.parse(localStorage.getItem(CALIBRATION_SETTINGS_KEY) ?? "null") as { calibrationPoints?: CalibrationPoint[]; landmarkDefaultPositions?: LandmarkDefaultPosition[]; updatedAt?: string } | null;
          } catch {
            return null;
          }
        })();
        localCalibrationUpdatedAtRef.current = Date.parse(persistentCalibration?.updatedAt ?? "") || 0;
        const persistentLockedCoordinates = (() => {
          try {
            return JSON.parse(localStorage.getItem(LOCKED_COORDINATE_SETTINGS_KEY) ?? "null") as { settings?: LockedCoordinateSetting[]; updatedAt?: string } | null;
          } catch {
            return null;
          }
        })();
        localLockedCoordinatesUpdatedAtRef.current = Date.parse(persistentLockedCoordinates?.updatedAt ?? "") || 0;

        const raw = localStorage.getItem(AUTOSAVE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<DocumentState>;
          if (Array.isArray(parsed.elements)) {
            const parsedElements = (parsed.elements as MapElement[]).map((item) => {
              const correctedPlace = defaultDirectoryPlaces.find((place) => place.id === item.directoryId || normalizePlaceName(place.name) === normalizePlaceName(item.name));
              const shouldMoveToCorrectedPosition = Boolean(correctedPlace?.coordinateStatus === "geocoded" && (/^(default-landmark|starter-marker)-/.test(item.id) || /초기 구성용|초기 배치/.test(item.memo ?? "")));
              const restored = {
                ...elementDefaults,
                ...item,
                ...(correctedPlace?.coordinateStatus === "geocoded" && !item.locked ? {
                  anchorX: correctedPlace.x,
                  anchorY: correctedPlace.y,
                  ...(shouldMoveToCorrectedPosition ? { x: correctedPlace.x, y: correctedPlace.y } : {}),
                } : {}),
              };
              if (restored.name === "탑동해변공연장" && !restored.assetId) {
                return { ...restored, assetId: "tapdong-seaside-stage-02", status: "approved" as AssetStatus, directoryId: "place-tapdong-seaside-stage" };
              }
              const markerDefault = defaultMarkerAssetId(restored.category);
              if (!restored.assetId && markerDefault) {
                return { ...restored, assetId: markerDefault, status: "review" as AssetStatus };
              }
              return restored;
            });
            const mergedElements = [
              ...parsedElements,
              ...initialElements.filter((defaultItem) => !parsedElements.some((item) => item.name === defaultItem.name)),
            ];
            const parsedAssets = Array.isArray(parsed.assets) ? parsed.assets : [];
            const mergedAssets = [
              ...builtInAssets,
              ...parsedAssets.filter((item) => !builtInAssets.some((builtIn) => builtIn.id === item.id)),
            ];
            if (!persistentLockedCoordinates) {
              const migratedSettings = lockedCoordinateSettingsFor(mergedElements);
              if (migratedSettings.length) {
                const updatedAt = new Date().toISOString();
                localLockedCoordinatesUpdatedAtRef.current = Date.parse(updatedAt);
                localStorage.setItem(LOCKED_COORDINATE_SETTINGS_KEY, JSON.stringify({ settings: migratedSettings, updatedAt }));
              }
            }
            setDocument({
              elements: mergedElements,
              assets: mergedAssets,
              reviewNotes: parsed.reviewNotes ?? [],
              directoryPlaces: parsed.directoryPlaces,
              calibrationPoints: persistentCalibration?.calibrationPoints ?? parsed.calibrationPoints,
              landmarkDefaultPositions: persistentCalibration?.landmarkDefaultPositions ?? parsed.landmarkDefaultPositions,
              denseLabelPositions: parsed.denseLabelPositions,
            });
            setSaveState("최근 상태 복구됨");
          }
        } else if (persistentCalibration?.calibrationPoints?.length) {
          setDocument({
            elements: initialElements,
            assets: builtInAssets,
            reviewNotes: [],
            directoryPlaces: defaultDirectoryPlaces,
            calibrationPoints: persistentCalibration.calibrationPoints,
            landmarkDefaultPositions: persistentCalibration.landmarkDefaultPositions,
          });
          setSaveState("저장된 기준좌표 복구됨");
        }
      } catch {
        setSaveState("자동복구 확인 필요");
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setDocument]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(currentDocument()));
        setSaveState("자동 저장됨");
      } catch {
        setSaveState("저장 공간 부족");
        setToast("대용량 업로드 자산 때문에 브라우저 저장 공간이 부족합니다. JSON을 내려받아 보관해 주세요.");
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [assets, calibrationPoints, currentDocument, denseLabelPositions, directoryPlaces, elements, hydrated, landmarkDefaultPositions, reviewNotes]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(VISIBILITY_GROUPS_KEY, JSON.stringify(expandedVisibilityGroups));
    } catch {}
  }, [expandedVisibilityGroups, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CALIBRATION_GROUPS_KEY, JSON.stringify(expandedCalibrationGroups));
    } catch {}
  }, [expandedCalibrationGroups, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(MAP_VIEW_SETTINGS_KEY, JSON.stringify({
        markerLabelsVisible,
        mergeDenseLabels,
        expandedPlacedMarkerGroups,
      }));
    } catch {}
  }, [expandedPlacedMarkerGroups, hydrated, markerLabelsVisible, mergeDenseLabels]);

  useEffect(() => {
    if (!hydrated || placeDirectoryLoadedRef.current) return;
    placeDirectoryLoadedRef.current = true;
    let cancelled = false;
    const applyBundledDirectory = () => {
      const bundledRecords = defaultDirectoryPlaces.map(directoryRecordFromPlace);
      replaceDirectoryPlaces((current) => mergeDirectoryRecords(bundledRecords, current));
      setPlaceDirectoryStorage("bundled");
    };
    fetch(PLACE_DIRECTORY_API, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as {
          rows?: PlaceDirectoryRecord[];
          persistent?: boolean;
          canEdit?: boolean;
          updatedAt?: string | null;
        } | null;
        if (!response.ok && response.status !== 503) throw new Error("directory load failed");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        setPlaceDirectoryCanEdit(Boolean(payload?.canEdit));
        setPlaceDirectoryUpdatedAt(payload?.updatedAt ?? null);
        const rows = Array.isArray(payload?.rows) ? payload.rows : [];
        if (!payload?.persistent || !rows.length) {
          applyBundledDirectory();
          return;
        }
        const merged = mergeDirectoryRecords(rows, placesRef.current);
        const byId = new Map(merged.map((place) => [place.id, place]));
        const byName = new Map(merged.map((place) => [normalizePlaceName(place.name), place]));
        replaceDirectoryPlaces(() => merged);
        replaceElements((current) => current.map((element) => {
          const place = (element.directoryId ? byId.get(element.directoryId) : undefined)
            ?? byName.get(normalizePlaceName(element.name));
          if (!place) return element;
          return {
            ...element,
            directoryId: place.id,
            name: place.name,
            category: place.category,
            address: place.address,
            addressSourceUrl: place.sourceUrl ?? "",
            assetId: assetIdAfterDirectoryCategoryChange(element, place.category),
          };
        }));
        setPlaceDirectoryStorage("persistent");
      })
      .catch(() => {
        if (!cancelled) applyBundledDirectory();
      });
    return () => { cancelled = true; };
  }, [hydrated, replaceDirectoryPlaces, replaceElements]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    fetch(PRINT_SETTINGS_API, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as {
          settings?: PrintPlaceSetting[];
          persistent?: boolean;
          canEdit?: boolean;
        } | null;
        if (!response.ok && response.status !== 503) throw new Error("print settings load failed");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        const settings = Array.isArray(payload?.settings) ? payload!.settings : [];
        printSettingsRef.current = settings;
        setPrintSettings(settings);
        setPrintSettingsCanEdit(Boolean(payload?.canEdit));
        setPrintSettingsStorage(payload?.persistent ? "persistent" : "local");
      })
      .catch(() => {
        if (!cancelled) setPrintSettingsStorage("local");
      });
    return () => { cancelled = true; };
  }, [hydrated]);

  const savePrintSetting = useCallback(async (target: Pick<MapElement, "directoryId" | "category" | "name">, patch: Partial<Pick<PrintPlaceSetting, "recommended" | "markerMode" | "labelMode">>) => {
    if (!printSettingsCanEdit) {
      setToast("출력 추천 설정은 소유자 로그인 후 영구 저장할 수 있습니다.");
      return;
    }
    const key = printSettingKey(target);
    const existing = printSettingsRef.current.find((setting) => setting.key === key);
    const next: PrintPlaceSetting = {
      key,
      ...(target.directoryId ? { directoryId: target.directoryId } : {}),
      name: normalizePlaceName(target.name),
      recommended: existing?.recommended ?? false,
      markerMode: existing?.markerMode ?? "auto",
      labelMode: existing?.labelMode ?? "auto",
      ...patch,
    };
    const previous = printSettingsRef.current;
    const updated = [...previous.filter((setting) => setting.key !== key), next];
    printSettingsRef.current = updated;
    setPrintSettings(updated);
    try {
      const response = await fetch(PRINT_SETTINGS_API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setting: next }),
      });
      if (!response.ok) throw new Error("print setting save failed");
      setPrintSettingsStorage("persistent");
    } catch {
      printSettingsRef.current = previous;
      setPrintSettings(previous);
      setToast("출력 추천 설정을 저장하지 못했습니다. 로그인 상태를 확인해 주세요.");
    }
  }, [printSettingsCanEdit]);

  useEffect(() => {
    if (!hydrated || !primaryCalibrationRemoteReady) return;
    try {
      const updatedAt = new Date().toISOString();
      localCalibrationUpdatedAtRef.current = Date.parse(updatedAt);
      localStorage.setItem(CALIBRATION_SETTINGS_KEY, JSON.stringify({
        calibrationPoints,
        landmarkDefaultPositions,
        updatedAt,
      }));
    } catch {}
  }, [calibrationPoints, hydrated, landmarkDefaultPositions, primaryCalibrationRemoteReady]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    fetch(CALIBRATION_SETTINGS_API, { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { points?: CalibrationPoint[]; updatedAt?: string | null } : null)
      .then((payload) => {
        if (cancelled) return;
        const remotePoints = Array.isArray(payload?.points) ? payload!.points.filter((point) => PRIMARY_CALIBRATION_NAMES.has(point.name)) : [];
        const remoteUpdatedAt = Date.parse(payload?.updatedAt ?? "") || 0;
        const shouldRestoreRemote = remotePoints.length === CALIBRATION_LANDMARK_NAMES.length
          && (localCalibrationUpdatedAtRef.current === 0 || remoteUpdatedAt >= localCalibrationUpdatedAtRef.current);
        if (shouldRestoreRemote) {
          const byName = new Map(remotePoints.map((point) => [point.name, point]));
          const restored = calibrationPointsRef.current.map((point) => {
            const remote = byName.get(point.name);
            return remote ? {
              ...point,
              sourceX: clamp(remote.sourceX, 0, 100),
              sourceY: clamp(remote.sourceY, 0, 100),
              targetX: clamp(remote.targetX, 0, 100),
              targetY: clamp(remote.targetY, 0, 100),
            } : point;
          });
          calibrationPointsRef.current = restored;
          setCalibrationPoints(restored);
          replaceLandmarkDefaults((current) => current.map((position) => {
            const remote = byName.get(position.name);
            return remote ? { ...position, x: clamp(remote.targetX, 0, 100), y: clamp(remote.targetY, 0, 100) } : position;
          }));
          replaceElements((current) => current.map((element) => {
            const remote = byName.get(normalizePlaceName(element.name));
            if (!remote) return element;
            const offsetX = element.x - element.anchorX;
            const offsetY = element.y - element.anchorY;
            return {
              ...element,
              anchorX: clamp(remote.targetX, 0, 100),
              anchorY: clamp(remote.targetY, 0, 100),
              x: clamp(remote.targetX + offsetX, 0, 100),
              y: clamp(remote.targetY + offsetY, 0, 100),
            };
          }));
          localCalibrationUpdatedAtRef.current = remoteUpdatedAt;
        }
        setPrimaryCalibrationStorage(payload ? "persistent" : "local");
        setPrimaryCalibrationRemoteReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPrimaryCalibrationStorage("local");
        setPrimaryCalibrationRemoteReady(true);
      });
    return () => { cancelled = true; };
  }, [hydrated, replaceElements, replaceLandmarkDefaults]);

  useEffect(() => {
    if (!hydrated || !primaryCalibrationRemoteReady) return;
    const timer = window.setTimeout(() => {
      void fetch(CALIBRATION_SETTINGS_API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ points: calibrationPointsRef.current.map(({ name, sourceX, sourceY, targetX, targetY }) => ({ name, sourceX, sourceY, targetX, targetY })) }),
      }).then((response) => {
        setPrimaryCalibrationStorage(response.ok ? "persistent" : "local");
      }).catch(() => setPrimaryCalibrationStorage("local"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [calibrationPoints, hydrated, primaryCalibrationRemoteReady]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    fetch(LOCKED_COORDINATE_SETTINGS_API, { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { settings?: LockedCoordinateSetting[]; updatedAt?: string | null } : null)
      .then((payload) => {
        if (cancelled) return;
        const remoteSettings = Array.isArray(payload?.settings) ? payload!.settings : [];
        const remoteUpdatedAt = Date.parse(payload?.updatedAt ?? "") || 0;
        const shouldRestoreRemote = remoteUpdatedAt > 0
          && (localLockedCoordinatesUpdatedAtRef.current === 0 || remoteUpdatedAt >= localLockedCoordinatesUpdatedAtRef.current);
        if (shouldRestoreRemote) {
          replaceElements((current) => applyLockedCoordinateSettings(current, remoteSettings, placesRef.current));
          localLockedCoordinatesUpdatedAtRef.current = remoteUpdatedAt;
          try {
            localStorage.setItem(LOCKED_COORDINATE_SETTINGS_KEY, JSON.stringify({ settings: remoteSettings, updatedAt: payload!.updatedAt }));
          } catch {}
        }
        setLockedCoordinateStorage(payload ? "persistent" : "local");
        setLockedCoordinatesRemoteReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLockedCoordinateStorage("local");
        setLockedCoordinatesRemoteReady(true);
      });
    return () => { cancelled = true; };
  }, [hydrated, replaceElements]);

  const lockedCoordinateSignature = useMemo(() => JSON.stringify(lockedCoordinateSettingsFor(elements)), [elements]);

  useEffect(() => {
    if (!hydrated || !lockedCoordinatesRemoteReady) return;
    const timer = window.setTimeout(() => {
      const settings = lockedCoordinateSettingsFor(elementsRef.current);
      const updatedAt = new Date().toISOString();
      localLockedCoordinatesUpdatedAtRef.current = Date.parse(updatedAt);
      try {
        localStorage.setItem(LOCKED_COORDINATE_SETTINGS_KEY, JSON.stringify({ settings, updatedAt }));
      } catch {}
      void fetch(LOCKED_COORDINATE_SETTINGS_API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings }),
      }).then((response) => {
        setLockedCoordinateStorage(response.ok ? "persistent" : "local");
      }).catch(() => setLockedCoordinateStorage("local"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [hydrated, lockedCoordinateSignature, lockedCoordinatesRemoteReady]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const image = baseMapImgRef.current;
    if (image?.complete && image.naturalWidth > 0) setMapLoaded(true);
  }, [baseMap]);

  useEffect(() => {
    calibrationLiveApplyRef.current = calibrationLiveApply;
  }, [calibrationLiveApply]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${UPLOADED_MAP_API}?meta=1`, { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as UploadedBaseMap : null)
      .then((metadata) => {
        if (cancelled || !metadata) return;
        setBaseMapCanUpload(Boolean(metadata.canUpload));
        if (metadata.available) setUploadedBaseMap(metadata);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!interaction) return;
      if (interaction.type === "pan") {
        setPan({ x: interaction.panX + event.clientX - interaction.startX, y: interaction.panY + event.clientY - interaction.startY });
        return;
      }
      if (interaction.type === "label") {
        updateElement(interaction.id, {
          labelOffsetX: clamp(interaction.offsetX + (event.clientX - interaction.startX) / zoom, -240, 240),
          labelOffsetY: clamp(interaction.offsetY + (event.clientY - interaction.startY) / zoom, -240, 240),
        }, false);
        return;
      }
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const deltaX = ((event.clientX - interaction.startX) / rect.width) * 100;
      const deltaY = ((event.clientY - interaction.startY) / rect.height) * 100;
      if (interaction.type === "dense-label") {
        updateDenseLabelPosition(
          interaction.key,
          interaction.elementIds,
          clamp(interaction.x + deltaX, interaction.halfWidth, 100 - interaction.halfWidth),
          clamp(interaction.y + deltaY, interaction.halfHeight, 100 - interaction.halfHeight),
        );
        return;
      }
      if (interaction.type === "resize") {
        updateElement(interaction.id, { size: clamp(interaction.startSize + deltaX * 2, 0.8, 15) }, false);
        return;
      }
      if (interaction.mode === "anchor" && interaction.calibrationPointId) {
        updateCalibrationPoint(interaction.calibrationPointId, {
          targetX: clamp(interaction.anchorX + deltaX, 0, 100),
          targetY: clamp(interaction.anchorY + deltaY, 0, 100),
        }, false);
      } else if (interaction.mode === "anchor") {
        const boundedDeltaX = clamp(deltaX, -Math.min(interaction.anchorX, interaction.elementX), 100 - Math.max(interaction.anchorX, interaction.elementX));
        const boundedDeltaY = clamp(deltaY, -Math.min(interaction.anchorY, interaction.elementY), 100 - Math.max(interaction.anchorY, interaction.elementY));
        updateElement(interaction.id, {
          anchorX: interaction.anchorX + boundedDeltaX,
          anchorY: interaction.anchorY + boundedDeltaY,
          x: interaction.elementX + boundedDeltaX,
          y: interaction.elementY + boundedDeltaY,
        }, false);
      } else {
        updateElement(interaction.id, {
          x: clamp(interaction.elementX + deltaX, 0, 100),
          y: clamp(interaction.elementY + deltaY, 0, 100),
        }, false);
      }
    };
    const handleUp = () => setInteraction(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [interaction, updateCalibrationPoint, updateDenseLabelPosition, updateElement, zoom]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (databaseEditorOpen || !selectedId || ["INPUT", "SELECT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName)) return;
      const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const direction = directions[event.key];
      if (!direction) return;
      const element = elementsRef.current.find((item) => item.id === selectedId);
      if (!element) return;
      event.preventDefault();
      const step = event.shiftKey ? 0.5 : 0.08;
      const calibrationPoint = !resourceOutputDragMode
        ? calibrationPointsRef.current.find((point) => point.name === normalizePlaceName(element.name))
        : undefined;
      if (calibrationPoint) {
        updateCalibrationPoint(calibrationPoint.id, {
          targetX: calibrationPoint.targetX + direction[0] * step,
          targetY: calibrationPoint.targetY + direction[1] * step,
        });
        return;
      }
      if (element.locked) return;
      if (resourceOutputDragMode) {
        updateElement(selectedId, { x: clamp(element.x + direction[0] * step, 0, 100), y: clamp(element.y + direction[1] * step, 0, 100) });
      } else {
        updateElementAnchor(element, element.anchorX + direction[0] * step, element.anchorY + direction[1] * step);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [databaseEditorOpen, resourceOutputDragMode, selectedId, updateCalibrationPoint, updateElement, updateElementAnchor]);

  const undo = () => {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((current) => [...current.slice(-59), cloneDocument(currentDocument())]);
    setUndoStack((current) => current.slice(0, -1));
    setDocument(previous);
  };

  const redo = () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((current) => [...current.slice(-59), cloneDocument(currentDocument())]);
    setRedoStack((current) => current.slice(0, -1));
    setDocument(next);
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const viewport = viewportRef.current?.getBoundingClientRect();
    if (!viewport) return;
    const cursorX = event.clientX - viewport.left - viewport.width / 2;
    const cursorY = event.clientY - viewport.top - viewport.height / 2;
    const nextZoom = clamp(zoom * Math.exp(-event.deltaY * 0.0012), 0.22, 4);
    const ratio = nextZoom / zoom;
    setPan({ x: cursorX - (cursorX - pan.x) * ratio, y: cursorY - (cursorY - pan.y) * ratio });
    setZoom(nextZoom);
  };

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget || memoMode) return;
    setSelectedId(null); setSelectedNoteId(null); setSelectedDenseLabelId(null);
    setInteraction({ type: "pan", startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y });
  };

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (memoMode && event.button === 0) {
      event.stopPropagation();
      const point = clientToMap(event.clientX, event.clientY);
      pushHistory();
      const note: ReviewNote = { id: uniqueRuntimeId("review", notesRef.current.map((item) => item.id)), x: point.x, y: point.y, status: "weaken", text: "" };
      replaceNotes((current) => [...current, note]);
      setSelectedId(null); setSelectedNoteId(note.id); setMemoMode(false); setRightOpen(true);
      return;
    }
    startPan(event);
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>, element: MapElement) => {
    event.stopPropagation();
    setSelectedId(element.id); setSelectedNoteId(null); setSelectedDenseLabelId(null);
    setRightOpen(true);
    if (event.button !== 0 || memoMode || element.locked) return;
    const primaryPoint = !resourceOutputDragMode
      ? calibrationPointsRef.current.find((point) => point.name === normalizePlaceName(element.name))
      : undefined;
    pushHistory();
    setInteraction({
      type: "drag",
      id: element.id,
      startX: event.clientX,
      startY: event.clientY,
      elementX: element.x,
      elementY: element.y,
      anchorX: primaryPoint?.targetX ?? element.anchorX,
      anchorY: primaryPoint?.targetY ?? element.anchorY,
      mode: resourceOutputDragMode ? "output" : "anchor",
      calibrationPointId: primaryPoint?.id,
    });
  };

  const startLabelDrag = (event: ReactPointerEvent<HTMLDivElement>, element: MapElement) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedId(element.id);
    setSelectedNoteId(null);
    setSelectedDenseLabelId(null);
    setRightOpen(true);
    pushHistory();
    setInteraction({
      type: "label",
      id: element.id,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: element.labelOffsetX,
      offsetY: element.labelOffsetY,
    });
  };

  const startDenseLabelDrag = (event: ReactPointerEvent<HTMLDivElement>, cluster: DenseLabelCluster) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedId(null);
    setSelectedNoteId(null);
    setSelectedDenseLabelId(cluster.id);
    pushHistory();
    setInteraction({
      type: "dense-label",
      key: cluster.id,
      elementIds: cluster.elementIds,
      startX: event.clientX,
      startY: event.clientY,
      x: cluster.x,
      y: cluster.y,
      halfWidth: cluster.width / 2,
      halfHeight: cluster.height / 2,
    });
  };

  const focusMapPosition = (x: number, y: number, elementId: string) => {
    const stageRect = stageRef.current?.getBoundingClientRect();
    const targetZoom = 1.55;
    if (stageRect) {
      const unscaledWidth = stageRect.width / Math.max(zoom, 0.01);
      const unscaledHeight = stageRect.height / Math.max(zoom, 0.01);
      setPan({
        x: -((x - 50) / 100) * unscaledWidth * targetZoom,
        y: -((y - 50) / 100) * unscaledHeight * targetZoom,
      });
    }
    setZoom(targetZoom);
    setFocusPulseId(elementId);
    window.setTimeout(() => setFocusPulseId((current) => current === elementId ? null : current), 1300);
  };

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
            : element
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

  const switchLeftPanel = (mode: "assets" | "places" | "calibration") => {
    setLeftPanelMode(mode);
    setCalibrationMode(mode === "calibration");
    if (mode === "calibration") {
      setActiveCategory("all");
      setViewMode("anchors");
    }
    window.requestAnimationFrame(() => leftPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const importMasterDatabase = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseMasterDatabase(JSON.parse(String(reader.result)));
        const importedPlaces = buildDirectoryPlaces(rows);
        replaceDirectoryPlaces(() => importedPlaces);
        setLeftPanelMode("places");
        setPlaceQuery("");
        setToast(`마스터 DB ${importedPlaces.length}곳을 등록하고 주소 위치 찾기를 시작합니다.`);
        void runAddressLookup(importedPlaces);
      } catch {
        setToast("문화공간·식음 장소 배열을 확인할 수 없는 DB입니다.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const openDirectoryPlace = (place: DirectoryPlace) => {
    setActiveCategory("all");
    setViewMode("all");
    setRightOpen(true);
    setSelectedNoteId(null);
    const existing = elementsRef.current.find((item) => item.directoryId === place.id || item.name === place.name);
    if (existing) {
      if (!existing.mapVisible) updateElement(existing.id, { mapVisible: true });
      setSelectedId(existing.id);
      focusMapPosition(existing.x, existing.y, existing.id);
      setToast(`${place.name} 위치로 이동했습니다.`);
      return;
    }
    pushHistory();
    const preferredLandmarkAssetId = landmarkLocationByName.get(normalizePlaceName(place.name))?.assetId;
    const placeAssetId = place.category === "landmark" ? preferredLandmarkAssetId ?? null : defaultMarkerAssetId(place.category);
    const next: MapElement = {
      ...elementDefaults,
      id: uniqueRuntimeId("element", elementsRef.current.map((item) => item.id)),
      directoryId: place.id,
      name: place.name,
      category: place.category,
      x: place.x,
      y: place.y,
      anchorX: place.x,
      anchorY: place.y,
      size: place.category === "landmark" ? 6.2 : place.category === "culture" ? 3 : 1.7,
      z: Math.max(0, ...elementsRef.current.map((item) => item.z)) + 1,
      labelVisible: true,
      assetId: placeAssetId,
      status: placeAssetId ? "review" : "unchecked",
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

  const openDatabaseEditor = () => {
    if (!placeDirectoryCanEdit) {
      setToast("내부 DB 수정은 소유자 로그인 후 사용할 수 있습니다.");
      return;
    }
    const draft = placesRef.current.map((place) => ({ ...place }));
    setDatabaseDraftPlaces(draft);
    setDatabaseEditorSelectedId(draft[0]?.id ?? null);
    setDatabaseEditorQuery("");
    setDatabaseEditorDirty(false);
    setDatabaseEditorOpen(true);
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
      return {
        ...next,
        name,
        category: categoryForPlace(name, next.category) as CategoryId,
        ...(isCoreLandmarkName(name) ? { coordinateStatus: "landmark" as const } : {}),
      };
    }));
    setDatabaseEditorDirty(true);
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
    };
    setDatabaseDraftPlaces((current) => [next, ...current]);
    setDatabaseEditorSelectedId(id);
    setDatabaseEditorQuery("");
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
      return {
        ...element,
        directoryId: place.id,
        name: place.name,
        category: place.category,
        address: place.address,
        addressSourceUrl: place.sourceUrl ?? "",
        assetId: assetIdAfterDirectoryCategoryChange(element, place.category),
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

  const addAssetElement = (asset: MapAsset) => {
    pushHistory();
    const count = elementsRef.current.filter((item) => item.assetId === asset.id).length + 1;
    const size = asset.category === "landmark" ? 6.4 : asset.category === "culture" || asset.category === "park" ? 3 : 1.7;
    const next: MapElement = {
      ...elementDefaults, id: uniqueRuntimeId("element", elementsRef.current.map((item) => item.id)), name: asset.placeName ?? (count > 1 ? `${asset.name} ${count}` : asset.name),
      category: asset.category, x: 50, y: 50, anchorX: 50, anchorY: 50, size,
      z: Math.max(0, ...elementsRef.current.map((item) => item.z)) + 1, labelVisible: asset.category === "landmark",
      assetId: asset.id, status: asset.status, address: asset.address ?? "", addressSourceUrl: asset.addressSourceUrl ?? "",
    };
    replaceElements((current) => [...current, next]); setSelectedId(next.id); setSelectedNoteId(null);
  };

  const applyLandmarkCandidate = (asset: MapAsset) => {
    const existing = elementsRef.current.find((element) => normalizePlaceName(element.name) === normalizePlaceName(asset.placeName ?? ""));
    if (!existing) {
      addAssetElement(asset);
      setToast(`${asset.placeName}에 ${asset.name} 후보를 적용했습니다.`);
      return;
    }
    updateElement(existing.id, { assetId: asset.id, status: asset.status });
    setSelectedId(existing.id);
    setSelectedNoteId(null);
    focusMapPosition(existing.x, existing.y, existing.id);
    setToast(`${asset.placeName} 리소스를 ${asset.name}(으)로 교체했습니다.`);
  };

  const uploadAsset = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    files.forEach((file) => {
      if (!file.type.startsWith("image/") && !file.name.toLowerCase().endsWith(".svg")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = typeof reader.result === "string" ? reader.result : "";
        if (!src) return;
        pushHistory();
        const extension = file.name.split(".").pop()?.toLowerCase();
        const asset: MapAsset = {
          id: uniqueRuntimeId("asset", assetsRef.current.map((item) => item.id)), name: file.name.replace(/\.[^.]+$/, ""), category: assetCategory,
          status: assetStatus, src, fileType: extension === "svg" ? "svg" : extension === "png" ? "png" : "image",
          sourceLabel: `사용자 업로드 · ${file.name}`,
          builtIn: false,
        };
        replaceAssets((current) => [...current, asset]);
      };
      reader.readAsDataURL(file);
    });
    event.target.value = "";
  };

  const uploadBaseMap = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 60 * 1024 * 1024) {
      setToast("베이스 지도는 60MB 이하 PNG·JPG·WebP·SVG 이미지로 올려주세요.");
      return;
    }
    setBaseMapUploading(true);
    try {
      const localUrl = URL.createObjectURL(file);
      const image = await loadImage(localUrl);
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      URL.revokeObjectURL(localUrl);
      if (!width || !height) throw new Error("invalid dimensions");
      const aspectDifference = Math.abs(width / height - MAP_ASPECT) / MAP_ASPECT;
      if (aspectDifference > 0.025) {
        setToast(`지도 비율이 기준(${Math.round(MAP_ASPECT * 1000) / 1000})과 달라 업로드하지 않았습니다. 같은 영역·비율의 지도를 사용해 주세요.`);
        return;
      }
      const params = new URLSearchParams({ name: file.name, width: String(width), height: String(height) });
      const response = await fetch(`${UPLOADED_MAP_API}?${params.toString()}`, {
        method: "POST",
        headers: { "content-type": file.type || "image/png" },
        body: file,
      });
      if (!response.ok) throw new Error(`upload ${response.status}`);
      const metadata = await response.json() as UploadedBaseMap;
      setUploadedBaseMap(metadata);
      setBaseMapCanUpload(Boolean(metadata.canUpload));
      setMapLoaded(false);
      setBaseMap("uploaded");
      setToast(`${file.name}을(를) 사이트 베이스 지도로 저장했습니다.`);
    } catch {
      setToast("베이스 지도를 저장하지 못했습니다. 소유자 로그인과 파일 형식을 확인해 주세요.");
    } finally {
      setBaseMapUploading(false);
    }
  };

  const autoArrangeLabels = (record = true, notify = true) => {
    const candidates = elementsRef.current
      .filter((element) => element.mapVisible && element.labelVisible)
      .sort((a, b) => Number(b.category === "landmark" || b.labelLocked) - Number(a.category === "landmark" || a.labelLocked) || b.z - a.z);
    if (!candidates.length) {
      setToast("자동 정리할 표시 라벨이 없습니다.");
      setLabelsRefreshing(false);
      return;
    }
    if (record) pushHistory();
    const assetById = new Map(assetsRef.current.map((asset) => [asset.id, asset]));
    const stageRect = stageRef.current?.getBoundingClientRect();
    const measuredLabelSizes = new Map<string, { width: number; height: number }>();
    if (stageRect?.width && stageRect.height) {
      stageRef.current?.querySelectorAll<HTMLElement>("[data-label-id]").forEach((label) => {
        const id = label.dataset.labelId;
        const rect = label.getBoundingClientRect();
        if (id && rect.width && rect.height) measuredLabelSizes.set(id, {
          width: rect.width / stageRect.width * 100,
          height: rect.height / stageRect.height * 100,
        });
      });
    }
    const iconRects = elementsRef.current.filter((element) => element.mapVisible).map((element) => {
      const asset = element.assetId ? assetById.get(element.assetId) : undefined;
      const bounds = asset ? assetVisualBounds[asset.id] : undefined;
      const leftFactor = bounds?.left ?? 0.05;
      const rightFactor = bounds?.right ?? 0.95;
      const topFactor = bounds?.top ?? 0.05;
      const bottomFactor = bounds?.bottom ?? 0.95;
      const elementHeight = element.size * MAP_ASPECT / 1.12;
      return { id: element.id, category: element.category, rect: {
        left: element.x + (leftFactor - 0.5) * element.size,
        right: element.x + (rightFactor - 0.5) * element.size,
        top: element.y + (topFactor - 0.5) * elementHeight,
        bottom: element.y + (bottomFactor - 0.5) * elementHeight,
      } };
    });
    const updates = new Map<string, Pick<MapElement, "labelPosition" | "labelOffsetX" | "labelOffsetY">>();
    const placedLabels: Array<{ id: string; category: CategoryId; rect: NormalizedRect }> = [];
    candidates.forEach((element) => {
      const asset = element.assetId ? assetById.get(element.assetId) : undefined;
      const bounds = asset ? assetVisualBounds[asset.id] : undefined;
      const leftFactor = bounds?.left ?? 0.05;
      const rightFactor = bounds?.right ?? 0.95;
      const topFactor = bounds?.top ?? 0.05;
      const bottomFactor = bounds?.bottom ?? 0.95;
      const characterCount = Array.from(element.name).length;
      const measuredLabel = measuredLabelSizes.get(element.id);
      const labelWidth = measuredLabel?.width ?? clamp((characterCount * 0.8 + 1.05) / Math.max(zoom, 0.22), 2.8, 28);
      const labelHeight = measuredLabel?.height ?? 1.72 / Math.max(zoom, 0.22);
      const elementHeight = element.size * MAP_ASPECT / 1.12;
      const visualRect = {
        left: element.x + (leftFactor - 0.5) * element.size,
        right: element.x + (rightFactor - 0.5) * element.size,
        top: element.y + (topFactor - 0.5) * elementHeight,
        bottom: element.y + (bottomFactor - 0.5) * elementHeight,
      };
      const visualCenterX = (visualRect.left + visualRect.right) / 2;
      const visualCenterY = (visualRect.top + visualRect.bottom) / 2;
      const gapX = 0.42 + element.labelGap / EXPORT_CANONICAL_WIDTH * 100;
      const gapY = 0.42 + element.labelGap / (EXPORT_CANONICAL_WIDTH / MAP_ASPECT) * 100;
      if (element.labelLocked) {
        const normalizedOffsetX = element.labelOffsetX / EXPORT_CANONICAL_WIDTH * 100;
        const normalizedOffsetY = element.labelOffsetY / (EXPORT_CANONICAL_WIDTH / MAP_ASPECT) * 100;
        let centerX = visualCenterX + normalizedOffsetX;
        let centerY = visualCenterY + normalizedOffsetY;
        if (element.labelPosition === "top") centerY = visualRect.top - gapY - labelHeight / 2 + normalizedOffsetY;
        if (element.labelPosition === "bottom") centerY = visualRect.bottom + gapY + labelHeight / 2 + normalizedOffsetY;
        if (element.labelPosition === "left") centerX = visualRect.left - gapX - labelWidth / 2 + normalizedOffsetX;
        if (element.labelPosition === "right") centerX = visualRect.right + gapX + labelWidth / 2 + normalizedOffsetX;
        placedLabels.push({ id: element.id, category: element.category, rect: { left: centerX - labelWidth / 2, right: centerX + labelWidth / 2, top: centerY - labelHeight / 2, bottom: centerY + labelHeight / 2 } });
        return;
      }
      const isLandmark = element.category === "landmark";
      const oppositeVertical: LabelPosition = element.labelPosition === "top" ? "bottom" : "top";
      const positionOrder: LabelPosition[] = isLandmark
        ? (element.labelPosition === "top" || element.labelPosition === "bottom"
            ? [element.labelPosition, oppositeVertical, "right", "left"]
            : [element.labelPosition, "top", "bottom", element.labelPosition === "left" ? "right" : "left"])
        : [element.labelPosition, ...(["bottom", "top", "right", "left"] as LabelPosition[]).filter((position) => position !== element.labelPosition)];
      const lateralShifts = isLandmark
        ? [0, -10, 10, -20, 20, -32, 32, -46, 46, -62, 62]
        : [0, -12, 12, -24, 24, -38, 38, -54, 54, -72, 72, -92, 92];
      const outwardShifts = isLandmark
        ? [0, 10, 20, 32, 46, 62, 80]
        : [0, 10, 20, 32, 46, 62, 82, 104];
      const baseOffsetX = element.labelOffsetX;
      const baseOffsetY = element.labelOffsetY;
      let best: { rect: NormalizedRect; position: LabelPosition; offsetX: number; offsetY: number; score: number; collisions: number } | null = null;
      positionOrder.forEach((position, positionIndex) => lateralShifts.forEach((lateralShift) => outwardShifts.forEach((outwardShift) => {
        const sameSide = position === element.labelPosition;
        const positionBaseX = sameSide ? baseOffsetX : (position === "top" || position === "bottom" ? baseOffsetX : 0);
        const positionBaseY = sameSide ? baseOffsetY : (position === "left" || position === "right" ? baseOffsetY : 0);
        const offsetX = positionBaseX + (position === "top" || position === "bottom"
          ? lateralShift
          : position === "left" ? -outwardShift : outwardShift);
        const offsetY = positionBaseY + (position === "left" || position === "right"
          ? lateralShift
          : position === "top" ? -outwardShift : outwardShift);
        const normalizedOffsetX = offsetX / EXPORT_CANONICAL_WIDTH * 100;
        const normalizedOffsetY = offsetY / (EXPORT_CANONICAL_WIDTH / MAP_ASPECT) * 100;
        let centerX = visualCenterX + normalizedOffsetX;
        let centerY = visualCenterY + normalizedOffsetY;
        if (position === "top") centerY = visualRect.top - gapY - labelHeight / 2 + normalizedOffsetY;
        if (position === "bottom") centerY = visualRect.bottom + gapY + labelHeight / 2 + normalizedOffsetY;
        if (position === "left") centerX = visualRect.left - gapX - labelWidth / 2 + normalizedOffsetX;
        if (position === "right") centerX = visualRect.right + gapX + labelWidth / 2 + normalizedOffsetX;
        const rect = { left: centerX - labelWidth / 2, right: centerX + labelWidth / 2, top: centerY - labelHeight / 2, bottom: centerY + labelHeight / 2 };
        const labelOverlapCount = placedLabels.reduce((count, item) => count + (rectsOverlap(rect, item.rect, 0.22) ? 1 : 0), 0);
        const iconOverlapScore = iconRects.reduce((score, item) => {
          if (!rectsOverlap(rect, item.rect, 0.14)) return score;
          return score + (item.category === "landmark" ? 4 : item.id === element.id ? 3 : 1);
        }, 0);
        const overflow = Math.max(0, -rect.left) + Math.max(0, rect.right - 100) + Math.max(0, -rect.top) + Math.max(0, rect.bottom - 100);
        const collisions = labelOverlapCount + iconOverlapScore;
        const manualDistance = Math.abs(offsetX - baseOffsetX) + Math.abs(offsetY - baseOffsetY);
        const relationDistance = Math.hypot(offsetX, offsetY);
        const sameSidePenalty = sameSide ? 0 : (isLandmark ? 1900 + positionIndex * 900 : 160 + positionIndex * 90);
        const horizontalLandmarkPenalty = isLandmark && (position === "left" || position === "right") ? 4200 : 0;
        const distancePenalty = manualDistance * (isLandmark ? 1.6 : 0.7) + Math.max(0, relationDistance - (isLandmark ? 72 : 92)) * 40;
        const score = labelOverlapCount * 16000 + iconOverlapScore * 10000 + overflow * 5000
          + sameSidePenalty + horizontalLandmarkPenalty + distancePenalty;
        if (!best || score < best.score) best = { rect, position, offsetX, offsetY, score, collisions };
      })));
      const selectedBest = best as { rect: NormalizedRect; position: LabelPosition; offsetX: number; offsetY: number; score: number; collisions: number } | null;
      if (!selectedBest) return;
      placedLabels.push({ id: element.id, category: element.category, rect: selectedBest.rect });
      updates.set(element.id, { labelPosition: selectedBest.position, labelOffsetX: selectedBest.offsetX, labelOffsetY: selectedBest.offsetY });
    });
    replaceElements((current) => current.map((element) => updates.has(element.id) ? { ...element, ...updates.get(element.id)! } : element));
    window.setTimeout(() => resolveRenderedLabelOverlaps(updates.size, notify), 0);
  };

  function resolveRenderedLabelOverlaps(total: number, notify: boolean) {
    window.requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) {
        setLabelsRefreshing(false);
        return;
      }
      const nodes = [...stage.querySelectorAll<HTMLElement>("[data-label-id]")]
        .map((node) => {
          const id = node.dataset.labelId;
          const element = elementsRef.current.find((item) => item.id === id);
          return id && element ? { id, element, rect: node.getBoundingClientRect() } : null;
        })
        .filter((item): item is { id: string; element: MapElement; rect: DOMRect } => Boolean(item?.rect.width && item.rect.height));
      const overlaps = (a: DOMRect | NormalizedRect, b: DOMRect | NormalizedRect, margin = 4) => (
        a.left < b.right + margin && a.right > b.left - margin && a.top < b.bottom + margin && a.bottom > b.top - margin
      );
      const iconObstacles: Array<{ id: string; rect: NormalizedRect }> = [...stage.querySelectorAll<HTMLElement>(".map-element[data-element-id]")].map((node) => {
        const rect = node.querySelector<HTMLElement>(".icon-visual")?.getBoundingClientRect() ?? node.getBoundingClientRect();
        return { id: node.dataset.elementId ?? "", rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } };
      });
      let labelOverlaps = 0;
      for (let index = 0; index < nodes.length; index += 1) for (let other = index + 1; other < nodes.length; other += 1) {
        if (overlaps(nodes[index].rect, nodes[other].rect, 0)) labelOverlaps += 1;
      }
      let iconOverlaps = 0;
      nodes.forEach((item) => {
        iconObstacles.forEach((obstacle) => {
          if (overlaps(item.rect, obstacle.rect, 0)) iconOverlaps += 1;
        });
      });
      const remaining = labelOverlaps + iconOverlaps;
      if (notify) setToast(remaining
        ? `기준 방향을 유지해 라벨 ${total}개를 정리했습니다. 남은 충돌 ${remaining}건은 통합 라벨 또는 직접 조정이 필요합니다.`
        : `라벨 ${total}개를 마커 주변에서 정리했습니다. 랜드마크 기준 위치와 각 마커의 대응 관계를 유지했습니다.`);
      setLabelsRefreshing(false);
    });
  }

  const refreshLabelPositions = () => {
    if (labelsRefreshing) return;
    setLabelsRefreshing(true);
    window.requestAnimationFrame(() => {
      autoArrangeLabels(true, true);
    });
  };

  const moveLayer = (direction: "front" | "back" | "forward" | "backward") => {
    if (!selected) return;
    const zs = elementsRef.current.map((item) => item.z);
    let z = selected.z;
    if (direction === "front") z = Math.max(...zs) + 1;
    if (direction === "back") z = Math.min(...zs) - 1;
    if (direction === "forward") z += 1;
    if (direction === "backward") z -= 1;
    updateElement(selected.id, { z });
  };

  const applyGroupSize = (group: "landmark" | "marker", size: number) => {
    pushHistory();
    replaceElements((current) => current.map((item) => (
      group === "landmark" ? (item.category === "landmark" ? { ...item, size } : item) : (item.category !== "landmark" ? { ...item, size } : item)
    )));
    setToast(group === "landmark" ? `랜드마크 ${size.toFixed(1)}% 일괄 적용` : `일반 마커 ${size.toFixed(1)}% 일괄 적용`);
  };

  const applyMarkerStyle = (style: BundledMarkerStyle) => {
    pushHistory();
    setMarkerStyle(style);
    replaceElements((current) => current.map((item) => {
      const nextAssetId = defaultMarkerAssetId(item.category, style);
      return nextAssetId ? { ...item, assetId: nextAssetId, status: "review" as AssetStatus } : item;
    }));
    const styleName = style === "01" ? "기본 핀형" : style === "02" ? "아치 배지형" : "유기적 원형";
    setToast(`범용 마커를 ${style}안 ${styleName}으로 통일했습니다.`);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    pushHistory();
    const duplicate = {
      ...selected,
      id: uniqueRuntimeId("element", elementsRef.current.map((item) => item.id)),
      directoryId: undefined,
      name: `${selected.name} 복사본`,
      x: clamp(selected.x + 1.2, 0, 100),
      y: clamp(selected.y + 1.2, 0, 100),
      z: Math.max(0, ...elementsRef.current.map((item) => item.z)) + 1,
    };
    replaceElements((current) => [...current, duplicate]); setSelectedId(duplicate.id);
  };

  const deleteSelected = () => {
    if (!selected || selected.locked) return;
    pushHistory(); replaceElements((current) => current.filter((item) => item.id !== selected.id)); setSelectedId(null);
  };

  const deleteSelectedNote = () => {
    if (!selectedNote) return;
    pushHistory(); replaceNotes((current) => current.filter((note) => note.id !== selectedNote.id)); setSelectedNoteId(null);
  };

  const saveNamedLayout = () => {
    const name = window.prompt("배치안 이름을 입력하세요.", layoutName === "최근 자동복구" ? `배치안 ${new Date().toLocaleDateString("ko-KR")}` : layoutName);
    if (!name?.trim()) return;
    try {
      const layouts = JSON.parse(localStorage.getItem(LAYOUTS_KEY) ?? "{}") as Record<string, { updatedAt: string; document: DocumentState }>;
      layouts[name.trim()] = { updatedAt: new Date().toISOString(), document: cloneDocument(currentDocument()) };
      localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts));
      setLayoutName(name.trim()); setToast(`‘${name.trim()}’ 배치안을 저장했습니다.`);
    } catch { setToast("배치안을 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요."); }
  };

  const loadNamedLayout = () => {
    try {
      const layouts = JSON.parse(localStorage.getItem(LAYOUTS_KEY) ?? "{}") as Record<string, { updatedAt: string; document: DocumentState }>;
      const names = Object.keys(layouts);
      if (!names.length) { setToast("저장된 배치안이 없습니다."); return; }
      const name = window.prompt(`불러올 배치안 이름을 입력하세요.\n${names.map((item, index) => `${index + 1}. ${item}`).join("\n")}`, names[0]);
      if (!name || !layouts[name]) { if (name) setToast("해당 이름의 배치안을 찾지 못했습니다."); return; }
      pushHistory(); setDocument(layouts[name].document); setLayoutName(name); setToast(`‘${name}’ 배치안을 불러왔습니다.`);
    } catch { setToast("저장된 배치안을 읽지 못했습니다."); }
  };

  const download = (name: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const downloadBlob = (name: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const exportHighResolutionPng = async () => {
    if (exporting) return;
    setExporting(true);
    setToast(`${exportWidth.toLocaleString()}px 고화질 사본을 합성하고 있습니다.`);
    try {
      const outputHeight = Math.round(exportWidth / MAP_ASPECT);
      const canvas = document.createElement("canvas");
      canvas.width = exportWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("canvas unavailable");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.fillStyle = "#f4f2ed";
      context.fillRect(0, 0, exportWidth, outputHeight);

      const mapSrc = baseMap === "svg" ? MAP_SVG : baseMap === "png" ? MAP_PNG : `${UPLOADED_MAP_API}?v=${encodeURIComponent(uploadedBaseMap?.uploadedAt ?? "current")}`;
      const baseImage = await loadImage(mapSrc);
      context.drawImage(baseImage, 0, 0, exportWidth, outputHeight);

      const placedElements = elementsRef.current.filter((element) => element.mapVisible);
      const exportMarkerElements = placedElements.filter((element) => printPolicyFor(element).marker);
      const exportLabelElements = placedElements.filter((element) => printPolicyFor(element).label);
      if (!exportMarkerElements.length && !exportLabelElements.length) throw new Error("empty print composition");
      const labelOnlyCount = exportLabelElements.filter((element) => !exportMarkerElements.some((marker) => marker.id === element.id)).length;
      if (labelOnlyCount) setToast(`마커 없이 라벨만 출력되는 장소가 ${labelOnlyCount}곳 있습니다. 고화질 사본을 계속 합성합니다.`);
      const exportClusters = mergeDenseLabels ? buildDenseLabelClusters(exportLabelElements, exportMarkerElements, denseLabelPositionsRef.current) : [];
      const clusteredExportIds = new Set(exportClusters.flatMap((cluster) => cluster.elementIds));
      const assetSources = [...new Set(exportMarkerElements.map((element) => assetsRef.current.find((asset) => asset.id === element.assetId)?.src).filter(Boolean) as string[])];
      const loadedAssets = new Map<string, HTMLImageElement>();
      await Promise.all(assetSources.map(async (src) => {
        try { loadedAssets.set(src, await loadImage(src)); } catch { /* 개별 자산 실패는 나머지 합성을 막지 않습니다. */ }
      }));
      const ordered = [...exportMarkerElements].sort((a, b) => a.z - b.z);
      ordered.forEach((element) => {
        const asset = assetsRef.current.find((item) => item.id === element.assetId);
        const image = asset ? loadedAssets.get(asset.src) : undefined;
        if (!image) return;
        const boxWidth = exportWidth * element.size / 100;
        const boxHeight = boxWidth / 1.12;
        const centerX = exportWidth * element.x / 100;
        const centerY = outputHeight * element.y / 100;
        const fit = Math.min(boxWidth / image.naturalWidth, boxHeight / image.naturalHeight);
        const drawWidth = image.naturalWidth * fit;
        const drawHeight = image.naturalHeight * fit;
        context.save();
        context.globalAlpha = element.opacity / 100;
        context.shadowColor = "rgba(30,43,39,.13)";
        context.shadowBlur = exportWidth / EXPORT_CANONICAL_WIDTH * 2;
        context.shadowOffsetY = exportWidth / EXPORT_CANONICAL_WIDTH * 2;
        context.drawImage(image, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight);
        context.restore();
      });

      if (exportClusters.length) {
        context.save();
        context.strokeStyle = "rgba(47,117,107,.45)";
        context.fillStyle = "rgba(47,117,107,.72)";
        context.lineWidth = Math.max(1, exportWidth / EXPORT_CANONICAL_WIDTH * 1.1);
        context.setLineDash([exportWidth / EXPORT_CANONICAL_WIDTH * 3.5, exportWidth / EXPORT_CANONICAL_WIDTH * 2.5]);
        exportClusters.forEach((cluster) => cluster.elementIds.forEach((elementId) => {
          const element = placedElements.find((item) => item.id === elementId);
          if (!element) return;
          const fromX = exportWidth * element.x / 100;
          const fromY = outputHeight * element.y / 100;
          const toX = exportWidth * cluster.x / 100;
          const toY = outputHeight * cluster.y / 100;
          context.beginPath();
          context.moveTo(fromX, fromY);
          context.lineTo(toX, toY);
          context.stroke();
          context.beginPath();
          context.arc(fromX, fromY, Math.max(1.2, exportWidth / EXPORT_CANONICAL_WIDTH * 1.5), 0, Math.PI * 2);
          context.fill();
        }));
        context.restore();
      }

      const drawLabels = (items: MapElement[]) => items.forEach((element) => {
        if (clusteredExportIds.has(element.id)) return;
        const fontSize = exportWidth / EXPORT_CANONICAL_WIDTH * 10;
        const paddingX = exportWidth / EXPORT_CANONICAL_WIDTH * 4;
        const paddingY = exportWidth / EXPORT_CANONICAL_WIDTH * 2.5;
        const gap = exportWidth / EXPORT_CANONICAL_WIDTH * element.labelGap;
        const offsetX = exportWidth / EXPORT_CANONICAL_WIDTH * element.labelOffsetX;
        const offsetY = exportWidth / EXPORT_CANONICAL_WIDTH * element.labelOffsetY;
        const centerX = exportWidth * element.x / 100;
        const centerY = outputHeight * element.y / 100;
        const boxWidth = exportWidth * element.size / 100;
        const boxHeight = boxWidth / 1.12;
        context.save();
        context.globalAlpha = element.opacity / 100;
        context.font = `700 ${fontSize}px Arial, "Noto Sans KR", sans-serif`;
        context.textBaseline = "middle";
        const metrics = context.measureText(element.name);
        const labelWidth = metrics.width + paddingX * 2;
        const labelHeight = fontSize * 1.25 + paddingY * 2;
        let x = centerX + offsetX;
        let y = centerY + offsetY;
        if (element.labelPosition === "top") y -= boxHeight / 2 + gap + labelHeight / 2;
        if (element.labelPosition === "bottom") y += boxHeight / 2 + gap + labelHeight / 2;
        if (element.labelPosition === "left") x -= boxWidth / 2 + gap + labelWidth / 2;
        if (element.labelPosition === "right") x += boxWidth / 2 + gap + labelWidth / 2;
        context.fillStyle = "rgba(255,255,255,.95)";
        context.strokeStyle = "rgba(91,106,101,.24)";
        context.lineWidth = Math.max(1, exportWidth / EXPORT_CANONICAL_WIDTH);
        context.beginPath();
        context.roundRect(x - labelWidth / 2, y - labelHeight / 2, labelWidth, labelHeight, exportWidth / EXPORT_CANONICAL_WIDTH * 3);
        context.fill();
        context.stroke();
        context.fillStyle = "#26332f";
        context.textAlign = "center";
        context.fillText(element.name, x, y + fontSize * 0.02);
        context.restore();
      });
      drawLabels(exportLabelElements.filter((element) => element.category !== "landmark"));
      drawLabels(exportLabelElements.filter((element) => element.category === "landmark"));

      exportClusters.forEach((cluster) => {
        const scale = exportWidth / EXPORT_CANONICAL_WIDTH;
        const fontSize = scale * 9.5;
        const smallSize = scale * 7;
        const paddingX = scale * 7;
        const paddingY = scale * 5;
        const maxCharacters = 24;
        const lines: string[] = [];
        cluster.names.forEach((name) => {
          const last = lines.at(-1);
          if (last && `${last} · ${name}`.length <= maxCharacters) lines[lines.length - 1] = `${last} · ${name}`;
          else lines.push(name);
        });
        const displayLines = lines.slice(0, 4);
        if (lines.length > 4) displayLines[3] = `외 ${Math.max(1, cluster.names.length - 3)}곳`;
        context.save();
        context.font = `700 ${fontSize}px Arial, "Noto Sans KR", sans-serif`;
        const labelWidth = Math.max(...displayLines.map((line) => context.measureText(line).width), scale * 58) + paddingX * 2;
        const labelHeight = paddingY * 2 + smallSize * 1.2 + displayLines.length * fontSize * 1.28;
        const x = exportWidth * cluster.x / 100;
        const y = outputHeight * cluster.y / 100;
        context.fillStyle = "rgba(248,253,251,.97)";
        context.strokeStyle = "rgba(47,124,113,.42)";
        context.lineWidth = Math.max(1, scale * 1.2);
        context.beginPath();
        context.roundRect(x - labelWidth / 2, y - labelHeight / 2, labelWidth, labelHeight, scale * 5);
        context.fill();
        context.stroke();
        context.fillStyle = "#2d756b";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = `800 ${smallSize}px Arial, "Noto Sans KR", sans-serif`;
        context.fillText(`${cluster.names.length}곳`, x, y - labelHeight / 2 + paddingY + smallSize / 2);
        context.fillStyle = "#26332f";
        context.font = `700 ${fontSize}px Arial, "Noto Sans KR", sans-serif`;
        displayLines.forEach((line, index) => context.fillText(line, x, y - labelHeight / 2 + paddingY + smallSize * 1.4 + fontSize * (index + 0.68) * 1.28));
        context.restore();
      });

      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("png encoding failed")), "image/png"));
      const sizeMb = blob.size / 1024 / 1024;
      downloadBlob(`제주원도심_${printRecommendedOnly ? "추천장소" : "전체배치"}_고화질_${exportWidth}px.png`, blob);
      setToast(`고화질 PNG 사본을 만들었습니다 · ${exportWidth.toLocaleString()}×${outputHeight.toLocaleString()}px · ${sizeMb.toFixed(1)}MB`);
    } catch {
      setToast("고화질 사본 생성에 실패했습니다. 8,944px로 낮추거나 업로드 지도 상태를 확인해 주세요.");
    } finally {
      setExporting(false);
    }
  };

  const exportJson = () => {
    const payload = {
      schemaVersion: 6, exportedAt: new Date().toISOString(), map: { baseMap, aspect: MAP_ASPECT, coordinateSystem: "normalized-percent", calibration: "six-point-distance-weighted", landmarkDefaults: "user-editable", denseLabelPositions: "user-editable" },
      ...cloneDocument(currentDocument()),
    };
    download(`제주원도심_배치안_${layoutName.replaceAll(" ", "_")}.json`, JSON.stringify(payload, null, 2), "application/json");
    setToast("현재 배치 상태를 JSON으로 내보냈습니다.");
  };

  const importJson = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<DocumentState>;
        if (!Array.isArray(parsed.elements)) throw new Error("invalid");
        pushHistory();
        setDocument({
          elements: parsed.elements.map((item) => ({ ...elementDefaults, ...item })) as MapElement[],
          assets: [
            ...builtInAssets,
            ...(Array.isArray(parsed.assets) ? parsed.assets.filter((item) => !builtInAssets.some((builtIn) => builtIn.id === item.id)) : []),
          ],
          reviewNotes: Array.isArray(parsed.reviewNotes) ? parsed.reviewNotes : [],
          directoryPlaces: Array.isArray(parsed.directoryPlaces) ? parsed.directoryPlaces : defaultDirectoryPlaces,
          calibrationPoints: Array.isArray(parsed.calibrationPoints) ? parsed.calibrationPoints : initialCalibrationPoints,
          landmarkDefaultPositions: Array.isArray(parsed.landmarkDefaultPositions) ? parsed.landmarkDefaultPositions : factoryLandmarkDefaultPositions,
          denseLabelPositions: Array.isArray(parsed.denseLabelPositions) ? parsed.denseLabelPositions : [],
        });
        setLayoutName(file.name.replace(/\.json$/i, "")); setToast("JSON 배치안을 불러왔습니다. 삭제 대상 장소는 자동 제외됩니다.");
      } catch { setToast("지원하지 않거나 손상된 JSON 파일입니다."); }
    };
    reader.readAsText(file); event.target.value = "";
  };

  const exportNotesJson = () => download("제주원도심_골목검토메모.json", JSON.stringify({ exportedAt: new Date().toISOString(), reviewNotes }, null, 2), "application/json");
  const exportNotesCsv = () => {
    const rows = [["메모 ID", "상태", "X(%)", "Y(%)", "내용"], ...reviewNotes.map((note) => [note.id, reviewStatusText[note.status], note.x.toFixed(3), note.y.toFixed(3), note.text])];
    download("제주원도심_골목검토메모.csv", `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`, "text/csv;charset=utf-8");
  };

  const stageMapClass = viewMode === "dim" ? "map-dim" : viewMode === "gray" ? "map-gray" : viewMode === "nomap" ? "map-hidden" : "";
  const activeBaseMapSrc = baseMap === "svg" ? MAP_SVG : baseMap === "png" ? MAP_PNG : `${UPLOADED_MAP_API}?v=${encodeURIComponent(uploadedBaseMap?.uploadedAt ?? "current")}`;
  const activeBaseMapLabel = baseMap === "uploaded" ? uploadedBaseMap?.name ?? "업로드 지도" : "v15 · 골목추가정리 검수본";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block"><div className="brand-mark">W</div><div><strong>원도심 지도 배치 검수</strong><span>제주문화예술재단 · 내부 디자인 도구</span></div></div>
        <div className="toolbar-group muted-actions">
          <button onClick={saveNamedLayout}>저장</button><button onClick={loadNamedLayout}>불러오기</button>
          <span className="toolbar-separator" />
          <button onClick={undo} disabled={!undoStack.length} aria-label="실행 취소">↶</button>
          <button onClick={redo} disabled={!redoStack.length} aria-label="다시 실행">↷</button>
          <button className={calibrationMode ? "active-tool" : ""} onClick={() => switchLeftPanel(calibrationMode ? "assets" : "calibration")}>◎ 기준점 보정</button>
        </div>
        <div className="toolbar-group zoom-tools">
          <button onClick={() => setZoom((value) => clamp(value / 1.16, 0.22, 4))} aria-label="축소">−</button><output>{Math.round(zoom * 100)}%</output>
          <button onClick={() => setZoom((value) => clamp(value * 1.16, 0.22, 4))} aria-label="확대">＋</button><button onClick={() => { setZoom(0.72); setPan({ x: 0, y: 0 }); }}>맞춤</button>
        </div>
        <div className="toolbar-group export-tools"><select value={exportWidth} onChange={(event) => setExportWidth(Number(event.target.value) as 8944 | 12000)} aria-label="고화질 사본 가로 크기"><option value="12000">12K PNG</option><option value="8944">원본 8.9K</option></select><button className="primary-export" disabled={exporting} onClick={() => void exportHighResolutionPng()}>{exporting ? "합성 중…" : "고화질 사본 ↓"}</button></div>
        <div className="toolbar-group muted-actions"><button onClick={exportJson}>JSON ↓</button><button onClick={() => jsonInputRef.current?.click()}>JSON ↑</button><input ref={jsonInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importJson} /></div>
      </header>

      <section className={`workspace ${leftOpen ? "" : "left-closed"} ${rightOpen ? "" : "right-closed"} ${leftPanelMode === "calibration" && leftOpen ? "calibration-open" : ""}`}>
        <aside ref={leftPanelRef} className="panel asset-panel" aria-label="자산 목록">
          <div className="panel-heading"><div><strong>{leftPanelMode === "assets" ? "자산" : leftPanelMode === "places" ? "장소 탐색" : "좌표 기준점"}</strong><span>{leftPanelMode === "assets" ? `${layoutName} · ${elements.filter((element) => element.mapVisible).length}개 배치` : leftPanelMode === "places" ? `통합 목록 ${allUnifiedPlaceRows.length}곳 · 배치/미배치 관리` : `기준점 ${calibrationPoints.length}곳 · 실시간 보정`}</span></div><button className="icon-button" onClick={() => setLeftOpen(false)} aria-label="왼쪽 패널 접기">‹</button></div>
          <div className="panel-tabs" role="tablist" aria-label="왼쪽 패널 내용">
            <button className={leftPanelMode === "assets" ? "active" : ""} onClick={() => switchLeftPanel("assets")} role="tab" aria-selected={leftPanelMode === "assets"}>아이콘·마커</button>
            <button className={leftPanelMode === "places" ? "active" : ""} onClick={() => switchLeftPanel("places")} role="tab" aria-selected={leftPanelMode === "places"}>장소 탐색 <span>{allUnifiedPlaceRows.length}</span></button>
            <button className={leftPanelMode === "calibration" ? "active" : ""} onClick={() => switchLeftPanel("calibration")} role="tab" aria-selected={leftPanelMode === "calibration"}>좌표 보정 <span>6</span></button>
          </div>
          {leftPanelMode === "assets" ? <>
          <div className="panel-search">아이콘·마커 보기 및 자산 <kbd>{assets.length}</kbd></div>
          <section className="view-control-panel" aria-label="지도 보기 설정">
            <div className="view-control-head"><strong>지도 전체 조절</strong><span>{screenRecommendedOnly ? `비추천 ${screenHiddenMarkerCount}곳 숨김` : "화면 전용"}</span></div>
            <div className="view-mode-grid" role="group" aria-label="표시 요소">
              {([ ["all", "전체"], ["landmarks", "랜드마크"], ["markers", "일반마커"], ["labels", "라벨만"] ] as const).map(([mode, label]) => <button key={mode} className={viewMode === mode ? "active" : ""} onClick={() => setViewMode(mode)}>{label}</button>)}
            </div>
            <div className="view-toggle-list">
              <label className={screenRecommendedOnly ? "active" : ""}><input type="checkbox" checked={screenRecommendedOnly} onChange={(event) => setScreenRecommendedOnly(event.target.checked)} /><span><b>추천 장소만 보기</b><small>랜드마크와 추천 일반 마커만 임시 표시 · 배치와 출력 설정은 유지</small></span></label>
              <label><input type="checkbox" checked={markerLabelsVisible} onChange={(event) => setMarkerLabelsVisible(event.target.checked)} /><span><b>마커 라벨 전체</b><small>일반 마커 라벨을 한 번에 ON/OFF</small></span></label>
              <label><input type="checkbox" checked={mergeDenseLabels} onChange={(event) => setMergeDenseLabels(event.target.checked)} /><span><b>밀집 라벨 자동 통합</b><small>고정 라벨도 묶어 표시 · 지도에서 통합 라벨을 직접 드래그</small></span></label>
            </div>
            {selectedDenseLabel && <div className={`dense-label-control ${selectedDenseLabel.hasCollision ? "collision" : ""}`}>
              <span><b>선택 라벨 · {selectedDenseLabel.names.length}곳</b><small>{selectedDenseLabel.manuallyPositioned ? "직접 지정한 위치를 화면·출력에 적용" : "겹침을 피한 자동 위치"}{selectedDenseLabel.hasCollision ? " · 겹침 확인 필요" : ""}</small></span>
              <button type="button" disabled={!selectedDenseLabel.manuallyPositioned} onClick={() => { pushHistory(); resetDenseLabelPosition(selectedDenseLabel.id); setToast("통합 라벨을 자동 위치로 되돌렸습니다."); }}>자동 위치</button>
            </div>}
            {denseLabelCollisionCount > 0 && <p className="dense-label-warning">통합 라벨 {denseLabelCollisionCount}개가 이미지 또는 다른 라벨과 겹칩니다. 지도에서 직접 옮긴 뒤 출력해 주세요.</p>}
            <label className="view-detail-select">검수·지도 효과<select value={(["anchors", "clearance", "collisions", "dim", "gray", "nomap"] as ViewMode[]).includes(viewMode) ? viewMode : "all"} onChange={(event) => setViewMode(event.target.value as ViewMode)}>
              <option value="all">효과 없음</option><option value="anchors">앵커·연결선</option><option value="clearance">아이콘 여유 구역</option><option value="collisions">충돌 검사</option><option value="dim">베이스맵 명도 낮추기</option><option value="gray">베이스맵 흑백</option><option value="nomap">지도 없이 보기</option>
            </select></label>
          </section>
          <section className="marker-visibility-panel placed-marker-panel" aria-label="배치된 마커 목록과 라벨 조절">
            <div className="placed-marker-heading">
              <div><strong>배치된 마커 목록</strong><span>라벨 {placedLabelCount}/{elements.filter((element) => element.mapVisible).length} ON</span></div>
              <button type="button" onClick={() => void refreshLabelPositions()} disabled={labelsRefreshing} title="각 마커와의 대응 관계 및 랜드마크의 현재 위·아래 기준을 우선해 정리">{labelsRefreshing ? "정리 중" : "위치 정리"}</button>
            </div>
            <div className="placed-label-bulk" role="group" aria-label="배치 라벨 일괄 조절">
              <button type="button" onClick={() => setPlacedLabelsVisibility(true)}>전체 라벨 ON</button>
              <button type="button" onClick={() => setPlacedLabelsVisibility(false)}>전체 라벨 OFF</button>
              <button type="button" onClick={() => setPlacedLabelsVisibility(true, "landmark")}>랜드마크 ON</button>
              <button type="button" onClick={() => setPlacedLabelsVisibility(true, "marker")}>일반마커 ON</button>
            </div>
            <div className="placed-marker-search">
              <input value={placedMarkerQuery} onChange={(event) => setPlacedMarkerQuery(event.target.value)} placeholder="배치 마커 검색" aria-label="배치 마커 검색" />
              {placedMarkerQuery && <button type="button" onClick={() => setPlacedMarkerQuery("")} aria-label="배치 마커 검색어 지우기">×</button>}
            </div>
            <div className="marker-visibility-list placed-marker-list" role="list" aria-label="현재 지도에 배치된 마커">
              {placedMarkerGroups.map(({ category, elements: groupElements }) => {
                const expanded = Boolean(placedMarkerQuery.trim()) || expandedPlacedMarkerGroups[category.id];
                const labelCount = groupElements.filter((element) => element.labelVisible).length;
                return <section key={category.id} className={`marker-visibility-group ${expanded ? "expanded" : "collapsed"}`}>
                  <button type="button" className="marker-visibility-group-toggle" aria-expanded={expanded} aria-controls={`placed-marker-group-${category.id}`} onClick={() => setExpandedPlacedMarkerGroups((current) => ({ ...current, [category.id]: !current[category.id] }))}>
                    <span className="marker-folder-icon" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                    <i style={{ background: category.color }} />
                    <strong>{category.name}</strong>
                    <span className="marker-group-count">라벨 {labelCount}/{groupElements.length}</span>
                  </button>
                  {expanded && <div id={`placed-marker-group-${category.id}`} className="marker-visibility-group-items">
                    {groupElements.map((element) => <div key={element.id} className={`placed-marker-row ${selectedId === element.id ? "selected" : ""}`} role="listitem">
                      <button type="button" className="placed-marker-focus" onClick={() => selectPlacedElement(element)} title={`${element.name} 지도 위치로 이동`}>
                        <i style={{ background: category.color }} />
                        <span><b>{element.name}</b><small>{element.locked ? "좌표 고정" : "좌표 미고정"}</small></span>
                      </button>
                      <label className={`placed-label-toggle ${element.labelVisible ? "active" : ""}`} title={`${element.name} 라벨 ${element.labelVisible ? "숨기기" : "표시"}`}>
                        <input type="checkbox" checked={element.labelVisible} onChange={(event) => setPlacedElementLabelVisibility(element, event.target.checked)} />
                        <span>{element.labelVisible ? "라벨 ON" : "라벨 OFF"}</span>
                      </label>
                    </div>)}
                  </div>}
                </section>;
              })}
              {!placedMarkerElements.length && <div className="place-empty">배치된 마커가 없거나 검색 결과가 없습니다.</div>}
            </div>
            <p>장소명을 누르면 지도 위치와 우측 편집창이 열립니다. 개별 라벨 설정은 자동 저장됩니다.</p>
          </section>
          <section className="print-output-panel" aria-label="고화질 출력 구성">
            <div className="view-control-head"><strong>담당자 제출용 고화질 출력</strong><span>추천 {recommendedPlaceCount}곳</span></div>
            <label className="print-recommended-toggle"><input type="checkbox" checked={printRecommendedOnly} onChange={(event) => setPrintRecommendedOnly(event.target.checked)} /><span><b>추천 장소 중심 출력</b><small>랜드마크는 기본 포함, 일반 마커는 추천 장소만</small></span></label>
            <div className="print-layer-grid">
              <label><input type="checkbox" checked={printLandmarks} onChange={(event) => setPrintLandmarks(event.target.checked)} />랜드마크</label>
              <label><input type="checkbox" checked={printMarkers} onChange={(event) => setPrintMarkers(event.target.checked)} />마커</label>
              <label><input type="checkbox" checked={printLabels} onChange={(event) => setPrintLabels(event.target.checked)} />라벨</label>
            </div>
            <p>장소 탐색 목록의 별표로 추천을 지정하고, 우측 속성에서 마커·라벨을 개별 포함/제외할 수 있습니다. 통합 라벨도 출력 이미지에 그대로 반영됩니다.</p>
            <div className="print-storage-status">{printSettingsStorage === "persistent" ? "추천 설정 영구 저장" : printSettingsStorage === "loading" ? "추천 설정 확인 중" : "추천 설정 기기 저장"}{!printSettingsCanEdit && <a href="/signin-with-chatgpt?return_to=/">소유자 로그인</a>}</div>
          </section>
          <div className="category-filter">
            <button className={activeCategory === "all" ? "active" : ""} onClick={() => setActiveCategory("all")}><span className="category-dot all-dot" /> 전체 자산 <em>{elements.length}</em></button>
            {categories.map((category) => <button key={category.id} className={activeCategory === category.id ? "active" : ""} onClick={() => setActiveCategory(category.id)}><span className="category-dot" style={{ background: category.color }} /> {category.name}<em>{elements.filter((item) => item.category === category.id).length}</em></button>)}
          </div>
          <div className="asset-upload"><div className="asset-upload-row">
            <select aria-label="업로드 자산 카테고리" value={assetCategory} onChange={(event) => setAssetCategory(event.target.value as CategoryId)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            <select aria-label="업로드 자산 검수 상태" value={assetStatus} onChange={(event) => setAssetStatus(event.target.value as AssetStatus)}><option value="approved">승인 완료</option><option value="review">검수 중</option><option value="unchecked">미검수</option></select>
          </div><button className="upload-button" onClick={() => fileInputRef.current?.click()}>PNG·SVG 자산 불러오기</button><input ref={fileInputRef} className="visually-hidden" type="file" accept="image/png,image/webp,image/svg+xml,.svg" multiple onChange={uploadAsset} /></div>
          <div className="asset-list-header"><span>프로젝트 자산</span><small>후보 클릭으로 적용·교체</small></div>
          <div className="asset-grid compact-assets">
            <div className="landmark-resource-heading"><strong>랜드마크 후보 리소스</strong><small>한 장소에서 여러 안을 선택할 수 있습니다.</small></div>
            {landmarkAssetGroups.map(({ placeName, candidates }) => {
              const activeAssetId = elements.find((element) => normalizePlaceName(element.name) === normalizePlaceName(placeName))?.assetId;
              return <article className="landmark-resource-group" key={placeName}>
                <div><strong>{placeName}</strong><small>{candidates.length}개 후보 · 1024px</small></div>
                <div className="landmark-candidate-row">{candidates.map((asset) => <button key={asset.id} className={activeAssetId === asset.id ? "active" : ""} onClick={() => applyLandmarkCandidate(asset)} title={`${placeName} ${asset.name}`}><img src={asset.src} alt="" /><span>{asset.name}</span></button>)}</div>
              </article>;
            })}
            {!!customLandmarkAssets.length && <><div className="landmark-resource-heading"><strong>사용자 랜드마크</strong></div>{customLandmarkAssets.map((asset) => <button key={asset.id} className="asset-card uploaded" onClick={() => addAssetElement(asset)}><span className="asset-preview image-preview"><img src={asset.src} alt="" /></span><span><strong>{asset.name}</strong><small>{statusText[asset.status]} · 사용자 자산</small></span><i>＋</i></button>)}</>}
            <div className="landmark-resource-heading"><strong>문화시설·카페·음식점·소품샵·주차장·편의시설</strong><small>모든 범용 마커를 SVG로 구성해 확대·출력 시 선명합니다.</small></div>
            {generalMarkerAssets.map((asset) => <button key={asset.id} className="asset-card uploaded" onClick={() => addAssetElement(asset)}><span className="asset-preview image-preview"><img src={asset.src} alt="" /></span><span><strong>{asset.name}</strong><small>{statusText[asset.status]} · {asset.fileType.toUpperCase()}</small></span><i>＋</i></button>)}
          </div>
          <div className="group-size-panel">
            <div className="marker-style-panel">
              <div className="review-list-head"><strong>범용 마커 스타일</strong><span>검수 중</span></div>
              <div className="marker-style-options" role="group" aria-label="범용 마커 스타일 일괄 적용">
                {([
                  ["01", "기본 핀형"],
                  ["02", "아치 배지형"],
                  ["03", "유기적 원형"],
                ] as const).map(([style, label]) => <button key={style} className={markerStyle === style ? "active" : ""} onClick={() => applyMarkerStyle(style)}><img src={`/markers/범용마커_${style}_culture.svg`} alt="" /><span><b>{style}안</b><small>{label}</small></span></button>)}
              </div>
              <p className="marker-style-help">문화시설·카페·음식점·소품샵·주차장·공원·편의시설에 같은 시안을 일괄 적용합니다. 01안은 제작 기준상 우선 추천안이며 아직 최종 승인 전입니다.</p>
            </div>
            <div className="review-list-head"><strong>종류별 크기 일괄 조절</strong><span>%</span></div>
            <div className="group-size-row"><label>랜드마크<input type="number" min="0.8" max="15" step="0.1" value={landmarkGroupSize} onChange={(event) => setLandmarkGroupSize(clamp(Number(event.target.value), 0.8, 15))} /></label><button onClick={() => applyGroupSize("landmark", landmarkGroupSize)}>전체 적용</button></div>
            <div className="group-size-row"><label>일반 마커<input type="number" min="0.8" max="15" step="0.1" value={markerGroupSize} onChange={(event) => setMarkerGroupSize(clamp(Number(event.target.value), 0.8, 15))} /></label><button onClick={() => applyGroupSize("marker", markerGroupSize)}>전체 적용</button></div>
            <div className="landmark-default-actions">
              <button onClick={saveAllLandmarksAsDefault}>현재 앵커를 기본 위치로 저장</button>
              <button className="landmark-reset" onClick={resetLandmarkPositions}>↺ 저장된 기본 위치로 초기화</button>
            </div>
          </div>
          </> : leftPanelMode === "places" ? <div className="place-directory">
            <div className="composition-helper">
              <div className="composition-head"><div><strong>지도 구성 도우미</strong><span>핵심 구성은 기본 적용되어 있으며 개별 편집할 수 있습니다.</span></div><b>{elements.length}개 배치</b></div>
              <div className="composition-counts" aria-label="현재 구성요소 수">
                <span><i style={{ background: categoryOf("landmark").color }} />랜드마크 <b>{placedCategoryCounts.landmark}</b></span>
                <span><i style={{ background: categoryOf("culture").color }} />문화 <b>{placedCategoryCounts.culture}</b></span>
                <span><i style={{ background: categoryOf("cafe").color }} />카페 <b>{placedCategoryCounts.cafe}</b></span>
                <span><i style={{ background: categoryOf("food").color }} />음식 <b>{placedCategoryCounts.food}</b></span>
                <span><i style={{ background: categoryOf("shop").color }} />소품샵 <b>{placedCategoryCounts.shop}</b></span>
                <span><i style={{ background: categoryOf("parking").color }} />주차 <b>{placedCategoryCounts.parking}</b></span>
                <span><i style={{ background: categoryOf("utility").color }} />편의 <b>{placedCategoryCounts.utility}</b></span>
              </div>
              <div className="composition-actions"><button onClick={applyStarterComposition}>기본 구성 복원</button><button onClick={alignPlacedMarkersByAddress} disabled={geocodeProgress.active}>{geocodeProgress.active ? "주소 확인 중" : "배치 장소 주소로 정렬"}</button></div>
              <p>주소 정렬은 일반 마커의 앵커를 갱신하고 기존 리소스 오프셋을 유지합니다. 이후 속성 패널의 앵커·출력 오프셋 값으로 세부 보정할 수 있습니다.</p>
            </div>
            <div className="database-import">
              <div><strong>통합 장소 DB</strong><span>{placeDirectoryStorage === "persistent" ? "영구 DB" : placeDirectoryStorage === "bundled" ? "기본 DB" : "확인 중"} · {allUnifiedPlaceRows.length}곳</span></div>
              <div className="database-action-grid">
                {placeDirectoryCanEdit
                  ? <button className="primary" onClick={openDatabaseEditor}>DB 직접 편집</button>
                  : <a href="/signin-with-chatgpt?return_to=/">소유자 로그인</a>}
                <button onClick={() => dbInputRef.current?.click()} disabled={geocodeProgress.active}>{geocodeProgress.active ? "주소 찾는 중" : "JSON 불러오기"}</button>
              </div>
              <input ref={dbInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importMasterDatabase} />
              {geocodeProgress.total > 0 && <div className="geocode-progress"><span style={{ width: `${(geocodeProgress.done / geocodeProgress.total) * 100}%` }} /><small>{geocodeProgress.done}/{geocodeProgress.total} · 반영 {geocodeProgress.found} · 미확정 {geocodeProgress.failed}</small></div>}
              <p>직접 편집은 장소 정보 원본을 영구 저장합니다. 좌표·고정·라벨·자산 배치는 별도 상태로 보존됩니다. JSON 업로드 후 주소 확인은 이 브라우저에서 진행됩니다.</p>
            </div>
            <div className="place-search-wrap"><input value={placeQuery} onChange={(event) => setPlaceQuery(event.target.value)} placeholder="장소명·주소·권역 검색" aria-label="장소 검색" />{placeQuery && <button onClick={() => setPlaceQuery("")} aria-label="검색어 지우기">×</button>}</div>
            <div className="place-filter" role="group" aria-label="장소 분류">
              {([
                ["all", "전체"], ["landmark", "랜드마크"], ["culture", "문화시설"], ["cafe", "카페"], ["food", "음식점"], ["shop", "소품샵"], ["parking", "주차장"], ["park", "공원"], ["utility", "편의시설"],
              ] as const).map(([id, label]) => <button key={id} className={placeCategory === id ? "active" : ""} onClick={() => setPlaceCategory(id)}>{label}<span>{id === "all" ? allUnifiedPlaceRows.length : allUnifiedPlaceRows.filter((row) => row.category === id).length}</span></button>)}
            </div>
            <div className="coordinate-lock-filter" role="group" aria-label="좌표 고정 상태 필터">
              <button className={coordinateLockFilter === "all" ? "active" : ""} onClick={() => setCoordinateLockFilter("all")}>전체 <span>{searchedUnifiedPlaceRows.length}</span></button>
              <button className={`unlocked ${coordinateLockFilter === "unlocked" ? "active" : ""}`} onClick={() => setCoordinateLockFilter("unlocked")}>좌표 미고정 <span>{coordinateLockCounts.unlocked}</span></button>
              <button className={coordinateLockFilter === "locked" ? "active" : ""} onClick={() => setCoordinateLockFilter("locked")}>좌표 고정 <span>{coordinateLockCounts.locked}</span></button>
            </div>
            <div className="marker-visibility-panel unified-place-panel">
              <div className="review-list-head"><strong>배치 목록</strong><span>미고정 {coordinateLockCounts.unlocked} · 고정 {coordinateLockCounts.locked}</span></div>
              <p>체크 상태는 배치/미배치만 사용합니다. 미배치로 바꿔도 좌표와 편집 정보는 보존됩니다.</p>
              <div className="marker-visibility-list unified-place-list" role="list" aria-label="통합 장소 배치 목록">
                {unifiedPlaceGroups.map(({ category, rows }) => {
                  const placedCount = rows.filter((row) => row.element?.mapVisible).length;
                  const expanded = Boolean(placeQuery.trim()) || expandedVisibilityGroups[category.id];
                  return <section key={category.id} className={`marker-visibility-group ${expanded ? "expanded" : "collapsed"}`}>
                    <button type="button" className="marker-visibility-group-toggle" aria-expanded={expanded} aria-controls={`place-group-${category.id}`} onClick={() => setExpandedVisibilityGroups((current) => ({ ...current, [category.id]: !current[category.id] }))}>
                      <span className="marker-folder-icon" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                      <i style={{ background: category.color }} />
                      <strong>{category.name}</strong>
                      <span className="marker-group-count">{placedCount}/{rows.length}</span>
                    </button>
                    {expanded && <div id={`place-group-${category.id}`} className="marker-visibility-group-items">
                      {rows.map((row) => {
                        const placed = Boolean(row.element?.mapVisible);
                        const hasCoordinateState = Boolean(row.element);
                        const printTarget = row.element ?? { directoryId: row.place?.id ?? row.id, category: row.category, name: row.name };
                        const explicitPrintSetting = printSettingsByKey.get(printSettingKey(printTarget));
                        const recommended = row.category === "landmark" || explicitPrintSetting?.recommended === true || (!explicitPrintSetting && /추천|우선/.test(row.place?.priority ?? ""));
                        return <div key={row.id} className={`marker-visibility-row unified-place-row ${placed ? "visible" : "hidden"} ${hasCoordinateState && !row.element?.locked ? "coordinate-unlocked" : ""}`} role="listitem">
                          <label title={`${row.name} ${placed ? "미배치" : "배치"}로 변경`}>
                            <input type="checkbox" checked={placed} onChange={(event) => setUnifiedPlacePlacement(row, event.target.checked)} />
                            <i style={{ background: category.color }} />
                            <span><b>{row.name}</b><small>{placed ? "배치" : "미배치"}{hasCoordinateState && <em className={row.element?.locked ? "locked" : "unlocked"}>{row.element?.locked ? "좌표 고정" : "좌표 미고정"}</em>}</small></span>
                          </label>
                          <button className={`recommend-toggle ${recommended ? "active" : ""}`} disabled={row.category === "landmark" || !printSettingsCanEdit} onClick={() => void savePrintSetting(printTarget, { recommended: !recommended })} aria-label={`${row.name} ${recommended ? "추천 해제" : "출력 추천"}`} title={row.category === "landmark" ? "랜드마크는 출력 기본 포함" : recommended ? "출력 추천 해제" : "고화질 출력 추천 장소로 지정"}>{recommended ? "★" : "☆"}</button>
                          <button onClick={() => selectUnifiedPlace(row)} aria-label={`${row.name} ${placed ? "선택" : "배치"}`}>{placed ? "선택" : "배치"}</button>
                        </div>;
                      })}
                    </div>}
                  </section>;
                })}
                {!unifiedPlaceRows.length && <div className="place-empty">조건에 맞는 장소가 없습니다.</div>}
              </div>
            </div>
          </div> : <div className="calibration-panel">
            <div className="calibration-summary">
              <div><strong>계층형 좌표 보정망</strong><span>1차 6점 + 2차 {secondaryCalibrationPoints.length}점 + 고정 좌표 3차 {tertiaryCalibrationPoints.length}점 · {calibrationLiveApply ? "기준 변경을 주변 미고정 장소에 실시간 반영합니다." : "기준값을 맞춘 뒤 보정 버튼으로 전체에 적용합니다."}</span></div>
              <label className="switch" title="기존 기준 위치 표시"><input type="checkbox" checked={showCalibrationSource} onChange={(event) => setShowCalibrationSource(event.target.checked)} /><span /></label>
            </div>
            <label className="calibration-live-toggle"><input type="checkbox" checked={calibrationLiveApply} onChange={(event) => { setCalibrationLiveApply(event.target.checked); if (event.target.checked && calibrationDirty) applyCalibrationToAll(); }} /><span><b>실시간 보정</b><small>끄면 기준점만 옮기고 버튼으로 일괄 적용</small></span></label>
            <p className="calibration-help">1차 기준점 6곳으로 전체를 맞추고, 확정 랜드마크를 2차 지역 기준으로 사용합니다. 그 밖의 좌표 고정 요소는 실제 주소 좌표가 확인된 경우 자동으로 3차 근거리 기준점이 되어 주변 미고정 장소의 대략적 위치를 보완합니다.</p>
            <section className={`calibration-folder primary ${expandedCalibrationGroups.primary ? "expanded" : "collapsed"}`}>
              <button type="button" className="calibration-folder-toggle" aria-expanded={expandedCalibrationGroups.primary} aria-controls="calibration-group-primary" onClick={() => setExpandedCalibrationGroups((current) => ({ ...current, primary: !current.primary }))}>
                <span className="marker-folder-icon" aria-hidden="true">{expandedCalibrationGroups.primary ? "▾" : "▸"}</span><i>1</i><strong>1차 전체 기준점</strong><span>{calibrationPoints.length}</span>
              </button>
              {expandedCalibrationGroups.primary && <div id="calibration-group-primary" className="calibration-folder-items calibration-list">
                {calibrationPoints.map((point, index) => {
                  const element = elements.find((item) => normalizePlaceName(item.name) === point.name);
                  return <article key={point.id} className={`calibration-card ${selectedId === element?.id ? "active" : ""}`}>
                    <button className="calibration-focus" onClick={() => { if (!element) return; setSelectedId(element.id); setSelectedNoteId(null); setRightOpen(true); focusMapPosition(point.targetX, point.targetY, element.id); }}>
                      <b>{index + 1}</b><span><strong>{point.name}</strong><small>보정 ΔX {(point.targetX - point.sourceX).toFixed(1)} · ΔY {(point.targetY - point.sourceY).toFixed(1)}</small></span>
                    </button>
                    <div className="calibration-coordinate-row">
                      <label>X<input disabled={Boolean(element?.locked)} type="number" min="0" max="100" step="0.1" value={point.targetX.toFixed(2)} onChange={(event) => updateCalibrationPoint(point.id, { targetX: Number(event.target.value) })} /></label>
                      <label>Y<input disabled={Boolean(element?.locked)} type="number" min="0" max="100" step="0.1" value={point.targetY.toFixed(2)} onChange={(event) => updateCalibrationPoint(point.id, { targetY: Number(event.target.value) })} /></label>
                      <div className="calibration-nudge" aria-label={`${point.name} 미세 이동`}>
                        <button disabled={Boolean(element?.locked)} onClick={() => updateCalibrationPoint(point.id, { targetY: point.targetY - 0.1 })} aria-label="위로">↑</button>
                        <button disabled={Boolean(element?.locked)} onClick={() => updateCalibrationPoint(point.id, { targetX: point.targetX - 0.1 })} aria-label="왼쪽으로">←</button>
                        <button disabled={Boolean(element?.locked)} onClick={() => updateCalibrationPoint(point.id, { targetX: point.targetX + 0.1 })} aria-label="오른쪽으로">→</button>
                        <button disabled={Boolean(element?.locked)} onClick={() => updateCalibrationPoint(point.id, { targetY: point.targetY + 0.1 })} aria-label="아래로">↓</button>
                      </div>
                    </div>
                  </article>;
                })}
              </div>}
            </section>
            <section className={`calibration-folder secondary ${expandedCalibrationGroups.secondary ? "expanded" : "collapsed"}`}>
              <button type="button" className="calibration-folder-toggle" aria-expanded={expandedCalibrationGroups.secondary} aria-controls="calibration-group-secondary" onClick={() => setExpandedCalibrationGroups((current) => ({ ...current, secondary: !current.secondary }))}>
                <span className="marker-folder-icon" aria-hidden="true">{expandedCalibrationGroups.secondary ? "▾" : "▸"}</span><i>2</i><strong>2차 확정 기준점</strong><span>{secondaryCalibrationPoints.length}</span>
              </button>
              {expandedCalibrationGroups.secondary && <div id="calibration-group-secondary" className="calibration-folder-items">
                {secondaryCalibrationPoints.length ? secondaryCalibrationPoints.map((point) => {
                  const element = elements.find((item) => normalizePlaceName(item.name) === point.name);
                  return <article key={point.id} className={`calibration-card secondary ${selectedId === element?.id ? "active" : ""}`}>
                    <button className="calibration-focus" onClick={() => { if (!element) return; setSelectedId(element.id); setSelectedNoteId(null); setRightOpen(true); focusMapPosition(point.targetX, point.targetY, element.id); }}>
                      <b>S</b><span><strong>{point.name}</strong><small>기본 앵커 {point.targetX.toFixed(1)}, {point.targetY.toFixed(1)} · 주변 보정 고정점</small></span>
                    </button>
                  </article>;
                }) : <p className="secondary-empty">랜드마크의 기본 위치를 확정하면 여기에 추가됩니다.</p>}
              </div>}
            </section>
            <section className={`calibration-folder tertiary ${expandedCalibrationGroups.tertiary ? "expanded" : "collapsed"}`}>
              <button type="button" className="calibration-folder-toggle" aria-expanded={expandedCalibrationGroups.tertiary} aria-controls="calibration-group-tertiary" onClick={() => setExpandedCalibrationGroups((current) => ({ ...current, tertiary: !current.tertiary }))}>
                <span className="marker-folder-icon" aria-hidden="true">{expandedCalibrationGroups.tertiary ? "▾" : "▸"}</span><i>3</i><strong>3차 고정 좌표 기준점</strong><span>{tertiaryCalibrationPoints.length}</span>
              </button>
              {expandedCalibrationGroups.tertiary && <div id="calibration-group-tertiary" className="calibration-folder-items">
                {tertiaryCalibrationPoints.length ? tertiaryCalibrationPoints.map((point) => {
                  const element = elements.find((item) => normalizePlaceName(item.name) === point.name);
                  return <article key={point.id} className={`calibration-card tertiary ${selectedId === element?.id ? "active" : ""}`}>
                    <button className="calibration-focus" onClick={() => { if (!element) return; setSelectedId(element.id); setSelectedNoteId(null); setRightOpen(true); focusMapPosition(point.targetX, point.targetY, element.id); }}>
                      <b>3</b><span><strong>{point.name}</strong><small>고정 앵커 {point.targetX.toFixed(1)}, {point.targetY.toFixed(1)} · 근거리 보정</small></span>
                    </button>
                  </article>;
                }) : <p className="secondary-empty">실제 주소 좌표가 있는 요소를 좌표 고정하면 자동으로 추가됩니다.</p>}
              </div>}
            </section>
            <div className="calibration-actions">
              <button className={`primary ${calibrationDirty ? "attention" : ""}`} onClick={applyCalibrationToAll}>전체 좌표 보정 적용{calibrationDirty ? " · 변경 있음" : ""}</button>
              <button onClick={resetCalibrationPoints}>1차 6점 초기화</button>
            </div>
            <button className="calibration-anchor-align" onClick={moveAllResourcesToAnchors}>모든 리소스를 저장된 기본 앵커로 이동</button>
            <p className="calibration-warning">`전체 좌표 보정 적용`은 리소스 오프셋을 유지합니다. `기본 앵커로 이동`은 랜드마크의 저장 기본값과 일반 마커의 현재 앵커를 사용하며, 우측 개별 이동과 동일하게 오프셋을 0으로 맞춥니다.</p>
          </div>}
          <div className="review-list">
            <div className="review-list-head"><strong>골목 검토 메모</strong><span>{reviewNotes.length}</span></div>
            <button className={`memo-add ${memoMode ? "active" : ""}`} onClick={() => setMemoMode((value) => !value)}>{memoMode ? "지도에서 위치를 클릭하세요" : "＋ 검토 메모 핀 추가"}</button>
            <div className="review-note-scroll">{reviewNotes.map((note, index) => <button key={note.id} className={selectedNoteId === note.id ? "active" : ""} onClick={() => { setSelectedNoteId(note.id); setSelectedId(null); setRightOpen(true); }}><i className={`note-dot ${note.status}`} /> <span>{index + 1}. {note.text || reviewStatusText[note.status]}</span></button>)}</div>
            <div className="review-export"><button onClick={exportNotesJson}>메모 JSON</button><button onClick={exportNotesCsv}>메모 CSV</button></div>
          </div>
        </aside>
        {!leftOpen && <button className="panel-reopen left" onClick={() => setLeftOpen(true)}>자산 ›</button>}

        <section className="canvas-column">
          <div className="canvas-toolbar"><div className="segmented"><button className={baseMap === "svg" ? "active" : ""} onClick={() => { setMapLoaded(false); setBaseMap("svg"); }}>벡터</button><button className={baseMap === "png" ? "active" : ""} onClick={() => { setMapLoaded(false); setBaseMap("png"); }}>원본 PNG</button>{uploadedBaseMap?.available && <button className={baseMap === "uploaded" ? "active" : ""} onClick={() => { setMapLoaded(false); setBaseMap("uploaded"); }}>업로드 지도</button>}</div><span className="map-file" title={activeBaseMapLabel}>{activeBaseMapLabel}</span>{baseMapCanUpload === false && <a className="inline-signin" href="/signin-with-chatgpt?return_to=/">소유자 로그인</a>}<button className="inline-tool" disabled={baseMapUploading} onClick={() => mapUploadInputRef.current?.click()}>{baseMapUploading ? "저장 중…" : "베이스 지도 업로드"}</button><input ref={mapUploadInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" onChange={(event) => void uploadBaseMap(event)} /><button className={`inline-tool label-refresh ${labelsRefreshing ? "refreshing" : ""}`} disabled={labelsRefreshing} onClick={refreshLabelPositions} title="현재 아이콘과 라벨 위치를 기준으로 겹치지 않게 다시 배치"><span aria-hidden="true">↻</span>{labelsRefreshing ? "정리 중…" : "라벨 위치 새로고침"}</button><button className={`inline-memo ${memoMode ? "active" : ""}`} onClick={() => setMemoMode((value) => !value)}>⌖ 메모 핀</button><div className={`canvas-hint ${resourceOutputDragMode ? "output-mode" : ""}`}>{resourceOutputDragMode ? "출력위치 변경 ON · 드래그/방향키로 리소스만 이동" : calibrationMode ? "앵커 드래그 → 전체 좌표 보정 적용" : "기본 드래그: 실제 위치 앵커 이동"}</div></div>
          <div className={`map-viewport ${interaction?.type === "pan" ? "is-panning" : ""} ${interaction?.type === "drag" ? "is-dragging-element" : ""} ${memoMode ? "memo-cursor" : ""}`} ref={viewportRef} onWheel={onWheel} onPointerDown={startPan}>
            <div className="map-stage-wrap" style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})` }}>
              <div className={`map-stage ${stageMapClass} ${calibrationMode ? "calibration-active" : ""}`} ref={stageRef} style={{ aspectRatio: `${MAP_ASPECT}` }} onPointerDown={handleStagePointerDown}>
                {!mapLoaded && <div className="map-loading"><span />초고해상도 베이스맵 불러오는 중</div>}
                <img ref={baseMapImgRef} className="base-map" src={activeBaseMapSrc} alt="제주 원도심 검수용 베이스맵" draggable={false} onLoad={() => setMapLoaded(true)} />
                {calibrationMode && <svg className="calibration-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="좌표 보정 기준점 연결망">
                  {([ [0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [5, 1], [0, 3] ] as Array<[number, number]>).map(([from, to]) => <line key={`${from}-${to}`} x1={calibrationPoints[from].targetX} y1={calibrationPoints[from].targetY} x2={calibrationPoints[to].targetX} y2={calibrationPoints[to].targetY} className="calibration-mesh-line" />)}
                  {showCalibrationSource && calibrationPoints.map((point) => <g key={`source-${point.id}`}><line x1={point.sourceX} y1={point.sourceY} x2={point.targetX} y2={point.targetY} className="calibration-offset-line" /><circle cx={point.sourceX} cy={point.sourceY} r="0.34" className="calibration-source-dot" /></g>)}
                  {secondaryCalibrationPoints.map((point) => <g key={`secondary-${point.id}`}><line x1={point.sourceX} y1={point.sourceY} x2={point.targetX} y2={point.targetY} className="calibration-secondary-line" /><circle cx={point.targetX} cy={point.targetY} r="0.45" className="calibration-secondary-dot" /></g>)}
                  {tertiaryCalibrationPoints.map((point) => <g key={`tertiary-${point.id}`}><line x1={point.sourceX} y1={point.sourceY} x2={point.targetX} y2={point.targetY} className="calibration-tertiary-line" /><circle cx={point.targetX} cy={point.targetY} r="0.4" className="calibration-tertiary-dot" /></g>)}
                </svg>}
                <svg className="connector-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{visibleElements.map((element) => {
                  const showAnchor = viewMode === "anchors" || element.connectorVisible || selectedId === element.id;
                  if (!showAnchor) return null;
                  const showLine = element.connectorVisible && (Math.abs(element.x - element.anchorX) > 0.05 || Math.abs(element.y - element.anchorY) > 0.05);
                  return <g key={`anchor-${element.id}`} opacity={element.opacity / 100}>{showLine && <line x1={element.anchorX} y1={element.anchorY} x2={element.x} y2={element.y} stroke={element.connectorColor} strokeWidth={element.connectorWidth / 10} vectorEffect="non-scaling-stroke" />}{selectedId !== element.id && <><circle cx={element.anchorX} cy={element.anchorY} r="0.42" fill="white" stroke={element.connectorColor} strokeWidth="0.13" vectorEffect="non-scaling-stroke" /><circle cx={element.anchorX} cy={element.anchorY} r="0.12" fill={element.connectorColor} /></>}</g>;
                })}{denseLabelClusters.flatMap((cluster) => cluster.elementIds.map((elementId) => {
                  const element = visibleElementsById.get(elementId);
                  return element ? <g key={`dense-connector-${cluster.id}-${elementId}`} className={`dense-label-connector ${selectedDenseLabelId === cluster.id ? "selected" : ""}`}><line x1={element.x} y1={element.y} x2={cluster.x} y2={cluster.y} vectorEffect="non-scaling-stroke" /><circle cx={element.x} cy={element.y} r="0.16" vectorEffect="non-scaling-stroke" /></g> : null;
                }))}</svg>
                <div className="element-layer">{visibleElements.map((element) => {
                  const meta = categoryOf(element.category); const isSelected = selectedId === element.id; const asset = assets.find((item) => item.id === element.assetId);
                  const isCalibrationReference = calibrationMode && effectiveCalibrationPoints.some((point) => point.name === normalizePlaceName(element.name));
                  const collisionClass = collisions.hard.has(element.id) ? "collision-hard" : collisions.clearance.has(element.id) ? "collision-near" : "";
                  return <div key={element.id} data-element-id={element.id} className={`map-element ${isSelected ? "selected" : ""} ${focusPulseId === element.id ? "focus-pulse" : ""} ${element.locked ? "locked" : ""} ${isCalibrationReference ? "calibration-reference" : ""} ${viewMode === "collisions" ? collisionClass : ""} ${viewMode === "labels" ? "label-only" : ""}`} style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.size}%`, zIndex: element.z, color: meta.color, opacity: element.opacity / 100 }} onPointerDown={(event) => startDrag(event, element)}>
                    {(viewMode === "clearance" || (viewMode === "collisions" && collisionClass)) && <span className={`clearance-zone ${viewMode === "clearance" ? "visible" : collisionClass}`} />}
                    <div className="icon-visual">{asset ? <img className="placed-asset" src={asset.src} alt="" draggable={false} onLoad={(event) => measureAssetBounds(asset.id, event.currentTarget)} /> : <div className={`dummy-symbol ${element.category === "landmark" ? "landmark" : "marker"}`}><span>{meta.glyph}</span></div>}</div>
                    {element.status !== "approved" && viewMode !== "labels" && (element.category === "landmark" || isSelected) && <span className="review-flag">{element.status === "review" ? "검수 중" : "미검수"}</span>}
                    {element.labelVisible && (element.category === "landmark" || markerLabelsVisible) && !clusteredLabelElementIds.has(element.id) && <div className={`label ${isSelected ? "label-editable" : ""}`} data-label-id={element.id} style={labelStyle(element.labelPosition, element.labelGap, element.labelOffsetX, element.labelOffsetY, zoom, asset ? assetVisualBounds[asset.id] : undefined)} onPointerDown={isSelected ? (event) => startLabelDrag(event, element) : undefined} title={isSelected ? "드래그하여 라벨 위치 조정" : undefined}>{element.name}</div>}
                    {isSelected && !element.locked && <button className="resize-handle" aria-label="크기 조절" onPointerDown={(event) => { event.stopPropagation(); pushHistory(); setInteraction({ type: "resize", id: element.id, startX: event.clientX, startSize: element.size }); }} />}
                  </div>;
                })}</div>
                {!!denseLabelClusters.length && <div className="dense-label-layer" aria-label="통합 라벨">
                  {denseLabelClusters.map((cluster) => <div
                    key={cluster.id}
                    className={`dense-label ${cluster.manuallyPositioned ? "manual" : ""} ${cluster.hasCollision ? "collision" : ""} ${selectedDenseLabelId === cluster.id ? "selected" : ""}`}
                    style={{ left: `${cluster.x}%`, top: `${cluster.y}%`, maxWidth: "156px", transform: `translate(-50%, -50%) scale(${(1 / Math.max(zoom, 0.22)).toFixed(4)})` }}
                    onPointerDown={(event) => startDenseLabelDrag(event, cluster)}
                    title={`${cluster.names.join(" · ")} · 드래그하여 위치 조절`}
                    role="button"
                    aria-label={`${cluster.names.length}곳 묶음 라벨. 드래그하여 위치 조절`}
                  ><span className="dense-label-count">{cluster.names.length}곳</span><strong>{cluster.names.slice(0, 4).map((name) => <span key={name}>{name}</span>)}{cluster.names.length > 4 && <em>외 {cluster.names.length - 4}곳</em>}</strong></div>)}
                </div>}
                {selected?.mapVisible && visibleElementIds.has(selected.id) && <svg className="active-anchor-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`${selected.name} 편집 앵커`}>
                  <g opacity={selected.opacity / 100}>
                    <circle cx={selected.anchorX} cy={selected.anchorY} r="0.72" className="active-anchor-halo" vectorEffect="non-scaling-stroke" />
                    <circle cx={selected.anchorX} cy={selected.anchorY} r="0.42" fill="white" stroke={selected.connectorColor} strokeWidth="0.16" vectorEffect="non-scaling-stroke" />
                    <circle cx={selected.anchorX} cy={selected.anchorY} r="0.14" fill={selected.connectorColor} />
                  </g>
                </svg>}
                {calibrationMode && <div className="calibration-badge-layer">{calibrationPoints.map((point, index) => <span key={`badge-${point.id}`} className="calibration-map-badge" style={{ left: `${point.targetX}%`, top: `${point.targetY}%` }}>{index + 1}</span>)}{secondaryCalibrationPoints.map((point) => <span key={`badge-${point.id}`} className="calibration-map-badge secondary" style={{ left: `${point.targetX}%`, top: `${point.targetY}%` }}>S</span>)}{tertiaryCalibrationPoints.map((point) => <span key={`badge-${point.id}`} className="calibration-map-badge tertiary" style={{ left: `${point.targetX}%`, top: `${point.targetY}%` }}>3</span>)}</div>}
                <div className="review-pin-layer">{reviewNotes.map((note, index) => <button key={note.id} className={`review-pin ${note.status} ${selectedNoteId === note.id ? "selected" : ""}`} style={{ left: `${note.x}%`, top: `${note.y}%` }} onPointerDown={(event) => { event.stopPropagation(); setSelectedNoteId(note.id); setSelectedId(null); setRightOpen(true); }} title={`${reviewStatusText[note.status]}: ${note.text || "내용 없음"}`}><span>{index + 1}</span></button>)}</div>
              </div>
            </div>
            <div className="map-scale"><span /> 정규화 좌표 0–100%</div><div className="mobile-readonly">모바일에서는 확대·이동과 배치 열람을 지원합니다.</div>
            {viewMode === "collisions" && <div className="collision-legend"><span><i className="hard" />아이콘 겹침 {collisions.hard.size}</span><span><i className="near" />여유 구역 침범 {collisions.clearance.size}</span></div>}
          </div>
          <footer className="statusbar"><span className="status-ok"><i /> {baseMap === "uploaded" ? "업로드 베이스맵 연결됨" : "기본 베이스맵 연결됨"}</span><span>{calibrationDirty ? "기준점 변경 · 보정 적용 대기" : `1차 6점 + 2차 ${secondaryCalibrationPoints.length}점 + 3차 ${tertiaryCalibrationPoints.length}점 적용`}</span><span>1차 기준좌표 {primaryCalibrationStorage === "persistent" ? "영구 저장" : primaryCalibrationStorage === "local" ? "기기 저장" : "확인 중"}</span><span>고정좌표 {lockedCoordinateStorage === "persistent" ? "영구 동기화" : lockedCoordinateStorage === "local" ? "기기 저장" : "확인 중"}</span><span>요소 {visibleElements.length} / {elements.length}</span><span>장소 목록 {directoryPlaces.length}</span><span>메모 {reviewNotes.length}</span><span>{saveState}</span><span className="status-end">드래그 배치 · 앵커 중심 좌표 보정</span></footer>
        </section>
        {!rightOpen && <button className="panel-reopen right" onClick={() => setRightOpen(true)}>‹ 속성</button>}

        <aside className="panel properties-panel" aria-label="속성 편집">
          <div className="panel-heading"><div><strong>{selectedNote ? "검토 메모" : "속성"}</strong><span>{selected?.name ?? (selectedNote ? reviewStatusText[selectedNote.status] : "요소를 선택하세요")}</span></div><button className="icon-button" onClick={() => setRightOpen(false)} aria-label="오른쪽 패널 접기">›</button></div>
          {selectedNote ? <div className="property-form note-form">
            <section><div className="section-title"><strong>도로·골목 검토</strong><span>메모 핀</span></div><label>상태<select value={selectedNote.status} onChange={(event) => updateNote(selectedNote.id, { status: event.target.value as ReviewStatus })}><option value="delete">삭제 검토</option><option value="weaken">약화 검토</option><option value="keep">유지</option><option value="hierarchy">도로 위계 조정</option></select></label><label>검토 내용<textarea value={selectedNote.text} onChange={(event) => updateNote(selectedNote.id, { text: event.target.value })} placeholder="가려지는 도로, 골목 정리 이유 등을 기록" /></label></section>
            <section><div className="section-title"><strong>지도 위치</strong><span>%</span></div><div className="field-row"><label>X<input type="number" step="0.1" value={selectedNote.x.toFixed(2)} onChange={(event) => updateNote(selectedNote.id, { x: clamp(Number(event.target.value), 0, 100) })} /></label><label>Y<input type="number" step="0.1" value={selectedNote.y.toFixed(2)} onChange={(event) => updateNote(selectedNote.id, { y: clamp(Number(event.target.value), 0, 100) })} /></label></div></section>
            <section><button className="wide-danger" onClick={deleteSelectedNote}>검토 메모 삭제</button></section>
          </div> : !selected ? <div className="empty-properties"><span>◇</span><strong>선택된 요소가 없습니다</strong><p>지도 위 요소나 검토 메모를 클릭하면 세부 설정을 편집할 수 있습니다.</p></div> : <div className="property-form">
            <section><div className="section-title"><strong>기본 정보</strong><div className="section-title-actions"><span className={`status-pill ${selected.status}`}>{statusText[selected.status]}</span><label className={`coordinate-lock-toggle ${selected.locked ? "active" : ""}`} title="켜면 요소는 움직이지 않으며, 실제 주소 좌표가 있으면 3차 지역 기준점으로 사용됩니다."><input type="checkbox" checked={selected.locked} onChange={(event) => { updateElement(selected.id, { locked: event.target.checked }); setCalibrationDirty(true); }} /><span>{selected.locked ? "좌표 고정 ON" : "좌표 고정 OFF"}</span></label></div></div><label>장소명<input value={selected.name} onChange={(event) => updateElement(selected.id, { name: event.target.value })} /></label><label>주소<input value={selected.address} onChange={(event) => updateElement(selected.id, { address: event.target.value })} placeholder="장소 주소" /></label>{selected.addressSourceUrl && <a className="source-link" href={selected.addressSourceUrl} target="_blank" rel="noreferrer">주소 확인 출처 ↗</a>}<label>카테고리{isCoreLandmarkName(selected.name) ? " · 핵심 랜드마크 고정" : ""}<select value={selected.category} disabled={isCoreLandmarkName(selected.name)} onChange={(event) => updateElement(selected.id, { category: event.target.value as CategoryId })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>사용 자산<select value={selected.assetId ?? ""} onChange={(event) => { const asset = assets.find((item) => item.id === event.target.value); updateElement(selected.id, asset ? { assetId: asset.id, status: asset.status, category: asset.category, address: asset.address || selected.address, addressSourceUrl: asset.addressSourceUrl || selected.addressSourceUrl } : { assetId: null }); }}><option value="" disabled>리소스 미지정</option>{compatibleAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>{selected.category === "landmark" && compatibleAssets.length > 1 && <div className="property-candidate-grid" aria-label="랜드마크 후보 리소스">{compatibleAssets.map((asset) => <button key={asset.id} className={selected.assetId === asset.id ? "active" : ""} onClick={() => updateElement(selected.id, { assetId: asset.id, status: asset.status })} title={asset.name}><img src={asset.src} alt="" /><span>{asset.name}</span></button>)}</div>}{selectedAsset && <div className="asset-source-box"><span>{selectedAsset.sourceLabel ?? "사용자 업로드 자산"}</span>{selectedAsset.sourceUrl && <a href={selectedAsset.sourceUrl} target="_blank" rel="noreferrer">Drive 원본 보기 ↗</a>}</div>}<label>검수 상태<select value={selected.status} onChange={(event) => updateElement(selected.id, { status: event.target.value as AssetStatus })}><option value="approved">승인 완료</option><option value="review">검수 중</option><option value="unchecked">미검수</option></select></label><label>요소 메모<textarea value={selected.memo} onChange={(event) => updateElement(selected.id, { memo: event.target.value })} placeholder="배치 판단과 검수 의견 기록" /></label></section>
            <section className="print-property-section"><div className="section-title"><strong>고화질 출력</strong><span>{printPolicyFor(selected).recommended ? "추천 장소" : "일반 장소"}</span></div><label className="print-recommended-toggle"><input type="checkbox" checked={printPolicyFor(selected).recommended} disabled={selected.category === "landmark" || !printSettingsCanEdit} onChange={(event) => void savePrintSetting(selected, { recommended: event.target.checked })} /><span><b>{selected.category === "landmark" ? "랜드마크 기본 포함" : "출력 추천 장소"}</b><small>추천 중심 출력에서 사용할 장소를 지정합니다.</small></span></label><div className="field-row"><label>마커 출력<select value={printPolicyFor(selected).setting?.markerMode ?? "auto"} disabled={!printSettingsCanEdit} onChange={(event) => void savePrintSetting(selected, { markerMode: event.target.value as PrintMode })}><option value="auto">자동</option><option value="include">항상 포함</option><option value="exclude">항상 제외</option></select></label><label>라벨 출력<select value={printPolicyFor(selected).setting?.labelMode ?? "auto"} disabled={!printSettingsCanEdit} onChange={(event) => void savePrintSetting(selected, { labelMode: event.target.value as PrintMode })}><option value="auto">자동</option><option value="include">항상 포함</option><option value="exclude">항상 제외</option></select></label></div><p className="field-help">자동은 랜드마크와 추천 상태를 따릅니다. 수동 포함·제외는 추천 상태가 바뀌어도 유지됩니다.</p></section>
            <section><div className="section-title"><strong>리소스 출력 오프셋</strong><label className={`coordinate-lock-toggle output-drag-toggle ${resourceOutputDragMode ? "active" : ""}`} title="켜면 지도 드래그와 방향키가 앵커 대신 이미지 리소스의 출력 위치만 변경합니다."><input type="checkbox" checked={resourceOutputDragMode} disabled={selected.locked} onChange={(event) => setResourceOutputDragMode(event.target.checked)} /><span>{resourceOutputDragMode ? "출력위치 변경 ON" : "출력위치 변경 OFF"}</span></label></div>{selectedDisplayOffset && <><div className="field-row"><label>ΔX<input disabled={selected.locked} type="number" step="0.1" value={selectedDisplayOffset.x.toFixed(2)} onChange={(event) => updateElement(selected.id, { x: clamp(selected.anchorX + Number(event.target.value), 0, 100) })} /></label><label>ΔY<input disabled={selected.locked} type="number" step="0.1" value={selectedDisplayOffset.y.toFixed(2)} onChange={(event) => updateElement(selected.id, { y: clamp(selected.anchorY + Number(event.target.value), 0, 100) })} /></label></div><div className="offset-nudge-grid" aria-label="리소스 출력 위치 미세 조정"><button disabled={selected.locked} onClick={() => updateElement(selected.id, { x: clamp(selected.x - 0.1, 0, 100) })}>←</button><button disabled={selected.locked} onClick={() => updateElement(selected.id, { y: clamp(selected.y - 0.1, 0, 100) })}>↑</button><button disabled={selected.locked} onClick={() => updateElement(selected.id, { y: clamp(selected.y + 0.1, 0, 100) })}>↓</button><button disabled={selected.locked} onClick={() => updateElement(selected.id, { x: clamp(selected.x + 0.1, 0, 100) })}>→</button><button disabled={selected.locked} className="reset" onClick={() => updateElement(selected.id, { x: selected.anchorX, y: selected.anchorY })}>리소스→앵커</button><button className="anchor-to-resource" disabled={selected.locked || (Math.abs(selectedDisplayOffset.x) < 0.001 && Math.abs(selectedDisplayOffset.y) < 0.001)} onClick={() => moveAnchorToResource(selected)} title="화면의 리소스는 그대로 두고 실제 위치 앵커를 리소스 중심으로 이동합니다.">앵커를 현재 리소스 위치로 이동</button></div></>}<p className="field-help">{selected.locked ? "좌표 고정이 켜져 있어 앵커와 리소스 출력 위치가 유지됩니다." : resourceOutputDragMode ? "출력위치 변경 ON: 드래그와 방향키는 앵커를 고정한 채 이미지 리소스만 이동합니다." : "기본 상태: 드래그와 방향키는 실제 위치 앵커를 이동하며 현재 ΔX·ΔY는 유지됩니다."}</p><label className="range-label"><span>크기 <b>{selected.size.toFixed(1)}%</b></span><input type="range" min="0.8" max="15" step="0.1" value={selected.size} onChange={(event) => updateElement(selected.id, { size: Number(event.target.value) })} /></label><label className="range-label"><span>투명도 <b>{selected.opacity}%</b></span><input type="range" min="10" max="100" step="1" value={selected.opacity} onChange={(event) => updateElement(selected.id, { opacity: Number(event.target.value) })} /></label><div className="layer-actions"><button onClick={() => moveLayer("back")}>맨 뒤</button><button onClick={() => moveLayer("backward")}>한 칸 뒤</button><button onClick={() => moveLayer("forward")}>한 칸 앞</button><button onClick={() => moveLayer("front")}>맨 앞</button></div></section>
            {selected.category === "landmark" && selectedLandmarkDefault && <section className="landmark-default-section"><div className="section-title"><strong>랜드마크 기본 앵커</strong><span>{selectedIsPrimaryCalibration ? "1차 기준점" : selectedLandmarkDefault.confirmed ? "2차 기준점" : "초기화 기준"}</span></div><div className="field-row"><label>기본 X<input type="number" min="0" max="100" step="0.1" value={selectedLandmarkDefault.x.toFixed(2)} onChange={(event) => updateLandmarkDefault(selected, { x: Number(event.target.value) })} /></label><label>기본 Y<input type="number" min="0" max="100" step="0.1" value={selectedLandmarkDefault.y.toFixed(2)} onChange={(event) => updateLandmarkDefault(selected, { y: Number(event.target.value) })} /></label></div><div className="landmark-default-buttons"><button className="primary" onClick={() => saveLandmarkAsDefault(selected)}>현재 앵커를 기본값으로 저장</button><button onClick={() => moveLandmarkToDefault(selected)}>기본 앵커로 이동</button></div>{selectedIsPrimaryCalibration ? <div className="default-tier-note primary">1차 기준점 6곳은 실제 위치 앵커와 기본 앵커가 자동 동기화되며 영구 기준좌표로 저장됩니다.</div> : <label className="default-confirm-toggle"><input type="checkbox" checked={Boolean(selectedLandmarkDefault.confirmed)} disabled={!selectedHasGeocodedSource} onChange={(event) => updateLandmarkDefault(selected, { confirmed: event.target.checked })} /><span><b>2차 기준점으로 확정</b><small>{selectedHasGeocodedSource ? "기본 앵커를 고정점으로 사용해 주변 마커를 보정합니다." : "실제 장소 좌표가 없어 2차 기준점으로 사용할 수 없습니다."}</small></span></label>}<p className="field-help">기본 위치는 화면상 리소스가 아니라 실제 위치 앵커를 기준으로 저장되며 자동 저장·배치안·JSON에 포함됩니다.</p></section>}
            <section><div className="section-title"><strong>실제 위치 앵커</strong><span>{selectedPrimaryCalibrationPoint ? "1차 기준점" : selectedSecondaryCalibrationPoint ? "2차 확정 기준점" : selectedTertiaryCalibrationPoint ? "3차 지역 기준점" : selected.locked ? "좌표 고정됨" : "직접 편집"}</span></div>{selectedCalibrationPoint && <div className="calibration-property-note"><b>◎ {selectedPrimaryCalibrationPoint ? "1차 6점 보정 기준" : selectedSecondaryCalibrationPoint ? "2차 확정 보정 기준" : "3차 고정 좌표 기준"}</b><span>{selectedTertiaryCalibrationPoint ? "이 고정 앵커는 움직이지 않으며 가까운 미고정 장소의 대략적 실제 위치를 보완합니다." : selected.locked ? "좌표 고정이 켜져 있어 보정 기준과 현재 앵커가 변경되지 않습니다." : selectedPrimaryCalibrationPoint ? (calibrationLiveApply ? "이 앵커를 바꾸면 주변 장소가 실시간으로 함께 보정됩니다." : "앵커를 맞춘 뒤 좌표 보정 패널에서 전체 적용 버튼을 눌러주세요.") : "확정한 기본 앵커를 유지하면서 주변 장소의 실제 좌표를 지역적으로 보정합니다."}</span></div>}<div className="field-row"><label>X<input disabled={selected.locked} type="number" step="0.1" value={(selectedPrimaryCalibrationPoint?.targetX ?? selected.anchorX).toFixed(2)} onChange={(event) => selectedPrimaryCalibrationPoint ? updateCalibrationPoint(selectedPrimaryCalibrationPoint.id, { targetX: Number(event.target.value) }) : updateElementAnchor(selected, Number(event.target.value), selected.anchorY)} /></label><label>Y<input disabled={selected.locked} type="number" step="0.1" value={(selectedPrimaryCalibrationPoint?.targetY ?? selected.anchorY).toFixed(2)} onChange={(event) => selectedPrimaryCalibrationPoint ? updateCalibrationPoint(selectedPrimaryCalibrationPoint.id, { targetY: Number(event.target.value) }) : updateElementAnchor(selected, selected.anchorX, Number(event.target.value))} /></label></div>{selectedCalibrationPoint && <button className="wide-secondary" onClick={() => switchLeftPanel("calibration")}>계층형 좌표 보정 패널 열기</button>}<p className="field-help">앵커는 직접 수정할 수 있으며, 변경해도 리소스의 ΔX·ΔY 오프셋은 유지됩니다. 주소 자동 조회 좌표는 최종 육안 검수가 필요합니다.</p></section>
            <section><div className="section-title"><strong>연결선</strong><label className="switch"><input type="checkbox" checked={selected.connectorVisible} onChange={(event) => updateElement(selected.id, { connectorVisible: event.target.checked })} /><span /></label></div><div className="field-row compact-color-row"><label>색상<input type="color" value={selected.connectorColor} onChange={(event) => updateElement(selected.id, { connectorColor: event.target.value })} /></label><label>굵기<input type="number" min="0.5" max="6" step="0.5" value={selected.connectorWidth} onChange={(event) => updateElement(selected.id, { connectorWidth: clamp(Number(event.target.value), 0.5, 6) })} /></label></div></section>
            <section><div className="section-title"><strong>라벨</strong><div className="section-title-actions"><label className={`coordinate-lock-toggle label-lock-toggle ${selected.labelLocked ? "active" : ""}`} title="켜면 라벨 위치 새로고침에서도 이 라벨을 기준점으로 유지합니다."><input type="checkbox" checked={selected.labelLocked} onChange={(event) => updateElement(selected.id, { labelLocked: event.target.checked })} /><span>{selected.labelLocked ? "라벨 고정 ON" : "라벨 고정 OFF"}</span></label><label className="switch" title="라벨 표시"><input type="checkbox" checked={selected.labelVisible} onChange={(event) => updateElement(selected.id, { labelVisible: event.target.checked })} /><span /></label></div></div><div className="position-grid">{(["top", "bottom", "left", "right"] as LabelPosition[]).map((position) => <button key={position} className={selected.labelPosition === position ? "active" : ""} onClick={() => updateElement(selected.id, { labelPosition: position })}>{{ top: "위", bottom: "아래", left: "왼쪽", right: "오른쪽" }[position]}</button>)}</div><label className="range-label"><span>보이는 아이콘과 간격 <b>{selected.labelGap}px</b></span><input type="range" min="0" max="40" step="1" value={selected.labelGap} onChange={(event) => updateElement(selected.id, { labelGap: Number(event.target.value) })} /></label><div className="field-row label-offset-fields"><label>좌우 미세 조정<input type="number" min="-240" max="240" step="1" value={selected.labelOffsetX} onChange={(event) => updateElement(selected.id, { labelOffsetX: clamp(Number(event.target.value), -240, 240) })} /></label><label>상하 미세 조정<input type="number" min="-240" max="240" step="1" value={selected.labelOffsetY} onChange={(event) => updateElement(selected.id, { labelOffsetY: clamp(Number(event.target.value), -240, 240) })} /></label></div><button className="wide-secondary" disabled={labelsRefreshing} onClick={refreshLabelPositions}>{labelsRefreshing ? "라벨 위치 정리 중…" : "전체 라벨 위치 새로고침"}</button><p className="field-help">현재 방향과 직접 조정한 지점을 기준으로 가까운 빈자리만 탐색합니다. 랜드마크는 위·아래 기준 위치를 최우선으로 유지하며, 모든 라벨은 다른 이미지·라벨을 피합니다.</p></section>
            <section><div className="section-title"><strong>빠른 작업</strong></div><div className="quick-actions"><button onClick={duplicateSelected}>복제</button><button onClick={() => toggleElementMapVisibility(selected, !selected.mapVisible)}>{selected.mapVisible ? "미배치로 변경" : "배치로 변경"}</button><button className="danger" disabled={selected.locked} onClick={deleteSelected}>삭제</button></div></section>
          </div>}
        </aside>
      </section>
      {databaseEditorOpen && <div className="database-editor-backdrop" role="presentation">
        <section className="database-editor" role="dialog" aria-modal="true" aria-labelledby="database-editor-title">
          <header className="database-editor-header">
            <div><strong id="database-editor-title">내부 장소 DB 직접 편집</strong><span>{databaseDraftPlaces.length}곳 · 좌표와 지도 배치는 별도 보존</span></div>
            <button onClick={closeDatabaseEditor} aria-label="DB 편집 닫기">×</button>
          </header>
          <div className="database-editor-body">
            <aside className="database-editor-list-pane">
              <div className="database-editor-list-tools">
                <input value={databaseEditorQuery} onChange={(event) => setDatabaseEditorQuery(event.target.value)} placeholder="장소명·주소·권역 검색" aria-label="DB 장소 검색" />
                <button onClick={addDatabaseDraftPlace}>＋ 신규</button>
              </div>
              <div className="database-editor-list" role="listbox" aria-label="DB 장소 목록">
                {filteredDatabaseDraftPlaces.map((place) => {
                  const category = categoryOf(place.category);
                  return <button key={place.id} className={databaseEditorSelectedId === place.id ? "active" : ""} onClick={() => setDatabaseEditorSelectedId(place.id)} role="option" aria-selected={databaseEditorSelectedId === place.id}>
                    <i style={{ background: category.color }} /><span><b>{place.name || "이름 없음"}</b><small>{category.name} · {place.area || "권역 미입력"}</small></span>
                  </button>;
                })}
                {!filteredDatabaseDraftPlaces.length && <p>검색 결과가 없습니다.</p>}
              </div>
            </aside>
            <div className="database-editor-form-pane">
              {selectedDatabasePlace ? <div className="database-editor-form">
                <div className="database-form-row primary-fields">
                  <label>장소명 <em>필수</em><input value={selectedDatabasePlace.name} maxLength={160} onChange={(event) => updateDatabaseDraftPlace(selectedDatabasePlace.id, { name: event.target.value })} /></label>
                  <label>분류 <em>{isCoreLandmarkName(selectedDatabasePlace.name) ? "핵심 랜드마크 고정" : "필수"}</em><select value={selectedDatabasePlace.category} disabled={isCoreLandmarkName(selectedDatabasePlace.name)} onChange={(event) => updateDatabaseDraftPlace(selectedDatabasePlace.id, { category: event.target.value as CategoryId })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                </div>
                <div className="database-form-row">
                  <label>세부 지역<input value={selectedDatabasePlace.area} maxLength={160} onChange={(event) => updateDatabaseDraftPlace(selectedDatabasePlace.id, { area: event.target.value })} /></label>
                  <label>세부 유형<input value={selectedDatabasePlace.subtype ?? ""} maxLength={160} onChange={(event) => updateDatabaseDraftPlace(selectedDatabasePlace.id, { subtype: event.target.value })} /></label>
                </div>
                <label>주소<input value={selectedDatabasePlace.address} maxLength={260} onChange={(event) => updateDatabaseDraftPlace(selectedDatabasePlace.id, { address: event.target.value })} /></label>
                <div className="database-form-row">
                  <label>우선도<input value={selectedDatabasePlace.priority ?? ""} maxLength={80} placeholder="추천·참고·검토" onChange={(event) => updateDatabaseDraftPlace(selectedDatabasePlace.id, { priority: event.target.value })} /></label>
                  <label>확인일<input type="date" value={selectedDatabasePlace.checkedAt ?? ""} onChange={(event) => updateDatabaseDraftPlace(selectedDatabasePlace.id, { checkedAt: event.target.value })} /></label>
                </div>
                <label>설명<textarea value={selectedDatabasePlace.description ?? ""} maxLength={1600} onChange={(event) => updateDatabaseDraftPlace(selectedDatabasePlace.id, { description: event.target.value })} /></label>
                <label>운영정보<textarea value={selectedDatabasePlace.operatingInfo ?? ""} maxLength={1000} onChange={(event) => updateDatabaseDraftPlace(selectedDatabasePlace.id, { operatingInfo: event.target.value })} /></label>
                <label>비고·주의사항<textarea value={selectedDatabasePlace.notes ?? ""} maxLength={1600} onChange={(event) => updateDatabaseDraftPlace(selectedDatabasePlace.id, { notes: event.target.value })} /></label>
                <label>사진·소개 자료 URL<input type="url" value={selectedDatabasePlace.sourceUrl ?? ""} maxLength={1200} onChange={(event) => updateDatabaseDraftPlace(selectedDatabasePlace.id, { sourceUrl: event.target.value })} /></label>
                <label>지도·코스 자료 URL<input type="url" value={selectedDatabasePlace.mapUrl ?? ""} maxLength={1200} onChange={(event) => updateDatabaseDraftPlace(selectedDatabasePlace.id, { mapUrl: event.target.value })} /></label>
                <div className="database-record-meta"><span>ID {selectedDatabasePlace.id}</span><button className="danger" onClick={() => removeDatabaseDraftPlace(selectedDatabasePlace)}>DB 항목 삭제</button></div>
              </div> : <div className="database-editor-empty"><strong>편집할 장소를 선택하세요.</strong><p>신규 장소는 왼쪽의 ＋ 신규 버튼으로 추가할 수 있습니다.</p></div>}
            </div>
          </div>
          <footer className="database-editor-footer">
            <span>{databaseEditorDirty ? "저장하지 않은 변경 있음" : placeDirectoryStorage === "persistent" ? `영구 DB 동기화${placeDirectoryUpdatedAt ? ` · ${new Date(placeDirectoryUpdatedAt).toLocaleString("ko-KR")}` : ""}` : "기본 DB를 처음 저장할 준비가 됐습니다."}</span>
            <div><button onClick={() => download(`제주원도심_내부DB_백업_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), rows: databaseDraftPlaces.map(directoryRecordFromPlace) }, null, 2), "application/json")}>JSON 백업</button><button onClick={closeDatabaseEditor}>취소</button><button className="primary" disabled={!databaseEditorDirty || databaseEditorSaving} onClick={() => void saveDatabaseEditor()}>{databaseEditorSaving ? "저장 중…" : "영구 DB 저장"}</button></div>
          </footer>
        </section>
      </div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
