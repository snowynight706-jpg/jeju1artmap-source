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

const MAP_ASPECT = 8944 / 7324;
const MAP_SVG = "/maps/제주원도심_랜드마크탐색_베이스맵_v15_골목추가정리_검수본_마스터벡터.svg";
const MAP_PNG = "/maps/제주원도심_랜드마크탐색_베이스맵_v15_골목추가정리_검수본_초고해상도.png";
const UPLOADED_MAP_API = "/api/base-map";
const EXPORT_CANONICAL_WIDTH = 1180;
const AUTOSAVE_KEY = "jeju-wondosim-map-review:autosave:v3";
const LAYOUTS_KEY = "jeju-wondosim-map-review:layouts:v3";
const CALIBRATION_SETTINGS_KEY = "jeju-wondosim-map-review:calibration-settings:v1";
const GEOCODE_CACHE_KEY = "jeju-wondosim-map-review:geocode-cache:v1";
const DELETED_PLACE_NAMES = new Set(["산짓물공원", "산짓물 공원"]);

const categories = [
  { id: "landmark", name: "핵심 랜드마크", color: "#df745c", glyph: "景" },
  { id: "culture", name: "일반 문화시설", color: "#4d9a91", glyph: "文" },
  { id: "cafe", name: "카페", color: "#b7835b", glyph: "珈" },
  { id: "food", name: "음식점", color: "#d8974f", glyph: "食" },
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
  memo: string;
  address: string;
  addressSourceUrl: string;
  directoryId?: string;
};

type DirectoryPlace = {
  id: string;
  name: string;
  category: "culture" | "cafe" | "food" | "parking" | "utility";
  area: string;
  address: string;
  x: number;
  y: number;
  coordinateStatus: "landmark" | "review" | "geocoded" | "unresolved";
  sourceLabel: string;
  sourceUrl?: string;
  subtype?: string;
  priority?: string;
  latitude?: number;
  longitude?: number;
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
  tier?: "primary" | "secondary";
};

type LandmarkDefaultPosition = {
  elementId: string;
  name: string;
  x: number;
  y: number;
  confirmed?: boolean;
};

type DocumentState = {
  elements: MapElement[];
  assets: MapAsset[];
  reviewNotes: ReviewNote[];
  directoryPlaces?: DirectoryPlace[];
  calibrationPoints?: CalibrationPoint[];
  landmarkDefaultPositions?: LandmarkDefaultPosition[];
};

const elementDefaults: Omit<MapElement, "id" | "name" | "category" | "x" | "y" | "anchorX" | "anchorY" | "size" | "z"> = {
  labelVisible: false,
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

const calibrationSourceOverrides: Partial<Record<(typeof CALIBRATION_LANDMARK_NAMES)[number], { x: number; y: number }>> = {
  // 기존 주소 검색은 중앙로 2의 남쪽 동명이점을 반환했습니다. 해변공연장은 탑동광장과 인접한 북쪽 해안 좌표를 기준으로 둡니다.
  "탑동해변공연장": { x: 58.25, y: 11.6 },
};

const initialCalibrationPoints: CalibrationPoint[] = CALIBRATION_LANDMARK_NAMES.map((name, index) => {
  const location = landmarkLocations.find((item) => item.name === name)!;
  const geocoded = geocodedPlaces[name];
  const source = calibrationSourceOverrides[name] ?? { x: geocoded?.x ?? location.x, y: geocoded?.y ?? location.y };
  return {
    id: `calibration-${index + 1}`,
    name,
    sourceX: source.x,
    sourceY: source.y,
    targetX: location.x,
    targetY: location.y,
    tier: "primary" as const,
  };
});

function buildEffectiveCalibrationPoints(primaryPoints: CalibrationPoint[], defaults: LandmarkDefaultPosition[]) {
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
  return [...primaryPoints.map((point) => ({ ...point, tier: "primary" as const })), ...secondaryPoints];
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

function calibratedCoordinates(sourceX: number, sourceY: number, points: CalibrationPoint[]) {
  const primaryPoints = points.filter((point) => point.tier !== "secondary");
  const secondaryPoints = points.filter((point) => point.tier === "secondary");
  const primaryResult = singleStageCalibratedCoordinates(sourceX, sourceY, primaryPoints);
  if (!secondaryPoints.length) return primaryResult;

  const exactSecondary = secondaryPoints.find((point) => Math.hypot(sourceX - point.sourceX, sourceY - point.sourceY) < 0.001);
  if (exactSecondary) return { x: exactSecondary.targetX, y: exactSecondary.targetY };

  const localControls = secondaryPoints.map((point) => {
    const primaryProjected = singleStageCalibratedCoordinates(point.sourceX, point.sourceY, primaryPoints);
    const distanceSquared = (primaryResult.x - primaryProjected.x) ** 2 + ((primaryResult.y - primaryProjected.y) / MAP_ASPECT) ** 2;
    return {
      distanceSquared,
      dx: point.targetX - primaryProjected.x,
      dy: point.targetY - primaryProjected.y,
    };
  }).sort((a, b) => a.distanceSquared - b.distanceSquared).slice(0, 4);
  const nearestDistance = Math.sqrt(localControls[0]?.distanceSquared ?? Number.POSITIVE_INFINITY);
  const localFade = Math.pow(clamp(1 - nearestDistance / 32, 0, 1), 1.35);
  if (!localFade) return primaryResult;
  let weightSum = 0;
  let dx = 0;
  let dy = 0;
  localControls.forEach((control) => {
    const weight = 1 / Math.pow(Math.max(control.distanceSquared, 0.05), 1.18);
    weightSum += weight;
    dx += control.dx * weight;
    dy += control.dy * weight;
  });
  return {
    x: clamp(primaryResult.x + dx / Math.max(weightSum, 1) * localFade, 0, 100),
    y: clamp(primaryResult.y + dy / Math.max(weightSum, 1) * localFade, 0, 100),
  };
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

function normalizePlaceName(name: string) {
  if (name === "제주해변공연장") return "탑동해변공연장";
  if (name === "제주특별자치도 소통협력센터") return "제주시소통협력센터";
  return name.trim();
}

function buildDirectoryPlaces(rows: MasterDirectoryRow[]) {
  const legacyByName = new Map(legacyDirectoryPlaces.map((place) => [normalizePlaceName(place.name), place]));
  const built = rows
    .filter((row) => row.address && !DELETED_PLACE_NAMES.has(normalizePlaceName(row.name)))
    .map((row, index): DirectoryPlace => {
      const name = normalizePlaceName(row.name);
      const legacy = legacyByName.get(name);
      const geocoded = geocodedPlaces[name] ?? geocodedPlaces[row.name];
      const fallback = areaFallbacks[row.area] ?? { x: 50, y: 50 };
      return {
        id: legacy?.id ?? `master-place-${index + 1}`,
        name,
        category: row.category,
        area: row.area,
        address: row.address,
        x: geocoded?.x ?? legacy?.x ?? fallback.x,
        y: geocoded?.y ?? legacy?.y ?? fallback.y,
        coordinateStatus: geocoded ? "geocoded" : legacy?.coordinateStatus === "landmark" ? "landmark" : "unresolved",
        latitude: geocoded?.latitude,
        longitude: geocoded?.longitude,
        sourceLabel: `마스터DB · ${row.subtype}`,
        sourceUrl: row.sourceUrl,
        subtype: row.subtype,
        priority: row.priority,
      };
    });
  const names = new Set(built.map((place) => place.name));
  return [
    ...built,
    ...legacyDirectoryPlaces.filter((place) => !names.has(normalizePlaceName(place.name))).map((place) => {
      const geocoded = geocodedPlaces[normalizePlaceName(place.name)];
      return geocoded ? { ...place, ...geocoded, coordinateStatus: "geocoded" as const } : place;
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
const directoryByName = new Map(defaultDirectoryPlaces.map((place) => [place.name, place]));

const addressByPlace = new Map<string, (typeof landmarkLocations)[number]>(landmarkLocations.map((location) => [location.name, location]));

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

function isBundledMarkerCategory(category: CategoryId): category is BundledMarkerCategory {
  return category !== "landmark";
}

function defaultMarkerAssetId(category: CategoryId, style: BundledMarkerStyle = recommendedMarkerStyle) {
  return isBundledMarkerCategory(category) ? markerAssetId(style, category) : null;
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
  return categories.find((category) => category.id === id) ?? categories[6];
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

function cloneDocument(document: DocumentState): DocumentState {
  return JSON.parse(JSON.stringify(document)) as DocumentState;
}

function sanitizeDocument(document: DocumentState): DocumentState {
  return {
    ...document,
    elements: document.elements
      .filter((element) => !DELETED_PLACE_NAMES.has(element.name.trim()))
      .map((element) => {
        const defaultAssetId = defaultMarkerAssetId(element.category);
        return !element.assetId && defaultAssetId
          ? { ...element, assetId: defaultAssetId, status: "review" as AssetStatus }
          : element;
      }),
    directoryPlaces: document.directoryPlaces?.filter((place) => !DELETED_PLACE_NAMES.has(place.name.trim())),
  };
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
      if (section === "food" && /소품샵|편집숍|상업공간/.test(subtype) && !/식음|카페/.test(subtype)) return;
      rows.push({
        name,
        address,
        area: String(raw[0] ?? "기타"),
        subtype,
        priority: String(raw[6] ?? ""),
        sourceUrl: String(raw[section === "culture" ? 11 : 10] ?? ""),
        category: section === "culture" ? "culture" : /카페|커피|로스터|티하우스|북카페|디저트/.test(subtype) ? "cafe" : "food",
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
  const nextIdRef = useRef(100);
  const nextAssetIdRef = useRef(0);
  const nextNoteIdRef = useRef(0);
  const elementsRef = useRef<MapElement[]>(initialElements);
  const assetsRef = useRef<MapAsset[]>(builtInAssets);
  const notesRef = useRef<ReviewNote[]>([]);
  const placesRef = useRef<DirectoryPlace[]>(defaultDirectoryPlaces);
  const calibrationPointsRef = useRef<CalibrationPoint[]>(initialCalibrationPoints);
  const landmarkDefaultsRef = useRef<LandmarkDefaultPosition[]>(factoryLandmarkDefaultPositions);
  const measuredAssetIdsRef = useRef(new Set<string>());
  const calibrationLiveApplyRef = useRef(false);

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
  const [assetStatus, setAssetStatus] = useState<AssetStatus>("unchecked");
  const [assetCategory, setAssetCategory] = useState<CategoryId>("landmark");
  const [leftPanelMode, setLeftPanelMode] = useState<"assets" | "places" | "calibration">("assets");
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeCategory, setPlaceCategory] = useState<"all" | "culture" | "cafe" | "food" | "parking" | "utility">("all");
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
  const [interaction, setInteraction] = useState<
    | { type: "pan"; startX: number; startY: number; panX: number; panY: number }
    | { type: "resize"; id: string; startX: number; startSize: number }
    | null
  >(null);

  const currentDocument = useCallback((): DocumentState => ({
    elements: elementsRef.current,
    assets: assetsRef.current,
    reviewNotes: notesRef.current,
    directoryPlaces: placesRef.current,
    calibrationPoints: calibrationPointsRef.current,
    landmarkDefaultPositions: landmarkDefaultsRef.current,
  }), []);

  const setDocument = useCallback((document: DocumentState) => {
    const clean = sanitizeDocument(cloneDocument(document));
    const hadCalibration = clean.calibrationPoints?.length === initialCalibrationPoints.length;
    const restoredCalibrationPoints = hadCalibration ? clean.calibrationPoints! : initialCalibrationPoints;
    const restoredLandmarkDefaults = Array.isArray(clean.landmarkDefaultPositions) && clean.landmarkDefaultPositions.length
      ? clean.landmarkDefaultPositions.map((position) => ({
          ...position,
          x: clamp(position.x, 0, 100),
          y: clamp(position.y, 0, 100),
          confirmed: Boolean(position.confirmed),
        }))
      : factoryLandmarkDefaultPositions.map((position) => ({ ...position }));
    const restoredEffectivePoints = buildEffectiveCalibrationPoints(restoredCalibrationPoints, restoredLandmarkDefaults);
    const restoredPlaces = clean.directoryPlaces?.length ? clean.directoryPlaces : defaultDirectoryPlaces;
    const restoredNames = new Set(restoredPlaces.map((place) => normalizePlaceName(place.name)));
    const mergedPlaces = [...restoredPlaces, ...supportDirectoryPlaces.filter((place) => !restoredNames.has(normalizePlaceName(place.name)))].map((place) => {
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
    setElements(migratedElements);
    setAssets(clean.assets);
    setReviewNotes(clean.reviewNotes);
    setDirectoryPlaces(placesRef.current);
    setCalibrationPoints(restoredCalibrationPoints);
    setLandmarkDefaultPositions(restoredLandmarkDefaults);
    setCalibrationDirty(false);
    setSelectedId(null);
    setSelectedNoteId(null);
  }, []);

  const pushHistory = useCallback(() => {
    const snapshot = cloneDocument(currentDocument());
    setUndoStack((current) => [...current.slice(-59), snapshot]);
    setRedoStack([]);
  }, [currentDocument]);

  const replaceElements = useCallback((updater: (current: MapElement[]) => MapElement[]) => {
    setElements((current) => {
      const next = updater(current);
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

  const applyCalibrationPoints = useCallback((nextPoints: CalibrationPoint[], _moveAllVisual = false, record = true) => {
    void _moveAllVisual;
    if (record) pushHistory();
    calibrationPointsRef.current = nextPoints;
    setCalibrationPoints(nextPoints);
    setCalibrationDirty(false);
    const effectivePoints = buildEffectiveCalibrationPoints(nextPoints, landmarkDefaultsRef.current);

    const mappedPlaces = placesRef.current.map((place) => {
      const mapped = calibratedPlaceCoordinates(place.name, place.latitude, place.longitude, effectivePoints);
      return mapped ? { ...place, ...mapped } : place;
    });
    const placesById = new Map(mappedPlaces.map((place) => [place.id, place]));
    const placesByName = new Map(mappedPlaces.map((place) => [normalizePlaceName(place.name), place]));
    replaceDirectoryPlaces(() => mappedPlaces);
    replaceElements((current) => current.map((element) => {
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
  }, [pushHistory, replaceDirectoryPlaces, replaceElements]);

  const updateCalibrationPoint = useCallback((id: string, patch: Partial<Pick<CalibrationPoint, "targetX" | "targetY">>, record = true) => {
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
    replaceElements((current) => current.map((element) => normalizePlaceName(element.name) === changed.name ? {
      ...element,
      x: clamp(changed.targetX + element.x - element.anchorX, 0, 100),
      y: clamp(changed.targetY + element.y - element.anchorY, 0, 100),
      anchorX: changed.targetX,
      anchorY: changed.targetY,
    } : element));
  }, [applyCalibrationPoints, pushHistory, replaceElements]);

  const resetCalibrationPoints = () => {
    applyCalibrationPoints(initialCalibrationPoints.map((point) => ({ ...point })), true);
    setToast("1차 기준점 6곳을 v15 기준으로 복원하고 저장된 2차 기준점을 다시 적용했습니다.");
  };

  const applyCalibrationToAll = () => {
    applyCalibrationPoints(calibrationPointsRef.current.map((point) => ({ ...point })), true);
    window.setTimeout(() => autoArrangeLabels(false, true), 0);
  };

  const moveAllResourcesToAnchors = () => {
    const targets = elementsRef.current.filter((element) => Number.isFinite(element.anchorX) && Number.isFinite(element.anchorY));
    if (!targets.length) {
      setToast("기준좌표가 설정된 마커가 없습니다.");
      return;
    }
    pushHistory();
    const targetIds = new Set(targets.map((element) => element.id));
    replaceElements((current) => current.map((element) => targetIds.has(element.id)
      ? { ...element, x: element.anchorX, y: element.anchorY }
      : element));
    window.setTimeout(() => autoArrangeLabels(false, true), 0);
    setToast(`기준좌표가 설정된 리소스 ${targets.length}개를 앵커 위치로 이동했습니다.`);
  };

  const updateElement = useCallback((id: string, patch: Partial<MapElement>, record = true) => {
    if (record) pushHistory();
    replaceElements((current) => current.map((element) => (element.id === id ? { ...element, ...patch } : element)));
  }, [pushHistory, replaceElements]);

  const updateElementAnchor = useCallback((element: MapElement, nextAnchorX: number, nextAnchorY: number, record = true) => {
    const anchorX = clamp(nextAnchorX, 0, 100);
    const anchorY = clamp(nextAnchorY, 0, 100);
    updateElement(element.id, {
      anchorX,
      anchorY,
      x: clamp(anchorX + element.x - element.anchorX, 0, 100),
      y: clamp(anchorY + element.y - element.anchorY, 0, 100),
    }, record);
  }, [updateElement]);

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
  const effectiveCalibrationPoints = useMemo(() => buildEffectiveCalibrationPoints(calibrationPoints, landmarkDefaultPositions), [calibrationPoints, landmarkDefaultPositions]);
  const secondaryCalibrationPoints = useMemo(() => effectiveCalibrationPoints.filter((point) => point.tier === "secondary"), [effectiveCalibrationPoints]);
  const selectedPrimaryCalibrationPoint = selected ? calibrationPoints.find((point) => point.name === normalizePlaceName(selected.name)) ?? null : null;
  const selectedSecondaryCalibrationPoint = selected ? secondaryCalibrationPoints.find((point) => point.name === normalizePlaceName(selected.name)) ?? null : null;
  const selectedCalibrationPoint = selectedPrimaryCalibrationPoint ?? selectedSecondaryCalibrationPoint;
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

  const filteredDirectoryPlaces = useMemo(() => {
    const query = placeQuery.trim().toLocaleLowerCase("ko-KR");
    return directoryPlaces.filter((place) => (
      (placeCategory === "all" || place.category === placeCategory)
      && (!query || `${place.name} ${place.address} ${place.area}`.toLocaleLowerCase("ko-KR").includes(query))
    ));
  }, [directoryPlaces, placeCategory, placeQuery]);

  const placedCategoryCounts = useMemo(() => categories.reduce<Record<CategoryId, number>>((counts, category) => {
    counts[category.id] = elements.filter((element) => element.category === category.id).length;
    return counts;
  }, { landmark: 0, culture: 0, cafe: 0, food: 0, parking: 0, park: 0, utility: 0 }), [elements]);

  const visibleElements = useMemo(() => [...elements]
    .filter((element) => activeCategory === "all" || element.category === activeCategory)
    .filter((element) => viewMode !== "landmarks" || element.category === "landmark")
    .filter((element) => viewMode !== "markers" || element.category !== "landmark")
    .sort((a, b) => a.z - b.z), [activeCategory, elements, viewMode]);

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

        let persistentCalibration: { calibrationPoints?: CalibrationPoint[]; landmarkDefaultPositions?: LandmarkDefaultPosition[] } | null = null;
        try {
          persistentCalibration = JSON.parse(localStorage.getItem(CALIBRATION_SETTINGS_KEY) ?? "null") as typeof persistentCalibration;
        } catch {
          persistentCalibration = null;
        }

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
                ...(correctedPlace?.coordinateStatus === "geocoded" ? {
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
            setDocument({
              elements: mergedElements,
              assets: mergedAssets,
              reviewNotes: parsed.reviewNotes ?? [],
              directoryPlaces: parsed.directoryPlaces,
              calibrationPoints: persistentCalibration?.calibrationPoints ?? parsed.calibrationPoints,
              landmarkDefaultPositions: persistentCalibration?.landmarkDefaultPositions ?? parsed.landmarkDefaultPositions,
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
  }, [assets, calibrationPoints, currentDocument, directoryPlaces, elements, hydrated, landmarkDefaultPositions, reviewNotes]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CALIBRATION_SETTINGS_KEY, JSON.stringify({
        calibrationPoints,
        landmarkDefaultPositions,
      }));
    } catch {}
  }, [calibrationPoints, hydrated, landmarkDefaultPositions]);

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
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const delta = ((event.clientX - interaction.startX) / rect.width) * 100;
      updateElement(interaction.id, { size: clamp(interaction.startSize + delta * 2, 0.8, 15) }, false);
    };
    const handleUp = () => setInteraction(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [interaction, updateElement]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!selectedId || ["INPUT", "SELECT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName)) return;
      const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const direction = directions[event.key];
      if (!direction) return;
      const element = elementsRef.current.find((item) => item.id === selectedId);
      if (!element) return;
      event.preventDefault();
      const step = event.shiftKey ? 0.5 : 0.08;
      const calibrationPoint = calibrationMode ? calibrationPointsRef.current.find((point) => point.name === normalizePlaceName(element.name)) : undefined;
      if (calibrationPoint) {
        updateCalibrationPoint(calibrationPoint.id, {
          targetX: calibrationPoint.targetX + direction[0] * step,
          targetY: calibrationPoint.targetY + direction[1] * step,
        });
        return;
      }
      if (element.locked) return;
      updateElement(selectedId, { x: clamp(element.x + direction[0] * step, 0, 100), y: clamp(element.y + direction[1] * step, 0, 100) });
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [calibrationMode, selectedId, updateCalibrationPoint, updateElement]);

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
    setSelectedId(null); setSelectedNoteId(null);
    setInteraction({ type: "pan", startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y });
  };

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (memoMode && event.button === 0) {
      event.stopPropagation();
      const point = clientToMap(event.clientX, event.clientY);
      pushHistory();
      const note: ReviewNote = { id: `review-${++nextNoteIdRef.current}`, x: point.x, y: point.y, status: "weaken", text: "" };
      replaceNotes((current) => [...current, note]);
      setSelectedId(null); setSelectedNoteId(note.id); setMemoMode(false); setRightOpen(true);
      return;
    }
    startPan(event);
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>, element: MapElement) => {
    event.stopPropagation();
    setSelectedId(element.id); setSelectedNoteId(null);
    setRightOpen(true);
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

  const findLandmarkDefault = useCallback((element: MapElement) => landmarkDefaultsRef.current.find((position) =>
    position.elementId === element.id || position.name === normalizePlaceName(element.name)
  ) ?? null, []);

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
    const position = findLandmarkDefault(element);
    if (!position) return;
    pushHistory();
    const nextPoints = calibrationPointsRef.current.map((point) => point.name === normalizePlaceName(element.name)
      ? { ...point, targetX: position.x, targetY: position.y }
      : point);
    calibrationPointsRef.current = nextPoints;
    setCalibrationPoints(nextPoints);
    if (nextPoints.some((point, index) => point.targetX !== calibrationPoints[index]?.targetX || point.targetY !== calibrationPoints[index]?.targetY)) setCalibrationDirty(true);
    replaceElements((current) => current.map((item) => item.id === element.id
      ? { ...item, x: clamp(position.x + item.x - item.anchorX, 0, 100), y: clamp(position.y + item.y - item.anchorY, 0, 100), anchorX: position.x, anchorY: position.y }
      : item));
    setToast(`${element.name}의 앵커를 저장된 기본 위치로 이동했습니다.`);
  };

  const resetLandmarkPositions = () => {
    const defaultsById = new Map(landmarkDefaultsRef.current.map((position) => [position.elementId, position]));
    const defaultsByName = new Map(landmarkDefaultsRef.current.map((position) => [position.name, position]));
    pushHistory();
    const nextPoints = calibrationPointsRef.current.map((point) => {
      const position = defaultsByName.get(point.name);
      return position ? { ...point, targetX: position.x, targetY: position.y } : point;
    });
    calibrationPointsRef.current = nextPoints;
    setCalibrationPoints(nextPoints);
    setCalibrationDirty(true);
    replaceElements((current) => current.map((element) => {
      if (element.category !== "landmark") return element;
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
      const mapped = result ? coordinatesToMap(result.latitude, result.longitude, buildEffectiveCalibrationPoints(calibrationPointsRef.current, landmarkDefaultsRef.current)) : null;
      if (mapped) {
        found += 1;
        replaceDirectoryPlaces((current) => current.map((item) => item.id === place.id ? {
          ...item, ...mapped, coordinateStatus: "geocoded", latitude: result!.latitude, longitude: result!.longitude,
        } : item));
        replaceElements((current) => current.map((element) => (
          element.directoryId === place.id || element.name === place.name
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
    const restored = missing.map((element, index) => ({ ...element, id: `element-${++nextIdRef.current}`, z: maxZ + index + 1 }));
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
      setSelectedId(existing.id);
      focusMapPosition(existing.x, existing.y, existing.id);
      setToast(`${place.name} 위치로 이동했습니다.`);
      return;
    }
    pushHistory();
    const next: MapElement = {
      ...elementDefaults,
      id: `element-${++nextIdRef.current}`,
      directoryId: place.id,
      name: place.name,
      category: place.category,
      x: place.x,
      y: place.y,
      anchorX: place.x,
      anchorY: place.y,
      size: place.category === "culture" ? 3 : 1.7,
      z: Math.max(0, ...elementsRef.current.map((item) => item.z)) + 1,
      labelVisible: true,
      assetId: defaultMarkerAssetId(place.category),
      status: defaultMarkerAssetId(place.category) ? "review" : "unchecked",
      address: place.address,
      memo: `${place.sourceLabel} · ${place.coordinateStatus === "landmark" ? "기본 앵커" : place.coordinateStatus === "geocoded" ? "주소 자동탐색 앵커(검수 필요)" : "권역 기준 임시 좌표"}`,
      addressSourceUrl: place.sourceUrl ?? "",
    };
    replaceElements((current) => [...current, next]);
    setSelectedId(next.id);
    focusMapPosition(next.x, next.y, next.id);
    setToast(`${place.name} 마커를 추가하고 위치로 이동했습니다.`);
  };

  const addAssetElement = (asset: MapAsset) => {
    pushHistory();
    const count = elementsRef.current.filter((item) => item.assetId === asset.id).length + 1;
    const size = asset.category === "landmark" ? 6.4 : asset.category === "culture" || asset.category === "park" ? 3 : 1.7;
    const next: MapElement = {
      ...elementDefaults, id: `element-${++nextIdRef.current}`, name: asset.placeName ?? (count > 1 ? `${asset.name} ${count}` : asset.name),
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
          id: `asset-${++nextAssetIdRef.current}`, name: file.name.replace(/\.[^.]+$/, ""), category: assetCategory,
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
      .filter((element) => element.labelVisible)
      .sort((a, b) => Number(b.category === "landmark") - Number(a.category === "landmark") || b.z - a.z);
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
    const iconRects = elementsRef.current.map((element) => {
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
    const positionOrder: LabelPosition[] = ["bottom", "top", "right", "left"];
    const lateralShifts = [0, -18, 18, -36, 36, -54, 54, -72, 72, -96, 96, -120, 120, -144, 144, -160, 160];
    const outwardShifts = [0, 12, 24, 36, 48, 64, 84, 108, 136, 160];
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
      const orderedPositions = [element.labelPosition, ...positionOrder.filter((position) => position !== element.labelPosition)];
      let best: { rect: NormalizedRect; position: LabelPosition; offsetX: number; offsetY: number; score: number; collisions: number } | null = null;
      orderedPositions.forEach((position, positionIndex) => lateralShifts.forEach((lateralShift) => outwardShifts.forEach((outwardShift) => {
        const offsetX = position === "top" || position === "bottom"
          ? lateralShift
          : position === "left" ? -outwardShift : outwardShift;
        const offsetY = position === "left" || position === "right"
          ? lateralShift
          : position === "top" ? -outwardShift : outwardShift;
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
          if (item.id === element.id || !rectsOverlap(rect, item.rect, 0.14)) return score;
          return score + (item.category === "landmark" ? 3 : 1);
        }, 0);
        const overflow = Math.max(0, -rect.left) + Math.max(0, rect.right - 100) + Math.max(0, -rect.top) + Math.max(0, rect.bottom - 100);
        const collisions = labelOverlapCount + iconOverlapScore;
        const distancePenalty = (Math.abs(lateralShift) + Math.abs(outwardShift) * 1.25) / 18;
        const score = labelOverlapCount * 12000 + iconOverlapScore * 7000 + overflow * 4000 + positionIndex * 4 + distancePenalty;
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

  function resolveRenderedLabelOverlaps(total: number, notify: boolean, pass = 0) {
    window.requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) {
        setLabelsRefreshing(false);
        return;
      }
      const priority = new Map([...elementsRef.current]
        .filter((element) => element.labelVisible)
        .sort((a, b) => Number(b.category === "landmark") - Number(a.category === "landmark") || b.z - a.z)
        .map((element, index) => [element.id, index]));
      const nodes = [...stage.querySelectorAll<HTMLElement>("[data-label-id]")]
        .map((node) => {
          const id = node.dataset.labelId;
          const element = elementsRef.current.find((item) => item.id === id);
          return id && element ? { id, element, rect: node.getBoundingClientRect() } : null;
        })
        .filter((item): item is { id: string; element: MapElement; rect: DOMRect } => Boolean(item?.rect.width && item.rect.height))
        .sort((a, b) => (priority.get(a.id) ?? 9999) - (priority.get(b.id) ?? 9999));
      const overlaps = (a: DOMRect | NormalizedRect, b: DOMRect | NormalizedRect, margin = 4) => (
        a.left < b.right + margin && a.right > b.left - margin && a.top < b.bottom + margin && a.bottom > b.top - margin
      );
      const shiftRect = (rect: DOMRect | NormalizedRect, dx: number, dy: number): NormalizedRect => ({
        left: rect.left + dx, right: rect.right + dx, top: rect.top + dy, bottom: rect.bottom + dy,
      });
      const stageRect = stage.getBoundingClientRect();
      const fixed: Array<{ id: string; rect: NormalizedRect }> = [];
      const adjustments = new Map<string, { x: number; y: number }>();

      nodes.forEach((item) => {
        let current: NormalizedRect = { left: item.rect.left, right: item.rect.right, top: item.rect.top, bottom: item.rect.bottom };
        let deltaX = 0;
        let deltaY = 0;
        for (let attempt = 0; attempt < Math.max(4, fixed.length * 3); attempt += 1) {
          const conflict = fixed.find((placed) => overlaps(current, placed.rect));
          if (!conflict) break;
          const margin = 5;
          const moves = [
            { x: conflict.rect.left - margin - current.right, y: 0 },
            { x: conflict.rect.right + margin - current.left, y: 0 },
            { x: 0, y: conflict.rect.top - margin - current.bottom },
            { x: 0, y: conflict.rect.bottom + margin - current.top },
          ];
          const bestMove = moves.map((move) => {
            const candidate = shiftRect(current, move.x, move.y);
            const collisionCount = fixed.reduce((count, placed) => count + (overlaps(candidate, placed.rect) ? 1 : 0), 0);
            const overflow = Math.max(0, stageRect.left - candidate.left) + Math.max(0, candidate.right - stageRect.right)
              + Math.max(0, stageRect.top - candidate.top) + Math.max(0, candidate.bottom - stageRect.bottom);
            return { ...move, candidate, score: collisionCount * 10000 + overflow * 120 + Math.abs(move.x) + Math.abs(move.y) };
          }).sort((a, b) => a.score - b.score)[0];
          current = bestMove.candidate;
          deltaX += bestMove.x;
          deltaY += bestMove.y;
        }
        fixed.push({ id: item.id, rect: current });
        if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) adjustments.set(item.id, { x: deltaX, y: deltaY });
      });

      if (adjustments.size && pass < 5) {
        const scale = Math.max(zoom, 0.22);
        replaceElements((current) => current.map((element) => {
          const adjustment = adjustments.get(element.id);
          return adjustment ? {
            ...element,
            labelOffsetX: clamp(element.labelOffsetX + adjustment.x / scale, -240, 240),
            labelOffsetY: clamp(element.labelOffsetY + adjustment.y / scale, -240, 240),
          } : element;
        }));
        window.setTimeout(() => resolveRenderedLabelOverlaps(total, notify, pass + 1), 0);
        return;
      }

      let remaining = 0;
      for (let index = 0; index < nodes.length; index += 1) for (let other = index + 1; other < nodes.length; other += 1) {
        if (overlaps(nodes[index].rect, nodes[other].rect, 0)) remaining += 1;
      }
      if (notify) setToast(remaining
        ? `라벨 위치 ${total}개를 새로고침했습니다. 밀집 구간 겹침 ${remaining}건은 개별 조정해 주세요.`
        : `라벨 위치 ${total}개를 새로고침했습니다. 랜드마크 우선으로 겹침 없이 정리했습니다.`);
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
    const duplicate = { ...selected, id: `element-${++nextIdRef.current}`, name: `${selected.name} 복사본`, x: clamp(selected.x + 1.2, 0, 100), y: clamp(selected.y + 1.2, 0, 100), z: Math.max(0, ...elementsRef.current.map((item) => item.z)) + 1 };
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

      const assetSources = [...new Set(elementsRef.current.map((element) => assetsRef.current.find((asset) => asset.id === element.assetId)?.src).filter(Boolean) as string[])];
      const loadedAssets = new Map<string, HTMLImageElement>();
      await Promise.all(assetSources.map(async (src) => {
        try { loadedAssets.set(src, await loadImage(src)); } catch { /* 개별 자산 실패는 나머지 합성을 막지 않습니다. */ }
      }));
      const ordered = [...elementsRef.current].sort((a, b) => a.z - b.z);
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

      const drawLabels = (items: MapElement[]) => items.forEach((element) => {
        if (!element.labelVisible) return;
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
      drawLabels(ordered.filter((element) => element.category !== "landmark"));
      drawLabels(ordered.filter((element) => element.category === "landmark"));

      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("png encoding failed")), "image/png"));
      const sizeMb = blob.size / 1024 / 1024;
      downloadBlob(`제주원도심_전체배치_고화질_${exportWidth}px.png`, blob);
      setToast(`고화질 PNG 사본을 만들었습니다 · ${exportWidth.toLocaleString()}×${outputHeight.toLocaleString()}px · ${sizeMb.toFixed(1)}MB`);
    } catch {
      setToast("고화질 사본 생성에 실패했습니다. 8,944px로 낮추거나 업로드 지도 상태를 확인해 주세요.");
    } finally {
      setExporting(false);
    }
  };

  const exportJson = () => {
    const payload = {
      schemaVersion: 5, exportedAt: new Date().toISOString(), map: { baseMap, aspect: MAP_ASPECT, coordinateSystem: "normalized-percent", calibration: "six-point-distance-weighted", landmarkDefaults: "user-editable" },
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
        <label className="select-control"><span>보기</span><select value={viewMode} onChange={(event) => setViewMode(event.target.value as ViewMode)}>
          <option value="all">전체 배치</option><option value="landmarks">랜드마크만</option><option value="markers">일반 마커만</option><option value="labels">라벨만</option>
          <option value="anchors">앵커·연결선</option><option value="clearance">아이콘 여유 구역</option><option value="collisions">충돌 검사</option>
          <option value="dim">베이스맵 명도 낮추기</option><option value="gray">베이스맵 흑백</option><option value="nomap">지도 없이 보기</option>
        </select></label>
        <div className="toolbar-group export-tools"><select value={exportWidth} onChange={(event) => setExportWidth(Number(event.target.value) as 8944 | 12000)} aria-label="고화질 사본 가로 크기"><option value="12000">12K PNG</option><option value="8944">원본 8.9K</option></select><button className="primary-export" disabled={exporting} onClick={() => void exportHighResolutionPng()}>{exporting ? "합성 중…" : "고화질 사본 ↓"}</button></div>
        <div className="toolbar-group muted-actions"><button onClick={exportJson}>JSON ↓</button><button onClick={() => jsonInputRef.current?.click()}>JSON ↑</button><input ref={jsonInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importJson} /></div>
      </header>

      <section className={`workspace ${leftOpen ? "" : "left-closed"} ${rightOpen ? "" : "right-closed"} ${leftPanelMode === "calibration" && leftOpen ? "calibration-open" : ""}`}>
        <aside ref={leftPanelRef} className="panel asset-panel" aria-label="자산 목록">
          <div className="panel-heading"><div><strong>{leftPanelMode === "assets" ? "자산" : leftPanelMode === "places" ? "장소 탐색" : "좌표 기준점"}</strong><span>{leftPanelMode === "assets" ? `${layoutName} · ${elements.length}개 배치` : leftPanelMode === "places" ? `조사 목록 ${directoryPlaces.length}곳 · 더블클릭 이동` : `기준점 ${calibrationPoints.length}곳 · 실시간 보정`}</span></div><button className="icon-button" onClick={() => setLeftOpen(false)} aria-label="왼쪽 패널 접기">‹</button></div>
          <div className="panel-tabs" role="tablist" aria-label="왼쪽 패널 내용">
            <button className={leftPanelMode === "assets" ? "active" : ""} onClick={() => switchLeftPanel("assets")} role="tab" aria-selected={leftPanelMode === "assets"}>아이콘·마커</button>
            <button className={leftPanelMode === "places" ? "active" : ""} onClick={() => switchLeftPanel("places")} role="tab" aria-selected={leftPanelMode === "places"}>장소 탐색 <span>{directoryPlaces.length}</span></button>
            <button className={leftPanelMode === "calibration" ? "active" : ""} onClick={() => switchLeftPanel("calibration")} role="tab" aria-selected={leftPanelMode === "calibration"}>좌표 보정 <span>6</span></button>
          </div>
          {leftPanelMode === "assets" ? <>
          <div className="panel-search">자산 목록 <kbd>{assets.length}</kbd></div>
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
            <div className="landmark-resource-heading"><strong>문화시설·카페·음식점·주차장·편의시설</strong><small>모든 범용 마커를 SVG로 구성해 확대·출력 시 선명합니다.</small></div>
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
              <p className="marker-style-help">문화시설·카페·음식점·주차장·공원·편의시설에 같은 시안을 일괄 적용합니다. 01안은 제작 기준상 우선 추천안이며 아직 최종 승인 전입니다.</p>
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
                <span><i style={{ background: categoryOf("parking").color }} />주차 <b>{placedCategoryCounts.parking}</b></span>
                <span><i style={{ background: categoryOf("utility").color }} />편의 <b>{placedCategoryCounts.utility}</b></span>
              </div>
              <div className="composition-actions"><button onClick={applyStarterComposition}>기본 구성 복원</button><button onClick={alignPlacedMarkersByAddress} disabled={geocodeProgress.active}>{geocodeProgress.active ? "주소 확인 중" : "배치 장소 주소로 정렬"}</button></div>
              <p>주소 정렬은 일반 마커의 앵커를 갱신하고 기존 리소스 오프셋을 유지합니다. 이후 속성 패널의 앵커·출력 오프셋 값으로 세부 보정할 수 있습니다.</p>
            </div>
            <div className="database-import">
              <div><strong>장소 마스터 DB</strong><span>문화·식음·주차·편의 {directoryPlaces.length}곳</span></div>
              <button onClick={() => dbInputRef.current?.click()} disabled={geocodeProgress.active}>{geocodeProgress.active ? "주소 찾는 중" : "DB JSON 불러오기"}</button>
              <input ref={dbInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importMasterDatabase} />
              {geocodeProgress.total > 0 && <div className="geocode-progress"><span style={{ width: `${(geocodeProgress.done / geocodeProgress.total) * 100}%` }} /><small>{geocodeProgress.done}/{geocodeProgress.total} · 반영 {geocodeProgress.found} · 미확정 {geocodeProgress.failed}</small></div>}
              <p>업로드 후 주소를 한 건씩 조회합니다. OpenStreetMap Nominatim 정책에 따라 초당 1건 이하로 처리하고 결과를 이 브라우저에 저장합니다. <a href="https://operations.osmfoundation.org/policies/nominatim/" target="_blank" rel="noreferrer">이용정책 ↗</a></p>
            </div>
            <div className="place-search-wrap"><input value={placeQuery} onChange={(event) => setPlaceQuery(event.target.value)} placeholder="장소명·주소·권역 검색" aria-label="장소 검색" />{placeQuery && <button onClick={() => setPlaceQuery("")} aria-label="검색어 지우기">×</button>}</div>
            <div className="place-filter" role="group" aria-label="장소 분류">
              {([
                ["all", "전체"], ["culture", "문화시설"], ["cafe", "카페"], ["food", "음식점"], ["parking", "주차장"], ["utility", "편의시설"],
              ] as const).map(([id, label]) => <button key={id} className={placeCategory === id ? "active" : ""} onClick={() => setPlaceCategory(id)}>{label}<span>{id === "all" ? directoryPlaces.length : directoryPlaces.filter((place) => place.category === id).length}</span></button>)}
            </div>
            <p className="place-directory-hint">목록을 더블클릭하면 마커를 만들거나 기존 요소를 찾아 지도 중앙에 표시합니다.</p>
            <div className="place-list" role="list" aria-label="조사 장소 목록">
              {filteredDirectoryPlaces.map((place) => {
                const placed = elements.some((element) => element.directoryId === place.id || element.name === place.name);
                const meta = categoryOf(place.category);
                return <button key={place.id} className={`place-row ${placed ? "placed" : ""}`} onDoubleClick={() => openDirectoryPlace(place)} onKeyDown={(event) => { if (event.key === "Enter") openDirectoryPlace(place); }} title="더블클릭하여 지도에 표시" role="listitem">
                  <span className="place-type" style={{ color: meta.color, background: `${meta.color}17`, borderColor: `${meta.color}45` }}>{meta.glyph}</span>
                  <span className="place-copy"><strong>{place.name}</strong><small>{place.area} · {place.address.replace("제주특별자치도 제주시 ", "")}</small><em>{place.sourceLabel}</em></span>
                  <span className={`coordinate-badge ${place.coordinateStatus}`}>{placed ? "배치됨" : place.coordinateStatus === "landmark" ? "기본 앵커" : place.coordinateStatus === "geocoded" ? "주소 조회" : place.coordinateStatus === "unresolved" ? "위치 미확정" : "권역 임시"}</span>
                </button>;
              })}
              {!filteredDirectoryPlaces.length && <div className="place-empty">조건에 맞는 장소가 없습니다.</div>}
            </div>
          </div> : <div className="calibration-panel">
            <div className="calibration-summary">
              <div><strong>계층형 좌표 보정망</strong><span>1차 6점 + 확정 랜드마크 {secondaryCalibrationPoints.length}곳 · {calibrationLiveApply ? "1차 기준 변경을 주변 장소에 실시간 반영합니다." : "기준값을 맞춘 뒤 보정 버튼으로 전체에 적용합니다."}</span></div>
              <label className="switch" title="기존 기준 위치 표시"><input type="checkbox" checked={showCalibrationSource} onChange={(event) => setShowCalibrationSource(event.target.checked)} /><span /></label>
            </div>
            <label className="calibration-live-toggle"><input type="checkbox" checked={calibrationLiveApply} onChange={(event) => { setCalibrationLiveApply(event.target.checked); if (event.target.checked && calibrationDirty) applyCalibrationToAll(); }} /><span><b>실시간 보정</b><small>끄면 기준점만 옮기고 버튼으로 일괄 적용</small></span></label>
            <p className="calibration-help">1차 기준점 6곳은 아래 X·Y와 화살표로 조정합니다. 추가 랜드마크는 우측 속성에서 앵커를 맞춰 기본 위치로 저장한 뒤 ‘2차 기준점으로 확정’하면 주변 마커 보정에 사용됩니다.</p>
            <div className="calibration-list">
              {calibrationPoints.map((point, index) => {
                const element = elements.find((item) => normalizePlaceName(item.name) === point.name);
                return <article key={point.id} className={`calibration-card ${selectedId === element?.id ? "active" : ""}`}>
                  <button className="calibration-focus" onClick={() => { if (!element) return; setSelectedId(element.id); setSelectedNoteId(null); setRightOpen(true); focusMapPosition(point.targetX, point.targetY, element.id); }}>
                    <b>{index + 1}</b><span><strong>{point.name}</strong><small>보정 ΔX {(point.targetX - point.sourceX).toFixed(1)} · ΔY {(point.targetY - point.sourceY).toFixed(1)}</small></span>
                  </button>
                  <div className="calibration-coordinate-row">
                    <label>X<input type="number" min="0" max="100" step="0.1" value={point.targetX.toFixed(2)} onChange={(event) => updateCalibrationPoint(point.id, { targetX: Number(event.target.value) })} /></label>
                    <label>Y<input type="number" min="0" max="100" step="0.1" value={point.targetY.toFixed(2)} onChange={(event) => updateCalibrationPoint(point.id, { targetY: Number(event.target.value) })} /></label>
                    <div className="calibration-nudge" aria-label={`${point.name} 미세 이동`}>
                      <button onClick={() => updateCalibrationPoint(point.id, { targetY: point.targetY - 0.1 })} aria-label="위로">↑</button>
                      <button onClick={() => updateCalibrationPoint(point.id, { targetX: point.targetX - 0.1 })} aria-label="왼쪽으로">←</button>
                      <button onClick={() => updateCalibrationPoint(point.id, { targetX: point.targetX + 0.1 })} aria-label="오른쪽으로">→</button>
                      <button onClick={() => updateCalibrationPoint(point.id, { targetY: point.targetY + 0.1 })} aria-label="아래로">↓</button>
                    </div>
                  </div>
                </article>;
              })}
            </div>
            <div className="secondary-calibration-list">
              <div className="review-list-head"><strong>2차 확정 기준점</strong><span>{secondaryCalibrationPoints.length}</span></div>
              {secondaryCalibrationPoints.length ? secondaryCalibrationPoints.map((point) => {
                const element = elements.find((item) => normalizePlaceName(item.name) === point.name);
                return <article key={point.id} className={`calibration-card secondary ${selectedId === element?.id ? "active" : ""}`}>
                  <button className="calibration-focus" onClick={() => { if (!element) return; setSelectedId(element.id); setSelectedNoteId(null); setRightOpen(true); focusMapPosition(point.targetX, point.targetY, element.id); }}>
                    <b>S</b><span><strong>{point.name}</strong><small>기본 앵커 {point.targetX.toFixed(1)}, {point.targetY.toFixed(1)} · 주변 보정 고정점</small></span>
                  </button>
                </article>;
              }) : <p className="secondary-empty">랜드마크의 기본 위치를 확정하면 여기에 추가됩니다.</p>}
            </div>
            <div className="calibration-actions">
              <button className={`primary ${calibrationDirty ? "attention" : ""}`} onClick={applyCalibrationToAll}>전체 좌표 보정 적용{calibrationDirty ? " · 변경 있음" : ""}</button>
              <button onClick={resetCalibrationPoints}>1차 6점 초기화</button>
            </div>
            <button className="calibration-anchor-align" onClick={moveAllResourcesToAnchors}>모든 리소스를 현재 기준좌표(앵커)로 이동</button>
            <p className="calibration-warning">보정 시 1차 6점과 2차 확정 랜드마크는 고정점으로 유지되고, 다른 장소 앵커가 가까운 기준점의 영향을 받아 이동합니다. 리소스의 앵커 기준 오프셋은 유지됩니다.</p>
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
          <div className="canvas-toolbar"><div className="segmented"><button className={baseMap === "svg" ? "active" : ""} onClick={() => { setMapLoaded(false); setBaseMap("svg"); }}>벡터</button><button className={baseMap === "png" ? "active" : ""} onClick={() => { setMapLoaded(false); setBaseMap("png"); }}>원본 PNG</button>{uploadedBaseMap?.available && <button className={baseMap === "uploaded" ? "active" : ""} onClick={() => { setMapLoaded(false); setBaseMap("uploaded"); }}>업로드 지도</button>}</div><span className="map-file" title={activeBaseMapLabel}>{activeBaseMapLabel}</span>{baseMapCanUpload === false && <a className="inline-signin" href="/signin-with-chatgpt?return_to=/">소유자 로그인</a>}<button className="inline-tool" disabled={baseMapUploading} onClick={() => mapUploadInputRef.current?.click()}>{baseMapUploading ? "저장 중…" : "베이스 지도 업로드"}</button><input ref={mapUploadInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" onChange={(event) => void uploadBaseMap(event)} /><button className={`inline-tool label-refresh ${labelsRefreshing ? "refreshing" : ""}`} disabled={labelsRefreshing} onClick={refreshLabelPositions} title="현재 아이콘과 라벨 위치를 기준으로 겹치지 않게 다시 배치"><span aria-hidden="true">↻</span>{labelsRefreshing ? "정리 중…" : "라벨 위치 새로고침"}</button><button className={`inline-memo ${memoMode ? "active" : ""}`} onClick={() => setMemoMode((value) => !value)}>⌖ 메모 핀</button><div className="canvas-hint">{calibrationMode ? "기준점 이동 → 전체 좌표 보정 적용" : "휠 확대 · 빈 공간 드래그 · 방향키 미세 조정"}</div></div>
          <div className={`map-viewport ${interaction?.type === "pan" ? "is-panning" : ""} ${memoMode ? "memo-cursor" : ""}`} ref={viewportRef} onWheel={onWheel} onPointerDown={startPan}>
            <div className="map-stage-wrap" style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})` }}>
              <div className={`map-stage ${stageMapClass} ${calibrationMode ? "calibration-active" : ""}`} ref={stageRef} style={{ aspectRatio: `${MAP_ASPECT}` }} onPointerDown={handleStagePointerDown}>
                {!mapLoaded && <div className="map-loading"><span />초고해상도 베이스맵 불러오는 중</div>}
                <img ref={baseMapImgRef} className="base-map" src={activeBaseMapSrc} alt="제주 원도심 검수용 베이스맵" draggable={false} onLoad={() => setMapLoaded(true)} />
                {calibrationMode && <svg className="calibration-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="좌표 보정 기준점 연결망">
                  {([ [0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [5, 1], [0, 3] ] as Array<[number, number]>).map(([from, to]) => <line key={`${from}-${to}`} x1={calibrationPoints[from].targetX} y1={calibrationPoints[from].targetY} x2={calibrationPoints[to].targetX} y2={calibrationPoints[to].targetY} className="calibration-mesh-line" />)}
                  {showCalibrationSource && calibrationPoints.map((point) => <g key={`source-${point.id}`}><line x1={point.sourceX} y1={point.sourceY} x2={point.targetX} y2={point.targetY} className="calibration-offset-line" /><circle cx={point.sourceX} cy={point.sourceY} r="0.34" className="calibration-source-dot" /></g>)}
                  {secondaryCalibrationPoints.map((point) => <g key={`secondary-${point.id}`}><line x1={point.sourceX} y1={point.sourceY} x2={point.targetX} y2={point.targetY} className="calibration-secondary-line" /><circle cx={point.targetX} cy={point.targetY} r="0.45" className="calibration-secondary-dot" /></g>)}
                </svg>}
                <svg className="connector-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{visibleElements.map((element) => {
                  const showAnchor = viewMode === "anchors" || element.connectorVisible || selectedId === element.id;
                  if (!showAnchor) return null;
                  const showLine = element.connectorVisible && (Math.abs(element.x - element.anchorX) > 0.05 || Math.abs(element.y - element.anchorY) > 0.05);
                  return <g key={`anchor-${element.id}`} opacity={element.opacity / 100}>{showLine && <line x1={element.anchorX} y1={element.anchorY} x2={element.x} y2={element.y} stroke={element.connectorColor} strokeWidth={element.connectorWidth / 10} vectorEffect="non-scaling-stroke" />}<circle cx={element.anchorX} cy={element.anchorY} r="0.42" fill="white" stroke={element.connectorColor} strokeWidth="0.13" vectorEffect="non-scaling-stroke" /><circle cx={element.anchorX} cy={element.anchorY} r="0.12" fill={element.connectorColor} /></g>;
                })}</svg>
                <div className="element-layer">{visibleElements.map((element) => {
                  const meta = categoryOf(element.category); const isSelected = selectedId === element.id; const asset = assets.find((item) => item.id === element.assetId);
                  const isCalibrationReference = calibrationMode && effectiveCalibrationPoints.some((point) => point.name === normalizePlaceName(element.name));
                  const collisionClass = collisions.hard.has(element.id) ? "collision-hard" : collisions.clearance.has(element.id) ? "collision-near" : "";
                  return <div key={element.id} className={`map-element ${isSelected ? "selected" : ""} ${focusPulseId === element.id ? "focus-pulse" : ""} ${element.locked ? "locked" : ""} ${isCalibrationReference ? "calibration-reference" : ""} ${viewMode === "collisions" ? collisionClass : ""} ${viewMode === "labels" ? "label-only" : ""}`} style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.size}%`, zIndex: element.z, color: meta.color, opacity: element.opacity / 100 }} onPointerDown={(event) => startDrag(event, element)}>
                    {(viewMode === "clearance" || (viewMode === "collisions" && collisionClass)) && <span className={`clearance-zone ${viewMode === "clearance" ? "visible" : collisionClass}`} />}
                    <div className="icon-visual">{asset ? <img className="placed-asset" src={asset.src} alt="" draggable={false} onLoad={(event) => measureAssetBounds(asset.id, event.currentTarget)} /> : <div className={`dummy-symbol ${element.category === "landmark" ? "landmark" : "marker"}`}><span>{meta.glyph}</span></div>}</div>
                    {element.status !== "approved" && viewMode !== "labels" && (element.category === "landmark" || isSelected) && <span className="review-flag">{element.status === "review" ? "검수 중" : "미검수"}</span>}
                    {element.labelVisible && <div className="label" data-label-id={element.id} style={labelStyle(element.labelPosition, element.labelGap, element.labelOffsetX, element.labelOffsetY, zoom, asset ? assetVisualBounds[asset.id] : undefined)}>{element.name}</div>}
                    {isSelected && !element.locked && <button className="resize-handle" aria-label="크기 조절" onPointerDown={(event) => { event.stopPropagation(); pushHistory(); setInteraction({ type: "resize", id: element.id, startX: event.clientX, startSize: element.size }); }} />}
                  </div>;
                })}</div>
                {calibrationMode && <div className="calibration-badge-layer">{calibrationPoints.map((point, index) => <span key={`badge-${point.id}`} className="calibration-map-badge" style={{ left: `${point.targetX}%`, top: `${point.targetY}%` }}>{index + 1}</span>)}{secondaryCalibrationPoints.map((point) => <span key={`badge-${point.id}`} className="calibration-map-badge secondary" style={{ left: `${point.targetX}%`, top: `${point.targetY}%` }}>S</span>)}</div>}
                <div className="review-pin-layer">{reviewNotes.map((note, index) => <button key={note.id} className={`review-pin ${note.status} ${selectedNoteId === note.id ? "selected" : ""}`} style={{ left: `${note.x}%`, top: `${note.y}%` }} onPointerDown={(event) => { event.stopPropagation(); setSelectedNoteId(note.id); setSelectedId(null); setRightOpen(true); }} title={`${reviewStatusText[note.status]}: ${note.text || "내용 없음"}`}><span>{index + 1}</span></button>)}</div>
              </div>
            </div>
            <div className="map-scale"><span /> 정규화 좌표 0–100%</div><div className="mobile-readonly">모바일에서는 확대·이동과 배치 열람을 지원합니다.</div>
            {viewMode === "collisions" && <div className="collision-legend"><span><i className="hard" />아이콘 겹침 {collisions.hard.size}</span><span><i className="near" />여유 구역 침범 {collisions.clearance.size}</span></div>}
          </div>
          <footer className="statusbar"><span className="status-ok"><i /> {baseMap === "uploaded" ? "업로드 베이스맵 연결됨" : "기본 베이스맵 연결됨"}</span><span>{calibrationDirty ? "기준점 변경 · 보정 적용 대기" : `1차 6점 + 2차 ${secondaryCalibrationPoints.length}점 보정망 적용`}</span><span>요소 {visibleElements.length} / {elements.length}</span><span>장소 목록 {directoryPlaces.length}</span><span>메모 {reviewNotes.length}</span><span>{saveState}</span><span className="status-end">앵커 중심 좌표 보정 · 라벨 자동 정리</span></footer>
        </section>
        {!rightOpen && <button className="panel-reopen right" onClick={() => setRightOpen(true)}>‹ 속성</button>}

        <aside className="panel properties-panel" aria-label="속성 편집">
          <div className="panel-heading"><div><strong>{selectedNote ? "검토 메모" : "속성"}</strong><span>{selected?.name ?? (selectedNote ? reviewStatusText[selectedNote.status] : "요소를 선택하세요")}</span></div><button className="icon-button" onClick={() => setRightOpen(false)} aria-label="오른쪽 패널 접기">›</button></div>
          {selectedNote ? <div className="property-form note-form">
            <section><div className="section-title"><strong>도로·골목 검토</strong><span>메모 핀</span></div><label>상태<select value={selectedNote.status} onChange={(event) => updateNote(selectedNote.id, { status: event.target.value as ReviewStatus })}><option value="delete">삭제 검토</option><option value="weaken">약화 검토</option><option value="keep">유지</option><option value="hierarchy">도로 위계 조정</option></select></label><label>검토 내용<textarea value={selectedNote.text} onChange={(event) => updateNote(selectedNote.id, { text: event.target.value })} placeholder="가려지는 도로, 골목 정리 이유 등을 기록" /></label></section>
            <section><div className="section-title"><strong>지도 위치</strong><span>%</span></div><div className="field-row"><label>X<input type="number" step="0.1" value={selectedNote.x.toFixed(2)} onChange={(event) => updateNote(selectedNote.id, { x: clamp(Number(event.target.value), 0, 100) })} /></label><label>Y<input type="number" step="0.1" value={selectedNote.y.toFixed(2)} onChange={(event) => updateNote(selectedNote.id, { y: clamp(Number(event.target.value), 0, 100) })} /></label></div></section>
            <section><button className="wide-danger" onClick={deleteSelectedNote}>검토 메모 삭제</button></section>
          </div> : !selected ? <div className="empty-properties"><span>◇</span><strong>선택된 요소가 없습니다</strong><p>지도 위 요소나 검토 메모를 클릭하면 세부 설정을 편집할 수 있습니다.</p></div> : <div className="property-form">
            <section><div className="section-title"><strong>기본 정보</strong><span className={`status-pill ${selected.status}`}>{statusText[selected.status]}</span></div><label>장소명<input value={selected.name} onChange={(event) => updateElement(selected.id, { name: event.target.value })} /></label><label>주소<input value={selected.address} onChange={(event) => updateElement(selected.id, { address: event.target.value })} placeholder="장소 주소" /></label>{selected.addressSourceUrl && <a className="source-link" href={selected.addressSourceUrl} target="_blank" rel="noreferrer">주소 확인 출처 ↗</a>}<label>카테고리<select value={selected.category} onChange={(event) => updateElement(selected.id, { category: event.target.value as CategoryId })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>사용 자산<select value={selected.assetId ?? ""} onChange={(event) => { const asset = assets.find((item) => item.id === event.target.value); updateElement(selected.id, asset ? { assetId: asset.id, status: asset.status, category: asset.category, address: asset.address || selected.address, addressSourceUrl: asset.addressSourceUrl || selected.addressSourceUrl } : { assetId: null }); }}><option value="" disabled>리소스 미지정</option>{compatibleAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>{selected.category === "landmark" && compatibleAssets.length > 1 && <div className="property-candidate-grid" aria-label="랜드마크 후보 리소스">{compatibleAssets.map((asset) => <button key={asset.id} className={selected.assetId === asset.id ? "active" : ""} onClick={() => updateElement(selected.id, { assetId: asset.id, status: asset.status })} title={asset.name}><img src={asset.src} alt="" /><span>{asset.name}</span></button>)}</div>}{selectedAsset && <div className="asset-source-box"><span>{selectedAsset.sourceLabel ?? "사용자 업로드 자산"}</span>{selectedAsset.sourceUrl && <a href={selectedAsset.sourceUrl} target="_blank" rel="noreferrer">Drive 원본 보기 ↗</a>}</div>}<label>검수 상태<select value={selected.status} onChange={(event) => updateElement(selected.id, { status: event.target.value as AssetStatus })}><option value="approved">승인 완료</option><option value="review">검수 중</option><option value="unchecked">미검수</option></select></label><label>요소 메모<textarea value={selected.memo} onChange={(event) => updateElement(selected.id, { memo: event.target.value })} placeholder="배치 판단과 검수 의견 기록" /></label></section>
            <section><div className="section-title"><strong>리소스 출력 오프셋</strong><span>앵커 기준</span></div>{selectedDisplayOffset && <><div className="field-row"><label>ΔX<input type="number" step="0.1" value={selectedDisplayOffset.x.toFixed(2)} onChange={(event) => updateElement(selected.id, { x: clamp(selected.anchorX + Number(event.target.value), 0, 100) })} /></label><label>ΔY<input type="number" step="0.1" value={selectedDisplayOffset.y.toFixed(2)} onChange={(event) => updateElement(selected.id, { y: clamp(selected.anchorY + Number(event.target.value), 0, 100) })} /></label></div><div className="offset-nudge-grid" aria-label="리소스 출력 위치 미세 조정"><button onClick={() => updateElement(selected.id, { x: clamp(selected.x - 0.1, 0, 100) })}>←</button><button onClick={() => updateElement(selected.id, { y: clamp(selected.y - 0.1, 0, 100) })}>↑</button><button onClick={() => updateElement(selected.id, { y: clamp(selected.y + 0.1, 0, 100) })}>↓</button><button onClick={() => updateElement(selected.id, { x: clamp(selected.x + 0.1, 0, 100) })}>→</button><button className="reset" onClick={() => updateElement(selected.id, { x: selected.anchorX, y: selected.anchorY })}>오프셋 0</button></div></>}<p className="field-help">지도에서는 요소를 선택만 합니다. 리소스 위치는 앵커와의 ΔX·ΔY 또는 화살표 버튼으로 조정합니다.</p><label className="range-label"><span>크기 <b>{selected.size.toFixed(1)}%</b></span><input type="range" min="0.8" max="15" step="0.1" value={selected.size} onChange={(event) => updateElement(selected.id, { size: Number(event.target.value) })} /></label><label className="range-label"><span>투명도 <b>{selected.opacity}%</b></span><input type="range" min="10" max="100" step="1" value={selected.opacity} onChange={(event) => updateElement(selected.id, { opacity: Number(event.target.value) })} /></label><div className="layer-actions"><button onClick={() => moveLayer("back")}>맨 뒤</button><button onClick={() => moveLayer("backward")}>한 칸 뒤</button><button onClick={() => moveLayer("forward")}>한 칸 앞</button><button onClick={() => moveLayer("front")}>맨 앞</button></div></section>
            {selected.category === "landmark" && selectedLandmarkDefault && <section className="landmark-default-section"><div className="section-title"><strong>랜드마크 기본 앵커</strong><span>{selectedIsPrimaryCalibration ? "1차 기준점" : selectedLandmarkDefault.confirmed ? "2차 기준점" : "초기화 기준"}</span></div><div className="field-row"><label>기본 X<input type="number" min="0" max="100" step="0.1" value={selectedLandmarkDefault.x.toFixed(2)} onChange={(event) => updateLandmarkDefault(selected, { x: Number(event.target.value) })} /></label><label>기본 Y<input type="number" min="0" max="100" step="0.1" value={selectedLandmarkDefault.y.toFixed(2)} onChange={(event) => updateLandmarkDefault(selected, { y: Number(event.target.value) })} /></label></div><div className="landmark-default-buttons"><button className="primary" onClick={() => saveLandmarkAsDefault(selected)}>현재 앵커를 기본값으로 저장</button><button onClick={() => moveLandmarkToDefault(selected)}>기본 앵커로 이동</button></div>{selectedIsPrimaryCalibration ? <div className="default-tier-note primary">1차 기준점 6곳은 항상 최우선 보정 기준으로 유지됩니다.</div> : <label className="default-confirm-toggle"><input type="checkbox" checked={Boolean(selectedLandmarkDefault.confirmed)} disabled={!selectedHasGeocodedSource} onChange={(event) => updateLandmarkDefault(selected, { confirmed: event.target.checked })} /><span><b>2차 기준점으로 확정</b><small>{selectedHasGeocodedSource ? "기본 앵커를 고정점으로 사용해 주변 마커를 보정합니다." : "실제 장소 좌표가 없어 2차 기준점으로 사용할 수 없습니다."}</small></span></label>}<p className="field-help">기본 위치는 화면상 리소스가 아니라 실제 위치 앵커를 기준으로 저장되며 자동 저장·배치안·JSON에 포함됩니다.</p></section>}
            <section><div className="section-title"><strong>실제 위치 앵커</strong><span>{selectedPrimaryCalibrationPoint ? "1차 기준점" : selectedSecondaryCalibrationPoint ? "2차 확정 기준점" : "직접 편집"}</span></div>{selectedCalibrationPoint && <div className="calibration-property-note"><b>◎ {selectedPrimaryCalibrationPoint ? "1차 6점 보정 기준" : "2차 확정 보정 기준"}</b><span>{selectedPrimaryCalibrationPoint ? (calibrationLiveApply ? "이 앵커를 바꾸면 주변 장소가 실시간으로 함께 보정됩니다." : "앵커를 맞춘 뒤 좌표 보정 패널에서 전체 적용 버튼을 눌러주세요.") : "확정한 기본 앵커를 유지하면서 주변 장소의 실제 좌표를 지역적으로 보정합니다."}</span></div>}<div className="field-row"><label>X<input type="number" step="0.1" value={(selectedPrimaryCalibrationPoint?.targetX ?? selected.anchorX).toFixed(2)} onChange={(event) => selectedPrimaryCalibrationPoint ? updateCalibrationPoint(selectedPrimaryCalibrationPoint.id, { targetX: Number(event.target.value) }) : updateElementAnchor(selected, Number(event.target.value), selected.anchorY)} /></label><label>Y<input type="number" step="0.1" value={(selectedPrimaryCalibrationPoint?.targetY ?? selected.anchorY).toFixed(2)} onChange={(event) => selectedPrimaryCalibrationPoint ? updateCalibrationPoint(selectedPrimaryCalibrationPoint.id, { targetY: Number(event.target.value) }) : updateElementAnchor(selected, selected.anchorX, Number(event.target.value))} /></label></div>{selectedCalibrationPoint && <button className="wide-secondary" onClick={() => switchLeftPanel("calibration")}>계층형 좌표 보정 패널 열기</button>}<p className="field-help">앵커는 직접 수정할 수 있으며, 변경해도 리소스의 ΔX·ΔY 오프셋은 유지됩니다. 주소 자동 조회 좌표는 최종 육안 검수가 필요합니다.</p></section>
            <section><div className="section-title"><strong>연결선</strong><label className="switch"><input type="checkbox" checked={selected.connectorVisible} onChange={(event) => updateElement(selected.id, { connectorVisible: event.target.checked })} /><span /></label></div><div className="field-row compact-color-row"><label>색상<input type="color" value={selected.connectorColor} onChange={(event) => updateElement(selected.id, { connectorColor: event.target.value })} /></label><label>굵기<input type="number" min="0.5" max="6" step="0.5" value={selected.connectorWidth} onChange={(event) => updateElement(selected.id, { connectorWidth: clamp(Number(event.target.value), 0.5, 6) })} /></label></div></section>
            <section><div className="section-title"><strong>라벨</strong><label className="switch"><input type="checkbox" checked={selected.labelVisible} onChange={(event) => updateElement(selected.id, { labelVisible: event.target.checked })} /><span /></label></div><div className="position-grid">{(["top", "bottom", "left", "right"] as LabelPosition[]).map((position) => <button key={position} className={selected.labelPosition === position ? "active" : ""} onClick={() => updateElement(selected.id, { labelPosition: position })}>{{ top: "위", bottom: "아래", left: "왼쪽", right: "오른쪽" }[position]}</button>)}</div><label className="range-label"><span>보이는 아이콘과 간격 <b>{selected.labelGap}px</b></span><input type="range" min="0" max="40" step="1" value={selected.labelGap} onChange={(event) => updateElement(selected.id, { labelGap: Number(event.target.value) })} /></label><div className="field-row label-offset-fields"><label>좌우 미세 조정<input type="number" min="-240" max="240" step="1" value={selected.labelOffsetX} onChange={(event) => updateElement(selected.id, { labelOffsetX: clamp(Number(event.target.value), -240, 240) })} /></label><label>상하 미세 조정<input type="number" min="-240" max="240" step="1" value={selected.labelOffsetY} onChange={(event) => updateElement(selected.id, { labelOffsetY: clamp(Number(event.target.value), -240, 240) })} /></label></div><button className="wide-secondary" disabled={labelsRefreshing} onClick={refreshLabelPositions}>{labelsRefreshing ? "라벨 위치 정리 중…" : "전체 라벨 위치 새로고침"}</button><p className="field-help">투명 여백을 제외한 실제 아이콘 가장자리를 기준으로 배치됩니다. 새로고침은 랜드마크 라벨을 먼저 고정한 뒤 나머지 겹침을 피하며, 실행 후에도 개별 미세 조정할 수 있습니다.</p></section>
            <section><div className="section-title"><strong>빠른 작업</strong></div><div className="quick-actions"><button onClick={duplicateSelected}>복제</button><button onClick={() => updateElement(selected.id, { locked: !selected.locked })}>{selected.locked ? "잠금 해제" : "잠금"}</button><button className="danger" disabled={selected.locked} onClick={deleteSelected}>삭제</button></div></section>
          </div>}
        </aside>
      </section>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
