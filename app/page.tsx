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

const MAP_ASPECT = 8944 / 7324;
const MAP_SVG = "/maps/제주원도심_랜드마크탐색_베이스맵_v15_골목추가정리_검수본_마스터벡터.svg";
const MAP_PNG = "/maps/제주원도심_랜드마크탐색_베이스맵_v15_골목추가정리_검수본_초고해상도.png";
const AUTOSAVE_KEY = "jeju-wondosim-map-review:autosave:v3";
const LAYOUTS_KEY = "jeju-wondosim-map-review:layouts:v3";
const GEOCODE_CACHE_KEY = "jeju-wondosim-map-review:geocode-cache:v1";
const DELETED_PLACE_NAMES = new Set(["산짓물공원", "산짓물 공원"]);
const GEO_BOUNDS = { west: 126.5135, east: 126.5365, north: 33.5208, south: 33.499 } as const;

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

type DocumentState = {
  elements: MapElement[];
  assets: MapAsset[];
  reviewNotes: ReviewNote[];
  directoryPlaces?: DirectoryPlace[];
};

const elementDefaults: Omit<MapElement, "id" | "name" | "category" | "x" | "y" | "anchorX" | "anchorY" | "size" | "z"> = {
  labelVisible: false,
  labelPosition: "bottom",
  labelGap: 8,
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
      const fallback = areaFallbacks[row.area] ?? { x: 50, y: 50 };
      return {
        id: legacy?.id ?? `master-place-${index + 1}`,
        name,
        category: row.category,
        area: row.area,
        address: row.address,
        x: legacy?.x ?? fallback.x,
        y: legacy?.y ?? fallback.y,
        coordinateStatus: legacy?.coordinateStatus === "landmark" ? "landmark" : "review",
        sourceLabel: `마스터DB · ${row.subtype}`,
        sourceUrl: row.sourceUrl,
        subtype: row.subtype,
        priority: row.priority,
      };
    });
  const names = new Set(built.map((place) => place.name));
  return [
    ...built,
    ...legacyDirectoryPlaces.filter((place) => !names.has(normalizePlaceName(place.name))),
    ...supportDirectoryPlaces.filter((place) => !names.has(normalizePlaceName(place.name))),
  ];
}

const defaultDirectoryPlaces = buildDirectoryPlaces(masterDirectoryRows);
const directoryByName = new Map(defaultDirectoryPlaces.map((place) => [place.name, place]));

const addressByPlace = new Map(landmarkLocations.map((location) => [location.name, location]));

const builtInLandmarkAssets: MapAsset[] = bundledLandmarkAssets.map((asset) => {
  const location = addressByPlace.get(asset.placeName);
  return {
    ...asset,
    category: "landmark",
    fileType: "png",
    address: location?.address ?? "",
    addressSourceUrl: location?.addressSourceUrl ?? "",
    sourceLabel: `Google Drive · 03_128px_검수본 · ${asset.fileName}`,
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
  return category === "culture" || category === "cafe" || category === "food" || category === "parking";
}

function defaultMarkerAssetId(category: CategoryId, style: BundledMarkerStyle = recommendedMarkerStyle) {
  return isBundledMarkerCategory(category) ? markerAssetId(style, category) : null;
}

const initialLandmarkElements: MapElement[] = landmarkLocations.map((location, index) => {
  const asset = builtInAssets.find((item) => item.id === location.assetId);
  const directoryPlace = directoryByName.get(location.name);
  return {
    ...elementDefaults,
    id: `default-landmark-${index + 1}`,
    name: location.name,
    category: "landmark",
    x: location.x,
    y: location.y,
    anchorX: location.x,
    anchorY: location.y,
    size: 6.2,
    z: index + 1,
    labelVisible: true,
    assetId: location.assetId,
    status: asset?.status ?? "unchecked",
    address: location.address,
    addressSourceUrl: location.addressSourceUrl,
    memo: "초기 배치 좌표는 검수용이며 실제 위치 앵커는 장소 DB 확인 후 확정 필요",
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
    const x = clamp(place.x + offset.x, 3, 97);
    const y = clamp(place.y + offset.y, 3, 97);
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

const statusText: Record<AssetStatus, string> = { approved: "승인 완료", review: "검수 중", unchecked: "미검수" };
const reviewStatusText: Record<ReviewStatus, string> = { delete: "삭제 검토", weaken: "약화 검토", keep: "유지", hierarchy: "도로 위계 조정" };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function categoryOf(id: CategoryId) {
  return categories.find((category) => category.id === id) ?? categories[6];
}

function labelStyle(position: LabelPosition, gap: number) {
  if (position === "top") return { left: "50%", bottom: `calc(100% + ${gap}px)`, transform: "translateX(-50%)" };
  if (position === "bottom") return { left: "50%", top: `calc(100% + ${gap}px)`, transform: "translateX(-50%)" };
  if (position === "left") return { right: `calc(100% + ${gap}px)`, top: "50%", transform: "translateY(-50%)" };
  return { left: `calc(100% + ${gap}px)`, top: "50%", transform: "translateY(-50%)" };
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

function coordinatesToMap(latitude: number, longitude: number) {
  const x = ((longitude - GEO_BOUNDS.west) / (GEO_BOUNDS.east - GEO_BOUNDS.west)) * 100;
  const y = ((GEO_BOUNDS.north - latitude) / (GEO_BOUNDS.north - GEO_BOUNDS.south)) * 100;
  if (x < -2 || x > 102 || y < -2 || y > 102) return null;
  return { x: clamp(x, 0, 100), y: clamp(y, 0, 100) };
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
  const geocodeRunRef = useRef(0);
  const nextIdRef = useRef(100);
  const nextAssetIdRef = useRef(0);
  const nextNoteIdRef = useRef(0);
  const elementsRef = useRef<MapElement[]>(initialElements);
  const assetsRef = useRef<MapAsset[]>(builtInAssets);
  const notesRef = useRef<ReviewNote[]>([]);
  const placesRef = useRef<DirectoryPlace[]>(defaultDirectoryPlaces);

  const [elements, setElements] = useState(initialElements);
  const [assets, setAssets] = useState<MapAsset[]>(builtInAssets);
  const [reviewNotes, setReviewNotes] = useState<ReviewNote[]>([]);
  const [directoryPlaces, setDirectoryPlaces] = useState<DirectoryPlace[]>(defaultDirectoryPlaces);
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
  const [baseMap, setBaseMap] = useState<"svg" | "png">("svg");
  const [activeCategory, setActiveCategory] = useState<CategoryId | "all">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [assetStatus, setAssetStatus] = useState<AssetStatus>("unchecked");
  const [assetCategory, setAssetCategory] = useState<CategoryId>("landmark");
  const [leftPanelMode, setLeftPanelMode] = useState<"assets" | "places">("assets");
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
  const [interaction, setInteraction] = useState<
    | { type: "pan"; startX: number; startY: number; panX: number; panY: number }
    | { type: "drag"; id: string; offsetX: number; offsetY: number }
    | { type: "resize"; id: string; startX: number; startSize: number }
    | null
  >(null);

  const currentDocument = useCallback((): DocumentState => ({
    elements: elementsRef.current,
    assets: assetsRef.current,
    reviewNotes: notesRef.current,
    directoryPlaces: placesRef.current,
  }), []);

  const setDocument = useCallback((document: DocumentState) => {
    const clean = sanitizeDocument(cloneDocument(document));
    const restoredPlaces = clean.directoryPlaces?.length ? clean.directoryPlaces : defaultDirectoryPlaces;
    const restoredNames = new Set(restoredPlaces.map((place) => normalizePlaceName(place.name)));
    const mergedPlaces = [...restoredPlaces, ...supportDirectoryPlaces.filter((place) => !restoredNames.has(normalizePlaceName(place.name)))];
    elementsRef.current = clean.elements;
    assetsRef.current = clean.assets;
    notesRef.current = clean.reviewNotes;
    placesRef.current = mergedPlaces;
    setElements(clean.elements);
    setAssets(clean.assets);
    setReviewNotes(clean.reviewNotes);
    setDirectoryPlaces(placesRef.current);
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

  const updateElement = useCallback((id: string, patch: Partial<MapElement>, record = true) => {
    if (record) pushHistory();
    replaceElements((current) => current.map((element) => (element.id === id ? { ...element, ...patch } : element)));
  }, [pushHistory, replaceElements]);

  const updateNote = useCallback((id: string, patch: Partial<ReviewNote>) => {
    pushHistory();
    replaceNotes((current) => current.map((note) => note.id === id ? { ...note, ...patch } : note));
  }, [pushHistory, replaceNotes]);

  const selected = elements.find((element) => element.id === selectedId) ?? null;
  const selectedNote = reviewNotes.find((note) => note.id === selectedNoteId) ?? null;
  const selectedAsset = selected ? assets.find((asset) => asset.id === selected.assetId) ?? null : null;
  const compatibleAssets = selected ? assets.filter((asset) => (
    asset.placeName ? asset.placeName === selected.name : asset.category === selected.category
  )) : assets;

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

        const raw = localStorage.getItem(AUTOSAVE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<DocumentState>;
          if (Array.isArray(parsed.elements)) {
            const parsedElements = (parsed.elements as MapElement[]).map((item) => {
              const restored = { ...elementDefaults, ...item };
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
            setDocument({ elements: mergedElements, assets: mergedAssets, reviewNotes: parsed.reviewNotes ?? [], directoryPlaces: parsed.directoryPlaces });
            setSaveState("최근 상태 복구됨");
          }
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
  }, [assets, currentDocument, directoryPlaces, elements, hydrated, reviewNotes]);

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
    const handleMove = (event: PointerEvent) => {
      if (!interaction) return;
      if (interaction.type === "pan") {
        setPan({ x: interaction.panX + event.clientX - interaction.startX, y: interaction.panY + event.clientY - interaction.startY });
        return;
      }
      if (interaction.type === "drag") {
        const point = clientToMap(event.clientX, event.clientY);
        const element = elementsRef.current.find((item) => item.id === interaction.id);
        if (!element) return;
        updateElement(interaction.id, { x: clamp(point.x - interaction.offsetX, 0, 100), y: clamp(point.y - interaction.offsetY, 0, 100) }, false);
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
  }, [clientToMap, interaction, updateElement]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!selectedId || ["INPUT", "SELECT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName)) return;
      const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const direction = directions[event.key];
      if (!direction) return;
      const element = elementsRef.current.find((item) => item.id === selectedId);
      if (!element || element.locked) return;
      event.preventDefault();
      const step = event.shiftKey ? 0.5 : 0.08;
      updateElement(selectedId, { x: clamp(element.x + direction[0] * step, 0, 100), y: clamp(element.y + direction[1] * step, 0, 100) });
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedId, updateElement]);

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
    if (element.locked) return;
    const point = clientToMap(event.clientX, event.clientY);
    pushHistory();
    setInteraction({ type: "drag", id: element.id, offsetX: point.x - element.x, offsetY: point.y - element.y });
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

  const resetLandmarkPositions = () => {
    const defaults = new Map(landmarkLocations.map((location) => [location.name, location]));
    pushHistory();
    replaceElements((current) => current.map((element) => {
      const location = defaults.get(element.name);
      if (element.category !== "landmark" || !location) return element;
      return { ...element, x: location.x, y: location.y, anchorX: location.x, anchorY: location.y };
    }));
    setToast(`기본 랜드마크 ${landmarkLocations.length}곳을 기준 위치로 초기화했습니다.`);
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
      const mapped = result ? coordinatesToMap(result.latitude, result.longitude) : null;
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
              ...(movePlacedElements ? { x: mapped.x, y: mapped.y } : {}),
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

  const switchLeftPanel = (mode: "assets" | "places") => {
    setLeftPanelMode(mode);
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

  const addDummy = (category: CategoryId) => {
    pushHistory();
    const meta = categoryOf(category);
    const count = elementsRef.current.filter((item) => item.category === category).length + 1;
    const size = category === "landmark" ? 6.4 : category === "culture" || category === "park" ? 3 : 1.7;
    const next: MapElement = {
      ...elementDefaults, id: `element-${++nextIdRef.current}`, name: `${meta.name} ${count}`, category,
      x: 50, y: 50, anchorX: 50, anchorY: 50, size, z: Math.max(0, ...elementsRef.current.map((item) => item.z)) + 1,
      labelVisible: category === "landmark",
    };
    replaceElements((current) => [...current, next]); setSelectedId(next.id); setSelectedNoteId(null);
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

  const exportJson = () => {
    const payload = {
      schemaVersion: 3, exportedAt: new Date().toISOString(), map: { baseMap, aspect: MAP_ASPECT, coordinateSystem: "normalized-percent" },
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block"><div className="brand-mark">W</div><div><strong>원도심 지도 배치 검수</strong><span>제주문화예술재단 · 내부 디자인 도구</span></div></div>
        <div className="toolbar-group muted-actions">
          <button onClick={saveNamedLayout}>저장</button><button onClick={loadNamedLayout}>불러오기</button>
          <span className="toolbar-separator" />
          <button onClick={undo} disabled={!undoStack.length} aria-label="실행 취소">↶</button>
          <button onClick={redo} disabled={!redoStack.length} aria-label="다시 실행">↷</button>
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
        <div className="toolbar-group muted-actions"><button onClick={exportJson}>JSON ↓</button><button onClick={() => jsonInputRef.current?.click()}>JSON ↑</button><input ref={jsonInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importJson} /></div>
      </header>

      <section className={`workspace ${leftOpen ? "" : "left-closed"} ${rightOpen ? "" : "right-closed"}`}>
        <aside ref={leftPanelRef} className="panel asset-panel" aria-label="자산 목록">
          <div className="panel-heading"><div><strong>{leftPanelMode === "assets" ? "자산" : "장소 탐색"}</strong><span>{leftPanelMode === "assets" ? `${layoutName} · ${elements.length}개 배치` : `조사 목록 ${directoryPlaces.length}곳 · 더블클릭 이동`}</span></div><button className="icon-button" onClick={() => setLeftOpen(false)} aria-label="왼쪽 패널 접기">‹</button></div>
          <div className="panel-tabs" role="tablist" aria-label="왼쪽 패널 내용">
            <button className={leftPanelMode === "assets" ? "active" : ""} onClick={() => switchLeftPanel("assets")} role="tab" aria-selected={leftPanelMode === "assets"}>아이콘·마커</button>
            <button className={leftPanelMode === "places" ? "active" : ""} onClick={() => switchLeftPanel("places")} role="tab" aria-selected={leftPanelMode === "places"}>장소 탐색 <span>{directoryPlaces.length}</span></button>
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
          <div className="asset-list-header"><span>{assets.length ? "프로젝트 자산" : "더미 자산"}</span><small>클릭하여 중앙에 추가</small></div>
          <div className="asset-grid compact-assets">
            {assets.map((asset) => <button key={asset.id} className="asset-card uploaded" onClick={() => addAssetElement(asset)}><span className="asset-preview image-preview"><img src={asset.src} alt="" /></span><span><strong>{asset.name}</strong><small>{statusText[asset.status]} · {asset.fileType.toUpperCase()}</small></span><i>＋</i></button>)}
            {categories.map((category) => <button key={category.id} className="asset-card" onClick={() => addDummy(category.id)}><span className="asset-preview" style={{ color: category.color, borderColor: `${category.color}55`, background: `${category.color}16` }}>{category.glyph}</span><span><strong>{category.name}</strong><small>임시 도형</small></span><i>＋</i></button>)}
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
              <p className="marker-style-help">문화시설·카페·음식점·주차장에 같은 시안을 일괄 적용합니다. 01안은 제작 기준상 우선 추천안이며 아직 최종 승인 전입니다.</p>
            </div>
            <div className="review-list-head"><strong>종류별 크기 일괄 조절</strong><span>%</span></div>
            <div className="group-size-row"><label>랜드마크<input type="number" min="0.8" max="15" step="0.1" value={landmarkGroupSize} onChange={(event) => setLandmarkGroupSize(clamp(Number(event.target.value), 0.8, 15))} /></label><button onClick={() => applyGroupSize("landmark", landmarkGroupSize)}>전체 적용</button></div>
            <div className="group-size-row"><label>일반 마커<input type="number" min="0.8" max="15" step="0.1" value={markerGroupSize} onChange={(event) => setMarkerGroupSize(clamp(Number(event.target.value), 0.8, 15))} /></label><button onClick={() => applyGroupSize("marker", markerGroupSize)}>전체 적용</button></div>
            <button className="landmark-reset" onClick={resetLandmarkPositions}>↺ 랜드마크 위치 초기화</button>
          </div>
          </> : <div className="place-directory">
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
              <p>주소 정렬은 일반 마커의 배치 위치와 앵커를 함께 갱신합니다. 이후 드래그·방향키·속성 패널로 세부 보정할 수 있습니다.</p>
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
          <div className="canvas-toolbar"><div className="segmented"><button className={baseMap === "svg" ? "active" : ""} onClick={() => { setMapLoaded(false); setBaseMap("svg"); }}>벡터</button><button className={baseMap === "png" ? "active" : ""} onClick={() => { setMapLoaded(false); setBaseMap("png"); }}>원본 PNG</button></div><span className="map-file">v15 · 골목추가정리 검수본</span><button className={`inline-memo ${memoMode ? "active" : ""}`} onClick={() => setMemoMode((value) => !value)}>⌖ 메모 핀</button><div className="canvas-hint">휠 확대 · 빈 공간 드래그 · 방향키 미세 조정</div></div>
          <div className={`map-viewport ${interaction?.type === "pan" ? "is-panning" : ""} ${memoMode ? "memo-cursor" : ""}`} ref={viewportRef} onWheel={onWheel} onPointerDown={startPan}>
            <div className="map-stage-wrap" style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})` }}>
              <div className={`map-stage ${stageMapClass}`} ref={stageRef} style={{ aspectRatio: `${MAP_ASPECT}` }} onPointerDown={handleStagePointerDown}>
                {!mapLoaded && <div className="map-loading"><span />초고해상도 베이스맵 불러오는 중</div>}
                <img ref={baseMapImgRef} className="base-map" src={baseMap === "svg" ? MAP_SVG : MAP_PNG} alt="제주 원도심 v15 검수용 베이스맵" draggable={false} onLoad={() => setMapLoaded(true)} />
                <svg className="connector-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{visibleElements.map((element) => {
                  const showAnchor = viewMode === "anchors" || element.connectorVisible || selectedId === element.id;
                  if (!showAnchor) return null;
                  const showLine = element.connectorVisible && (Math.abs(element.x - element.anchorX) > 0.05 || Math.abs(element.y - element.anchorY) > 0.05);
                  return <g key={`anchor-${element.id}`} opacity={element.opacity / 100}>{showLine && <line x1={element.anchorX} y1={element.anchorY} x2={element.x} y2={element.y} stroke={element.connectorColor} strokeWidth={element.connectorWidth / 10} vectorEffect="non-scaling-stroke" />}<circle cx={element.anchorX} cy={element.anchorY} r="0.42" fill="white" stroke={element.connectorColor} strokeWidth="0.13" vectorEffect="non-scaling-stroke" /><circle cx={element.anchorX} cy={element.anchorY} r="0.12" fill={element.connectorColor} /></g>;
                })}</svg>
                <div className="element-layer">{visibleElements.map((element) => {
                  const meta = categoryOf(element.category); const isSelected = selectedId === element.id; const asset = assets.find((item) => item.id === element.assetId);
                  const collisionClass = collisions.hard.has(element.id) ? "collision-hard" : collisions.clearance.has(element.id) ? "collision-near" : "";
                  return <div key={element.id} className={`map-element ${isSelected ? "selected" : ""} ${focusPulseId === element.id ? "focus-pulse" : ""} ${element.locked ? "locked" : ""} ${viewMode === "collisions" ? collisionClass : ""} ${viewMode === "labels" ? "label-only" : ""}`} style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.size}%`, zIndex: element.z, color: meta.color, opacity: element.opacity / 100 }} onPointerDown={(event) => startDrag(event, element)}>
                    {(viewMode === "clearance" || (viewMode === "collisions" && collisionClass)) && <span className={`clearance-zone ${viewMode === "clearance" ? "visible" : collisionClass}`} />}
                    <div className="icon-visual">{asset ? <img className="placed-asset" src={asset.src} alt="" draggable={false} /> : <div className={`dummy-symbol ${element.category === "landmark" ? "landmark" : "marker"}`}><span>{meta.glyph}</span></div>}</div>
                    {element.status !== "approved" && viewMode !== "labels" && (element.category === "landmark" || isSelected) && <span className="review-flag">{element.status === "review" ? "검수 중" : "미검수"}</span>}
                    {element.labelVisible && <div className="label" style={labelStyle(element.labelPosition, element.labelGap)}>{element.name}</div>}
                    {isSelected && !element.locked && <button className="resize-handle" aria-label="크기 조절" onPointerDown={(event) => { event.stopPropagation(); pushHistory(); setInteraction({ type: "resize", id: element.id, startX: event.clientX, startSize: element.size }); }} />}
                  </div>;
                })}</div>
                <div className="review-pin-layer">{reviewNotes.map((note, index) => <button key={note.id} className={`review-pin ${note.status} ${selectedNoteId === note.id ? "selected" : ""}`} style={{ left: `${note.x}%`, top: `${note.y}%` }} onPointerDown={(event) => { event.stopPropagation(); setSelectedNoteId(note.id); setSelectedId(null); setRightOpen(true); }} title={`${reviewStatusText[note.status]}: ${note.text || "내용 없음"}`}><span>{index + 1}</span></button>)}</div>
              </div>
            </div>
            <div className="map-scale"><span /> 정규화 좌표 0–100%</div><div className="mobile-readonly">모바일에서는 확대·이동과 배치 열람을 지원합니다.</div>
            {viewMode === "collisions" && <div className="collision-legend"><span><i className="hard" />아이콘 겹침 {collisions.hard.size}</span><span><i className="near" />여유 구역 침범 {collisions.clearance.size}</span></div>}
          </div>
          <footer className="statusbar"><span className="status-ok"><i /> 베이스맵 연결됨</span><span>8944 × 7324 px</span><span>요소 {visibleElements.length} / {elements.length}</span><span>장소 목록 {directoryPlaces.length}</span><span>메모 {reviewNotes.length}</span><span>{saveState}</span><span className="status-end">주소 조회 좌표는 최종 검수 필요</span></footer>
        </section>
        {!rightOpen && <button className="panel-reopen right" onClick={() => setRightOpen(true)}>‹ 속성</button>}

        <aside className="panel properties-panel" aria-label="속성 편집">
          <div className="panel-heading"><div><strong>{selectedNote ? "검토 메모" : "속성"}</strong><span>{selected?.name ?? (selectedNote ? reviewStatusText[selectedNote.status] : "요소를 선택하세요")}</span></div><button className="icon-button" onClick={() => setRightOpen(false)} aria-label="오른쪽 패널 접기">›</button></div>
          {selectedNote ? <div className="property-form note-form">
            <section><div className="section-title"><strong>도로·골목 검토</strong><span>메모 핀</span></div><label>상태<select value={selectedNote.status} onChange={(event) => updateNote(selectedNote.id, { status: event.target.value as ReviewStatus })}><option value="delete">삭제 검토</option><option value="weaken">약화 검토</option><option value="keep">유지</option><option value="hierarchy">도로 위계 조정</option></select></label><label>검토 내용<textarea value={selectedNote.text} onChange={(event) => updateNote(selectedNote.id, { text: event.target.value })} placeholder="가려지는 도로, 골목 정리 이유 등을 기록" /></label></section>
            <section><div className="section-title"><strong>지도 위치</strong><span>%</span></div><div className="field-row"><label>X<input type="number" step="0.1" value={selectedNote.x.toFixed(2)} onChange={(event) => updateNote(selectedNote.id, { x: clamp(Number(event.target.value), 0, 100) })} /></label><label>Y<input type="number" step="0.1" value={selectedNote.y.toFixed(2)} onChange={(event) => updateNote(selectedNote.id, { y: clamp(Number(event.target.value), 0, 100) })} /></label></div></section>
            <section><button className="wide-danger" onClick={deleteSelectedNote}>검토 메모 삭제</button></section>
          </div> : !selected ? <div className="empty-properties"><span>◇</span><strong>선택된 요소가 없습니다</strong><p>지도 위 요소나 검토 메모를 클릭하면 세부 설정을 편집할 수 있습니다.</p></div> : <div className="property-form">
            <section><div className="section-title"><strong>기본 정보</strong><span className={`status-pill ${selected.status}`}>{statusText[selected.status]}</span></div><label>장소명<input value={selected.name} onChange={(event) => updateElement(selected.id, { name: event.target.value })} /></label><label>주소<input value={selected.address} onChange={(event) => updateElement(selected.id, { address: event.target.value })} placeholder="장소 주소" /></label>{selected.addressSourceUrl && <a className="source-link" href={selected.addressSourceUrl} target="_blank" rel="noreferrer">주소 확인 출처 ↗</a>}<label>카테고리<select value={selected.category} onChange={(event) => updateElement(selected.id, { category: event.target.value as CategoryId })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>사용 자산<select value={selected.assetId ?? ""} onChange={(event) => { const asset = assets.find((item) => item.id === event.target.value); updateElement(selected.id, asset ? { assetId: asset.id, status: asset.status, category: asset.category, address: asset.address || selected.address, addressSourceUrl: asset.addressSourceUrl || selected.addressSourceUrl } : { assetId: null }); }}><option value="">임시 색상 도형</option>{compatibleAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>{selectedAsset && <div className="asset-source-box"><span>{selectedAsset.sourceLabel ?? "사용자 업로드 자산"}</span>{selectedAsset.sourceUrl && <a href={selectedAsset.sourceUrl} target="_blank" rel="noreferrer">Drive 원본 보기 ↗</a>}</div>}<label>검수 상태<select value={selected.status} onChange={(event) => updateElement(selected.id, { status: event.target.value as AssetStatus })}><option value="approved">승인 완료</option><option value="review">검수 중</option><option value="unchecked">미검수</option></select></label><label>요소 메모<textarea value={selected.memo} onChange={(event) => updateElement(selected.id, { memo: event.target.value })} placeholder="배치 판단과 검수 의견 기록" /></label></section>
            <section><div className="section-title"><strong>화면상 배치</strong><span>%</span></div><div className="field-row"><label>X<input type="number" step="0.1" value={selected.x.toFixed(2)} onChange={(event) => updateElement(selected.id, { x: clamp(Number(event.target.value), 0, 100) })} /></label><label>Y<input type="number" step="0.1" value={selected.y.toFixed(2)} onChange={(event) => updateElement(selected.id, { y: clamp(Number(event.target.value), 0, 100) })} /></label></div><label className="range-label"><span>크기 <b>{selected.size.toFixed(1)}%</b></span><input type="range" min="0.8" max="15" step="0.1" value={selected.size} onChange={(event) => updateElement(selected.id, { size: Number(event.target.value) })} /></label><label className="range-label"><span>투명도 <b>{selected.opacity}%</b></span><input type="range" min="10" max="100" step="1" value={selected.opacity} onChange={(event) => updateElement(selected.id, { opacity: Number(event.target.value) })} /></label><div className="layer-actions"><button onClick={() => moveLayer("back")}>맨 뒤</button><button onClick={() => moveLayer("backward")}>한 칸 뒤</button><button onClick={() => moveLayer("forward")}>한 칸 앞</button><button onClick={() => moveLayer("front")}>맨 앞</button></div></section>
            <section><div className="section-title"><strong>실제 위치 앵커</strong><span>직접 편집</span></div><div className="field-row"><label>X<input type="number" step="0.1" value={selected.anchorX.toFixed(2)} onChange={(event) => updateElement(selected.id, { anchorX: clamp(Number(event.target.value), 0, 100) })} /></label><label>Y<input type="number" step="0.1" value={selected.anchorY.toFixed(2)} onChange={(event) => updateElement(selected.id, { anchorY: clamp(Number(event.target.value), 0, 100) })} /></label></div><button className="wide-secondary" onClick={() => updateElement(selected.id, { anchorX: selected.x, anchorY: selected.y })}>배치 위치를 앵커로 복사</button><p className="field-help">DB 주소 조회 결과 또는 사용자가 보정한 정규화 좌표가 저장됩니다. 자동 조회 좌표는 최종 검수가 필요합니다.</p></section>
            <section><div className="section-title"><strong>연결선</strong><label className="switch"><input type="checkbox" checked={selected.connectorVisible} onChange={(event) => updateElement(selected.id, { connectorVisible: event.target.checked })} /><span /></label></div><div className="field-row compact-color-row"><label>색상<input type="color" value={selected.connectorColor} onChange={(event) => updateElement(selected.id, { connectorColor: event.target.value })} /></label><label>굵기<input type="number" min="0.5" max="6" step="0.5" value={selected.connectorWidth} onChange={(event) => updateElement(selected.id, { connectorWidth: clamp(Number(event.target.value), 0.5, 6) })} /></label></div></section>
            <section><div className="section-title"><strong>라벨</strong><label className="switch"><input type="checkbox" checked={selected.labelVisible} onChange={(event) => updateElement(selected.id, { labelVisible: event.target.checked })} /><span /></label></div><div className="position-grid">{(["top", "bottom", "left", "right"] as LabelPosition[]).map((position) => <button key={position} className={selected.labelPosition === position ? "active" : ""} onClick={() => updateElement(selected.id, { labelPosition: position })}>{{ top: "위", bottom: "아래", left: "왼쪽", right: "오른쪽" }[position]}</button>)}</div><label className="range-label"><span>아이콘과 간격 <b>{selected.labelGap}px</b></span><input type="range" min="0" max="30" step="1" value={selected.labelGap} onChange={(event) => updateElement(selected.id, { labelGap: Number(event.target.value) })} /></label></section>
            <section><div className="section-title"><strong>빠른 작업</strong></div><div className="quick-actions"><button onClick={duplicateSelected}>복제</button><button onClick={() => updateElement(selected.id, { locked: !selected.locked })}>{selected.locked ? "잠금 해제" : "잠금"}</button><button className="danger" disabled={selected.locked} onClick={deleteSelected}>삭제</button></div></section>
          </div>}
        </aside>
      </section>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
