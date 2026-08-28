"use client";
/* eslint-disable @next/next/no-img-element */

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  markerAssetSrc,
  recommendedMarkerStyle,
  type BundledMarkerStyle,
} from "./marker-assets";
import { isCoreLandmarkName, normalizePlaceName } from "./core-landmarks";
import {
  MAP_ASPECT,
  calibratedPlaceCoordinates,
  initialCalibrationPoints,
  type CalibrationPoint,
} from "./map/calibration/model";
import {
  EXPORT_CANONICAL_WIDTH,
  categories,
  categoryOf,
  type CategoryId,
} from "./map/core/model";
import {
  DenseLabelLayer,
  MapConnectorLayer,
  MapElementLayer,
  MobileMarkerPlaceholderLayer,
  type MapRenderActions,
} from "./map/rendering/layers";
import { createMapDocumentModel } from "./editor/document/bootstrap";
import { useEditorDocumentState } from "./editor/document/use-editor-document-state";
import { usePlaceEditorActions } from "./editor/places/actions";
import {
  printSettingKey,
  type PrintMode,
} from "./map/print/settings";
import { usePrintSettingsPersistence } from "./map/print/use-settings-persistence";
import { useDenseLabelSettingsPersistence } from "./map/labels/use-settings-persistence";
import type {
  AssetStatus,
  DenseLabelPosition,
  DirectoryPlace,
  DocumentState,
  LabelPosition,
  LandmarkDefaultPosition,
  MapAsset,
  MapElement,
  MapLabelStatus,
  PlacementOverride,
  PublicLayoutAccess,
  ReviewNote,
  ReviewStatus,
  StageDimensions,
  ViewMode,
  VisualBounds,
} from "./map/core/types";
import { useLocalAutosave } from "./editor/persistence/use-local-autosave";
import { useApplicationBootstrap } from "./editor/persistence/use-application-bootstrap";
import { useAdminOutputWorkspace } from "./editor/workspace/use-admin-output-workspace";
import {
  useAdminMapAssetActions,
  useAdminMapAssetViewModel,
} from "./editor/workspace/use-admin-map-asset-actions";
import { useEditorMapEditActions } from "./editor/workspace/use-editor-map-edit-actions";
import { usePlaceManagerWorkspace } from "./editor/places/use-place-manager-workspace";
import {
  type BaseMapMode,
  type OptionalLabelScaleStep,
  type PublicLayoutHistoryItem,
  type PublicViewSettings,
  type UploadedBaseMap,
} from "./editor/persistence/public-layout-client";
import { useMapSettingsPersistence } from "./editor/persistence/use-map-settings-persistence";
import { normalizeOptionalLabelScaleSteps } from "./map/labels/density.mjs";
import type { PublicExplorerTab } from "./public/explorer-panel";
import {
  PublicDialogLoading,
  PublicExplorerPanelLoading,
  PublicPlaceSheetLoading,
} from "./public/panel-loading";
import {
  publicCategoryMetaForPlace,
  publicListCategories,
  usePublicPlaceWorkspace,
  type PublicPlaceCategoryScope,
} from "./public/use-public-place-workspace";
import { usePublicNavigationActions } from "./public/use-public-navigation-actions";
import { usePublicNavigationLifecycle } from "./public/use-public-navigation-lifecycle";
import { useMapTransformController } from "./map/interaction/use-map-transform-controller";
import {
  useMapInteractionActions,
  type MapInteractionState,
} from "./map/interaction/use-map-interaction-actions";
import { useMapWorkspaceModel } from "./map/workspace/use-map-workspace-model";
import { useMapRuntimeLifecycle } from "./map/workspace/use-map-runtime-lifecycle";
import {
  STANDARD_MOBILE_RENDER_BUDGET,
  mobileRenderBudgetForDevice,
} from "./map/rendering/mobile-render-budget.mjs";
import type { MobileRenderBudget } from "./map/rendering/mobile-render";
import {
  publicPlaceDirectionsUrl,
} from "./public/navigation.mjs";
import {
  isMainHubPersistenceTarget,
} from "./editor/document/main-hub-persistence.mjs";
import {
  LPP_CANONICAL_NAME,
  MAIN_HUB_CANONICAL_NAME,
  additionalCategoryDefinitions,
  convenienceAttributeDefinitions,
  isPrimaryPublicCategory,
  sanitizeAdditionalCategories,
  sanitizeConvenienceAttributes,
} from "./place-taxonomy";
import {
  createDirectoryCatalog,
  createDirectoryRecordMerger,
  directoryCategory,
  directoryRecordFromPlace,
} from "./place-directory/model";
import { usePlaceSelectionModel } from "./place-directory/use-place-selection-model";
import {
  sendPerformanceDiagnostic,
} from "./content/client";
import type {
  StoryCameraPermissionState,
} from "./content/types";
import { usePlaceContentActions } from "./content/use-place-content-actions";
import { usePlaceContentWorkspace } from "./content/use-place-content-workspace";
import { UiThemePicker, UiThemeSwatch, useUiTheme } from "./shell/ui-theme";
import {
  PUBLIC_VIEW_COOKIE,
  useApplicationShellLifecycle,
} from "./shell/use-application-shell-lifecycle";

// 이하는 필요할 때만 불러오는 관리자·공개 화면 모듈 코드입니다.

const AdminDatabaseEditor = lazy(() => import("./admin-database-editor"));
const AdminFolder = lazy(() => import("./admin-folder"));
const AdminPlaceEventDialog = lazy(() => import("./admin-place-event-dialog"));
const PublicExplorerPanel = lazy(() => import("./public/explorer-panel"));
const PublicPlaceSheet = lazy(() => import("./public/place-sheet"));
const PublicViewerDialogs = lazy(() => import("./public/viewer-dialogs"));

// 이하는 지도 자산, 서버 API 주소, 저장 키에 관한 공통 설정 코드입니다.
const MAP_SVG = "/maps/제주원도심_랜드마크탐색_베이스맵_v15_골목추가정리_검수본_마스터벡터.svg";
const MAP_PNG = "/maps/제주원도심_랜드마크탐색_베이스맵_v15_골목추가정리_검수본_초고해상도.png";
const JFAC_SIGNATURE_B_SVG = "/jfac-signature-b.svg?v=20260821-svg1";
const JFAC_SYMBOL_SVG = "/jfac-symbol.svg?v=20260821-svg1";
const UPLOADED_MAP_API = "/api/base-map";
const PLACE_DIRECTORY_API = "/api/place-directory";
const LATEST_SANJICHEON_ASSET_ID = "sanjicheon-v06";
const LATEST_ARTSPACE_IA_ASSET_ID = "artspace-ia-v04";
const LATEST_DONGMUN_ASSET_ID = "dongmun-v08";
const LATEST_MOKGWANA_ASSET_ID = "mokgwana-v10";
const LATEST_GWANDEOKJEONG_ASSET_ID = "gwandeokjeong-v09";
const LATEST_KIM_MEMORIAL_ASSET_ID = "kim-memorial-front03";
const LATEST_ARARIO_ASSET_ID = "arario-01";
const LATEST_BUKSUGU_ASSET_ID = "buksugu-02";
const LATEST_TAPDONG_SEASIDE_STAGE_ASSET_ID = "tapdong-seaside-stage-02";
const LATEST_JEJU_ART_PLATFORM_ASSET_ID = "jeju-art-platform-c01-v05";
const LATEST_CHILSUNGRO_ASSET_ID = "chilsungro-20260820-transparent";
const MAIN_HUB_LANDMARK_ASSET_ID = "jeju-communication-center-a02";
const LANDMARK_RESOURCE_SIZE = 6.2;
const LANDMARK_LABEL_GAP = 8;
const LEGACY_MAIN_HUB_MEMO = "워크케이션 메인 거점 · A-02 우측계단 전용 랜드마크";
const STANDARD_MAIN_HUB_MEMO = "워크케이션 메인 거점 · A-02 외곽선보강 최종검수안 · 표준 랜드마크 이미지·라벨 처리";
const latestRedesignedLandmarkAssets = new Map<string, string>([
  ["산지천갤러리", LATEST_SANJICHEON_ASSET_ID],
  ["동문시장", LATEST_DONGMUN_ASSET_ID],
  ["예술공간 이아", LATEST_ARTSPACE_IA_ASSET_ID],
  ["제주목 관아", LATEST_MOKGWANA_ASSET_ID],
  ["관덕정", LATEST_GWANDEOKJEONG_ASSET_ID],
  ["김만덕기념관", LATEST_KIM_MEMORIAL_ASSET_ID],
  ["아라리오뮤지엄 탑동시네마", LATEST_ARARIO_ASSET_ID],
  ["북수구광장", LATEST_BUKSUGU_ASSET_ID],
  ["탑동해변공연장", LATEST_TAPDONG_SEASIDE_STAGE_ASSET_ID],
  ["제주아트플랫폼", LATEST_JEJU_ART_PLATFORM_ASSET_ID],
  ["칠성로", LATEST_CHILSUNGRO_ASSET_ID],
]);
const supersededRedesignedLandmarkAssets = new Map<string, Set<string>>([
  ["산지천갤러리", new Set(["sanjicheon-v04", "sanjicheon-01", "sanjicheon-02", "sanjicheon-03"])],
  ["동문시장", new Set(["dongmun-01", "dongmun-02", "dongmun-03"])],
  ["예술공간 이아", new Set(["artspace-ia-01", "artspace-ia-02", "artspace-ia-03"])],
  ["제주목 관아", new Set(["mokgwana-v06", "mokgwana-01", "mokgwana-02", "mokgwana-03"])],
  ["관덕정", new Set(["gwandeokjeong-v07", "gwandeokjeong-01", "gwandeokjeong-02", "gwandeokjeong-03"])],
  ["김만덕기념관", new Set(["kim-memorial-front01", "kim-memorial-front02", "kim-memorial-quarter01", "kim-memorial-quarter02", "kim-memorial-quarter03"])],
  ["아라리오뮤지엄 탑동시네마", new Set(["arario-02", "arario-03"])],
  ["북수구광장", new Set(["buksugu-01", "buksugu-03"])],
  ["탑동해변공연장", new Set(["tapdong-seaside-stage-03"])],
  ["제주아트플랫폼", new Set(["jeju-art-platform-c01"])],
  ["칠성로", new Set(["chilsungro", "chilsungro-20260819"])],
]);
const GEOCODE_CACHE_KEY = "jeju-wondosim-map-review:geocode-cache:v1";
const DELETED_PLACE_NAMES = new Set(["산짓물공원", "산짓물 공원"]);
const UI_THEME_EASTER_EGG_PLACES = new Set([
  "제주아트플랫폼",
  "예술공간 이아",
  "산지천갤러리",
  "김만덕객주",
]);

// 이하는 관리자 좌표 그룹과 공개 자산 프로필에 관한 타입입니다.
type CalibrationGroupId = "primary" | "secondary" | "tertiary";
type PublicAssetProfile = "mobile" | "standard";

// 이하는 지도 좌표 보정과 기준 랜드마크 위치를 계산하는 코드입니다.
const landmarkLocations = [
  { name: MAIN_HUB_CANONICAL_NAME, address: "제주특별자치도 제주시 관덕로 44", addressSourceUrl: "https://www.jejusotong.kr/", assetId: MAIN_HUB_LANDMARK_ASSET_ID, x: 48, y: 64 },
  { name: "제주아트플랫폼", address: "제주특별자치도 제주시 중앙로14길 18", addressSourceUrl: "https://www.jfac.kr/", assetId: LATEST_JEJU_ART_PLATFORM_ASSET_ID, x: 31, y: 62 },
  { name: "김만덕기념관", address: "제주특별자치도 제주시 산지로 7", addressSourceUrl: "https://www.mandukmuseum.or.kr/", assetId: LATEST_KIM_MEMORIAL_ASSET_ID, x: 74, y: 31 },
  { name: "예술공간 이아", address: "제주특별자치도 제주시 중앙로14길 21", addressSourceUrl: "https://www.jfac.kr/operatingSpace/artSpaceIAa/iAaGuide", assetId: LATEST_ARTSPACE_IA_ASSET_ID, x: 34, y: 57 },
  { name: "아라리오뮤지엄 탑동시네마", address: "제주특별자치도 제주시 탑동로 14", addressSourceUrl: "https://www.arariomuseum.org/", assetId: LATEST_ARARIO_ASSET_ID, x: 18, y: 24 },
  { name: "김만덕객주", address: "제주특별자치도 제주시 임항로 68", addressSourceUrl: "https://www.visitjeju.net/kr/detail/view?contentsid=CNTS_000000000019652", assetId: "guesthouse-01", x: 75, y: 25 },
  { name: "산지천갤러리", address: "제주특별자치도 제주시 중앙로3길 36", addressSourceUrl: "https://www.jfac.kr/operatingSpace/sjcGallery/sjcGuide", assetId: LATEST_SANJICHEON_ASSET_ID, x: 64, y: 40 },
  { name: "제주목 관아", address: "제주특별자치도 제주시 관덕로 25", addressSourceUrl: "https://www.jeju.go.kr/mokkwana/", assetId: LATEST_MOKGWANA_ASSET_ID, x: 39, y: 60 },
  { name: "관덕정", address: "제주특별자치도 제주시 관덕로 19", addressSourceUrl: "https://www.visitjeju.net/kr/detail/view?contentsid=CONT_000000000500057", assetId: LATEST_GWANDEOKJEONG_ASSET_ID, x: 37, y: 58 },
  { name: "칠성로", address: "제주특별자치도 제주시 관덕로13길 12 일대", addressSourceUrl: "https://www.visitjeju.net/kr/detail/view?contentsid=CONT_000000000500750", assetId: LATEST_CHILSUNGRO_ASSET_ID, x: 58, y: 50 },
  { name: "동문시장", address: "제주특별자치도 제주시 관덕로14길 20", addressSourceUrl: "https://www.visitjeju.net/kr/detail/view?contentsid=CONT_000000000500745", assetId: LATEST_DONGMUN_ASSET_ID, x: 66, y: 55 },
  { name: "북수구광장", address: "제주특별자치도 제주시 일도일동 1232", addressSourceUrl: "https://www.facebook.com/wowjejusi/", assetId: LATEST_BUKSUGU_ASSET_ID, x: 62, y: 45 },
  { name: "탑동광장", address: "제주특별자치도 제주시 중앙로 1", addressSourceUrl: "https://access.visitkorea.or.kr/ms/detail.do?cotId=2a115c66-9a01-4b59-bf17-ac2dd692ceea", assetId: "tapdong-square-03", x: 28, y: 20 },
  { name: "탑동해변공연장", address: "제주특별자치도 제주시 중앙로 2", addressSourceUrl: "https://access.visitkorea.or.kr/ms/detail.do?cotId=51ad702c-5321-45a0-8a03-316acb38336e", assetId: LATEST_TAPDONG_SEASIDE_STAGE_ASSET_ID, x: 37, y: 20 },
] as const;

const legacyDirectoryPlaces: DirectoryPlace[] = [
  { id: "place-jeju-art-platform", name: "제주아트플랫폼", category: "culture", area: "중앙로", address: "제주특별자치도 제주시 중앙로14길 18", x: 31, y: 62, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "master-v10-a80e3fe120dd", name: "아르코공연연습센터@제주", category: "culture", area: "관덕로·목관아", address: "제주특별자치도 제주시 중앙로14길 18 제주아트플랫폼 3~4층", x: 31, y: 62, coordinateStatus: "landmark", sourceLabel: "제주아트플랫폼 동일 건물 시설", subtype: "공연예술 연습공간", priority: "검토", description: "연습실·리딩룸·분장실과 공연 장비를 갖춘 공연예술인 대관 공간", operatingInfo: "운영·대관 일정은 공식 안내 확인", sourceUrl: "https://www.jfac.kr/notification/notice/19026", checkedAt: "2026-08-12" },
  { id: "master-v12-jeju-artist-welfare-center", name: "제주예술인복지센터", category: "culture", area: "관덕로·목관아", address: "제주특별자치도 제주시 중앙로14길 18 제주아트플랫폼 1층", x: 31, y: 62, coordinateStatus: "landmark", sourceLabel: "제주아트플랫폼 동일 건물 시설", subtype: "예술인 복지·회의공간", priority: "검토", description: "예술인의 행정 상담과 회의·세미나·교육 등 활동을 지원하는 공간", operatingInfo: "운영·상담·대관 일정은 제주문화예술재단 공식 안내 확인", sourceUrl: "https://www.jfac.kr/notification/notice/20301", checkedAt: "2026-08-12" },
  { id: "place-artspace-ia", name: "예술공간 이아", category: "culture", area: "중앙로", address: "제주특별자치도 제주시 중앙로14길 21", x: 34, y: 57, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-sanjicheon-gallery", name: "산지천갤러리", category: "culture", area: "산지천", address: "제주특별자치도 제주시 중앙로3길 36", x: 64, y: 40, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-kim-manduk-memorial", name: "김만덕기념관", category: "culture", area: "산지천", address: "제주특별자치도 제주시 산지로 7", x: 74, y: 31, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-arario-tapdong", name: "아라리오뮤지엄 탑동시네마", category: "culture", area: "탑동", address: "제주특별자치도 제주시 탑동로 14", x: 18, y: 24, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-tapdong-seaside-stage", name: "탑동해변공연장", category: "culture", area: "탑동", address: "제주특별자치도 제주시 중앙로 2", x: 37, y: 20, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB · 최종 자산 02" },
  { id: "master-v13-tapdong-square", name: "탑동광장", category: "culture", area: "칠성로·탑동", address: "제주특별자치도 제주시 중앙로 1", x: 28, y: 20, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-mokgwana", name: "제주목 관아", category: "culture", area: "관덕로·목관아", address: "제주특별자치도 제주시 관덕로 25", x: 39, y: 60, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-gwandeokjeong", name: "관덕정", category: "culture", area: "관덕로·목관아", address: "제주특별자치도 제주시 관덕로 19", x: 37, y: 58, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-kim-manduk-guesthouse", name: "김만덕객주", category: "culture", area: "산지천", address: "제주특별자치도 제주시 임항로 68", x: 75, y: 25, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "master-v13-chilseong-ro", name: "칠성로", category: "culture", area: "칠성로·탑동", address: "제주특별자치도 제주시 관덕로13길 12 일대", x: 58, y: 50, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "master-v13-dongmun-market", name: "동문시장", category: "culture", area: "동문시장·동문로", address: "제주특별자치도 제주시 관덕로14길 20", x: 66, y: 55, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "master-v13-buksugu-square", name: "북수구광장", category: "culture", area: "산지천·탐라문화광장·서부두", address: "제주특별자치도 제주시 일도일동 1232", x: 62, y: 45, coordinateStatus: "landmark", sourceLabel: "기본 랜드마크 DB" },
  { id: "place-sotong-center", name: "제주특별자치도 소통협력센터", category: "culture", area: "관덕로·목관아", address: "제주특별자치도 제주시 관덕로 44", x: 45, y: 59, coordinateStatus: "review", sourceLabel: "원도심 조사본 · 공식 주소 확인" },
  { id: "master-v12-lpp-local-player-platform", name: LPP_CANONICAL_NAME, category: "culture", area: "관덕로·목관아", address: "제주특별자치도 제주시 관덕로8길 15-3", x: 44.61417391305452, y: 42.09463302752, coordinateStatus: "geocoded", latitude: 33.51162337, longitude: 126.52376126, sourceLabel: "카카오맵 좌표 · 개관 보도 교차확인", sourceUrl: "https://www.headlinejeju.co.kr/news/articleView.html?idxno=596237", subtype: "로컬 브랜드·창업 복합공간", priority: "추천", description: "제주 로컬 브랜드와 청년 창업가의 팝업·테스트베드·교육·교류를 지원하는 3층 복합 창업·문화공간", operatingInfo: "운영시간: 프로그램·팝업별 상이 · 방문 전 공식 채널 확인", notes: "1층 로컬 식음·농산물 팝업과 교육, 2층 로컬 상품 전시·판매, 3층 세미나·포럼 공간 · 정규 운영시간은 공식 채널 확인", mapUrl: "https://place.map.kakao.com/1316005169", checkedAt: "2026-08-12" },
  { id: "place-jeju-arts-center", name: "제주특별자치도 문예회관", category: "culture", area: "이도동", address: "제주특별자치도 제주시 동광로 69", x: 74, y: 84, coordinateStatus: "review", sourceLabel: "원도심 정보 v02" },
  { id: "place-folklore-museum", name: "제주특별자치도 민속자연사박물관", category: "culture", area: "이도동", address: "제주특별자치도 제주시 삼성로 40", x: 64, y: 78, coordinateStatus: "review", sourceLabel: "원도심 정보 v02" },
  { id: "place-triptea-sanji", name: "제주트립티 산지", category: "cafe", area: "산지천", address: "제주특별자치도 제주시 관덕로17길 29", x: 65, y: 43, coordinateStatus: "review", sourceLabel: "원도심 정보 v01" },
  { id: "place-coffee-finder", name: "커피파인더", category: "cafe", area: "이도동", address: "제주특별자치도 제주시 서광로32길 20", x: 61, y: 91, coordinateStatus: "review", sourceLabel: "원도심 정보 v02" },
  { id: "place-idongat", name: "이돈갓", category: "food", area: "칠성통", address: "제주특별자치도 제주시 칠성로길 27", x: 58, y: 51, coordinateStatus: "review", sourceLabel: "원도심 정보 v01" },
  { id: "place-chilseong-buffet", name: "칠성뷔페", category: "food", area: "칠성통", address: "제주특별자치도 제주시 관덕로11길 17", x: 54, y: 54, coordinateStatus: "review", sourceLabel: "원도심 정보 v01" },
];

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

// 장소 DB의 생성·보정·시스템 항목 병합은 하나의 카탈로그 경계가 담당합니다.
const { buildDirectoryPlaces, ensureSystemDirectoryPlaces } = createDirectoryCatalog({
  legacyPlaces: legacyDirectoryPlaces,
  supportPlaces: supportDirectoryPlaces,
  deletedPlaceNames: DELETED_PLACE_NAMES,
});

// Keep the public viewer's initial bundle lean. The full master directory is
// loaded only when an editor needs the bundled database fallback.
const defaultDirectoryPlaces = buildDirectoryPlaces([]).map((place) => {
  const mapped = calibratedPlaceCoordinates(place.name, place.latitude, place.longitude, initialCalibrationPoints);
  return mapped ? { ...place, ...mapped } : place;
});

const mergeDirectoryRecords = createDirectoryRecordMerger(defaultDirectoryPlaces, ensureSystemDirectoryPlaces);
const {
  assetIdAfterDirectoryCategoryChange,
  buildStarterMarkers,
  builtInAssets,
  canonicalMarkerAssetIds,
  ensureMainHubMapElement,
  factoryLandmarkDefaultPositions,
  initialElements,
  landmarkLocationByName,
  sanitizeDocument,
} = createMapDocumentModel({
  landmarkLocations,
  defaultDirectoryPlaces,
  supportDirectoryPlaces,
  ensureSystemDirectoryPlaces,
  deletedPlaceNames: DELETED_PLACE_NAMES,
  mainHubLandmarkAssetId: MAIN_HUB_LANDMARK_ASSET_ID,
  landmarkResourceSize: LANDMARK_RESOURCE_SIZE,
  landmarkLabelGap: LANDMARK_LABEL_GAP,
  legacyMainHubMemo: LEGACY_MAIN_HUB_MEMO,
  standardMainHubMemo: STANDARD_MAIN_HUB_MEMO,
  latestRedesignedLandmarkAssets,
  supersededRedesignedLandmarkAssets,
});

const statusText: Record<AssetStatus, string> = { approved: "승인 완료", review: "검수 중", unchecked: "미검수" };
const reviewStatusText: Record<ReviewStatus, string> = { delete: "삭제 검토", weaken: "약화 검토", keep: "유지", hierarchy: "도로 위계 조정" };

// 이하는 날짜, 분류, 위치, 방문자 정보 등에 공통으로 쓰는 보조 함수입니다.
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function storyDateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "날짜 미상" : date.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

function storyCameraPermissionLabel(state: StoryCameraPermissionState) {
  if (state === "requesting") return "확인 중";
  if (state === "granted") return "허용됨";
  if (state === "denied") return "차단됨";
  if (state === "unavailable") return "확인 미지원";
  return "요청 전";
}

function storyDateTimeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "날짜 미상" : date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventScheduleLabel(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "행사 일시 확인 필요";
  const sameDay = start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
    && start.getDate() === end.getDate();
  if (!sameDay) return `${storyDateTimeLabel(startsAt)} ~ ${storyDateTimeLabel(endsAt)}`;
  const day = start.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
  const time = (date: Date) => date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time(start)} ~ ${time(end)}`;
}

// 이하는 업로드된 베이스맵 화면용 파생본을 준비하는 코드입니다.
function uploadedBaseMapOriginalSource(metadata: UploadedBaseMap | null) {
  if (!metadata?.available) return "";
  return metadata.originalUrl ?? `${UPLOADED_MAP_API}?v=${encodeURIComponent(metadata.uploadedAt)}`;
}

const EMPTY_MAP_LABEL_STATUS_BY_ELEMENT_ID = new Map<string, MapLabelStatus>();
const EMPTY_MAP_ELEMENT_IDS = new Set<string>();

// 이하는 아트맵 전체 화면과 동작을 묶는 메인 화면 코드입니다.
export default function Home() {
  // 이하는 지도 화면 요소와 제스처 상태를 직접 참조하기 위한 코드입니다.
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mobileMarkerPlaceholderLayerRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLElement>(null);
  const printPanelRef = useRef<HTMLElement>(null);
  const baseMapImgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const placeQueryInputRef = useRef<HTMLInputElement>(null);
  const databaseEditorQueryInputRef = useRef<HTMLInputElement>(null);
  const mapUploadInputRef = useRef<HTMLInputElement>(null);
  const mapRenderActionsRef = useRef<MapRenderActions | null>(null);
  const placeRequestLocationBeforePickingRef = useRef<{ x: number; y: number } | null>(null);
  const publicInitialViewAppliedRef = useRef(false);
  const publicNavigationInitializedRef = useRef(false);
  const publicNavigationApplyingRef = useRef(false);
  const publicNavigationAfterPopRef = useRef<"explorer" | null>(null);
  const startupLoadCompletedRef = useRef(false);
  const performanceStartedAtRef = useRef(0);
  const performanceStartupSentRef = useRef(false);
  const performanceSettleSamplesRef = useRef({ pan: 0, pinch: 0 });
  const mobileSlowSettleSamplesRef = useRef(0);
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
  const localDenseLabelsUpdatedAtRef = useRef(0);
  const localPlacementUpdatedAtRef = useRef(0);
  const fitZoomRef = useRef(0.72);
  const fitZoomAppliedRef = useRef(false);
  const zoomRef = useRef(0.72);
  const panRef = useRef({ x: 0, y: 0 });
  const placeDirectoryLoadedRef = useRef(false);
  const directoryTaxonomySaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const directoryTaxonomySaveRunRef = useRef(0);
  const denseLabelPositionsRef = useRef<DenseLabelPosition[]>([]);
  const denseLabelExcludedIdsRef = useRef<string[]>([]);
  const placementOverridesRef = useRef<PlacementOverride[]>([]);
  const publishedLayoutDocumentRef = useRef<DocumentState | null>(null);
  const publishedLayoutViewRef = useRef<PublicViewSettings | null>(null);
  const publishedLayoutRevisionRef = useRef(0);
  const editorDraftDocumentRef = useRef<DocumentState | null>(null);
  const editorDraftViewRef = useRef<PublicViewSettings | null>(null);
  const editorDraftRevisionRef = useRef(0);
  const labelDensitySettingsRevisionRef = useRef(0);
  const cancelMapTransformsRef = useRef<() => void>(() => undefined);
  const cancelMapTransforms = useCallback(() => cancelMapTransformsRef.current(), []);

  // 이하는 장소, 지도, 관리자 도구, 팝업의 현재 상태를 보관하는 코드입니다.
  const [elements, setElements] = useState(initialElements);
  const [assets, setAssets] = useState<MapAsset[]>(builtInAssets);
  const [reviewNotes, setReviewNotes] = useState<ReviewNote[]>([]);
  const [directoryPlaces, setDirectoryPlaces] = useState<DirectoryPlace[]>(defaultDirectoryPlaces);
  const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>(initialCalibrationPoints);
  const [landmarkDefaultPositions, setLandmarkDefaultPositions] = useState<LandmarkDefaultPosition[]>(factoryLandmarkDefaultPositions);
  const [selectedId, setSelectedId] = useState<string | null>(initialElements[0].id);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<DocumentState[]>([]);
  const [redoStack, setRedoStack] = useState<DocumentState[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const { uiTheme, activeUiTheme, selectUiTheme } = useUiTheme();
  const [saveState, setSaveState] = useState("자동 저장 준비");
  const [layoutName, setLayoutName] = useState("최근 자동복구");
  const [toast, setToast] = useState("");
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [publicHistoryOpen, setPublicHistoryOpen] = useState(false);
  const [publicHistory, setPublicHistory] = useState<PublicLayoutHistoryItem[]>([]);
  const [publicHistoryActionId, setPublicHistoryActionId] = useState<string | null>(null);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoginSubmitting, setAdminLoginSubmitting] = useState(false);
  const [adminLoginError, setAdminLoginError] = useState("");
  const [adminAccessMethod, setAdminAccessMethod] = useState<"owner" | "shared" | null>(null);
  const [publicViewOverride] = useState(() => typeof document !== "undefined"
    && document.cookie.split(";").some((item) => item.trim() === `${PUBLIC_VIEW_COOKIE}=1`));
  const [zoom, setZoom] = useState(0.72);
  const [mapRenderPan, setMapRenderPan] = useState({ x: 0, y: 0 });
  const [mobileRenderBudget, setMobileRenderBudget] = useState<MobileRenderBudget>(() => {
    if (typeof navigator === "undefined") return STANDARD_MOBILE_RENDER_BUDGET;
    const deviceNavigator = navigator as Navigator & { deviceMemory?: number };
    return mobileRenderBudgetForDevice(
      deviceNavigator.deviceMemory,
      deviceNavigator.hardwareConcurrency,
    );
  });
  const [settledLabelZoom, setSettledLabelZoom] = useState(0.22);
  const [settledLabelPan, setSettledLabelPan] = useState({ x: 0, y: 0 });
  const [mapRenderRefreshRevision, setMapRenderRefreshRevision] = useState(0);
  const [stageDimensions, setStageDimensions] = useState<StageDimensions>({
    width: EXPORT_CANONICAL_WIDTH,
    height: EXPORT_CANONICAL_WIDTH / MAP_ASPECT,
  });
  const [viewportDimensions, setViewportDimensions] = useState<StageDimensions>({ width: 0, height: 0 });
  const [baseMap, setBaseMap] = useState<BaseMapMode>("svg");
  const [uploadedBaseMap, setUploadedBaseMap] = useState<UploadedBaseMap | null>(null);
  const [decodedHighResolutionBaseMapSource, setDecodedHighResolutionBaseMapSource] = useState("");
  const [committedBaseMapUpgradeSource, setCommittedBaseMapUpgradeSource] = useState("");
  const [baseMapCanUpload, setBaseMapCanUpload] = useState<boolean | null>(null);
  const [baseMapUploading, setBaseMapUploading] = useState(false);
  const [exportWidth, setExportWidth] = useState<8944 | 12000>(12000);
  const [exporting, setExporting] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryId | "all">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [screenRecommendedOnly, setScreenRecommendedOnly] = useState(false);
  const [markerLabelsVisible, setMarkerLabelsVisible] = useState(true);
  const [mergeDenseLabels, setMergeDenseLabels] = useState(true);
  const [editorScaleLabelLimitsEnabled, setEditorScaleLabelLimitsEnabled] = useState(false);
  const [optionalLabelScaleSteps, setOptionalLabelScaleSteps] = useState<OptionalLabelScaleStep[]>(
    () => normalizeOptionalLabelScaleSteps(undefined),
  );
  const [printRecommendedOnly, setPrintRecommendedOnly] = useState(true);
  const [printLandmarks, setPrintLandmarks] = useState(true);
  const [printMarkers, setPrintMarkers] = useState(true);
  const [printLabels, setPrintLabels] = useState(true);
  const [printPreviewMode, setPrintPreviewMode] = useState(false);
  const [printAuditOpen, setPrintAuditOpen] = useState(false);
  const [printFolderOpenRequest, setPrintFolderOpenRequest] = useState(0);
  const [denseLabelPositions, setDenseLabelPositions] = useState<DenseLabelPosition[]>([]);
  const [denseLabelExcludedIds, setDenseLabelExcludedIds] = useState<string[]>([]);
  const [placementOverrides, setPlacementOverrides] = useState<PlacementOverride[]>([]);
  const [selectedDenseLabelId, setSelectedDenseLabelId] = useState<string | null>(null);
  const [forceIndividualLabels, setForceIndividualLabels] = useState(false);
  const [publicLayoutAccess, setPublicLayoutAccess] = useState<PublicLayoutAccess>("loading");
  const {
    printSettings,
    printSettingsCanEdit,
    printSettingsStorage,
    savePrintSetting,
  } = usePrintSettingsPersistence({
    hydrated,
    publicLayoutAccess,
    screenRecommendedOnly,
    onMessage: setToast,
  });
  const [publicLayoutPublishedAt, setPublicLayoutPublishedAt] = useState<string | null>(null);
  const [publicLayoutRevision, setPublicLayoutRevision] = useState(0);
  const [publicLayoutPublishing, setPublicLayoutPublishing] = useState(false);
  const [editorDraftUpdatedAt, setEditorDraftUpdatedAt] = useState<string | null>(null);
  const [editorDraftSaving, setEditorDraftSaving] = useState(false);
  const [optionalLabelScaleSaving, setOptionalLabelScaleSaving] = useState(false);
  const [editorDraftSyncState, setEditorDraftSyncState] = useState<"ready" | "saving" | "saved" | "error" | "conflict">("ready");
  const [assetStatus, setAssetStatus] = useState<AssetStatus>("unchecked");
  const [assetCategory, setAssetCategory] = useState<CategoryId>("landmark");
  const [leftPanelMode, setLeftPanelMode] = useState<"assets" | "places" | "calibration" | "print">("places");
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
  const [startupAssetsReady, setStartupAssetsReady] = useState(false);
  const [startupInitialViewTarget, setStartupInitialViewTarget] = useState<{ zoom: number; pan: { x: number; y: number } } | null>(null);
  const [startupInitialViewReady, setStartupInitialViewReady] = useState(false);
  const [startupRevealReady, setStartupRevealReady] = useState(false);
  const [startupLoadDone, setStartupLoadDone] = useState(0);
  const [startupLoadTotal, setStartupLoadTotal] = useState(0);
  const [publicAssetProfile] = useState<PublicAssetProfile>(() => (
    typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches ? "mobile" : "standard"
  ));
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
  const [interaction, setInteraction] = useState<MapInteractionState>(null);

  const clearMapInteraction = useCallback(() => setInteraction(null), []);

  const setMapPan = useCallback((nextPan: { x: number; y: number }) => {
    panRef.current = nextPan;
    const stageWrap = stageWrapRef.current;
    if (stageWrap) {
      stageWrap.style.transform = `translate3d(calc(-50% + ${nextPan.x}px), calc(-50% + ${nextPan.y}px), 0)`;
    }
  }, []);

  const setEditorMapPan = useCallback((nextPan: { x: number; y: number }) => {
    panRef.current = nextPan;
    setMapRenderPan((current) => (
      current.x === nextPan.x && current.y === nextPan.y ? current : nextPan
    ));
  }, []);

  const setMapLayoutZoom = useCallback((nextZoom: number) => {
    if (publicLayoutAccess === "editor") return;
    stageWrapRef.current?.style.setProperty("--map-stage-width", `${nextZoom * 100}%`);
  }, [publicLayoutAccess]);

  // 편집 문서 복원·스냅샷·히스토리와 ref/state 동기화는 문서 작업공간이 담당합니다.
  const {
    currentDocument,
    setDocument,
    pushHistory,
    replaceElements,
    replaceAssets,
    replaceNotes,
    replaceDirectoryPlaces,
    replaceLandmarkDefaults,
    replaceDenseLabelPositions,
    replaceDenseLabelExcludedIds,
    restoreDenseLabelSettings,
    replacePlacementOverrides,
    editorAutosaveDocument,
  } = useEditorDocumentState({
    elements,
    assets,
    reviewNotes,
    directoryPlaces,
    calibrationPoints,
    landmarkDefaultPositions,
    denseLabelPositions,
    denseLabelExcludedIds,
    placementOverrides,
    elementsRef,
    assetsRef,
    notesRef,
    placesRef,
    calibrationPointsRef,
    landmarkDefaultsRef,
    denseLabelPositionsRef,
    denseLabelExcludedIdsRef,
    placementOverridesRef,
    factoryLandmarkDefaultPositions,
    defaultDirectoryPlaces,
    supportDirectoryPlaces,
    sanitizeDocument,
    ensureSystemDirectoryPlaces,
    ensureMainHubMapElement,
    setElements,
    setAssets,
    setReviewNotes,
    setDirectoryPlaces,
    setCalibrationPoints,
    setLandmarkDefaultPositions,
    setDenseLabelPositions,
    setDenseLabelExcludedIds,
    setPlacementOverrides,
    setUndoStack,
    setRedoStack,
    setCalibrationDirty,
    setSelectedId,
    setSelectedFacilityId,
    setSelectedNoteId,
    setSelectedDenseLabelId,
  });

  useLocalAutosave({
    hydrated,
    publicLayoutAccess,
    document: editorAutosaveDocument,
    getDocument: currentDocument,
    publishedRevisionRef: publishedLayoutRevisionRef,
    setSaveState,
    setToast,
  });

  useMapSettingsPersistence({
    hydrated,
    publicLayoutAccess,
    calibrationPoints,
    landmarkDefaultPositions,
    elements,
    placementOverrides,
    calibrationPointsRef,
    elementsRef,
    placesRef,
    placementOverridesRef,
    localCalibrationUpdatedAtRef,
    localLockedCoordinatesUpdatedAtRef,
    localPlacementUpdatedAtRef,
    setCalibrationPoints,
    replaceLandmarkDefaults,
    replaceElements,
    replacePlacementOverrides,
    ensureMainHubMapElement,
  });

  // 장소 목록·DB 편집 상태와 선택 인덱스는 서로 다른 책임의 작업공간에서 관리합니다.
  const {
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
  } = usePlaceManagerWorkspace({
    elements,
    directoryPlaces,
    printSettings,
    viewMode,
    screenRecommendedOnly,
  });
  const {
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
  } = usePlaceSelectionModel({
    elements,
    reviewNotes,
    directoryPlaces,
    selectedId,
    selectedFacilityId,
    selectedNoteId,
    directoryTaxonomySync,
    placeDirectoryCanEdit,
    publicCategoryMetaForPlace,
  });
  const {
    compatibleAssets,
    landmarkAssetGroups,
    generalMarkerAssets,
    customLandmarkAssets,
    assetsById,
  } = useAdminMapAssetViewModel({ assets, selected });
  const contentWorkspace = usePlaceContentWorkspace({
    selectedStoryKey,
    publicLayoutAccess,
    elementsRef,
    setToast,
  });
  const {
    eventPlaceIndexBootstrappedRef,
    placeStoriesLoading,
    placeStoriesLoadedKey,
    publishedPlaceStories,
    globalStoriesOpen,
    globalContentTab,
    globalStories,
    globalStoriesPage,
    globalStoriesPageCount,
    globalStoriesTotal,
    globalStoriesCanModerate,
    globalStoriesLoading,
    globalStoriesError,
    uploadDiagnostics,
    uploadDiagnosticsLoading,
    uploadDiagnosticsError,
    performanceDiagnostics,
    performanceDiagnosticsLoading,
    performanceDiagnosticsError,
    uploadDiagnosticActionId,
    performanceDiagnosticActionId,
    placeStoryActionId,
    placeStoryFormOpen,
    placeStoryAuthor,
    placeStoryText,
    placeStoryPhoto,
    placeStoryPhotoPreview,
    placeStorySubmitting,
    placeStoryPhotoRetaining,
    storyCameraPermission,
    storyReportTarget,
    storyReportReason,
    storyReportDetail,
    storyReportSubmitting,
    reportedStoryIds,
    placeEvents,
    placeEventsLoadedKey,
    eventLinkedPlaces,
    reviewCountsByPlace,
    reviewBadgeNow,
    placeEventFormOpen,
    placeEventEditingId,
    placeEventNoPlace,
    placeEventMultiPlace,
    placeEventPlaces,
    placeEventDialogOffset,
    placeEventName,
    placeEventInfo,
    placeEventStartsAt,
    placeEventEndsAt,
    placeEventVisibleFrom,
    placeEventVisibleUntil,
    placeEventPhoto,
    placeEventPhotoPreview,
    placeEventExistingPhotoUrl,
    placeEventSubmitting,
    placeEventActionId,
    globalEvents,
    globalEventsPage,
    globalEventsPageCount,
    globalEventsTotal,
    globalEventsCanManage,
    globalEventsLoading,
    globalEventsError,
    globalEventsRefreshKey,
    placeRequestFormOpen,
    placeRequestName,
    placeRequestArea,
    placeRequestAddress,
    placeRequestDescription,
    placeRequestCategory,
    placeRequestMarkerStyle,
    placeRequestLocation,
    placeRequestPickingLocation,
    placeRequestSubmitting,
    placeRequests,
    placeRequestsPage,
    placeRequestsPageCount,
    placeRequestsTotal,
    placeRequestsLoading,
    placeRequestsError,
    placeRequestActionId,
    setGlobalStoriesOpen,
    setGlobalContentTab,
    setGlobalStoriesPage,
    setGlobalStoriesTotal,
    setGlobalStoriesRefreshKey,
    setUploadDiagnosticsRefreshKey,
    setPerformanceDiagnosticsRefreshKey,
    setPlaceStoryAuthor,
    setPlaceStoryText,
    setStoryReportReason,
    setStoryReportDetail,
    setEventLinkedPlaces,
    setReviewCountsByPlace,
    setPlaceEventNoPlace,
    setPlaceEventMultiPlace,
    setPlaceEventPlaces,
    setPlaceEventName,
    setPlaceEventInfo,
    setPlaceEventStartsAt,
    setPlaceEventEndsAt,
    setPlaceEventVisibleFrom,
    setPlaceEventVisibleUntil,
    setGlobalEventsPage,
    setGlobalEventsTotal,
    setGlobalEventsRefreshKey,
    setPlaceRequestFormOpen,
    setPlaceRequestName,
    setPlaceRequestArea,
    setPlaceRequestAddress,
    setPlaceRequestDescription,
    setPlaceRequestCategory,
    setPlaceRequestMarkerStyle,
    setPlaceRequestLocation,
    setPlaceRequestPickingLocation,
    setPlaceRequestsPage,
    setPlaceRequestsTotal,
    setPlaceRequestsRefreshKey,
    syncReviewedPlaceRequestLocation,
    updatePlaceStoryPhoto,
    retainPlaceStoryPhoto,
    updatePlaceEventPhoto,
    togglePlaceEventMapSelection,
  } = contentWorkspace;

  // 좌표·앵커·요소 수정과 라벨 자동 정리는 관리자 지도 편집 작업공간이 담당합니다.
  const {
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
    setPlacementOverride,
    updateDenseLabelPosition,
    setDenseLabelEligibility,
    updateCalibrationPoint,
    resetCalibrationPoints,
    applyCalibrationToAll,
    moveAllResourcesToAnchors,
    updateElement,
    updateElementAnchor,
    moveAnchorToResource,
    updateNote,
    measureAssetBounds,
    autoArrangeLabels,
    refreshLabelPositions,
  } = useEditorMapEditActions({
    zoom,
    labelsRefreshing,
    assetVisualBounds,
    elements,
    directoryPlaces,
    calibrationPoints,
    landmarkDefaultPositions,
    selected,
    elementsRef,
    assetsRef,
    placesRef,
    calibrationPointsRef,
    landmarkDefaultsRef,
    calibrationLiveApplyRef,
    measuredAssetIdsRef,
    stageRef,
    canonicalMarkerAssetIds,
    landmarkLocationByName,
    pushHistory,
    replacePlacementOverrides,
    replaceDenseLabelPositions,
    replaceDenseLabelExcludedIds,
    replaceLandmarkDefaults,
    replaceDirectoryPlaces,
    replaceElements,
    replaceNotes,
    setSelectedDenseLabelId,
    setToast,
    setCalibrationPoints,
    setCalibrationDirty,
    setAssetVisualBounds,
    setLabelsRefreshing,
  });
  // 이하는 화면 크기와 초기 로딩 상태를 실제 화면에 맞춰 동기화하는 코드입니다.
  const publicPlaceDetailLoading = publicLayoutAccess === "viewer"
    && Boolean(selectedStoryKey)
    && (placeStoriesLoadedKey !== selectedStoryKey || placeEventsLoadedKey !== selectedStoryKey);
  const selectedHasThemeEasterEgg = UI_THEME_EASTER_EGG_PLACES.has(normalizePlaceName(selectedDirectoryPlace?.name ?? selectedDisplayName));

  const {
    mapVisibleElements,
    placedCategoryCounts,
    fitZoom,
    labelRenderZoom,
    labelDetailRatio,
    mapScaleRatioLabel,
    mapVisiblePercent,
    labelContentReady,
    labelDetailsReady,
    labelViewportSettled,
    denseLabelLayoutOptions,
    printSettingsByKey,
    printPolicyFor,
    recommendedPlaceCount,
    screenHiddenMarkerCount,
    editorLabelCandidates,
    editorLabelElements,
    visibleElements,
    stageLabelElements,
    outputLabelCount,
    stageMarkerIds,
    stageLabelIds,
    visibleElementIds,
    publicSelectedMarkerZIndex,
    denseLabelClusters,
    printAudit,
    collisions,
    mapLabelStatusByElementId,
    renderedMapElements,
    mobilePlaceholderElements,
    renderedMapElementsById,
    renderedDenseLabelClusters,
    renderedClusteredLabelElementIds,
    renderedIndividualLabelCount,
  } = useMapWorkspaceModel({
    elements,
    directoryPlaces,
    viewportDimensions,
    stageDimensions,
    publicLayoutAccess,
    printPreviewMode,
    settledLabelZoom,
    settledLabelPan,
    zoom,
    mapRenderPan,
    mapRenderRefreshRevision,
    activeCategory,
    viewMode,
    screenRecommendedOnly,
    markerLabelsVisible,
    selectedId,
    editorScaleLabelLimitsEnabled,
    optionalLabelScaleSteps,
    mobileRenderBudget,
    printSettings,
    printLandmarks,
    printMarkers,
    printLabels,
    printRecommendedOnly,
    denseLabelPositions,
    denseLabelExcludedIds,
    mergeDenseLabels,
    forceIndividualLabels,
    exportWidth,
    eventLinkedPlaces,
    reviewCountsByPlace,
    reviewBadgeNow,
    selectedDenseLabelId,
  });

  useLayoutEffect(() => {
    if (!performanceStartedAtRef.current) performanceStartedAtRef.current = performance.now();
  }, []);

  // 이하는 화면 좌표를 지도 좌표로 바꾸고 선택된 장소 정보를 동기화하는 코드입니다.
  const clientToMap = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return {
      x: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }, []);

  const {
    publicPlaceItems,
    publicPlaceCategoryCounts,
    publicExplorerPlaceRows,
    publicPanelExpanded,
    setPublicPanelExpanded,
    publicPlaceExpanded,
    setPublicPlaceExpanded,
    publicPanelDrag,
    publicPlaceQuery,
    setPublicPlaceQuery,
    publicPlaceCategory,
    setPublicPlaceCategory,
    expandedAdditionalCategoryItemId,
    setExpandedAdditionalCategoryItemId,
    publicPlaceQueryInputRef,
    publicPreserveMapViewOnNextPopRef,
    publicMapViewBeforeFocusRef,
    publicPlacePanelRef,
    publicExplorerPanelRef,
    currentPublicPlaceId,
    confirmDiscardStoryPhoto,
    rememberPublicMapView,
    restorePublicMapView,
    writePublicHistory,
    setPublicPanelExpansion,
    startPublicPanelDrag,
    movePublicPanelDrag,
    finishPublicPanelDrag,
    selectPublicMarker,
  } = usePublicPlaceWorkspace({
    visibleElements,
    directoryPlacesById,
    directoryPlacesByNormalizedName,
    directoryPlacesByGroup,
    eventLinkedPlaces,
    selectedId,
    selectedFacilityId,
    selectedDirectoryPlaceId: selectedDirectoryPlace?.id ?? null,
    placeStoryPhoto,
    zoomRef,
    panRef,
    fitZoomRef,
    publicNavigationInitializedRef,
    publicNavigationApplyingRef,
    cancelMapTransforms,
    setZoom,
    setMapPan,
    setMapRenderPan,
    setSelectedId,
    setSelectedFacilityId,
    setGlobalStoriesOpen,
    setSelectedNoteId,
    setSelectedDenseLabelId,
    onDiscardStoryPhoto: updatePlaceStoryPhoto,
  });

  useEffect(() => {
    if (!expandedAdditionalCategoryItemId) return;
    const closeAdditionalCategoryPopover = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".public-place-additional-category")) return;
      setExpandedAdditionalCategoryItemId(null);
    };
    document.addEventListener("pointerdown", closeAdditionalCategoryPopover, true);
    return () => document.removeEventListener("pointerdown", closeAdditionalCategoryPopover, true);
  }, [expandedAdditionalCategoryItemId, setExpandedAdditionalCategoryItemId]);

  useApplicationBootstrap({
    globalEventsRefreshKey,
    publicLayoutAccess,
    hydrated,
    editorDraftUpdatedAt,
    publicLayoutPublishedAt,
    expandedVisibilityGroups,
    expandedCalibrationGroups,
    markerLabelsVisible,
    mergeDenseLabels,
    expandedPlacedMarkerGroups,
    placeDirectoryApi: PLACE_DIRECTORY_API,
    latestTapdongSeasideStageAssetId: LATEST_TAPDONG_SEASIDE_STAGE_ASSET_ID,
    initialElements,
    builtInAssets,
    defaultDirectoryPlaces,
    initialCalibrationPoints,
    factoryLandmarkDefaultPositions,
    eventPlaceIndexBootstrappedRef,
    publishedLayoutDocumentRef,
    publishedLayoutViewRef,
    publishedLayoutRevisionRef,
    editorDraftDocumentRef,
    editorDraftViewRef,
    editorDraftRevisionRef,
    labelDensitySettingsRevisionRef,
    localCalibrationUpdatedAtRef,
    localLockedCoordinatesUpdatedAtRef,
    localDenseLabelsUpdatedAtRef,
    localPlacementUpdatedAtRef,
    placeDirectoryLoadedRef,
    placesRef,
    sanitizeDocument,
    buildDirectoryPlaces,
    mergeDirectoryRecords,
    assetIdAfterDirectoryCategoryChange,
    setDocument,
    replaceDirectoryPlaces,
    replaceElements,
    setAdminAccessMethod,
    setPublicLayoutPublishedAt,
    setPublicLayoutRevision,
    setPublicHistory,
    setEditorDraftUpdatedAt,
    setEditorDraftSyncState,
    setGlobalStoriesTotal,
    setGlobalEventsTotal,
    setPlaceRequestsTotal,
    setEventLinkedPlaces,
    setReviewCountsByPlace,
    setUploadedBaseMap,
    setBaseMapCanUpload,
    setPublicLayoutAccess,
    setBaseMap,
    setMarkerLabelsVisible,
    setMergeDenseLabels,
    setScreenRecommendedOnly,
    setMarkerGroupSize,
    setOptionalLabelScaleSteps,
    setSaveState,
    setLeftOpen,
    setRightOpen,
    setSelectedId,
    setHydrated,
    setExpandedVisibilityGroups,
    setExpandedCalibrationGroups,
    setExpandedPlacedMarkerGroups,
    setPlaceDirectoryStorage,
    setPlaceDirectoryCanEdit,
    setPlaceDirectoryUpdatedAt,
  });

  const {
    denseLabelSettingsCanEdit,
    denseLabelSettingsStorage,
    denseLabelSettingsError,
  } = useDenseLabelSettingsPersistence({
    hydrated,
    publicLayoutAccess,
    positions: denseLabelPositions,
    excludedElementIds: denseLabelExcludedIds,
    positionsRef: denseLabelPositionsRef,
    excludedElementIdsRef: denseLabelExcludedIdsRef,
    localUpdatedAtRef: localDenseLabelsUpdatedAtRef,
    onRestore: restoreDenseLabelSettings,
  });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // 베이스맵 품질, 시작 자산, 화면 측정·초기 시점과 라벨 정착은 지도 런타임 생명주기가 담당합니다.
  const {
    activeBaseMapSrc,
    baseMapResolutionUpgradeSrc,
    useMobileLandmarkAssets,
  } = useMapRuntimeLifecycle({
    baseMap,
    mapSvg: MAP_SVG,
    mapPng: MAP_PNG,
    signatureSource: JFAC_SIGNATURE_B_SVG,
    uploadedBaseMap,
    decodedHighResolutionBaseMapSource,
    mobileRenderBudget,
    publicLayoutAccess,
    publicAssetProfile,
    viewportDimensions,
    stageDimensions,
    zoom,
    mapRenderPan,
    hydrated,
    visibleElements,
    assetsById,
    elements,
    startupAssetsReady,
    startupInitialViewTarget,
    startupInitialViewReady,
    startupRevealReady,
    settledLabelZoom,
    printPreviewMode,
    labelDetailRatio,
    calibrationLiveApply,
    fitZoom,
    stageLabelElementCount: stageLabelElements.length,
    baseMapImgRef,
    viewportRef,
    stageWrapRef,
    stageRef,
    startupLoadCompletedRef,
    fitZoomRef,
    fitZoomAppliedRef,
    zoomRef,
    panRef,
    publicInitialViewAppliedRef,
    performanceStartupSentRef,
    performanceStartedAtRef,
    calibrationLiveApplyRef,
    uploadedBaseMapOriginalSource,
    setDecodedHighResolutionBaseMapSource,
    setMapLoaded,
    setStartupLoadDone,
    setStartupLoadTotal,
    setStartupAssetsReady,
    setStageDimensions,
    setViewportDimensions,
    setZoom,
    setStartupInitialViewTarget,
    setStartupInitialViewReady,
    setStartupRevealReady,
    setForceIndividualLabels,
    setSettledLabelZoom,
    setSettledLabelPan,
    setMapRenderPan,
    setMapLayoutZoom,
    setEditorMapPan,
    setMapPan,
    sendPerformanceDiagnostic,
  });
  const baseMapPrimarySrc = baseMapResolutionUpgradeSrc
    && committedBaseMapUpgradeSource === baseMapResolutionUpgradeSrc
    ? baseMapResolutionUpgradeSrc
    : activeBaseMapSrc;
  const pendingBaseMapUpgradeSrc = baseMapResolutionUpgradeSrc
    && committedBaseMapUpgradeSource !== baseMapResolutionUpgradeSrc
    ? baseMapResolutionUpgradeSrc
    : "";

  // 이하는 모바일 드래그·핀치와 지도 확대·이동을 처리하는 코드입니다.
  const mapTransformController = useMapTransformController({
    elements: {
      viewportRef,
      stageWrapRef,
      stageRef,
      mobileMarkerPlaceholderLayerRef,
    },
    transform: {
      fitZoom,
      zoomRef,
      panRef,
      zoom,
      publicLayoutAccess,
      setZoom,
      setMapLayoutZoom,
      setMapPan,
      setMapRenderPan,
      setEditorMapPan,
    },
    clearInteraction: clearMapInteraction,
  });
  useLayoutEffect(() => {
    cancelMapTransformsRef.current = mapTransformController.cancelTransientMapTransforms;
    return () => {
      cancelMapTransformsRef.current = () => undefined;
    };
  }, [mapTransformController.cancelTransientMapTransforms]);

  useEffect(() => {
    if (publicLayoutAccess === "loading" || (publicLayoutAccess === "viewer" && baseMap !== "uploaded")) return;
    if (uploadedBaseMap?.available) return;
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
  }, [baseMap, publicLayoutAccess, uploadedBaseMap?.available]);

  // 포인터 생명주기, 편집 드래그, 키보드 이동, 지도 포커스는 상호작용 작업공간이 담당합니다.
  const {
    undo,
    redo,
    onWheel,
    startPan,
    handleStagePointerDown,
    startDrag,
    startLabelDrag,
    startDenseLabelDrag,
    startResize,
    focusMapPosition,
  } = useMapInteractionActions({
    publicLayoutAccess,
    fitZoom,
    zoom,
    viewportDimensions,
    stageDimensions,
    visibleElementCount: visibleElements.length,
    stageLabelElementCount: stageLabelElements.length,
    interaction,
    memoMode,
    selectedId,
    selected,
    resourceOutputDragMode,
    databaseEditorOpen,
    publicHistoryOpen,
    shortcutHelpOpen,
    placeEventFormOpen,
    placeEventNoPlace,
    placeEventMultiPlace,
    placeRequestPickingLocation,
    globalStoriesOpen,
    publicPanelExpanded,
    publicPlaceExpanded,
    undoStack,
    redoStack,
    viewportRef,
    stageRef,
    zoomRef,
    panRef,
    elementsRef,
    calibrationPointsRef,
    notesRef,
    performanceSettleSamplesRef,
    mobileSlowSettleSamplesRef,
    transformController: mapTransformController,
    clientToMap,
    syncReviewedPlaceRequestLocation,
    togglePlaceEventMapSelection,
    selectPublicMarker,
    confirmDiscardStoryPhoto,
    updateElement,
    updateCalibrationPoint,
    updateDenseLabelPosition,
    updateElementAnchor,
    setPlacementOverride,
    currentDocument,
    setDocument,
    pushHistory,
    replaceElements,
    replaceNotes,
    setInteraction,
    setEditorMapPan,
    setMobileRenderBudget,
    setUndoStack,
    setRedoStack,
    setZoom,
    setSelectedId,
    setSelectedFacilityId,
    setSelectedNoteId,
    setSelectedDenseLabelId,
    setPublicPlaceExpanded,
    setPlaceRequestLocation,
    setCalibrationDirty,
    setMemoMode,
    setRightOpen,
    setFocusPulseId,
    setToast,
    sendPerformanceDiagnostic,
  });

  const {
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
  } = usePlaceEditorActions({
    geocodeCacheKey: GEOCODE_CACHE_KEY,
    landmarkResourceSize: LANDMARK_RESOURCE_SIZE,
    placeDirectoryApi: PLACE_DIRECTORY_API,
    autoArrangeLabels: (...args) => autoArrangeLabels(...args),
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
  });
  // 관리자 자산·베이스맵 업로드와 선택 요소 빠른 작업은 별도 작업공간에서 조립합니다.
  const {
    addAssetElement,
    applyLandmarkCandidate,
    uploadAsset,
    uploadBaseMap,
    moveLayer,
    applyGroupSize,
    applyMarkerStyle,
    duplicateSelected,
    toggleSelectedCoordinateReview,
    deleteSelected,
    deleteSelectedNote,
  } = useAdminMapAssetActions({
    assetCategory,
    assetStatus,
    markerGroupSize,
    selected,
    selectedNote,
    directoryPlaces,
    uploadedMapApi: UPLOADED_MAP_API,
    elementsRef,
    assetsRef,
    pushHistory,
    replaceElements,
    replaceAssets,
    replaceNotes,
    updateElement,
    focusMapPosition,
    setPlacementOverride,
    setSelectedId,
    setSelectedNoteId,
    setToast,
    setBaseMapUploading,
    setUploadedBaseMap,
    setBaseMapCanUpload,
    setMapLoaded,
    setBaseMap,
    setMarkerStyle,
    setCalibrationDirty,
    setResourceOutputDragMode,
  });

  const {
    download,
    exportHighResolutionPng,
    exportJson,
    importJson,
    exportNotesJson,
    exportNotesCsv,
    updateOptionalLabelScaleLimit,
    resetOptionalLabelScaleLimits,
    saveOptionalLabelScaleLimits,
    saveEditorDraft,
    publishCurrentLayout,
    refreshPublicHistory,
    loadPublicHistoryEntry,
  } = useAdminOutputWorkspace({
    exporting,
    exportWidth,
    printAudit,
    baseMap,
    mapSvg: MAP_SVG,
    mapPng: MAP_PNG,
    uploadedBaseMap,
    printRecommendedOnly,
    mergeDenseLabels,
    layoutName,
    reviewNotes,
    reviewStatusText,
    publicLayoutAccess,
    optionalLabelScaleSteps,
    optionalLabelScaleSaving,
    editorDraftSaving,
    publicLayoutPublishing,
    publicLayoutRevision,
    publicHistoryActionId,
    markerLabelsVisible,
    screenRecommendedOnly,
    markerGroupSize,
    builtInAssets,
    defaultDirectoryPlaces,
    initialCalibrationPoints,
    factoryLandmarkDefaultPositions,
    elementsRef,
    assetsRef,
    denseLabelPositionsRef,
    denseLabelExcludedIdsRef,
    labelDensitySettingsRevisionRef,
    publishedLayoutDocumentRef,
    publishedLayoutViewRef,
    publishedLayoutRevisionRef,
    editorDraftDocumentRef,
    editorDraftViewRef,
    editorDraftRevisionRef,
    uploadedBaseMapOriginalSource,
    printPolicyFor,
    currentDocument,
    sanitizeDocument,
    pushHistory,
    setDocument,
    setPrintAuditOpen,
    setPrintPreviewMode,
    setToast,
    setExporting,
    setLayoutName,
    setOptionalLabelScaleSteps,
    setSaveState,
    setEditorDraftSyncState,
    setOptionalLabelScaleSaving,
    setEditorDraftUpdatedAt,
    setPublicHistory,
    setEditorDraftSaving,
    setPublicLayoutPublishing,
    setPublicLayoutPublishedAt,
    setPublicLayoutRevision,
    setPublicHistoryActionId,
    setPublicHistoryOpen,
    setBaseMap,
    setMarkerLabelsVisible,
    setMergeDenseLabels,
    setScreenRecommendedOnly,
    setMarkerGroupSize,
  });

  // 관리자 전역 단축키와 로그인·공개 화면 전환은 애플리케이션 셸 생명주기에서 관리합니다.
  const {
    submitSharedAdminLogin,
    signOutSharedAdmin,
    switchPublicView,
  } = useApplicationShellLifecycle({
    publicLayoutAccess,
    adminPassword,
    adminLoginOpen,
    placeRequestFormOpen,
    placeEventFormOpen,
    databaseEditorOpen,
    publicHistoryOpen,
    editorDraftSaving,
    shortcutHelpOpen,
    leftPanelRef,
    placeQueryInputRef,
    databaseEditorQueryInputRef,
    saveEditorDraft,
    undo,
    redo,
    setAdminLoginError,
    setAdminLoginSubmitting,
    setShortcutHelpOpen,
    setLeftOpen,
    setLeftPanelMode,
    setCalibrationMode,
  });

  // 후기·행사·장소 요청 명령은 콘텐츠 상태 계약을 기준으로 한곳에서 조립합니다.
  const {
    togglePlaceStoryForm,
    requestPlaceStoryCameraPermission,
    submitPlaceStory,
    closePlaceStoryReport,
    openPlaceStoryReport,
    submitPlaceStoryReport,
    moderatePlaceStory,
    deletePlaceStory,
    deleteUploadDiagnostic,
    clearUploadDiagnostics,
    deletePerformanceDiagnostic,
    clearPerformanceDiagnostics,
    closePlaceEventForm,
    openUnassignedPlaceEventForm,
    editPlaceEvent,
    startPlaceEventDialogDrag,
    movePlaceEventDialog,
    endPlaceEventDialogDrag,
    submitPlaceEvent,
    moderatePlaceEvent,
    togglePlaceEventPin,
    deletePlaceEvent,
    submitPlaceRegistrationRequest,
    updatePlaceRequestDraft,
    savePlaceRequestEdits,
    startPlaceRequestReview,
    approvePlaceRequest,
    rejectPlaceRequest,
    deletePlaceRequest,
  } = usePlaceContentActions({
    content: contentWorkspace,
    selected,
    selectedDirectoryPlace,
    selectedStoryKey,
    markerGroupSize,
    selectedId,
    elementsRef,
    mergeDirectoryRecords,
    replaceElements,
    replaceDirectoryPlaces,
    pushHistory,
    focusMapPosition,
    setSelectedId,
    setSelectedNoteId,
    setSelectedDenseLabelId,
    setRightOpen,
    setPlaceDirectoryUpdatedAt,
    setPlaceDirectoryStorage,
    setToast,
  });

  // 공개 패널 전환·장소 포커스·복사·공유는 별도 내비게이션 작업공간에서 조립합니다.
  const {
    closePublicExplorerPanel,
    toggleGlobalStories,
    openUnifiedContentManagement,
    focusPublicPlaceItem,
    closePublicPlacePanel,
    openPublicPlaceList,
    resetPublicMap,
    refreshVisibleMapRenderInfo,
    copyPublicPlaceAddress,
    sharePublicPlace,
    openGlobalStoryPlace,
    openGlobalEventPlace,
  } = usePublicNavigationActions({
    publicLayoutAccess,
    globalStoriesOpen,
    globalContentTab,
    viewportDimensions,
    publicPlaceItems,
    selectedDirectoryPlace,
    selected,
    selectedDisplayName,
    fitZoom,
    zoomRef,
    panRef,
    publicPreserveMapViewOnNextPopRef,
    publicMapViewBeforeFocusRef,
    publicNavigationAfterPopRef,
    confirmDiscardStoryPhoto,
    rememberPublicMapView,
    restorePublicMapView,
    cancelMapTransforms,
    currentPublicPlaceId,
    writePublicHistory,
    focusMapPosition,
    setGlobalStoriesOpen,
    setGlobalContentTab,
    setGlobalStoriesPage,
    setGlobalStoriesRefreshKey,
    setGlobalEventsPage,
    setGlobalEventsRefreshKey,
    setPlaceRequestsPage,
    setSelectedId,
    setSelectedFacilityId,
    setSelectedNoteId,
    setSelectedDenseLabelId,
    setPublicPanelExpanded,
    setPublicPlaceExpanded,
    setZoom,
    setMapPan,
    setMapRenderPan,
    setSettledLabelZoom,
    setSettledLabelPan,
    setMapRenderRefreshRevision,
    setToast,
  });

  // 공개 단축키, 브라우저 히스토리 복원, Escape 닫기 순서는 공개 내비게이션 생명주기가 담당합니다.
  usePublicNavigationLifecycle({
    publicLayoutAccess,
    adminLoginOpen,
    placeRequestFormOpen,
    placeRequestPickingLocation,
    shortcutHelpOpen,
    globalStoriesOpen,
    fitZoom,
    publicPlaceItems,
    selectedId,
    publicPlaceExpanded,
    publicPanelExpanded,
    publicHistoryOpen,
    storyReportTarget,
    databaseEditorOpen,
    placeEventFormOpen,
    publicPlaceQueryInputRef,
    publicPreserveMapViewOnNextPopRef,
    publicMapViewBeforeFocusRef,
    publicNavigationAfterPopRef,
    publicNavigationApplyingRef,
    publicNavigationInitializedRef,
    placeRequestLocationBeforePickingRef,
    openPublicPlaceList,
    currentPublicPlaceId,
    restorePublicMapView,
    rememberPublicMapView,
    focusMapPosition,
    confirmDiscardStoryPhoto,
    closePlaceStoryReport,
    closeDatabaseEditor,
    closePlaceEventForm,
    closePublicExplorerPanel,
    closePublicPlacePanel,
    setPublicPanelExpansion,
    setGlobalContentTab,
    setZoom,
    setMapPan,
    setMapRenderPan,
    setShortcutHelpOpen,
    setSelectedId,
    setSelectedFacilityId,
    setSelectedNoteId,
    setSelectedDenseLabelId,
    setPublicPlaceExpanded,
    setGlobalStoriesOpen,
    setPublicPanelExpanded,
    setPublicHistoryOpen,
    setAdminLoginOpen,
    setAdminLoginError,
    setPlaceRequestFormOpen,
    setPlaceRequestPickingLocation,
    setPlaceRequestLocation,
  });

  // 이하는 공개·관리자 화면 전환과 최종 지도 렌더링 자료를 준비하는 코드입니다.
  const stageMapClass = printPreviewMode ? "print-preview-mode" : viewMode === "dim" ? "map-dim" : viewMode === "gray" ? "map-gray" : viewMode === "nomap" ? "map-hidden" : "";
  const editingEnabled = publicLayoutAccess === "editor" && !printPreviewMode;
  const activeGlobalCount = globalContentTab === "reviews"
    ? globalStoriesTotal
    : globalContentTab === "events"
      ? globalEventsTotal
      : globalContentTab === "places"
        ? publicPlaceItems.length
        : placeRequestsTotal;
  const eventPlaceSelectionMode = editingEnabled && placeEventFormOpen && !placeEventNoPlace && placeEventMultiPlace;
  const eventPlaceKeySet = useMemo(() => new Set(placeEventPlaces.map((place) => place.placeKey)), [placeEventPlaces]);
  const activeBaseMapLabel = baseMap === "uploaded" ? uploadedBaseMap?.name ?? "업로드 지도" : "v15 · 골목추가정리 검수본";
  const editorSyncLabel = editorDraftSyncState === "saving"
    ? "서버 저장 중"
    : editorDraftSyncState === "conflict"
      ? "서버 초안 충돌"
      : editorDraftSyncState === "error"
        ? "동기화 오류 · 기기 임시복구 유지"
        : editorDraftUpdatedAt
          ? `서버 동기화됨 · ${new Date(editorDraftUpdatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
          : "서버 초안 저장 전 · 기기 임시복구 중";
  const editorSyncClass = editorDraftSyncState === "error" || editorDraftSyncState === "conflict"
    ? "sync-error"
    : editorDraftSyncState === "saving"
      ? "sync-saving"
      : editorDraftUpdatedAt
        ? "sync-saved"
        : "sync-local";
  const printSyncLabel = printSettingsStorage === "loading" || denseLabelSettingsStorage === "loading"
    ? "동기화 확인 중"
    : denseLabelSettingsStorage === "error"
      ? denseLabelSettingsError ?? "라벨 설정 서버 저장 실패 · 기기 저장본 유지"
    : printSettingsStorage === "persistent" && denseLabelSettingsStorage === "persistent"
      ? "서버 동기화됨"
      : "기기 임시 저장";

  const startupLoadPercent = startupAssetsReady
    ? 100
    : startupLoadTotal > 0
      ? Math.round((startupLoadDone / startupLoadTotal) * 100)
      : 8;
  const startupLoadingMessage = publicLayoutAccess === "loading"
    ? "공개 지도를 확인하고 있습니다."
    : !startupAssetsReady
      ? "지도와 장소 자산을 준비하고 있습니다."
      : !startupInitialViewReady
        ? "주요 거점을 중심으로 지도를 맞추고 있습니다."
        : "화면을 안정화하고 있습니다.";
  const startupLoadingCard = <section className="public-loading-card" aria-live="polite" aria-busy="true">
    <img className="public-loading-symbol" src={JFAC_SIGNATURE_B_SVG} width={1182} height={626} alt="제주문화예술재단 국문 시그니처 B" decoding="async" />
    <div className="public-loading-status"><span aria-hidden="true" /><b>로딩 중</b></div>
    <p>{startupLoadingMessage}</p>
    <div className="public-loading-track" aria-hidden="true"><span style={{ width: `${startupLoadPercent}%` }} /></div>
    <small>{startupAssetsReady && startupInitialViewReady ? "화면 정리" : startupLoadTotal > 0 ? `${Math.min(startupLoadDone, startupLoadTotal)} / ${startupLoadTotal}` : "연결 준비"}</small>
  </section>;

  useLayoutEffect(() => {
    mapRenderActionsRef.current = {
      measureAssetBounds,
      selectPublicMarker,
      startDenseLabelDrag,
      startDrag,
      startLabelDrag,
      startPan,
      startResize,
      togglePlaceEventMapSelection,
    };
  });

  if (publicLayoutAccess === "loading") {
    return <main className="app-shell public-loading" data-ui-theme={uiTheme}>{startupLoadingCard}</main>;
  }

  // 이하는 사용자가 실제로 보는 헤더, 지도, 패널, 팝업 화면 코드입니다.
  return (
    <Suspense fallback={<main className="app-shell public-loading" data-ui-theme={uiTheme}>{startupLoadingCard}</main>}>
      <main className={`app-shell ${publicLayoutAccess === "viewer" ? "public-readonly-shell" : ""} ${publicLayoutAccess === "viewer" && selected ? "public-place-selected" : ""}`} data-ui-theme={uiTheme}>
      {!startupRevealReady && <div className="public-loading public-loading-overlay">{startupLoadingCard}</div>}
      {publicLayoutAccess === "editor" ? <header className="topbar">
        <div className="brand-block"><div className="brand-mark"><img src={JFAC_SYMBOL_SVG} width={446} height={140} alt="" aria-hidden="true" /></div><div><strong>제주 원도심 아트맵 관리</strong><span>제주문화예술재단 · 내부 디자인 도구</span></div><details className="admin-theme-menu">
            <summary aria-label={`현재 ${activeUiTheme.name} 테마 · 테마 선택 열기`} title="UI 테마 선택">
              <span>테마</span><UiThemeSwatch colors={activeUiTheme.colors} />
            </summary>
            <div className="admin-theme-popover"><div><strong>UI 테마</strong><span>이 기기에 저장됩니다</span></div><UiThemePicker activeTheme={uiTheme} onSelect={selectUiTheme} /></div>
          </details></div>
        <div className="toolbar-group manager-tools">
          <button type="button" onClick={openDatabaseEditor}>DB 관리</button>
          <button type="button" className="history-trigger" onClick={() => { setPublicHistoryOpen(true); void refreshPublicHistory(); }}>공개본 기록 <span>{publicHistory.length}</span></button>
        </div>
        <div className="toolbar-group muted-actions">
          <button onClick={undo} disabled={!undoStack.length} aria-label="실행 취소">↶</button>
          <button onClick={redo} disabled={!redoStack.length} aria-label="다시 실행">↷</button>
          <button type="button" className="shortcut-trigger" onClick={() => setShortcutHelpOpen(true)} aria-haspopup="dialog" aria-controls="shortcut-dialog">단축키</button>
        </div>
        <div className="toolbar-group zoom-tools">
          <button onClick={() => setZoom((value) => clamp(value / 1.16, 0.22, 4))} aria-label="축소">−</button><output>{Math.round(zoom * 100)}%</output>
          <button onClick={() => setZoom((value) => clamp(value * 1.16, 0.22, 4))} aria-label="확대">＋</button><button onClick={() => { zoomRef.current = fitZoom; setZoom(fitZoom); setEditorMapPan({ x: 0, y: 0 }); }}>맞춤</button>
        </div>
        <div className="toolbar-group export-tools"><button className={`print-preview-toggle ${printPreviewMode ? "active" : ""}`} onClick={openPrintSettings}>{printPreviewMode ? "출력 · 미리보기 중" : "출력"}</button></div>
        <div className="toolbar-group public-layout-tools"><span className={publicLayoutPublishedAt ? "published" : "draft-only"}>{publicLayoutPublishedAt ? `공개본 ${new Date(publicLayoutPublishedAt).toLocaleDateString("ko-KR")}` : "아직 게시 안 됨"}</span><button className="public-view-link" type="button" onClick={() => switchPublicView(true)}>배포본 보기</button><button className="publish-layout" disabled={publicLayoutPublishing || !hydrated} onClick={() => void publishCurrentLayout()}>{publicLayoutPublishing ? "저장 중…" : "공개본 업데이트"}</button></div>
        {adminAccessMethod === "shared" && <button className="shared-admin-signout" type="button" onClick={() => void signOutSharedAdmin()}>관리자 로그아웃</button>}
      </header> : <header className="topbar public-topbar">
        <div className="brand-block"><div className="brand-mark"><img src={JFAC_SYMBOL_SVG} width={446} height={140} alt="" aria-hidden="true" /></div><div><strong>제주 원도심 아트맵</strong><span>{publicLayoutPublishedAt ? `공개 배치본 · ${new Date(publicLayoutPublishedAt).toLocaleDateString("ko-KR")} 갱신` : "공개 배치본 준비 중"}</span></div></div>
        <div className="toolbar-group zoom-tools"><button onClick={() => setZoom((value) => clamp(value / 1.16, fitZoom, 4))} aria-label="축소">−</button><output>{Math.round(zoom * 100)}%</output><button onClick={() => setZoom((value) => clamp(value * 1.16, fitZoom, 4))} aria-label="확대">＋</button><button onClick={() => { setZoom(fitZoom); setMapPan({ x: 0, y: 0 }); setMapRenderPan({ x: 0, y: 0 }); }}>맞춤</button></div>
        <button className="main-hub-quick" type="button" onClick={() => { const hub = publicPlaceItems.find((item) => item.isMainHub); if (hub) { setGlobalStoriesOpen(false); focusPublicPlaceItem(hub); } }}>▼ 주요 거점</button>
        <span className="readonly-badge">마커 선택 · 기록 참여</span>
        <button className="public-shortcut-trigger shortcut-trigger" type="button" onClick={() => setShortcutHelpOpen(true)} aria-haspopup="dialog" aria-controls="shortcut-dialog">단축키</button>
        {publicViewOverride
          ? <button className="owner-signin admin-return-trigger" type="button" onClick={() => switchPublicView(false)}>관리자 화면으로</button>
          : <button className="owner-signin admin-login-trigger" type="button" onClick={() => { setAdminPassword(""); setAdminLoginError(""); setAdminLoginOpen(true); }}>관리자 로그인</button>}
      </header>}

      <section className={`workspace ${publicLayoutAccess === "viewer" ? "public-viewer" : ""} ${leftOpen ? "" : "left-closed"} ${rightOpen ? "" : "right-closed"} ${leftPanelMode === "calibration" && leftOpen ? "calibration-open" : ""}`}>
        {publicLayoutAccess === "editor" && <aside ref={leftPanelRef} className="panel asset-panel" aria-label="자산 목록">
          <div className="panel-heading"><div><strong>{leftPanelMode === "assets" ? "지도·자산" : leftPanelMode === "places" ? "장소·요소" : leftPanelMode === "print" ? "출력" : "좌표 기준점"}</strong><span>{leftPanelMode === "assets" ? "베이스맵·프로젝트 자산·검토 도구" : leftPanelMode === "places" ? `통합 목록 ${allUnifiedPlaceRows.length}곳 · 배치/표시 관리` : leftPanelMode === "print" ? `${exportWidth.toLocaleString()}px · 추천 ${recommendedPlaceCount}곳` : `기준점 ${calibrationPoints.length}곳 · 실시간 보정`}</span></div><button className="icon-button" onClick={() => setLeftOpen(false)} aria-label="왼쪽 패널 접기">‹</button></div>
          <div className="panel-tabs" role="tablist" aria-label="왼쪽 패널 내용">
            <button className={leftPanelMode === "places" ? "active" : ""} onClick={() => switchLeftPanel("places")} role="tab" aria-selected={leftPanelMode === "places"}>장소·요소 <span>{allUnifiedPlaceRows.length}</span></button>
            <button className={leftPanelMode === "assets" ? "active" : ""} onClick={() => switchLeftPanel("assets")} role="tab" aria-selected={leftPanelMode === "assets"}>지도·자산</button>
            <button className={leftPanelMode === "calibration" ? "active" : ""} onClick={() => switchLeftPanel("calibration")} role="tab" aria-selected={leftPanelMode === "calibration"}>좌표 보정 <span>6</span></button>
            <button className={leftPanelMode === "print" ? "active" : ""} onClick={() => switchLeftPanel("print")} role="tab" aria-selected={leftPanelMode === "print"}>출력</button>
          </div>
          {leftPanelMode === "assets" ? <>
          <div className="panel-search">아이콘·마커 보기 및 자산 <kbd>{assets.length}</kbd></div>
          <AdminFolder className="side-admin-folder view-control-panel" title="지도 검수·베이스맵" meta={activeBaseMapLabel} defaultOpen>
            <div className="map-review-flat">
              <section className="map-review-section">
                <div className="flat-section-head"><strong>검수 화면</strong><span>지도 효과와 오류 표시</span></div>
                <label className="view-detail-select">표시 효과<select value={(["anchors", "clearance", "collisions", "dim", "gray", "nomap"] as ViewMode[]).includes(viewMode) ? viewMode : "all"} onChange={(event) => setViewMode(event.target.value as ViewMode)}>
                  <option value="all">효과 없음</option><option value="anchors">앵커·연결선</option><option value="clearance">아이콘 여유 구역</option><option value="collisions">충돌 검사</option><option value="dim">베이스맵 명도 낮추기</option><option value="gray">베이스맵 흑백</option><option value="nomap">지도 없이 보기</option>
                </select></label>
              </section>
              <section className="map-review-section advanced-basemap-tools">
                <div className="flat-section-head"><strong>베이스맵</strong><span>{activeBaseMapLabel}</span></div>
                <div className="segmented"><button className={baseMap === "svg" ? "active" : ""} onClick={() => { setMapLoaded(false); setBaseMap("svg"); }}>벡터 기본</button>{uploadedBaseMap?.available && <button className={baseMap === "uploaded" ? "active" : ""} onClick={() => { setMapLoaded(false); setBaseMap("uploaded"); }}>업로드 지도</button>}<button className={baseMap === "png" ? "active" : ""} onClick={() => { setMapLoaded(false); setBaseMap("png"); }}>원본 PNG · 비상용</button></div>
                <button className="advanced-map-upload" disabled={baseMapUploading} onClick={() => mapUploadInputRef.current?.click()}>{baseMapUploading ? "저장 중…" : "베이스 지도 업로드"}</button>
                <input ref={mapUploadInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" onChange={(event) => void uploadBaseMap(event)} />
                {baseMapCanUpload === false && <a className="inline-signin" href="/signin-with-chatgpt?return_to=/">소유자 로그인</a>}
                <p>벡터 지도를 기본으로 사용합니다. 원본 PNG는 벡터 표시를 확인하기 어려울 때만 선택하세요.</p>
              </section>
              <section className="map-review-section advanced-backup-tools"><div className="flat-section-head"><strong>편집 상태 백업</strong><span>문제 발생 시 복구용</span></div><div><button type="button" onClick={exportJson}>JSON 백업 ↓</button><button type="button" onClick={() => jsonInputRef.current?.click()}>JSON 불러오기 ↑</button></div><input ref={jsonInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importJson} /></section>
            </div>
          </AdminFolder>
          <AdminFolder className="side-admin-folder" title="자산 필터·업로드" meta={`${assets.length}개`}>
          <div className="category-filter">
            <button className={activeCategory === "all" ? "active" : ""} onClick={() => setActiveCategory("all")}><span className="category-dot all-dot" /> 전체 자산 <em>{elements.length}</em></button>
            {categories.map((category) => <button key={category.id} className={activeCategory === category.id ? "active" : ""} onClick={() => setActiveCategory(category.id)}><span className="category-dot" style={{ background: category.color }} /> {category.name}<em>{placedCategoryCounts[category.id]}</em></button>)}
          </div>
          <div className="asset-upload"><div className="asset-upload-row">
            <select aria-label="업로드 자산 카테고리" value={assetCategory} onChange={(event) => setAssetCategory(event.target.value as CategoryId)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            <select aria-label="업로드 자산 검수 상태" value={assetStatus} onChange={(event) => setAssetStatus(event.target.value as AssetStatus)}><option value="approved">승인 완료</option><option value="review">검수 중</option><option value="unchecked">미검수</option></select>
          </div><button className="upload-button" onClick={() => fileInputRef.current?.click()}>PNG·SVG 자산 불러오기</button><input ref={fileInputRef} className="visually-hidden" type="file" accept="image/png,image/webp,image/svg+xml,.svg" multiple onChange={uploadAsset} /></div>
          </AdminFolder>
          <AdminFolder className="side-admin-folder" title="프로젝트 자산" meta="후보 클릭으로 적용·교체">
          <div className="asset-grid compact-assets">
            <div className="landmark-resource-heading"><strong>랜드마크 후보 리소스</strong><small>한 장소에서 여러 안을 선택할 수 있습니다.</small></div>
            {landmarkAssetGroups.map(({ placeName, candidates }) => {
              const activeAssetId = elementsByNormalizedName.get(normalizePlaceName(placeName))?.assetId;
              return <article className="landmark-resource-group" key={placeName}>
                <div><strong>{placeName}</strong><small>{candidates.length}개 후보 · 1024px</small></div>
                <div className="landmark-candidate-row">{candidates.map((asset) => <div className="project-asset-candidate" key={asset.id}><button className={activeAssetId === asset.id ? "active" : ""} onClick={() => applyLandmarkCandidate(asset)} title={`${placeName} ${asset.name}`}><img src={asset.screenSrc ?? asset.src} alt="" loading="lazy" decoding="async" /><span>{asset.name}</span></button>{asset.sourceUrl && <a className="project-asset-source-link" href={asset.sourceUrl} target="_blank" rel="noreferrer" title={`${asset.name} Drive 원본 보기`}>Drive 원본 ↗</a>}</div>)}</div>
              </article>;
            })}
            {!!customLandmarkAssets.length && <><div className="landmark-resource-heading"><strong>사용자 랜드마크</strong></div>{customLandmarkAssets.map((asset) => <div className="project-asset-row" key={asset.id}><button className="asset-card uploaded" onClick={() => addAssetElement(asset)}><span className="asset-preview image-preview"><img src={asset.src} alt="" loading="lazy" decoding="async" /></span><span><strong>{asset.name}</strong><small>{statusText[asset.status]} · 사용자 자산</small></span><i>＋</i></button>{asset.sourceUrl && <a className="project-asset-source-link" href={asset.sourceUrl} target="_blank" rel="noreferrer">Drive 원본 보기 ↗</a>}</div>)}</>}
            <div className="landmark-resource-heading"><strong>문화시설·카페·음식점·소품샵·주차장·공원·편의시설</strong><small>리뉴얼 최종 9종과 기존 시안을 SVG 자산으로 선택할 수 있습니다.</small></div>
            {generalMarkerAssets.map((asset) => <div className="project-asset-row" key={asset.id}><button className="asset-card uploaded" onClick={() => addAssetElement(asset)}><span className="asset-preview image-preview"><img src={asset.src} alt="" loading="lazy" decoding="async" /></span><span><strong>{asset.name}</strong><small>{statusText[asset.status]} · {asset.fileType.toUpperCase()}</small></span><i>＋</i></button>{asset.sourceUrl && <a className="project-asset-source-link" href={asset.sourceUrl} target="_blank" rel="noreferrer">Drive 원본 보기 ↗</a>}</div>)}
          </div>
          </AdminFolder>
          </> : leftPanelMode === "places" ? <div className="place-directory">
            <AdminFolder className="side-admin-folder group-size-panel" title="일괄 조절" meta={`기본 마커 ${markerGroupSize.toFixed(1)}%`}>
              <div className="marker-style-panel"><div className="review-list-head"><strong>범용 마커 스타일</strong><span>새 마커 기본 포함</span></div><div className="marker-style-options" role="group" aria-label="범용 마커 스타일 일괄 적용">{([ ["v2", "리뉴얼 최종 원형"], ["01", "기본 핀형"], ["02", "아치 배지형"], ["03", "유기적 원형"] ] as const).map(([style, label]) => <button key={style} className={markerStyle === style ? "active" : ""} onClick={() => applyMarkerStyle(style)}><img src={markerAssetSrc(style, "culture")} alt="" /><span><b>{style === "v2" ? "최종" : `${style}안`}</b><small>{label}</small></span></button>)}</div></div>
              <div className="review-list-head"><strong>종류별 크기</strong><span>%</span></div>
              <div className="group-size-row"><label>랜드마크<input type="number" min="0.8" max="15" step="0.1" value={landmarkGroupSize} onChange={(event) => setLandmarkGroupSize(clamp(Number(event.target.value), 0.8, 15))} /></label><button onClick={() => applyGroupSize("landmark", landmarkGroupSize)}>전체 적용</button></div>
              <div className="group-size-row"><label>일반 마커<input type="number" min="0.8" max="15" step="0.1" value={markerGroupSize} onChange={(event) => setMarkerGroupSize(clamp(Number(event.target.value), 0.8, 15))} /></label><button onClick={() => applyGroupSize("marker", markerGroupSize)}>전체 적용</button></div>
              <p className="group-size-help">일반 마커 값은 공개본 업데이트 시 저장되며 이후 새 마커의 공통 기본 크기로 사용됩니다.</p>
              <div className="landmark-default-actions"><button onClick={saveAllLandmarksAsDefault}>현재 앵커를 기본 위치로 저장</button><button className="landmark-reset" onClick={resetLandmarkPositions}>↺ 저장된 기본 위치로 초기화</button></div>
            </AdminFolder>
            <AdminFolder className="side-admin-folder place-map-manager" title="장소·지도 구성" meta={`배치 ${placedUnifiedPlaceCount} · 미고정 ${coordinateLockCounts.unlocked}`} defaultOpen>
            <div className="place-manager-sticky">
              <div className="place-search-wrap"><input ref={placeQueryInputRef} value={placeQuery} onChange={(event) => setPlaceQuery(event.target.value)} placeholder="장소명·주소·권역 검색" aria-label="장소 검색" />{placeQuery && <button onClick={() => setPlaceQuery("")} aria-label="검색어 지우기">×</button>}</div>
              <div className="place-manager-view-head"><strong>화면 보기</strong><span>화면에만 적용</span></div>
              <div className="view-mode-grid" role="group" aria-label="화면 표시 요소">
                {([ ["all", "전체"], ["landmarks", "랜드마크"], ["markers", "일반마커"], ["labels", "라벨"] ] as const).map(([mode, label]) => <button key={mode} className={viewMode === mode ? "active" : ""} onClick={() => setViewMode(mode)}>{label}</button>)}
              </div>
            </div>
            <details className="place-manager-details screen-settings">
              <summary><span><strong>화면·라벨 표시 설정</strong><small>{screenRecommendedOnly ? `비추천 ${screenHiddenMarkerCount}곳 임시 숨김` : `라벨 ${editorLabelElements.length}/${editorLabelCandidates.length}`}</small></span></summary>
              <div className="place-manager-details-body">
                <div className="view-toggle-list">
                  <label className={screenRecommendedOnly ? "active" : ""}><input type="checkbox" checked={screenRecommendedOnly} onChange={(event) => setScreenRecommendedOnly(event.target.checked)} /><span><b>추천 장소만 임시 표시</b><small>배치와 출력 포함 설정은 유지됩니다.</small></span></label>
                  <label><input type="checkbox" checked={markerLabelsVisible} onChange={(event) => setMarkerLabelsVisible(event.target.checked)} /><span><b>일반 마커 라벨</b><small>화면 표시만 한 번에 전환합니다.</small></span></label>
                  <label><input type="checkbox" checked={mergeDenseLabels} onChange={(event) => setMergeDenseLabels(event.target.checked)} /><span><b>밀집 라벨 자동 통합</b><small>확대해도 주변 4곳 이상 밀집 시 통합 유지</small></span></label>
                  <label className={editorScaleLabelLimitsEnabled ? "active" : ""}><input type="checkbox" checked={editorScaleLabelLimitsEnabled} onChange={(event) => setEditorScaleLabelLimitsEnabled(event.target.checked)} /><span><b>관리자 지도에 축척별 라벨 수 적용</b><small>아래 배포본 단계값으로 현재 화면을 미리 봅니다.</small></span></label>
                </div>
                <section className="public-label-density-editor" aria-labelledby="public-label-density-title">
                  <header><span><b id="public-label-density-title">배포본 축척별 전체 라벨</b><small>랜드마크·주요 거점을 포함한 화면 총량</small></span><div className="public-label-density-actions"><button type="button" onClick={resetOptionalLabelScaleLimits}>기본값</button><button type="button" className="server-save" disabled={optionalLabelScaleSaving || editorDraftSaving || publicLayoutPublishing} onClick={() => void saveOptionalLabelScaleLimits()}>{optionalLabelScaleSaving ? "저장 중…" : "저장"}</button></div></header>
                  <output className="public-label-density-live" aria-live="polite">현재 화면 · 개별 {renderedIndividualLabelCount}개 · 통합 {renderedDenseLabelClusters.length}묶음</output>
                  <div className="public-label-density-steps">{optionalLabelScaleSteps.map((step, index) => <label key={step.maximumRatio}><span><b>맞춤 ×{step.maximumRatio}</b><small>지도 약 {Math.round(100 / step.maximumRatio)}% 이상 표시</small></span><input type="number" min="0" max="1200" step="1" value={step.limit} onChange={(event) => updateOptionalLabelScaleLimit(index, Number(event.target.value))} aria-label={`맞춤 축척 ${step.maximumRatio}배 전체 라벨 개수`} /><em>개</em></label>)}</div>
                  <p>각 값은 랜드마크·주요 거점·현재 선택을 포함한 화면 전체 라벨 목표 수입니다. 필수 라벨만 목표 수보다 많을 때는 필수 라벨을 모두 유지합니다. 저장하면 독립 서버 설정으로 보관되어 공개본 업데이트 없이 공개 지도에 반영됩니다.</p>
                </section>
                <div className="placed-label-bulk" role="group" aria-label="배치 라벨 가시성 일괄 조절"><button type="button" onClick={() => setPlacedLabelsVisibility(true)}>배치 라벨 전체 ON</button><button type="button" onClick={() => setPlacedLabelsVisibility(false)}>전체 OFF</button><button type="button" onClick={() => setPlacedLabelsVisibility(true, "landmark")}>랜드마크 ON</button><button type="button" onClick={() => setPlacedLabelsVisibility(true, "marker")}>일반마커 ON</button></div>
                <button type="button" className={`view-label-refresh ${labelsRefreshing ? "refreshing" : ""}`} disabled={labelsRefreshing} onClick={() => void refreshLabelPositions()}><span aria-hidden="true">↻</span>{labelsRefreshing ? "전체 라벨 정리 중…" : "전체 라벨 위치 새로고침"}</button>
              </div>
            </details>
            <div className="place-manager-filter-head"><div><strong>상태 필터</strong><span>{unifiedPlaceRows.length}/{allUnifiedPlaceRows.length}곳 표시 · 분류는 아래 카테고리 폴더 사용</span></div>{placeFiltersActive && <button type="button" onClick={() => { setPlaceQuery(""); setCoordinateLockFilter("all"); setPlacementFilter("all"); setRecommendationFilter("all"); setViewMode("all"); setScreenRecommendedOnly(false); }}>필터 초기화</button>}</div>
            <div className="place-status-filters">
              <div className="place-filter-axis">
                <div className="place-filter-axis-head"><strong>좌표</strong><span>고정 여부</span></div>
                <div className="coordinate-lock-filter" role="group" aria-label="좌표 고정 상태 필터">
                  <button className={coordinateLockFilter === "all" ? "active" : ""} onClick={() => setCoordinateLockFilter("all")}>전체 <span>{searchedUnifiedPlaceRows.length}</span></button>
                  <button className={`unlocked ${coordinateLockFilter === "unlocked" ? "active" : ""}`} onClick={() => setCoordinateLockFilter("unlocked")}>미고정 <span>{coordinateLockCounts.unlocked}</span></button>
                  <button className={coordinateLockFilter === "locked" ? "active" : ""} onClick={() => setCoordinateLockFilter("locked")}>고정 <span>{coordinateLockCounts.locked}</span></button>
                </div>
              </div>
              <div className="place-filter-axis">
                <div className="place-filter-axis-head"><strong>지도 배치</strong><span>표시 상태</span></div>
                <div className="place-secondary-filters" role="group" aria-label="지도 배치 상태 필터"><button className={placementFilter === "all" ? "active" : ""} onClick={() => setPlacementFilter("all")}>전체</button><button className={placementFilter === "placed" ? "active" : ""} onClick={() => setPlacementFilter("placed")}>배치됨</button><button className={placementFilter === "unplaced" ? "active" : ""} onClick={() => setPlacementFilter("unplaced")}>미배치</button></div>
              </div>
              <div className="place-filter-axis">
                <div className="place-filter-axis-head"><strong>출력 추천</strong><span>인쇄 기준</span></div>
                <div className="place-secondary-filters" role="group" aria-label="추천 상태 필터"><button className={recommendationFilter === "all" ? "active" : ""} onClick={() => setRecommendationFilter("all")}>전체</button><button className={recommendationFilter === "recommended" ? "active" : ""} onClick={() => setRecommendationFilter("recommended")}>★ 추천</button><button className={recommendationFilter === "standard" ? "active" : ""} onClick={() => setRecommendationFilter("standard")}>일반</button></div>
              </div>
            </div>
            <details className="place-manager-details composition-settings">
              <summary><span><strong>지도 정리·복원</strong><small>주소 정렬 · 기본 구성</small></span></summary>
              <div className="place-manager-details-body composition-helper folder-card-content">
                <div className="composition-actions"><button onClick={applyStarterComposition}>기본 구성 복원</button><button onClick={alignPlacedMarkersByAddress} disabled={geocodeProgress.active}>{geocodeProgress.active ? "주소 확인 중" : "배치 장소 주소로 정렬"}</button></div>
                <p>주소 정렬은 일반 마커의 앵커를 갱신하고 기존 리소스 오프셋을 유지합니다. 기본 구성 복원은 누락된 초기 요소만 추가하며 현재 배치는 유지합니다.</p>
              </div>
            </details>
            <div className="marker-visibility-panel unified-place-panel">
              <div className="review-list-head place-list-head"><div><strong>장소 배치 목록</strong><span>카테고리 폴더를 여러 개 동시에 펼칠 수 있습니다.</span></div><div className="place-group-actions"><button type="button" onClick={() => setExpandedVisibilityGroups((current) => Object.fromEntries(Object.keys(current).map((id) => [id, true])) as Record<CategoryId, boolean>)}>모두 펼치기</button><button type="button" onClick={() => setExpandedVisibilityGroups((current) => Object.fromEntries(Object.keys(current).map((id) => [id, false])) as Record<CategoryId, boolean>)}>접기</button></div></div>
              <p><b>체크</b> 배치 · <b>라벨</b> 화면 표시 · <b>★</b> 출력 추천. 미배치로 바꿔도 좌표와 편집 정보는 보존됩니다.</p>
              <div className="marker-visibility-list unified-place-list" role="list" aria-label="통합 장소 배치 목록">
                {unifiedPlaceGroups.map(({ category, rows }) => {
                  const placedCount = rows.filter((row) => row.element?.mapVisible).length;
                  const expanded = Boolean(placeQuery.trim()) || expandedVisibilityGroups[category.id];
                  return <section key={category.id} className={`marker-visibility-group ${expanded ? "expanded" : "collapsed"}`}>
                    <button type="button" className="marker-visibility-group-toggle" aria-expanded={expanded} aria-controls={`place-group-${category.id}`} onClick={() => setExpandedVisibilityGroups((current) => ({ ...current, [category.id]: !current[category.id] }))}>
                      <span className="marker-folder-icon" aria-hidden="true" />
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
                          {row.element && <button className={`row-label-toggle ${row.element.labelVisible ? "active" : ""}`} onClick={() => setPlacedElementLabelVisibility(row.element!, !row.element!.labelVisible)} aria-label={`${row.name} 라벨 ${row.element.labelVisible ? "숨기기" : "표시"}`} title="지도 라벨 가시성">{row.element.labelVisible ? "라벨" : "라벨 OFF"}</button>}
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
            </AdminFolder>
          </div> : leftPanelMode === "print" ? <div className="print-panel-directory">
            <AdminFolder sectionRef={printPanelRef} className="side-admin-folder print-output-panel" title="고화질 출력 설정" meta={`추천 ${recommendedPlaceCount}곳`} openSignal={printFolderOpenRequest} defaultOpen>
              <div className="print-resolution-row"><label>출력 해상도<select value={exportWidth} onChange={(event) => setExportWidth(Number(event.target.value) as 8944 | 12000)}><option value="12000">12K PNG · 12,000px</option><option value="8944">원본 비율 · 8,944px</option></select></label><button className="primary-export" disabled={exporting} onClick={() => void exportHighResolutionPng()}>{exporting ? "합성 중…" : "고화질 PNG 만들기 ↓"}</button></div>
              <label className="print-recommended-toggle"><input type="checkbox" checked={printRecommendedOnly} onChange={(event) => setPrintRecommendedOnly(event.target.checked)} /><span><b>추천 장소 중심 출력</b><small>랜드마크는 기본 포함, 일반 마커는 추천 장소만</small></span></label>
              <div className="print-layer-grid">
                <label><input type="checkbox" checked={printLandmarks} onChange={(event) => setPrintLandmarks(event.target.checked)} />랜드마크</label>
                <label><input type="checkbox" checked={printMarkers} onChange={(event) => setPrintMarkers(event.target.checked)} />마커</label>
                <label><input type="checkbox" checked={printLabels} onChange={(event) => setPrintLabels(event.target.checked)} />라벨</label>
              </div>
              <div className="print-preview-actions"><button type="button" className={printPreviewMode ? "active" : ""} onClick={() => { setPrintPreviewMode((current) => !current); setSelectedId(null); setSelectedNoteId(null); setSelectedDenseLabelId(null); setMemoMode(false); }}>◉ {printPreviewMode ? "편집 화면으로" : "실제 PNG 구성 미리보기"}</button><button type="button" className={printAudit.issues.length ? "warning" : "pass"} onClick={() => setPrintAuditOpen((current) => !current)}>{printAudit.issues.length ? `출력 점검 ${printAudit.issues.length}건` : "출력 점검 통과"}</button></div>
              {printAuditOpen && <div className={`print-audit ${printAudit.issues.length ? "warning" : "pass"}`}><div className="print-audit-summary"><strong>{printAudit.issues.length ? "수정 권장 항목" : "출력 준비 완료"}</strong><span>잘림 {printAudit.clippingCount} · 겹침 {printAudit.overlapCount} · 선 교차 {printAudit.crossingCount}</span><small>최소 글자 {printAudit.minimumTextPixels.toFixed(0)}px · {exportWidth.toLocaleString()}px 출력 기준</small></div>{printAudit.issues.length > 0 && <div className="print-audit-list">{printAudit.issues.slice(0, 12).map((issue) => <button type="button" key={issue.id} onClick={() => { setPrintPreviewMode(true); if (issue.elementId) { const element = elementsRef.current.find((item) => item.id === issue.elementId); if (element) { setSelectedId(element.id); focusMapPosition(element.x, element.y, element.id); } } else if (issue.clusterId) setSelectedDenseLabelId(issue.clusterId); }}>{issue.label}</button>)}</div>}</div>}
              <p>화면 가시성, 지도 배치, 출력 포함 여부는 서로 독립적으로 유지됩니다.</p>
              <div className="print-storage-status"><span>{printSyncLabel}</span>{(!printSettingsCanEdit || !denseLabelSettingsCanEdit) && <a href="/signin-with-chatgpt?return_to=/">소유자 로그인</a>}</div>
            </AdminFolder>
            <AdminFolder className="side-admin-folder print-target-panel" title="장소별 출력 항목" meta={`${mapVisibleElements.length}곳`} defaultOpen>
              <div className="print-target-list">{mapVisibleElements.map((element) => {
                const setting = printSettingsByKey.get(printSettingKey(element));
                return <div className="print-target-row" key={element.id}><button type="button" onClick={() => selectPlacedElement(element)}><i style={{ background: categoryOf(element.category).color }} /><span><b>{element.name}</b><small>{printPolicyFor(element).marker ? "마커 출력" : "마커 제외"} · {printPolicyFor(element).label ? "라벨 출력" : "라벨 제외"}</small></span></button><select aria-label={`${element.name} 마커 출력`} value={setting?.markerMode ?? "auto"} onChange={(event) => void savePrintSetting(element, { markerMode: event.target.value as PrintMode })}><option value="auto">마커 자동</option><option value="include">마커 포함</option><option value="exclude">마커 제외</option></select><select aria-label={`${element.name} 라벨 출력`} value={setting?.labelMode ?? "auto"} onChange={(event) => void savePrintSetting(element, { labelMode: event.target.value as PrintMode })}><option value="auto">라벨 자동</option><option value="include">라벨 포함</option><option value="exclude">라벨 제외</option></select></div>;
              })}</div>
            </AdminFolder>
          </div> : <div className="calibration-panel">
            <div className="calibration-summary">
              <div><strong>계층형 좌표 보정망</strong><span>1차 6점 + 2차 {secondaryCalibrationPoints.length}점 + 고정 좌표 3차 {tertiaryCalibrationPoints.length}점 · {calibrationLiveApply ? "기준 변경을 주변 미고정 장소에 실시간 반영합니다." : "기준값을 맞춘 뒤 보정 버튼으로 전체에 적용합니다."}</span></div>
              <label className="switch" title="기존 기준 위치 표시"><input type="checkbox" checked={showCalibrationSource} onChange={(event) => setShowCalibrationSource(event.target.checked)} /><span /></label>
            </div>
            <label className="calibration-live-toggle"><input type="checkbox" checked={calibrationLiveApply} onChange={(event) => { setCalibrationLiveApply(event.target.checked); if (event.target.checked && calibrationDirty) applyCalibrationToAll(); }} /><span><b>실시간 보정</b><small>끄면 기준점만 옮기고 버튼으로 일괄 적용</small></span></label>
            <p className="calibration-help">1차 기준점 6곳으로 전체를 맞추고, 확정 랜드마크를 2차 지역 기준으로 사용합니다. 그 밖의 좌표 고정 요소는 실제 주소 좌표가 확인된 경우 자동으로 3차 근거리 기준점이 되어 주변 미고정 장소의 대략적 위치를 보완합니다.</p>
            <section className={`calibration-folder primary ${expandedCalibrationGroups.primary ? "expanded" : "collapsed"}`}>
              <button type="button" className="calibration-folder-toggle" aria-expanded={expandedCalibrationGroups.primary} aria-controls="calibration-group-primary" onClick={() => setExpandedCalibrationGroups((current) => ({ ...current, primary: !current.primary }))}>
                <span className="marker-folder-icon" aria-hidden="true" /><i>1</i><strong>1차 전체 기준점</strong><span>{calibrationPoints.length}</span>
              </button>
              {expandedCalibrationGroups.primary && <div id="calibration-group-primary" className="calibration-folder-items calibration-list">
                {calibrationPoints.map((point, index) => {
                  const element = elementsByNormalizedName.get(point.name);
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
                <span className="marker-folder-icon" aria-hidden="true" /><i>2</i><strong>2차 확정 기준점</strong><span>{secondaryCalibrationPoints.length}</span>
              </button>
              {expandedCalibrationGroups.secondary && <div id="calibration-group-secondary" className="calibration-folder-items">
                {secondaryCalibrationPoints.length ? secondaryCalibrationPoints.map((point) => {
                  const element = elementsByNormalizedName.get(point.name);
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
                <span className="marker-folder-icon" aria-hidden="true" /><i>3</i><strong>3차 고정 좌표 기준점</strong><span>{tertiaryCalibrationPoints.length}</span>
              </button>
              {expandedCalibrationGroups.tertiary && <div id="calibration-group-tertiary" className="calibration-folder-items">
                {tertiaryCalibrationPoints.length ? tertiaryCalibrationPoints.map((point) => {
                  const element = elementsByNormalizedName.get(point.name);
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
          {leftPanelMode === "assets" && <div className="review-list">
            <div className="review-list-head"><strong>골목 검토 메모</strong><span>{reviewNotes.length}</span></div>
            <button className={`memo-add ${memoMode ? "active" : ""}`} onClick={() => setMemoMode((value) => !value)}>{memoMode ? "지도에서 위치를 클릭하세요" : "＋ 검토 메모 핀 추가"}</button>
            <div className="review-note-scroll">{reviewNotes.map((note, index) => <button key={note.id} className={selectedNoteId === note.id ? "active" : ""} onClick={() => { setSelectedNoteId(note.id); setSelectedId(null); setRightOpen(true); }}><i className={`note-dot ${note.status}`} /> <span>{index + 1}. {note.text || reviewStatusText[note.status]}</span></button>)}</div>
            <div className="review-export"><button onClick={exportNotesJson}>메모 JSON</button><button onClick={exportNotesCsv}>메모 CSV</button></div>
          </div>}
        </aside>}
        {publicLayoutAccess === "editor" && !leftOpen && <button className="panel-reopen left" onClick={() => setLeftOpen(true)}>관리 도구 ›</button>}

        <section className="canvas-column">
          <div className="canvas-toolbar"><span className="map-file" title={activeBaseMapLabel}>{activeBaseMapLabel}</span><div className={`canvas-hint ${resourceOutputDragMode ? "output-mode" : ""}`}>{resourceOutputDragMode ? "출력 위치 ON · 드래그/방향키로 리소스만 이동" : calibrationMode ? "앵커 드래그 → 전체 좌표 보정 적용" : "출력 위치 OFF · 실제 위치 앵커 이동"}</div></div>
          <div className={`map-viewport ${publicLayoutAccess === "editor" ? "editor-label-motion" : ""} ${interaction?.type === "pan" ? "is-panning" : ""} ${interaction?.type === "drag" ? "is-dragging-element" : ""} ${publicLayoutAccess === "viewer" && Math.abs(zoom - settledLabelZoom) > 0.002 ? "is-zooming" : ""} ${labelViewportSettled ? "" : "is-label-viewport-settling"} ${memoMode ? "memo-cursor" : ""} ${eventPlaceSelectionMode ? "event-place-selecting" : ""} ${placeRequestPickingLocation ? "place-request-location-selecting" : ""}`} ref={viewportRef} onWheel={onWheel} onPointerDown={startPan}>
            {publicLayoutAccess === "viewer" && <button type="button" className="public-map-reset" onPointerDown={(event) => event.stopPropagation()} onClick={resetPublicMap} aria-label="전체 지도 보기">↙ 전체 지도</button>}
            <div
              ref={stageWrapRef}
              className={`map-stage-wrap ${publicLayoutAccess === "editor" ? "editor-direct-render" : ""}`}
              style={publicLayoutAccess === "editor" ? { transform: `translate(calc(-50% + ${mapRenderPan.x}px), calc(-50% + ${mapRenderPan.y}px)) scale(${zoom})` } : undefined}
            >
              <div className={`map-stage ${stageMapClass} ${forceIndividualLabels && !printPreviewMode ? "label-detail-individual" : ""} ${calibrationMode && editingEnabled ? "calibration-active" : ""}`} data-label-detail={denseLabelClusters.length ? forceIndividualLabels && !printPreviewMode ? "dense-exception" : "grouped" : "individual"} ref={stageRef} style={{ aspectRatio: `${MAP_ASPECT}` }} onPointerDown={editingEnabled ? handleStagePointerDown : publicLayoutAccess === "viewer" ? (event) => startPan(event, undefined, placeRequestPickingLocation) : undefined}>
                {!mapLoaded && <div className="map-loading"><span />초고해상도 베이스맵 불러오는 중</div>}
                <img key={baseMapPrimarySrc} ref={baseMapImgRef} className="base-map" src={baseMapPrimarySrc} alt="제주 원도심 검수용 베이스맵" draggable={false} decoding="async" fetchPriority="high" onLoad={() => {
                  setMapLoaded(true);
                  setCommittedBaseMapUpgradeSource(baseMapPrimarySrc);
                  if (baseMapPrimarySrc === uploadedBaseMap?.screen4096Url) {
                    setDecodedHighResolutionBaseMapSource(baseMapPrimarySrc);
                  }
                }} />
                {pendingBaseMapUpgradeSrc && <img
                  key={pendingBaseMapUpgradeSrc}
                  className="base-map base-map-resolution-upgrade"
                  src={pendingBaseMapUpgradeSrc}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  decoding="async"
                  fetchPriority="low"
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    window.requestAnimationFrame(() => image.classList.add("is-ready"));
                    window.setTimeout(() => setCommittedBaseMapUpgradeSource(pendingBaseMapUpgradeSrc), 180);
                  }}
                />}
                <div className="base-map-edge-fade" data-south-edge-fade="on" aria-hidden="true" />
                {calibrationMode && editingEnabled && <svg className="calibration-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="좌표 보정 기준점 연결망">
                  {([ [0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [5, 1], [0, 3] ] as Array<[number, number]>).map(([from, to]) => <line key={`${from}-${to}`} x1={calibrationPoints[from].targetX} y1={calibrationPoints[from].targetY} x2={calibrationPoints[to].targetX} y2={calibrationPoints[to].targetY} className="calibration-mesh-line" />)}
                  {showCalibrationSource && calibrationPoints.map((point) => <g key={`source-${point.id}`}><line x1={point.sourceX} y1={point.sourceY} x2={point.targetX} y2={point.targetY} className="calibration-offset-line" /><circle cx={point.sourceX} cy={point.sourceY} r="0.34" className="calibration-source-dot" /></g>)}
                  {secondaryCalibrationPoints.map((point) => <g key={`secondary-${point.id}`}><line x1={point.sourceX} y1={point.sourceY} x2={point.targetX} y2={point.targetY} className="calibration-secondary-line" /><circle cx={point.targetX} cy={point.targetY} r="0.45" className="calibration-secondary-dot" /></g>)}
                  {tertiaryCalibrationPoints.map((point) => <g key={`tertiary-${point.id}`}><line x1={point.sourceX} y1={point.sourceY} x2={point.targetX} y2={point.targetY} className="calibration-tertiary-line" /><circle cx={point.targetX} cy={point.targetY} r="0.4" className="calibration-tertiary-dot" /></g>)}
                </svg>}
                {labelDetailsReady && <MapConnectorLayer
                  denseLabelClusters={renderedDenseLabelClusters}
                  printPreviewMode={printPreviewMode}
                  publicLayoutAccess={publicLayoutAccess}
                  selectedDenseLabelId={selectedDenseLabelId}
                  selectedId={selectedId}
                  stageDimensions={stageDimensions}
                  viewMode={viewMode}
                  visibleElements={renderedMapElements}
                  visibleElementsById={renderedMapElementsById}
                  zoom={labelRenderZoom}
                />}
                <MobileMarkerPlaceholderLayer
                  actionsRef={mapRenderActionsRef}
                  elements={mobilePlaceholderElements}
                  layerRef={mobileMarkerPlaceholderLayerRef}
                />
                <MapElementLayer
                  actionsRef={mapRenderActionsRef}
                  assetVisualBounds={assetVisualBounds}
                  assetsById={assetsById}
                  calibrationMode={calibrationMode}
                  calibrationReferenceNames={calibrationReferenceNames}
                  clusteredLabelElementIds={renderedClusteredLabelElementIds}
                  collisions={collisions}
                  editingEnabled={editingEnabled}
                  eventPlaceKeySet={eventPlaceKeySet}
                  eventPlaceSelectionMode={eventPlaceSelectionMode}
                  fitZoom={fitZoom}
                  focusPulseId={focusPulseId}
                  mapLabelStatusByElementId={labelDetailsReady ? mapLabelStatusByElementId : EMPTY_MAP_LABEL_STATUS_BY_ELEMENT_ID}
                  placeRequestPickingLocation={placeRequestPickingLocation}
                  printPreviewMode={printPreviewMode}
                  publicLayoutAccess={publicLayoutAccess}
                  publicSelectedMarkerZIndex={publicSelectedMarkerZIndex}
                  selectedId={selectedId}
                  stageLabelIds={labelContentReady ? stageLabelIds : EMPTY_MAP_ELEMENT_IDS}
                  stageMarkerIds={stageMarkerIds}
                  useMobileLandmarkAssets={useMobileLandmarkAssets}
                  viewMode={viewMode}
                  visibleElements={renderedMapElements}
                  zoom={labelRenderZoom}
                />
                {placeRequestPickingLocation && placeRequestLocation && <div className="place-request-location-marker" style={{ left: `${placeRequestLocation.x}%`, top: `${placeRequestLocation.y}%` }} aria-label="요청할 마커 위치">
                  <img src={markerAssetSrc(placeRequestMarkerStyle, placeRequestCategory)} alt="" draggable={false} decoding="async" />
                  <span>제안 위치</span>
                </div>}
                {labelDetailsReady && <DenseLabelLayer
                  actionsRef={mapRenderActionsRef}
                  denseLabelClusters={renderedDenseLabelClusters}
                  editingEnabled={editingEnabled}
                  mapLabelStatusByElementId={mapLabelStatusByElementId}
                  mobileSingleColumn={Boolean(denseLabelLayoutOptions?.singleColumn)}
                  placeRequestPickingLocation={placeRequestPickingLocation}
                  printPreviewMode={printPreviewMode}
                  publicLayoutAccess={publicLayoutAccess}
                  selectedDenseLabelId={selectedDenseLabelId}
                  zoom={labelRenderZoom}
                />}
                {editingEnabled && selected?.mapVisible && visibleElementIds.has(selected.id) && <svg className="active-anchor-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`${selected.name} 편집 앵커`}>
                  <g opacity={selected.opacity / 100}>
                    <circle cx={selected.anchorX} cy={selected.anchorY} r="0.72" className="active-anchor-halo" vectorEffect="non-scaling-stroke" />
                    <circle cx={selected.anchorX} cy={selected.anchorY} r="0.42" fill="white" stroke={selected.connectorColor} strokeWidth="0.16" vectorEffect="non-scaling-stroke" />
                    <circle cx={selected.anchorX} cy={selected.anchorY} r="0.14" fill={selected.connectorColor} />
                  </g>
                </svg>}
                {calibrationMode && editingEnabled && <div className="calibration-badge-layer">{calibrationPoints.map((point, index) => <span key={`badge-${point.id}`} className="calibration-map-badge" style={{ left: `${point.targetX}%`, top: `${point.targetY}%` }}>{index + 1}</span>)}{secondaryCalibrationPoints.map((point) => <span key={`badge-${point.id}`} className="calibration-map-badge secondary" style={{ left: `${point.targetX}%`, top: `${point.targetY}%` }}>S</span>)}{tertiaryCalibrationPoints.map((point) => <span key={`badge-${point.id}`} className="calibration-map-badge tertiary" style={{ left: `${point.targetX}%`, top: `${point.targetY}%` }}>3</span>)}</div>}
                {editingEnabled && <div className="review-pin-layer">{reviewNotes.map((note, index) => <button key={note.id} className={`review-pin ${note.status} ${selectedNoteId === note.id ? "selected" : ""}`} style={{ left: `${note.x}%`, top: `${note.y}%` }} onPointerDown={(event) => { event.stopPropagation(); setSelectedNoteId(note.id); setSelectedId(null); setRightOpen(true); }} title={`${reviewStatusText[note.status]}: ${note.text || "내용 없음"}`}><span>{index + 1}</span></button>)}</div>}
              </div>
            </div>
            {printPreviewMode && <div className={`print-preview-badge ${printAudit.issues.length ? "warning" : "pass"}`}><strong>PNG 출력 미리보기</strong><span>{printAudit.issues.length ? `점검 ${printAudit.issues.length}건` : "점검 통과"}</span></div>}
            {eventPlaceSelectionMode && <div className="event-place-selection-hint"><strong>행사 장소 선택 중</strong><span>지도 마커를 눌러 추가·해제 · 현재 {placeEventPlaces.length}곳</span></div>}
            {placeRequestPickingLocation && <div className="place-request-location-hint" role="status" onPointerDown={(event) => event.stopPropagation()}><div><strong>마커 위치 지정 중</strong><span>{placeRequestLocation ? "선택한 위치를 다시 눌러 조정하거나 지도를 이동·확대할 수 있습니다." : "지도를 이동·확대한 뒤 마커를 둘 지점을 눌러 주세요."}</span></div><div><button type="button" onClick={() => { setPlaceRequestLocation(placeRequestLocationBeforePickingRef.current); setPlaceRequestPickingLocation(false); setPlaceRequestFormOpen(true); }}>선택 취소</button><button type="button" className="primary" disabled={!placeRequestLocation} onClick={() => { setPlaceRequestPickingLocation(false); setPlaceRequestFormOpen(true); }}>이 위치 사용</button></div></div>}
            {publicLayoutAccess === "editor" && <div className="map-scale"><span /> 정규화 좌표 0–100%</div>}
            {publicLayoutAccess === "editor" && <button type="button" className={`global-story-toggle editor-map ${globalStoriesOpen ? "active" : ""}`} onClick={toggleGlobalStories} aria-expanded={globalStoriesOpen} aria-controls="global-story-panel"><span aria-hidden="true">✓</span><strong>{globalStoriesOpen ? "관리 닫기" : "리뷰·행사·장소 관리"}</strong>{activeGlobalCount !== null && activeGlobalCount > 0 && <em>{activeGlobalCount}</em>}</button>}
            <div className="mobile-readonly">마커를 눌러 장소 정보와 기록을 확인하세요.</div>
            {viewMode === "collisions" && <div className="collision-legend"><span><i className="hard" />아이콘 겹침 {collisions.hard.size}</span><span><i className="near" />여유 구역 침범 {collisions.clearance.size}</span></div>}
          </div>
          {publicLayoutAccess === "viewer" && selected && !globalStoriesOpen && <Suspense fallback={<PublicPlaceSheetLoading expanded={publicPlaceExpanded} placeName={selectedDisplayName} />}><PublicPlaceSheet
            panelRef={publicPlacePanelRef}
            expanded={publicPlaceExpanded}
            dragging={publicPanelDrag?.target === "place"}
            dragOffsetY={publicPanelDrag?.target === "place" ? publicPanelDrag.offsetY : 0}
            placeName={selectedDisplayName}
            categoryName={selectedPublicCategoryName}
            categoryColor={selectedPublicCategory?.color ?? categoryOf(selected.category).color}
            detail={{
              loading: publicPlaceDetailLoading,
              placeName: selectedDisplayName,
              locationPlaces: selectedLocationGroupPlaces.map((place) => ({ id: place.id, name: place.name, active: place.id === selectedDirectoryPlace?.id })),
              address: selectedDirectoryPlace?.address || selected.address,
              convenienceNames: convenienceAttributeDefinitions.filter((definition) => sanitizeConvenienceAttributes(selectedDirectoryPlace?.convenienceAttributes).includes(definition.id)).map((definition) => definition.name),
              description: selectedDirectoryPlace?.description ?? "",
              operatingInfo: selectedDirectoryPlace?.operatingInfo ?? "",
              notes: selectedDirectoryPlace?.notes ?? "",
              directionsUrl: publicPlaceDirectionsUrl(selectedDisplayName, selectedDirectoryPlace?.address || selected.address, selectedDirectoryPlace?.mapUrl),
              events: placeEvents.map((event) => ({ id: event.id, photoUrl: event.photoUrl, eventName: event.eventName, eventInfo: event.eventInfo, scheduleLabel: eventScheduleLabel(event.startsAt, event.endsAt) })),
              stories: publishedPlaceStories.map((story) => ({ id: story.id, authorName: story.authorName, reviewText: story.reviewText, photoUrl: story.photoUrl, createdAt: story.createdAt, dateLabel: storyDateLabel(story.createdAt), reported: reportedStoryIds.has(story.id) })),
              storiesLoading: placeStoriesLoading,
              storyFormOpen: placeStoryFormOpen,
              storyAuthor: placeStoryAuthor,
              storyText: placeStoryText,
              cameraPermissionClass: storyCameraPermission,
              cameraPermissionLabel: storyCameraPermissionLabel(storyCameraPermission),
              cameraPermissionRequesting: storyCameraPermission === "requesting",
              cameraPermissionGranted: storyCameraPermission === "granted",
              photoRetaining: placeStoryPhotoRetaining,
              photoSelected: Boolean(placeStoryPhoto),
              photoPreview: placeStoryPhotoPreview ?? "",
              storySubmitting: placeStorySubmitting,
              storyCanSubmit: !placeStorySubmitting && !placeStoryPhotoRetaining && Boolean(placeStoryAuthor.trim()) && placeStoryText.trim().length >= 2,
              onLocationSelect: (placeId) => { const item = publicPlaceItems.find((candidate) => candidate.place.id === placeId); if (item) focusPublicPlaceItem(item); },
              onCopyAddress: () => { void copyPublicPlaceAddress(); },
              onShare: () => { void sharePublicPlace(); },
              onToggleStoryForm: togglePlaceStoryForm,
              onStoryAuthorChange: setPlaceStoryAuthor,
              onStoryTextChange: setPlaceStoryText,
              onRequestCameraPermission: () => { void requestPlaceStoryCameraPermission(); },
              onPhotoSelected: (file) => { void retainPlaceStoryPhoto(file); },
              onRemovePhoto: () => updatePlaceStoryPhoto(null),
              onSubmitStory: () => { void submitPlaceStory(); },
              onReportStory: (storyId) => { const story = publishedPlaceStories.find((candidate) => candidate.id === storyId); if (story) openPlaceStoryReport(story); },
            }}
            themePicker={selectedHasThemeEasterEgg ? <UiThemePicker activeTheme={uiTheme} onSelect={selectUiTheme} /> : undefined}
            onDragPointerDown={(event) => startPublicPanelDrag(event, "place", publicPlaceExpanded)}
            onDragPointerMove={movePublicPanelDrag}
            onDragPointerEnd={finishPublicPanelDrag}
            onOpenPlaceList={openPublicPlaceList}
            onClose={closePublicPlacePanel}
          /></Suspense>}
          {publicLayoutAccess === "editor" ? <footer className="statusbar"><span className="status-ok"><i /> {baseMap === "uploaded" ? "업로드 베이스맵" : "기본 베이스맵"}</span><span className={editorSyncClass}>{editorSyncLabel}</span><span>{calibrationDirty ? "기준점 변경 · 보정 적용 대기" : `좌표 보정 ${6 + secondaryCalibrationPoints.length + tertiaryCalibrationPoints.length}점 적용`}</span><span className="map-scale-status">맞춤 ×{mapScaleRatioLabel} · 지도 {mapVisiblePercent}% · 라벨 {outputLabelCount}개</span><span className="status-end">{saveState}</span></footer> : <footer className="statusbar public-statusbar"><span className="status-ok"><i /> 공개 배치본</span><span className="map-scale-status"><span>맞춤 ×{mapScaleRatioLabel} · 지도 {mapVisiblePercent}% · 라벨 {outputLabelCount}개</span><button type="button" className="map-render-refresh" onClick={refreshVisibleMapRenderInfo} aria-label="현재 화면 라벨과 마커 정보 새로고침" title="현재 화면 표시만 다시 계산">↻</button></span><span>{publicLayoutPublishedAt ? `${new Date(publicLayoutPublishedAt).toLocaleString("ko-KR")} 갱신` : "게시 준비 중"}</span><span className="status-end">확대하면 대부분 개별 표시되고, 밀집 구역은 통합 유지됩니다.</span></footer>}
        </section>
        {publicLayoutAccess === "editor" && !rightOpen && <button className="panel-reopen right" onClick={() => setRightOpen(true)}>‹ 속성</button>}

        {publicLayoutAccess === "editor" && <aside className="panel properties-panel" aria-label="속성 편집">
          <div className="panel-heading properties-heading"><div className="properties-heading-title"><strong>{selectedNote ? "검토 메모" : "속성"}</strong><span>{selected?.name ?? (selectedNote ? reviewStatusText[selectedNote.status] : "요소를 선택하세요")}</span></div><div className="properties-heading-actions">{selected && !selectedNote && <button type="button" className={`coordinate-review-button ${selected.locked ? "complete" : "pending"}`} aria-pressed={selected.locked} onClick={toggleSelectedCoordinateReview} title={selected.locked ? "좌표 고정 ON · 최종 검수 완료. 누르면 다시 편집할 수 있습니다." : "좌표 고정 OFF · 검수 필요. 누르면 최종 검수를 완료합니다."}><b>{selected.locked ? "검수 완료" : "검수 필요"}</b><small>{selected.locked ? "좌표고정 ON" : "좌표고정 OFF"}</small></button>}<button className="icon-button" onClick={() => setRightOpen(false)} aria-label="오른쪽 패널 접기">›</button></div></div>
          {selectedNote ? <div className="property-form note-form">
            <AdminFolder title="도로·골목 검토" meta="메모 핀" defaultOpen>
              <label>상태<select value={selectedNote.status} onChange={(event) => updateNote(selectedNote.id, { status: event.target.value as ReviewStatus })}><option value="delete">삭제 검토</option><option value="weaken">약화 검토</option><option value="keep">유지</option><option value="hierarchy">도로 위계 조정</option></select></label>
              <label>검토 내용<textarea value={selectedNote.text} onChange={(event) => updateNote(selectedNote.id, { text: event.target.value })} placeholder="가려지는 도로, 골목 정리 이유 등을 기록" /></label>
            </AdminFolder>
            <AdminFolder title="지도 위치" meta="%">
              <div className="field-row"><label>X<input type="number" step="0.1" value={selectedNote.x.toFixed(2)} onChange={(event) => updateNote(selectedNote.id, { x: clamp(Number(event.target.value), 0, 100) })} /></label><label>Y<input type="number" step="0.1" value={selectedNote.y.toFixed(2)} onChange={(event) => updateNote(selectedNote.id, { y: clamp(Number(event.target.value), 0, 100) })} /></label></div>
            </AdminFolder>
            <AdminFolder title="빠른 작업"><button className="wide-danger" onClick={deleteSelectedNote}>검토 메모 삭제</button></AdminFolder>
          </div> : !selected ? <div className="empty-properties"><span>◇</span><strong>선택된 요소가 없습니다</strong><p>지도 위 요소나 검토 메모를 클릭하면 세부 설정을 편집할 수 있습니다.</p></div> : <div className="property-form">
            <AdminFolder className="compact-basic-information" title="기본 정보" meta={selectedBasicInfoMeta} defaultOpen>
              <label>장소명 <em>지도·관리자·배포 표시 전용</em><input value={selected.name} onChange={(event) => updateElement(selected.id, { name: event.target.value })} /></label>
              <p className="field-help compact-help">연결된 ID의 DB 장소명은 변경하지 않습니다.</p>
              <label>주소 <em>{selectedDirectoryPlace ? "연결 DB 반영" : "DB 연결 전 지도 값"}</em><input value={selected.address} disabled={Boolean(selectedDirectoryPlace) && !placeDirectoryCanEdit} onChange={(event) => updateElement(selected.id, { address: event.target.value })} onBlur={(event) => { if (selectedDirectoryPlace) saveSelectedDirectoryAddress(selectedDirectoryPlace, event.currentTarget.value); }} placeholder="장소 주소" /></label>
              {selected.addressSourceUrl && <a className="source-link" href={selected.addressSourceUrl} target="_blank" rel="noreferrer">주소 확인 출처 ↗</a>}
              {selectedDirectoryPlace ? <>
                <label>분류 <em>연결 DB 즉시 반영</em><select value={directoryCategory(selectedDirectoryPlace.category)} disabled={!placeDirectoryCanEdit} onChange={(event) => updateSelectedDirectoryTaxonomy(selectedDirectoryPlace, { category: event.target.value as CategoryId })}>{!isPrimaryPublicCategory(directoryCategory(selectedDirectoryPlace.category)) && <option value={directoryCategory(selectedDirectoryPlace.category)} disabled>{categoryOf(directoryCategory(selectedDirectoryPlace.category)).name} · 기존 분류</option>}{categories.filter((category) => isPrimaryPublicCategory(category.id)).map((category) => <option key={category.id} value={category.id}>{category.id === "culture" ? "문화공간" : category.name}</option>)}</select></label>
                <details className="compact-property-details taxonomy-details"><summary>추가분류 <span>{sanitizeAdditionalCategories(selectedDirectoryPlace.additionalCategories).length}개</span></summary><div className="marker-additional-categories"><div>{additionalCategoryDefinitions.map((definition) => {
                  const checked = sanitizeAdditionalCategories(selectedDirectoryPlace.additionalCategories).includes(definition.id);
                  return <label className={checked ? "active" : ""} key={definition.id}><input type="checkbox" checked={checked} disabled={!placeDirectoryCanEdit} onChange={() => toggleSelectedDirectoryAdditionalCategory(selectedDirectoryPlace, definition.id)} /><span>{definition.name}</span></label>;
                })}</div></div></details>
              </> : <>
                <label>분류 <em>{selected.placeRequestId ? "승인 후 DB 연결" : "첫 변경 시 DB 항목 생성"}</em><select value={selectedUnlinkedPrimaryCategory ?? ""} disabled={!placeDirectoryCanEdit || selectedUnlinkedTaxonomySaving || Boolean(selected.placeRequestId)} onChange={(event) => connectUnlinkedElementTaxonomy(selected, { category: event.target.value as CategoryId, additionalCategories: [] })}>{!selectedUnlinkedPrimaryCategory && <option value="" disabled>기본분류 선택</option>}{categories.filter((category) => isPrimaryPublicCategory(category.id)).map((category) => <option key={category.id} value={category.id}>{category.id === "culture" ? "문화공간" : category.name}</option>)}</select></label>
                <details className="compact-property-details taxonomy-details"><summary>추가분류 <span>DB 연결 후 선택</span></summary><div className="marker-additional-categories"><div>{additionalCategoryDefinitions.map((definition) => <label key={definition.id}><input type="checkbox" checked={false} disabled={!placeDirectoryCanEdit || selectedUnlinkedTaxonomySaving || !selectedUnlinkedPrimaryCategory || Boolean(selected.placeRequestId)} onChange={() => toggleUnlinkedElementAdditionalCategory(selected, definition.id)} /><span>{definition.name}</span></label>)}</div></div></details>
              </>}
              <label className="compact-recommended" title="공개 출력의 추천 중심 구성에 반영됩니다."><input type="checkbox" checked={printPolicyFor(selected).recommended} disabled={selected.category === "landmark" || !printSettingsCanEdit} onChange={(event) => void savePrintSetting(selected, { recommended: event.target.checked })} /><span>{selected.category === "landmark" ? "기본 추천" : "추천 장소"}</span></label>
              <label>사용 자산<select value={selected.assetId ?? ""} onChange={(event) => { const asset = assets.find((item) => item.id === event.target.value); updateElement(selected.id, asset ? { assetId: asset.id } : { assetId: null }); }}><option value="" disabled>리소스 미지정</option>{compatibleAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
              {selected.category === "landmark" && compatibleAssets.length > 1 && <div className="property-candidate-grid" aria-label="랜드마크 후보 리소스">{compatibleAssets.map((asset) => <button key={asset.id} className={selected.assetId === asset.id ? "active" : ""} onClick={() => updateElement(selected.id, { assetId: asset.id })} title={asset.name}><img src={asset.screenSrc ?? asset.src} alt="" /><span>{asset.name}</span></button>)}</div>}
              <details className="compact-property-details print-details"><summary>고화질 출력 세부 <span>{printPolicyFor(selected).recommended ? "추천" : "일반"}</span></summary><div className="field-row"><label>마커 출력<select value={printPolicyFor(selected).setting?.markerMode ?? "auto"} disabled={!printSettingsCanEdit} onChange={(event) => void savePrintSetting(selected, { markerMode: event.target.value as PrintMode })}><option value="auto">자동</option><option value="include">항상 포함</option><option value="exclude">항상 제외</option></select></label><label>라벨 출력<select value={printPolicyFor(selected).setting?.labelMode ?? "auto"} disabled={!printSettingsCanEdit} onChange={(event) => void savePrintSetting(selected, { labelMode: event.target.value as PrintMode })}><option value="auto">자동</option><option value="include">항상 포함</option><option value="exclude">항상 제외</option></select></label></div><p className="field-help">자동은 랜드마크와 추천장소 여부를 따릅니다.</p></details>
            </AdminFolder>
            <AdminFolder className="editor-place-content-management" title="리뷰·행사 관리" meta="통합 팝업"><p className="field-help">후기·사진 신고 처리와 행사 등록·수정·노출 관리를 하나의 팝업에서 전환합니다.</p><div className="content-management-shortcuts"><button type="button" className="primary" onClick={openUnifiedContentManagement}>리뷰·행사 통합 관리 열기</button></div></AdminFolder>
            <AdminFolder
              title="위치 앵커 · 리소스 출력"
              meta={selected.locked ? "좌표 고정됨" : "직접 편집"}
              actions={<label className={`coordinate-lock-toggle output-drag-toggle ${resourceOutputDragMode ? "active" : ""}`} title="켜면 지도 드래그와 방향키가 앵커 대신 이미지 리소스의 출력 위치만 변경합니다."><input type="checkbox" checked={resourceOutputDragMode} disabled={selected.locked} onChange={(event) => setResourceOutputDragMode(event.target.checked)} /><span>{resourceOutputDragMode ? "출력 위치 ON" : "출력 위치 OFF"}</span></label>}
            >
              <div className="property-subsection anchor-controls">
                <header><strong>실제 위치 앵커</strong><span>{selectedPrimaryCalibrationPoint ? "1차 기준점" : selectedSecondaryCalibrationPoint ? "2차 확정 기준점" : selectedTertiaryCalibrationPoint ? "3차 지역 기준점" : "지도 좌표"}</span></header>
                {selectedCalibrationPoint && <div className="calibration-property-note"><b>◎ {selectedPrimaryCalibrationPoint ? "1차 6점 보정 기준" : selectedSecondaryCalibrationPoint ? "2차 확정 보정 기준" : "3차 고정 좌표 기준"}</b><span>{selectedTertiaryCalibrationPoint ? "이 고정 앵커는 가까운 미고정 장소의 실제 위치를 보완합니다." : selected.locked ? "좌표 고정이 켜져 있어 현재 앵커가 유지됩니다." : selectedPrimaryCalibrationPoint ? (calibrationLiveApply ? "이 앵커를 바꾸면 주변 장소가 실시간으로 함께 보정됩니다." : "앵커를 맞춘 뒤 좌표 보정 패널에서 전체 적용해 주세요.") : "확정한 기본 앵커로 주변 장소를 지역 보정합니다."}</span></div>}
                <div className="field-row"><label>X<input disabled={selected.locked} type="number" step="0.1" value={(selectedPrimaryCalibrationPoint?.targetX ?? selected.anchorX).toFixed(2)} onChange={(event) => selectedPrimaryCalibrationPoint ? updateCalibrationPoint(selectedPrimaryCalibrationPoint.id, { targetX: Number(event.target.value) }) : updateElementAnchor(selected, Number(event.target.value), selected.anchorY)} /></label><label>Y<input disabled={selected.locked} type="number" step="0.1" value={(selectedPrimaryCalibrationPoint?.targetY ?? selected.anchorY).toFixed(2)} onChange={(event) => selectedPrimaryCalibrationPoint ? updateCalibrationPoint(selectedPrimaryCalibrationPoint.id, { targetY: Number(event.target.value) }) : updateElementAnchor(selected, selected.anchorX, Number(event.target.value))} /></label></div>
                {selectedCalibrationPoint && <button className="wide-secondary" onClick={() => switchLeftPanel("calibration")}>계층형 좌표 보정 열기</button>}
              </div>
              <div className="property-subsection output-offset-controls">
                <header><strong>리소스 출력 오프셋</strong><span>앵커 대비 ΔX·ΔY</span></header>
                {selectedDisplayOffset && <><div className="field-row"><label>ΔX<input disabled={selected.locked} type="number" step="0.1" value={selectedDisplayOffset.x.toFixed(2)} onChange={(event) => updateElement(selected.id, { x: clamp(selected.anchorX + Number(event.target.value), 0, 100) })} /></label><label>ΔY<input disabled={selected.locked} type="number" step="0.1" value={selectedDisplayOffset.y.toFixed(2)} onChange={(event) => updateElement(selected.id, { y: clamp(selected.anchorY + Number(event.target.value), 0, 100) })} /></label></div><div className="offset-nudge-grid" aria-label="리소스 출력 위치 미세 조정"><button disabled={selected.locked} onClick={() => updateElement(selected.id, { x: clamp(selected.x - 0.1, 0, 100) })}>←</button><button disabled={selected.locked} onClick={() => updateElement(selected.id, { y: clamp(selected.y - 0.1, 0, 100) })}>↑</button><button disabled={selected.locked} onClick={() => updateElement(selected.id, { y: clamp(selected.y + 0.1, 0, 100) })}>↓</button><button disabled={selected.locked} onClick={() => updateElement(selected.id, { x: clamp(selected.x + 0.1, 0, 100) })}>→</button><button disabled={selected.locked} className="reset" onClick={() => updateElement(selected.id, { x: selected.anchorX, y: selected.anchorY })}>리소스→앵커</button><button className="anchor-to-resource" disabled={selected.locked || (Math.abs(selectedDisplayOffset.x) < 0.001 && Math.abs(selectedDisplayOffset.y) < 0.001)} onClick={() => moveAnchorToResource(selected)} title="화면의 리소스는 그대로 두고 실제 위치 앵커를 리소스 중심으로 이동합니다.">앵커를 현재 리소스 위치로 이동</button></div></>}
                <p className="field-help">{selected.locked ? "좌표 고정이 켜져 있어 앵커와 출력 위치가 유지됩니다." : resourceOutputDragMode ? "드래그와 방향키로 이미지 리소스만 이동합니다." : "드래그와 방향키로 실제 위치 앵커를 이동하며 현재 오프셋은 유지됩니다."}</p>
              </div>
              <label className="range-label"><span>크기 <b>{selected.size.toFixed(1)}%</b></span><input type="range" min="0.8" max="15" step="0.1" value={selected.size} onChange={(event) => updateElement(selected.id, { size: Number(event.target.value) })} /></label>
              <label className="range-label"><span>투명도 <b>{selected.opacity}%</b></span><input type="range" min="10" max="100" step="1" value={selected.opacity} onChange={(event) => updateElement(selected.id, { opacity: Number(event.target.value) })} /></label>
              <div className="layer-actions"><button onClick={() => moveLayer("back")}>맨 뒤</button><button onClick={() => moveLayer("backward")}>한 칸 뒤</button><button onClick={() => moveLayer("forward")}>한 칸 앞</button><button onClick={() => moveLayer("front")}>맨 앞</button></div>
            </AdminFolder>
            {selected.category === "landmark" && selectedLandmarkDefault && <AdminFolder className="landmark-default-section" title="랜드마크 기본 앵커" meta={selectedIsPrimaryCalibration ? "1차 기준점" : selectedLandmarkDefault.confirmed ? "2차 기준점" : "초기화 기준"}><div className="field-row"><label>기본 X<input type="number" min="0" max="100" step="0.1" value={selectedLandmarkDefault.x.toFixed(2)} onChange={(event) => updateLandmarkDefault(selected, { x: Number(event.target.value) })} /></label><label>기본 Y<input type="number" min="0" max="100" step="0.1" value={selectedLandmarkDefault.y.toFixed(2)} onChange={(event) => updateLandmarkDefault(selected, { y: Number(event.target.value) })} /></label></div><div className="landmark-default-buttons"><button className="primary" onClick={() => saveLandmarkAsDefault(selected)}>현재 앵커를 기본값으로 저장</button><button onClick={() => moveLandmarkToDefault(selected)}>기본 앵커로 이동</button></div>{selectedIsPrimaryCalibration ? <div className="default-tier-note primary">1차 기준점 6곳은 실제 위치 앵커와 기본 앵커가 자동 동기화되며 영구 기준좌표로 저장됩니다.</div> : <label className="default-confirm-toggle"><input type="checkbox" checked={Boolean(selectedLandmarkDefault.confirmed)} disabled={!selectedHasGeocodedSource} onChange={(event) => updateLandmarkDefault(selected, { confirmed: event.target.checked })} /><span><b>2차 기준점으로 확정</b><small>{selectedHasGeocodedSource ? "기본 앵커를 고정점으로 사용해 주변 마커를 보정합니다." : "실제 장소 좌표가 없어 2차 기준점으로 사용할 수 없습니다."}</small></span></label>}<p className="field-help">기본 위치는 화면상 리소스가 아니라 실제 위치 앵커를 기준으로 저장되며 자동 저장·배치안·JSON에 포함됩니다.</p></AdminFolder>}
            <AdminFolder title="라벨 · 연결선" actions={<><label className={`coordinate-lock-toggle label-lock-toggle ${selected.labelLocked ? "active" : ""}`} title="켜면 라벨 위치 새로고침에서도 이 라벨을 기준점으로 유지합니다."><input type="checkbox" checked={selected.labelLocked} onChange={(event) => updateElement(selected.id, { labelLocked: event.target.checked })} /><span>{selected.labelLocked ? "라벨 고정 ON" : "라벨 고정 OFF"}</span></label><label className="switch" title="라벨 표시"><input type="checkbox" checked={selected.labelVisible} onChange={(event) => updateElement(selected.id, { labelVisible: event.target.checked })} /><span /></label></>}>
              {selected.category !== "landmark" && <label className="dense-label-eligibility"><input type="checkbox" checked={!denseLabelExcludedIds.includes(selected.id)} onChange={(event) => setDenseLabelEligibility(selected.id, event.target.checked)} /><span><b>밀집 시 통합 라벨 사용</b><small>끄면 이 장소명은 항상 자기 마커 옆에 개별 표시됩니다.</small></span></label>}
              <div className="position-grid">{(["top", "bottom", "left", "right"] as LabelPosition[]).map((position) => <button key={position} className={selected.labelPosition === position ? "active" : ""} onClick={() => updateElement(selected.id, { labelPosition: position })}>{{ top: "위", bottom: "아래", left: "왼쪽", right: "오른쪽" }[position]}</button>)}</div>
              <label className="range-label"><span>보이는 아이콘과 간격 <b>{selected.labelGap}px</b></span><input type="range" min="0" max="40" step="1" value={selected.labelGap} onChange={(event) => updateElement(selected.id, { labelGap: Number(event.target.value) })} /></label>
              <div className="field-row label-offset-fields"><label>좌우 미세 조정<input type="number" min="-240" max="240" step="1" value={selected.labelOffsetX} onChange={(event) => updateElement(selected.id, { labelOffsetX: clamp(Number(event.target.value), -240, 240) })} /></label><label>상하 미세 조정<input type="number" min="-240" max="240" step="1" value={selected.labelOffsetY} onChange={(event) => updateElement(selected.id, { labelOffsetY: clamp(Number(event.target.value), -240, 240) })} /></label></div>
              <div className="property-subsection connector-controls"><header><strong>연결선</strong><label className="switch" title="연결선 표시"><input type="checkbox" checked={selected.connectorVisible} onChange={(event) => updateElement(selected.id, { connectorVisible: event.target.checked })} /><span /></label></header><div className="field-row compact-color-row"><label>색상<input type="color" value={selected.connectorColor} onChange={(event) => updateElement(selected.id, { connectorColor: event.target.value })} /></label><label>기본 굵기<input type="number" min="0.5" max="6" step="0.5" value={selected.connectorWidth} onChange={(event) => updateElement(selected.id, { connectorWidth: clamp(Number(event.target.value), 0.5, 6) })} /></label></div></div>
              <p className="field-help">라벨 위치와 마커 연결선을 한곳에서 조정합니다. 전체 라벨 정리는 왼쪽 ‘지도 전체 조절’에서 실행합니다.</p>
            </AdminFolder>
            <AdminFolder title="빠른 작업"><div className="quick-actions"><button onClick={duplicateSelected}>복제</button><button disabled={isMainHubPersistenceTarget(selected)} onClick={() => toggleElementMapVisibility(selected, !selected.mapVisible)}>{selected.mapVisible ? "미배치로 변경" : "배치로 변경"}</button><button className="danger" disabled={selected.locked || isMainHubPersistenceTarget(selected)} onClick={deleteSelected}>삭제</button></div></AdminFolder>
          </div>}
        </aside>}
      </section>
      {publicLayoutAccess === "viewer" && !selected && !globalStoriesOpen && <button type="button" className="global-story-toggle" onClick={toggleGlobalStories} aria-expanded="false" aria-controls="global-story-panel">
        <span aria-hidden="true">⌖</span><strong>장소 · 리뷰 · 행사</strong>{publicPlaceItems.length > 0 && <em>{publicPlaceItems.length}</em>}
      </button>}
      {globalStoriesOpen && <Suspense fallback={<PublicExplorerPanelLoading access={publicLayoutAccess === "editor" ? "editor" : "viewer"} expanded={publicPanelExpanded} />}><PublicExplorerPanel
        access={publicLayoutAccess === "editor" ? "editor" : "viewer"}
        panelRef={publicExplorerPanelRef}
        queryInputRef={publicPlaceQueryInputRef}
        panel={{
          open: globalStoriesOpen,
          hasSelectedPlace: Boolean(selected),
          expanded: publicPanelExpanded,
          dragging: publicPanelDrag?.target === "explorer",
          dragOffsetY: publicPanelDrag?.target === "explorer" ? publicPanelDrag.offsetY : 0,
          onToggle: toggleGlobalStories,
          onClose: closePublicExplorerPanel,
          onDragPointerDown: (event) => startPublicPanelDrag(event, "explorer", publicPanelExpanded),
          onDragPointerMove: movePublicPanelDrag,
          onDragPointerEnd: finishPublicPanelDrag,
          onOpenPlaceRequest: () => setPlaceRequestFormOpen(true),
        }}
        tabs={{
          active: globalContentTab,
          placeCount: publicPlaceItems.length,
          reviewCount: globalStoriesTotal,
          eventCount: globalEventsTotal,
          placeRequestCount: placeRequestsTotal,
          onSelect: (tab: PublicExplorerTab) => {
            setGlobalContentTab(tab);
            if (tab === "reviews") setGlobalStoriesPage(1);
            if (tab === "events") setGlobalEventsPage(1);
            if (tab === "place-requests") setPlaceRequestsPage(1);
          },
        }}
        places={{
          query: publicPlaceQuery,
          activeCategory: publicPlaceCategory,
          categories: publicListCategories.map((category) => ({ ...category, count: publicPlaceCategoryCounts[category.id] })),
          rows: publicExplorerPlaceRows,
          expandedAdditionalCategoryItemId,
          onQueryChange: (value) => { setPublicPlaceQuery(value); setExpandedAdditionalCategoryItemId(null); },
          onCategoryChange: (categoryId) => { setPublicPlaceCategory(categoryId as PublicPlaceCategoryScope); setExpandedAdditionalCategoryItemId(null); },
          onResetFilters: () => { setPublicPlaceCategory("all"); setPublicPlaceQuery(""); setExpandedAdditionalCategoryItemId(null); },
          onExpandedAdditionalCategoryChange: setExpandedAdditionalCategoryItemId,
          onFocusPlace: (itemId, showDetails) => { const item = publicPlaceItems.find((candidate) => candidate.id === itemId); if (item) focusPublicPlaceItem(item, showDetails); },
        }}
        eventManagement={{ canManage: globalEventsCanManage, onCreate: openUnassignedPlaceEventForm }}
        diagnostics={{
          uploadDiagnostics,
          uploadLoading: uploadDiagnosticsLoading,
          uploadError: uploadDiagnosticsError,
          uploadActionId: uploadDiagnosticActionId,
          onRefreshUploads: () => setUploadDiagnosticsRefreshKey((current) => current + 1),
          onDeleteUpload: (id) => { void deleteUploadDiagnostic(id); },
          onClearUploads: () => { void clearUploadDiagnostics(); },
          performanceDiagnostics,
          performanceLoading: performanceDiagnosticsLoading,
          performanceError: performanceDiagnosticsError,
          performanceActionId: performanceDiagnosticActionId,
          onRefreshPerformance: () => setPerformanceDiagnosticsRefreshKey((current) => current + 1),
          onDeletePerformance: (id) => { void deletePerformanceDiagnostic(id); },
          onClearPerformance: () => { void clearPerformanceDiagnostics(); },
        }}
        activity={{
          stories: globalStories,
          storiesLoading: globalStoriesLoading,
          storiesError: globalStoriesError,
          storiesCanModerate: globalStoriesCanModerate,
          reportedStoryIds,
          storyActionId: placeStoryActionId,
          events: globalEvents,
          eventsLoading: globalEventsLoading,
          eventsError: globalEventsError,
          eventsCanManage: globalEventsCanManage,
          eventActionId: placeEventActionId,
          onRetryStories: () => setGlobalStoriesRefreshKey((current) => current + 1),
          onOpenStoryPlace: openGlobalStoryPlace,
          onReportStory: openPlaceStoryReport,
          onModerateStory: moderatePlaceStory,
          onDeleteStory: deletePlaceStory,
          onRetryEvents: () => setGlobalEventsRefreshKey((current) => current + 1),
          onOpenEventPlace: openGlobalEventPlace,
          onEditEvent: editPlaceEvent,
          onModerateEvent: moderatePlaceEvent,
          onToggleEventPin: togglePlaceEventPin,
          onDeleteEvent: deletePlaceEvent,
        }}
        requests={{
          loading: placeRequestsLoading,
          error: placeRequestsError,
          requests: placeRequests,
          actionId: placeRequestActionId,
          areaOptions: placeRequestAreaOptions,
          linkedMarkers: requestMarkerByRequestId,
          formatDateTime: storyDateTimeLabel,
          onRetry: () => setPlaceRequestsRefreshKey((current) => current + 1),
          onUpdate: updatePlaceRequestDraft,
          onStartReview: startPlaceRequestReview,
          onSave: savePlaceRequestEdits,
          onApprove: approvePlaceRequest,
          onReject: rejectPlaceRequest,
          onDelete: deletePlaceRequest,
        }}
        pagination={{
          reviews: {
            current: globalStoriesPage,
            count: globalStoriesPageCount,
            loading: globalStoriesLoading,
            onPrevious: () => setGlobalStoriesPage((page) => Math.max(1, page - 1)),
            onNext: () => setGlobalStoriesPage((page) => Math.min(globalStoriesPageCount, page + 1)),
          },
          events: {
            current: globalEventsPage,
            count: globalEventsPageCount,
            loading: globalEventsLoading,
            onPrevious: () => setGlobalEventsPage((page) => Math.max(1, page - 1)),
            onNext: () => setGlobalEventsPage((page) => Math.min(globalEventsPageCount, page + 1)),
          },
          placeRequests: {
            current: placeRequestsPage,
            count: placeRequestsPageCount,
            loading: placeRequestsLoading,
            onPrevious: () => setPlaceRequestsPage((page) => Math.max(1, page - 1)),
            onNext: () => setPlaceRequestsPage((page) => Math.min(placeRequestsPageCount, page + 1)),
          },
        }}
      /></Suspense>}
      {publicLayoutAccess === "viewer" && (storyReportTarget || placeRequestFormOpen || adminLoginOpen) && <Suspense fallback={<PublicDialogLoading />}>
        <PublicViewerDialogs
          storyReport={{
            target: storyReportTarget,
            reason: storyReportReason,
            detail: storyReportDetail,
            submitting: storyReportSubmitting,
            onClose: closePlaceStoryReport,
            onReasonChange: setStoryReportReason,
            onDetailChange: setStoryReportDetail,
            onSubmit: () => { void submitPlaceStoryReport(); },
          }}
          placeRequest={{
            open: placeRequestFormOpen,
            category: placeRequestCategory,
            markerStyle: placeRequestMarkerStyle,
            location: placeRequestLocation,
            area: placeRequestArea,
            areaOptions: placeRequestAreaOptions,
            name: placeRequestName,
            address: placeRequestAddress,
            description: placeRequestDescription,
            submitting: placeRequestSubmitting,
            canSubmit: !placeRequestSubmitting && Boolean(placeRequestLocation) && Boolean(placeRequestArea) && placeRequestName.trim().length >= 2 && placeRequestAddress.trim().length >= 5 && placeRequestDescription.trim().length >= 10,
            onClose: () => { setPlaceRequestFormOpen(false); setPlaceRequestPickingLocation(false); },
            onCategoryChange: setPlaceRequestCategory,
            onMarkerStyleChange: setPlaceRequestMarkerStyle,
            onChooseLocation: () => { placeRequestLocationBeforePickingRef.current = placeRequestLocation; setPlaceRequestFormOpen(false); setGlobalStoriesOpen(false); setSelectedId(null); setPlaceRequestPickingLocation(true); },
            onAreaChange: setPlaceRequestArea,
            onNameChange: setPlaceRequestName,
            onAddressChange: setPlaceRequestAddress,
            onDescriptionChange: setPlaceRequestDescription,
            onSubmit: () => { void submitPlaceRegistrationRequest(); },
          }}
          adminLogin={{
            open: adminLoginOpen,
            password: adminPassword,
            error: adminLoginError,
            submitting: adminLoginSubmitting,
            onClose: () => setAdminLoginOpen(false),
            onPasswordChange: (password) => { setAdminPassword(password); setAdminLoginError(""); },
            onSubmit: submitSharedAdminLogin,
          }}
        />
      </Suspense>}
      {publicLayoutAccess === "editor" && placeEventFormOpen && <Suspense fallback={<div className="place-event-dialog-layer" role="status"><div className="admin-module-loading"><span className="global-story-spinner" /><strong>행사 등록 화면을 불러오는 중입니다.</strong></div></div>}>
        <AdminPlaceEventDialog
          editingId={placeEventEditingId}
          dialogOffset={placeEventDialogOffset}
          name={placeEventName}
          info={placeEventInfo}
          startsAt={placeEventStartsAt}
          endsAt={placeEventEndsAt}
          visibleFrom={placeEventVisibleFrom}
          visibleUntil={placeEventVisibleUntil}
          noPlace={placeEventNoPlace}
          multiPlace={placeEventMultiPlace}
          places={placeEventPlaces}
          photo={placeEventPhoto}
          existingPhotoUrl={placeEventExistingPhotoUrl}
          photoPreview={placeEventPhotoPreview}
          submitting={placeEventSubmitting}
          onDialogPointerDown={startPlaceEventDialogDrag}
          onDialogPointerMove={movePlaceEventDialog}
          onDialogPointerUp={endPlaceEventDialogDrag}
          onClose={closePlaceEventForm}
          onNameChange={setPlaceEventName}
          onInfoChange={setPlaceEventInfo}
          onStartsAtChange={setPlaceEventStartsAt}
          onEndsAtChange={setPlaceEventEndsAt}
          onVisibleFromChange={setPlaceEventVisibleFrom}
          onVisibleUntilChange={setPlaceEventVisibleUntil}
          onNoPlaceChange={(checked) => { setPlaceEventNoPlace(checked); if (checked) { setPlaceEventMultiPlace(false); setPlaceEventPlaces([]); } else if (selected && selectedStoryKey) { setPlaceEventPlaces([{ placeKey: selectedStoryKey, placeName: selected.name }]); } }}
          onMultiPlaceChange={(checked) => { setPlaceEventMultiPlace(checked); if (!checked) setPlaceEventPlaces((current) => current.slice(0, 1)); }}
          onRemovePlace={(placeKey) => setPlaceEventPlaces((current) => current.filter((item) => item.placeKey !== placeKey))}
          onPhotoChange={updatePlaceEventPhoto}
          onSubmit={() => void submitPlaceEvent()}
        />
      </Suspense>}
      {publicLayoutAccess === "editor" && publicHistoryOpen && <div className="public-history-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPublicHistoryOpen(false); }}>
        <section className="public-history-dialog" role="dialog" aria-modal="true" aria-labelledby="public-history-title">
          <header>
            <div><strong id="public-history-title">공개본 기록</strong><span>저장 기록은 공개 화면을 바꾸지 않으며, 게시 기록만 실제 공개된 상태입니다.</span></div>
            <div><button type="button" className="history-save-current" disabled={editorDraftSaving} onClick={() => void saveEditorDraft()}>{editorDraftSaving ? "기록 중…" : "현재 상태 기록"}</button><button type="button" onClick={() => setPublicHistoryOpen(false)} aria-label="공개본 기록 닫기">×</button></div>
          </header>
          <div className="public-history-legend"><span className="snapshot">저장 기록</span><span className="published">게시 기록</span><small>Ctrl / ⌘ + S = 저장 기록 추가</small></div>
          <div className="public-history-list">
            {publicHistory.map((item) => {
              const isLive = item.sourceRevision === publicLayoutRevision && item.kind !== "snapshot";
              const label = item.kind === "snapshot" ? "저장 기록" : item.kind === "restored" ? "복원 게시" : item.kind === "legacy" ? "기존 공개본" : "게시 기록";
              return <article key={item.id} className={`public-history-row ${item.kind} ${isLive ? "live" : ""}`}>
                <div className="public-history-row-main"><span className="history-kind">{label}</span>{isLive && <span className="history-live">현재 공개</span>}<strong>{new Date(item.createdAt).toLocaleString("ko-KR")}</strong><small>요소 {item.elementCount} · 배치 {item.placedCount} · 공개 리비전 {item.sourceRevision}</small></div>
                <div className="public-history-row-meta"><span title={item.createdBy}>{item.createdBy}</span><button type="button" disabled={Boolean(publicHistoryActionId)} onClick={() => void loadPublicHistoryEntry(item)}>{publicHistoryActionId === item.id ? "불러오는 중…" : "편집 화면에 불러오기"}</button></div>
              </article>;
            })}
            {!publicHistory.length && <div className="public-history-empty"><strong>아직 저장된 기록이 없습니다.</strong><span>Ctrl / ⌘ + S를 누르면 현재 편집 상태가 첫 기록으로 추가됩니다.</span></div>}
          </div>
          <footer>기록을 불러와도 공개 화면은 바뀌지 않습니다. 검토 후 상단의 ‘공개본 업데이트’를 눌러야 게시됩니다.</footer>
        </section>
      </div>}
      {shortcutHelpOpen && <div className="admin-shortcut-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShortcutHelpOpen(false); }}>
        <section id="shortcut-dialog" className="admin-shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-title" aria-describedby="shortcut-note">
          <header><div><strong id="shortcut-title">{publicLayoutAccess === "editor" ? "관리자 단축키" : "공개본 단축키"}</strong><span>{publicLayoutAccess === "editor" ? "편집 작업을 빠르게 이어가는 안전 단축키" : "키보드로 지도 탐색을 빠르게 이어갈 수 있습니다."}</span></div><button type="button" autoFocus onClick={() => setShortcutHelpOpen(false)} aria-label="단축키 안내 닫기">×</button></header>
          <div className="admin-shortcut-list">
            {publicLayoutAccess === "editor" ? <>
              <div><kbd>Ctrl / ⌘ + S</kbd><span>현재 상태를 공개본 기록에 저장</span></div>
              <div><kbd>Ctrl / ⌘ + Z</kbd><span>실행 취소</span></div>
              <div><kbd>Ctrl / ⌘ + Shift + Z</kbd><span>다시 실행</span></div>
              <div><kbd>↑ ↓ ← →</kbd><span>선택 항목 미세 이동</span></div>
              <div><kbd>Shift + 방향키</kbd><span>선택 항목 크게 이동</span></div>
              <div><kbd>Delete / Backspace</kbd><span>고정 해제 → 지도 배치 삭제</span></div>
              <div><kbd>/</kbd><span>현재 장소 목록 검색</span></div>
              <div><kbd>Esc</kbd><span>가장 위의 창 닫기</span></div>
              <div><kbd>?</kbd><span>이 단축키 안내 열기</span></div>
            </> : <>
              <div><kbd>/</kbd><span>원도심 탐색을 열고 장소 검색</span></div>
              <div><kbd>+ / −</kbd><span>지도 확대·축소</span></div>
              <div><kbd>0</kbd><span>전체 지도를 화면에 맞춤</span></div>
              <div><kbd>Enter / Space</kbd><span>선택한 마커·버튼 실행</span></div>
              <div><kbd>Esc</kbd><span>현재 상세정보·탐색창 닫기</span></div>
              <div><kbd>?</kbd><span>이 단축키 안내 열기</span></div>
            </>}
          </div>
          <p id="shortcut-note">{publicLayoutAccess === "editor" ? "Ctrl+S 기록은 공개 화면을 바꾸지 않습니다. 삭제 단축키는 지도 배치만 제거하며 통합 장소 DB는 보존합니다. 공개본 업데이트와 DB 영구 삭제에는 단축키를 두지 않았습니다." : "단축키는 PC 키보드 환경에서 동작하며, 입력란을 작성하는 동안에는 실행되지 않습니다."}</p>
        </section>
      </div>}
      {publicLayoutAccess === "editor" && databaseEditorOpen && <Suspense fallback={<div className="database-editor-backdrop" role="status"><div className="admin-module-loading"><span className="global-story-spinner" /><strong>관리자 DB 편집 도구를 불러오는 중입니다.</strong></div></div>}>
        <AdminDatabaseEditor
          places={databaseDraftPlaces}
          filteredPlaces={filteredDatabaseDraftPlaces}
          selectedPlace={selectedDatabasePlace}
          selectedId={databaseEditorSelectedId}
          query={databaseEditorQuery}
          queryInputRef={databaseEditorQueryInputRef}
          categoryFilter={databaseEditorCategory}
          categoryCounts={databaseEditorCategoryCounts}
          categoryOptions={categories}
          areaOptions={databaseAreaOptions}
          dirty={databaseEditorDirty}
          saving={databaseEditorSaving}
          storageSummary={placeDirectoryStorage === "persistent" ? `영구 DB 동기화${placeDirectoryUpdatedAt ? ` · ${new Date(placeDirectoryUpdatedAt).toLocaleString("ko-KR")}` : ""}` : "기본 DB를 처음 저장할 준비가 됐습니다."}
          isCoreLandmark={isCoreLandmarkName}
          onClose={closeDatabaseEditor}
          onQueryChange={setDatabaseEditorQuery}
          onAdd={addDatabaseDraftPlace}
          onSelectCategory={selectDatabaseEditorCategory}
          onSelectPlace={setDatabaseEditorSelectedId}
          onUpdatePlace={(id, patch) => updateDatabaseDraftPlace(id, patch as Partial<DirectoryPlace>)}
          onToggleAdditionalCategory={toggleDatabaseAdditionalCategory}
          onToggleConvenienceAttribute={toggleDatabaseConvenienceAttribute}
          onRemovePlace={(place) => removeDatabaseDraftPlace(place as DirectoryPlace)}
          onBackup={() => download(`제주원도심_내부DB_백업_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), rows: databaseDraftPlaces.map(directoryRecordFromPlace) }, null, 2), "application/json")}
          onSave={() => void saveDatabaseEditor()}
        />
      </Suspense>}
      {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    </Suspense>
  );
}
