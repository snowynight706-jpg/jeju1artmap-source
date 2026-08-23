"use client";
/* eslint-disable @next/next/no-img-element */

import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  lazy,
  Suspense,
  startTransition,
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
  type BundledMarkerCategory,
  type BundledMarkerStyle,
} from "./marker-assets";
import { geocodedPlaces } from "./geocoded-places";
import { isCoreLandmarkName, normalizePlaceName } from "./core-landmarks";
import {
  MAP_ASPECT,
  PRIMARY_CALIBRATION_NAMES,
  buildEffectiveCalibrationPoints,
  calibratedPlaceCoordinates,
  canonicalAnchorForElement,
  initialCalibrationPoints,
  type CalibrationPoint,
} from "./map/calibration/model";
import {
  EXPORT_CANONICAL_WIDTH,
  categories,
  categoryOf,
  isPrimaryHubLabel,
  mapElementDisplaySize,
  placeContentKey,
  type CategoryId,
} from "./map/core/model";
import {
  DenseLabelLayer,
  MapConnectorLayer,
  MapElementLayer,
  MobileMarkerPlaceholderLayer,
  type MapRenderActions,
} from "./map/rendering/layers";
import {
  applyPlacementOverrides,
  cloneDocument,
  ensureIndependentElementIdentity,
  placementKey,
  sanitizePlacementOverrides,
  uniqueRuntimeId,
} from "./editor/document/rules";
import { createMapDocumentModel } from "./editor/document/bootstrap";
import { usePlaceEditorActions } from "./editor/places/actions";
import {
  printSettingKey,
  type PrintMode,
} from "./map/print/settings";
import { usePrintSettingsPersistence } from "./map/print/use-settings-persistence";
import { denseLabelRenderScale } from "./map/labels/clusters";
import { rectsOverlap, type NormalizedRect } from "./map/labels/geometry";
import { useDenseLabelSettingsPersistence } from "./map/labels/use-settings-persistence";
import type {
  AssetStatus,
  DenseLabelCluster,
  DenseLabelPosition,
  DirectoryPlace,
  DocumentState,
  LabelPosition,
  LandmarkDefaultPosition,
  MapAsset,
  MapElement,
  MapLabelStatus,
  PlacementOverride,
  PlacementState,
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
import { useAdminMapAssetActions } from "./editor/workspace/use-admin-map-asset-actions";
import {
  type BaseMapMode,
  type OptionalLabelScaleStep,
  type PublicLayoutHistoryItem,
  type PublicViewSettings,
  type UploadedBaseMap,
} from "./editor/persistence/public-layout-client";
import { useMapSettingsPersistence } from "./editor/persistence/use-map-settings-persistence";
import { normalizeOptionalLabelScaleSteps } from "./map/labels/density.mjs";
import PublicExplorerPanel, { type PublicExplorerTab } from "./public/explorer-panel";
import { publicPlaceFocusZoom } from "./public/place-focus.mjs";
import PublicPlaceSheet from "./public/place-sheet";
import {
  publicCategoryMetaForPlace,
  publicListCategories,
  usePublicPlaceWorkspace,
  type PublicHistoryState,
  type PublicPanelHistory,
  type PublicPlaceCategoryScope,
} from "./public/use-public-place-workspace";
import { usePublicNavigationActions } from "./public/use-public-navigation-actions";
import { useMapTransformController } from "./map/interaction/use-map-transform-controller";
import { useMapWorkspaceModel } from "./map/workspace/use-map-workspace-model";
import { lowTierBaseMapNeedsHighResolution } from "./map/rendering/base-map-quality.mjs";
import {
  LOW_MOBILE_RENDER_BUDGET,
  STANDARD_MOBILE_RENDER_BUDGET,
  mobileRenderBudgetForDevice,
} from "./map/rendering/mobile-render-budget.mjs";
import { shouldSendMapSettleDiagnostic } from "./map/rendering/performance-diagnostics.mjs";
import type { MobileRenderBudget } from "./map/rendering/mobile-render";
import {
  publicPanelIsExpanded,
  publicPanelIsExplorer,
  publicPanelIsPlace,
  publicPlaceDirectionsUrl,
  publicUrlWithPlace,
} from "./public/navigation.mjs";
import {
  isMainHubPersistenceTarget,
} from "./editor/document/main-hub-persistence.mjs";
import {
  ART_PLATFORM_FACILITY_NAMES,
  LPP_CANONICAL_NAME,
  MAIN_HUB_CANONICAL_NAME,
  MAIN_HUB_ROLE,
  additionalCategoryDefinitions,
  convenienceAttributeDefinitions,
  isPrimaryPublicCategory,
  publicDisplayName,
  sanitizeAdditionalCategories,
  sanitizeConvenienceAttributes,
} from "./place-taxonomy";
import {
  createDirectoryCatalog,
  createDirectoryRecordMerger,
  databaseEditorCategoryForPlace,
  directoryCategory,
  directoryRecordFromPlace,
} from "./place-directory/model";
import type { DatabaseEditorCategoryFilter } from "./admin-database-editor";
import {
  PLACE_EVENTS_API,
  PLACE_REGISTRATION_REQUESTS_API,
  PLACE_STORIES_API,
  readPlaceStoryDraft,
  sendPerformanceDiagnostic,
  sendPlaceStoryUploadDiagnostic,
  writePlaceStoryDraft,
} from "./content/client";
import type {
  GlobalContentTab,
  PlaceEvent,
  PlaceEventPlace,
  PlaceEventsPayload,
  PlaceRegistrationRequestsPayload,
  PlaceReviewCount,
  PlaceStoriesPayload,
  PlaceStory,
  StoryCameraPermissionState,
  StoryReportReason,
} from "./content/types";
import {
  useExplorerDiagnostics,
  useExplorerEvents,
  useExplorerStories,
  usePlaceRequests,
} from "./content/use-explorer-content";
import { usePlaceStoryActions } from "./content/use-place-story-actions";
import { usePlaceEventRequestActions } from "./content/use-place-event-request-actions";
import { STORY_PHOTO_MAX_SOURCE_BYTES } from "./media/photo-processing";

// 이하는 필요할 때만 불러오는 관리자·공개 화면 모듈 코드입니다.

const AdminDatabaseEditor = lazy(() => import("./admin-database-editor"));
const AdminFolder = lazy(() => import("./admin-folder"));
const AdminPlaceEventDialog = lazy(() => import("./admin-place-event-dialog"));

// 이하는 지도 자산, 서버 API 주소, 저장 키에 관한 공통 설정 코드입니다.
const MAP_SVG = "/maps/제주원도심_랜드마크탐색_베이스맵_v15_골목추가정리_검수본_마스터벡터.svg";
const MAP_PNG = "/maps/제주원도심_랜드마크탐색_베이스맵_v15_골목추가정리_검수본_초고해상도.png";
const JFAC_SIGNATURE_B_SVG = "/jfac-signature-b.svg?v=20260821-svg1";
const JFAC_SYMBOL_SVG = "/jfac-symbol.svg?v=20260821-svg1";
const UPLOADED_MAP_API = "/api/base-map";
const PLACE_DIRECTORY_API = "/api/place-directory";
const ADMIN_SESSION_API = "/api/admin-session";
const PUBLIC_VIEW_COOKIE = "jfac_map_public_view";
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
const UI_THEME_STORAGE_KEY = "jeju-wondosim-map-review:ui-theme:v1";
const DELETED_PLACE_NAMES = new Set(["산짓물공원", "산짓물 공원"]);
const UI_THEME_EASTER_EGG_PLACES = new Set([
  "제주아트플랫폼",
  "예술공간 이아",
  "산지천갤러리",
  "김만덕객주",
]);

const uiThemes = [
  { id: "stormy", name: "스토미 미니멀", shortName: "스토미", colors: ["#FAFAFA", "#E1E2E5", "#B9BBC1", "#70737C", "#2B2D33"] },
  { id: "nordic-sand", name: "노르딕 샌드", shortName: "샌드", colors: ["#F6F3EF", "#DED9D2", "#B4AEA6", "#7A746D", "#3A3835"] },
  { id: "lilac", name: "라일락", shortName: "라일락", colors: ["#F4F2F7", "#D6D2DF", "#A59DB6", "#5D556F", "#26222F"] },
  { id: "urban-blush", name: "어반 블러시", shortName: "블러시", colors: ["#F6F2F4", "#DED5DA", "#B7A4AC", "#6E5B63", "#C07B8F"] },
  { id: "harbor-morning", name: "항구의 아침", shortName: "항구", colors: ["#F0F3F7", "#C8D2E0", "#8EA2BB", "#4E647A", "#26313B"] },
] as const;

// 이하는 화면 테마 선택기를 그리는 작은 UI 코드입니다.
type UiThemeId = (typeof uiThemes)[number]["id"];

function isUiThemeId(value: unknown): value is UiThemeId {
  return typeof value === "string" && uiThemes.some((theme) => theme.id === value);
}

function UiThemeSwatch({ colors }: { colors: readonly string[] }) {
  return <span className="ui-theme-swatch" aria-hidden="true">{colors.map((color, index) => <i style={{ background: color }} key={`${color}-${index}`} />)}</span>;
}

function UiThemePicker({ activeTheme, compact = false, onSelect }: {
  activeTheme: UiThemeId;
  compact?: boolean;
  onSelect: (theme: UiThemeId) => void;
}) {
  return <div className={`ui-theme-picker ${compact ? "compact" : ""}`} role="group" aria-label="화면 테마 선택">
    {uiThemes.map((theme) => <button
      type="button"
      className={activeTheme === theme.id ? "active" : ""}
      aria-pressed={activeTheme === theme.id}
      aria-label={`${theme.name} 테마`}
      title={theme.name}
      onClick={() => onSelect(theme.id)}
      key={theme.id}
    >
      <UiThemeSwatch colors={theme.colors} />
      {!compact && <span>{theme.shortName}</span>}
    </button>)}
  </div>;
}

// 이하는 관리자 목록의 필터와 좌표 그룹에 관한 타입입니다.
type CoordinateLockFilter = "all" | "unlocked" | "locked";
type PlacementFilter = "all" | "placed" | "unplaced";
type RecommendationFilter = "all" | "recommended" | "standard";
type CalibrationGroupId = "primary" | "secondary" | "tertiary";
type PublicAssetProfile = "mobile" | "standard";

// 이하는 지도, 장소, 후기, 행사, 공개본에 사용되는 데이터 형태 정의입니다.
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

const storyReportReasons: Array<{ id: StoryReportReason; label: string }> = [
  { id: "inappropriate", label: "부적절한 내용" },
  { id: "privacy", label: "개인정보 노출" },
  { id: "copyright", label: "사진·저작권 문제" },
  { id: "spam", label: "광고·도배" },
  { id: "other", label: "기타" },
];


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
function reviewStatusForCoordinateLock(locked: boolean): AssetStatus {
  return locked ? "approved" : "unchecked";
}

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

function uploadedBaseMapDisplaySource(metadata: UploadedBaseMap | null, preferCompact = false) {
  if (!metadata?.available) return "";
  if (preferCompact) {
    return metadata.screen2048Url ?? metadata.screen4096Url ?? uploadedBaseMapOriginalSource(metadata);
  }
  return metadata.screen4096Url ?? metadata.screen2048Url ?? uploadedBaseMapOriginalSource(metadata);
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
  const adminShortcutActionsRef = useRef({ saveDraft: () => {}, undo: () => {}, redo: () => {} });
  const mapRenderActionsRef = useRef<MapRenderActions | null>(null);
  const placeRequestLocationBeforePickingRef = useRef<{ x: number; y: number } | null>(null);
  const publicInitialViewAppliedRef = useRef(false);
  const publicNavigationInitializedRef = useRef(false);
  const publicNavigationApplyingRef = useRef(false);
  const publicNavigationAfterPopRef = useRef<"explorer" | null>(null);
  const placeStoryDraftKeyRef = useRef<string | null>(null);
  const selectedStoryKeyRef = useRef<string | null>(null);
  const placeStoryTextRef = useRef("");
  const startupLoadCompletedRef = useRef(false);
  const performanceStartedAtRef = useRef(0);
  const performanceStartupSentRef = useRef(false);
  const performanceSettleSamplesRef = useRef({ pan: 0, pinch: 0 });
  const mobileSlowSettleSamplesRef = useRef(0);
  const geocodeRunRef = useRef(0);
  const storyRequestRunRef = useRef(0);
  const eventRequestRunRef = useRef(0);
  const eventPlaceIndexBootstrappedRef = useRef(false);
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
  const [uiTheme, setUiTheme] = useState<UiThemeId>("stormy");
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
  const [placeStories, setPlaceStories] = useState<PlaceStory[]>([]);
  const [placeStoriesLoading, setPlaceStoriesLoading] = useState(false);
  const [placeStoriesLoadedKey, setPlaceStoriesLoadedKey] = useState<string | null>(null);
  const [, setPlaceStoriesCanModerate] = useState(false);
  const [globalStoriesOpen, setGlobalStoriesOpen] = useState(false);
  const [globalContentTab, setGlobalContentTab] = useState<GlobalContentTab>("places");
  const {
    globalStories,
    globalStoriesPage,
    globalStoriesPageCount,
    globalStoriesTotal,
    globalStoriesCanModerate,
    globalStoriesLoading,
    globalStoriesError,
    setGlobalStories,
    setGlobalStoriesPage,
    setGlobalStoriesTotal,
    setGlobalStoriesRefreshKey,
  } = useExplorerStories({ access: publicLayoutAccess, open: globalStoriesOpen, tab: globalContentTab });
  const {
    uploadDiagnostics,
    uploadDiagnosticsLoading,
    uploadDiagnosticsError,
    performanceDiagnostics,
    performanceDiagnosticsLoading,
    performanceDiagnosticsError,
    setUploadDiagnostics,
    setUploadDiagnosticsRefreshKey,
    setPerformanceDiagnostics,
    setPerformanceDiagnosticsRefreshKey,
  } = useExplorerDiagnostics({ access: publicLayoutAccess, open: globalStoriesOpen, tab: globalContentTab });
  const [uploadDiagnosticActionId, setUploadDiagnosticActionId] = useState<string | null>(null);
  const [performanceDiagnosticActionId, setPerformanceDiagnosticActionId] = useState<string | null>(null);
  const [placeStoryActionId, setPlaceStoryActionId] = useState<string | null>(null);
  const [placeStoryFormOpen, setPlaceStoryFormOpen] = useState(false);
  const [placeStoryAuthor, setPlaceStoryAuthor] = useState("");
  const [placeStoryText, setPlaceStoryText] = useState("");
  const [placeStoryPhoto, setPlaceStoryPhoto] = useState<File | null>(null);
  const [placeStoryPhotoPreview, setPlaceStoryPhotoPreview] = useState<string | null>(null);
  const [placeStorySubmitting, setPlaceStorySubmitting] = useState(false);
  const [placeStoryPhotoRetaining, setPlaceStoryPhotoRetaining] = useState(false);
  const [storyCameraPermission, setStoryCameraPermission] = useState<StoryCameraPermissionState>("unknown");
  const placeStoryPhotoRetainTokenRef = useRef(0);
  const [storyReportTarget, setStoryReportTarget] = useState<PlaceStory | null>(null);
  const [storyReportReason, setStoryReportReason] = useState<StoryReportReason>("inappropriate");
  const [storyReportDetail, setStoryReportDetail] = useState("");
  const [storyReportSubmitting, setStoryReportSubmitting] = useState(false);
  const [reportedStoryIds, setReportedStoryIds] = useState<Set<string>>(() => new Set());
  const [placeEvents, setPlaceEvents] = useState<PlaceEvent[]>([]);
  const [, setPlaceEventsLoading] = useState(false);
  const [placeEventsLoadedKey, setPlaceEventsLoadedKey] = useState<string | null>(null);
  const [, setPlaceEventsCanManage] = useState(false);
  const [placeEventsRefreshKey, setPlaceEventsRefreshKey] = useState(0);
  const [eventLinkedPlaces, setEventLinkedPlaces] = useState<PlaceEventPlace[]>([]);
  const [reviewCountsByPlace, setReviewCountsByPlace] = useState<PlaceReviewCount[]>([]);
  const [reviewBadgeNow, setReviewBadgeNow] = useState(() => Date.now());
  const [placeEventFormOpen, setPlaceEventFormOpen] = useState(false);
  const [placeEventEditingId, setPlaceEventEditingId] = useState<string | null>(null);
  const [placeEventNoPlace, setPlaceEventNoPlace] = useState(false);
  const [placeEventMultiPlace, setPlaceEventMultiPlace] = useState(false);
  const [placeEventPlaces, setPlaceEventPlaces] = useState<PlaceEventPlace[]>([]);
  const [placeEventDialogOffset, setPlaceEventDialogOffset] = useState({ x: 0, y: 0 });
  const [placeEventName, setPlaceEventName] = useState("");
  const [placeEventInfo, setPlaceEventInfo] = useState("");
  const [placeEventStartsAt, setPlaceEventStartsAt] = useState("");
  const [placeEventEndsAt, setPlaceEventEndsAt] = useState("");
  const [placeEventVisibleFrom, setPlaceEventVisibleFrom] = useState("");
  const [placeEventVisibleUntil, setPlaceEventVisibleUntil] = useState("");
  const [placeEventPhoto, setPlaceEventPhoto] = useState<File | null>(null);
  const [placeEventPhotoPreview, setPlaceEventPhotoPreview] = useState<string | null>(null);
  const [placeEventExistingPhotoUrl, setPlaceEventExistingPhotoUrl] = useState<string | null>(null);
  const [placeEventSubmitting, setPlaceEventSubmitting] = useState(false);
  const [placeEventActionId, setPlaceEventActionId] = useState<string | null>(null);
  const {
    globalEvents,
    globalEventsPage,
    globalEventsPageCount,
    globalEventsTotal,
    globalEventsCanManage,
    globalEventsLoading,
    globalEventsError,
    globalEventsRefreshKey,
    setGlobalEvents,
    setGlobalEventsPage,
    setGlobalEventsTotal,
    setGlobalEventsRefreshKey,
  } = useExplorerEvents({ access: publicLayoutAccess, open: globalStoriesOpen, tab: globalContentTab });
  const [placeRequestFormOpen, setPlaceRequestFormOpen] = useState(false);
  const [placeRequestName, setPlaceRequestName] = useState("");
  const [placeRequestArea, setPlaceRequestArea] = useState("");
  const [placeRequestAddress, setPlaceRequestAddress] = useState("");
  const [placeRequestDescription, setPlaceRequestDescription] = useState("");
  const [placeRequestCategory, setPlaceRequestCategory] = useState<BundledMarkerCategory>("culture");
  const [placeRequestMarkerStyle, setPlaceRequestMarkerStyle] = useState<BundledMarkerStyle>(recommendedMarkerStyle);
  const [placeRequestLocation, setPlaceRequestLocation] = useState<{ x: number; y: number } | null>(null);
  const [placeRequestPickingLocation, setPlaceRequestPickingLocation] = useState(false);
  const [placeRequestSubmitting, setPlaceRequestSubmitting] = useState(false);
  const {
    placeRequests,
    placeRequestsPage,
    placeRequestsPageCount,
    placeRequestsTotal,
    placeRequestsLoading,
    placeRequestsError,
    setPlaceRequests,
    setPlaceRequestsPage,
    setPlaceRequestsTotal,
    setPlaceRequestsRefreshKey,
  } = usePlaceRequests({ access: publicLayoutAccess, open: globalStoriesOpen, tab: globalContentTab });
  const [placeRequestActionId, setPlaceRequestActionId] = useState<string | null>(null);
  const [assetStatus, setAssetStatus] = useState<AssetStatus>("unchecked");
  const [assetCategory, setAssetCategory] = useState<CategoryId>("landmark");
  const [leftPanelMode, setLeftPanelMode] = useState<"assets" | "places" | "calibration" | "print">("places");
  const [placeQuery, setPlaceQuery] = useState("");
  const [coordinateLockFilter, setCoordinateLockFilter] = useState<CoordinateLockFilter>("all");
  const [placementFilter, setPlacementFilter] = useState<PlacementFilter>("all");
  const [recommendationFilter, setRecommendationFilter] = useState<RecommendationFilter>("all");
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
  const [placeDirectoryStorage, setPlaceDirectoryStorage] = useState<"loading" | "persistent" | "bundled">("loading");
  const [placeDirectoryCanEdit, setPlaceDirectoryCanEdit] = useState(false);
  const [placeDirectoryUpdatedAt, setPlaceDirectoryUpdatedAt] = useState<string | null>(null);
  const [databaseEditorOpen, setDatabaseEditorOpen] = useState(false);
  const [databaseEditorSaving, setDatabaseEditorSaving] = useState(false);
  const [databaseEditorDirty, setDatabaseEditorDirty] = useState(false);
  const [databaseEditorQuery, setDatabaseEditorQuery] = useState("");
  const [databaseEditorCategory, setDatabaseEditorCategory] = useState<DatabaseEditorCategoryFilter>("all");
  const [databaseEditorSelectedId, setDatabaseEditorSelectedId] = useState<string | null>(null);
  const [databaseDraftPlaces, setDatabaseDraftPlaces] = useState<DirectoryPlace[]>([]);
  const [directoryTaxonomySync, setDirectoryTaxonomySync] = useState<{
    placeId: string | null;
    state: "ready" | "saving" | "saved" | "error";
  }>({ placeId: null, state: "ready" });
  const [interaction, setInteraction] = useState<
    | { type: "pan"; startX: number; startY: number; panX: number; panY: number }
    | { type: "resize"; id: string; startX: number; startSize: number }
    | { type: "drag"; id: string; startX: number; startY: number; elementX: number; elementY: number; anchorX: number; anchorY: number; mode: "anchor" | "output"; calibrationPointId?: string }
    | { type: "label"; id: string; startX: number; startY: number; offsetX: number; offsetY: number }
    | { type: "dense-label"; key: string; elementIds: string[]; startX: number; startY: number; x: number; y: number; halfWidth: number; halfHeight: number }
    | null
  >(null);

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

  const currentDocument = useCallback((): DocumentState => ({
    elements: elementsRef.current,
    assets: assetsRef.current,
    reviewNotes: notesRef.current,
    directoryPlaces: placesRef.current,
    calibrationPoints: calibrationPointsRef.current,
    landmarkDefaultPositions: landmarkDefaultsRef.current,
    denseLabelPositions: denseLabelPositionsRef.current,
    denseLabelExcludedIds: denseLabelExcludedIdsRef.current,
    placementOverrides: placementOverridesRef.current,
  }), []);

  const setDocument = useCallback((document: DocumentState) => {
    const clean = sanitizeDocument(cloneDocument(document));
    const hadCalibration = clean.calibrationPoints?.length === initialCalibrationPoints.length;
    const restoredCalibrationPoints = hadCalibration ? clean.calibrationPoints! : initialCalibrationPoints;
    const storedLandmarkDefaults = Array.isArray(clean.landmarkDefaultPositions) && clean.landmarkDefaultPositions.length
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
      : [];
    const storedLandmarkDefaultNames = new Set(storedLandmarkDefaults.map((position) => normalizePlaceName(position.name)));
    const restoredLandmarkDefaults = [
      ...storedLandmarkDefaults,
      ...factoryLandmarkDefaultPositions
        .filter((position) => !storedLandmarkDefaultNames.has(normalizePlaceName(position.name)))
        .map((position) => ({ ...position })),
    ];
    const restoredPlaces = clean.directoryPlaces?.length ? clean.directoryPlaces : defaultDirectoryPlaces;
    const restoredNames = new Set(restoredPlaces.map((place) => normalizePlaceName(place.name)));
    const restoredPlaceSet = ensureSystemDirectoryPlaces([
      ...restoredPlaces,
      ...supportDirectoryPlaces.filter((place) => !restoredNames.has(normalizePlaceName(place.name))),
    ]);
    const restoredEffectivePoints = buildEffectiveCalibrationPoints(restoredCalibrationPoints, restoredLandmarkDefaults, clean.elements, restoredPlaceSet);
    const mergedPlaces = restoredPlaceSet.map((place) => {
      if (hadCalibration) return place;
      const mapped = calibratedPlaceCoordinates(place.name, place.latitude, place.longitude, restoredEffectivePoints);
      return mapped ? { ...place, ...mapped } : place;
    });
    const migratedPlacesByName = new Map(mergedPlaces.map((place) => [normalizePlaceName(place.name), place]));
    const migratedElementsBeforePlacement = hadCalibration ? clean.elements : clean.elements.map((element) => {
      const reference = restoredEffectivePoints.find((point) => point.name === normalizePlaceName(element.name));
      const place = migratedPlacesByName.get(normalizePlaceName(element.name));
      const mapped = reference ? { x: reference.targetX, y: reference.targetY } : place ? { x: place.x, y: place.y } : null;
      if (!mapped) return element;
      const followsAnchor = Math.hypot(element.x - element.anchorX, element.y - element.anchorY) < 0.18;
      const isDefaultPlacement = /^(default-landmark|starter-marker)-/.test(element.id) || /초기 구성용|초기 배치/.test(element.memo ?? "");
      return { ...element, anchorX: mapped.x, anchorY: mapped.y, ...((reference || followsAnchor || isDefaultPlacement) ? { x: mapped.x, y: mapped.y } : {}) };
    });
    const restoredPlacementOverrides = sanitizePlacementOverrides(clean.placementOverrides);
    const migratedElements = ensureMainHubMapElement(
      applyPlacementOverrides(migratedElementsBeforePlacement, restoredPlacementOverrides),
      mergedPlaces,
    );
    elementsRef.current = migratedElements;
    assetsRef.current = clean.assets;
    notesRef.current = clean.reviewNotes;
    placesRef.current = mergedPlaces;
    calibrationPointsRef.current = restoredCalibrationPoints;
    landmarkDefaultsRef.current = restoredLandmarkDefaults;
    const restoredDenseLabelPositions = clean.denseLabelPositions ?? [];
    const restoredDenseLabelExcludedIds = clean.denseLabelExcludedIds ?? [];
    denseLabelPositionsRef.current = restoredDenseLabelPositions;
    denseLabelExcludedIdsRef.current = restoredDenseLabelExcludedIds;
    placementOverridesRef.current = restoredPlacementOverrides;
    setElements(migratedElements);
    setAssets(clean.assets);
    setReviewNotes(clean.reviewNotes);
    setDirectoryPlaces(placesRef.current);
    setCalibrationPoints(restoredCalibrationPoints);
    setLandmarkDefaultPositions(restoredLandmarkDefaults);
    setDenseLabelPositions(restoredDenseLabelPositions);
    setDenseLabelExcludedIds(restoredDenseLabelExcludedIds);
    setPlacementOverrides(restoredPlacementOverrides);
    setCalibrationDirty(false);
    setSelectedId(null);
    setSelectedFacilityId(null);
    setSelectedNoteId(null);
    setSelectedDenseLabelId(null);
  }, [setSelectedId]);

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

  const replaceDenseLabelExcludedIds = useCallback((updater: (current: string[]) => string[]) => {
    setDenseLabelExcludedIds((current) => {
      const next = [...new Set(updater(current))];
      denseLabelExcludedIdsRef.current = next;
      return next;
    });
  }, []);

  const restoreDenseLabelSettings = useCallback((positions: DenseLabelPosition[], excludedElementIds: string[]) => {
    denseLabelPositionsRef.current = positions;
    denseLabelExcludedIdsRef.current = excludedElementIds;
    setDenseLabelPositions(positions);
    setDenseLabelExcludedIds(excludedElementIds);
  }, []);

  const replacePlacementOverrides = useCallback((updater: (current: PlacementOverride[]) => PlacementOverride[]) => {
    setPlacementOverrides((current) => {
      const next = sanitizePlacementOverrides(updater(current));
      placementOverridesRef.current = next;
      return next;
    });
  }, []);

  const editorAutosaveDocument = useMemo<DocumentState>(() => ({
    elements,
    assets,
    reviewNotes,
    directoryPlaces,
    calibrationPoints,
    landmarkDefaultPositions,
    denseLabelPositions,
    denseLabelExcludedIds,
    placementOverrides,
  }), [
    assets,
    calibrationPoints,
    denseLabelExcludedIds,
    denseLabelPositions,
    directoryPlaces,
    elements,
    landmarkDefaultPositions,
    placementOverrides,
    reviewNotes,
  ]);

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

  const setPlacementOverride = useCallback((target: MapElement | DirectoryPlace, state: PlacementState | null) => {
    const key = placementKey(target);
    const directoryId = "anchorX" in target ? target.directoryId : target.id;
    replacePlacementOverrides((current) => {
      const remaining = current.filter((item) => item.key !== key);
      if (state && isMainHubPersistenceTarget(target)) return remaining;
      return state ? [...remaining, {
        key,
        ...(directoryId ? { directoryId } : {}),
        name: normalizePlaceName(target.name),
        state,
      }] : remaining;
    });
  }, [replacePlacementOverrides]);

  const updateDenseLabelPosition = useCallback((key: string, elementIds: string[], x: number, y: number) => {
    replaceDenseLabelPositions((current) => {
      const targetIds = new Set(elementIds);
      const position: DenseLabelPosition = {
        key,
        elementIds: [...elementIds].sort(),
        x: clamp(x, 0, 100),
        y: clamp(y, 0, 100),
      };
      const unrelated = current.filter((item) => item.key !== key && !item.elementIds.some((id) => targetIds.has(id)));
      return [...unrelated, position];
    });
  }, [replaceDenseLabelPositions]);

  const resetDenseLabelPosition = useCallback((keyOrKeys: string | string[]) => {
    const keys = new Set(Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]);
    replaceDenseLabelPositions((current) => current.filter((position) => !keys.has(position.key)));
  }, [replaceDenseLabelPositions]);

  const setDenseLabelEligibility = useCallback((elementId: string, eligible: boolean, clusterKeys?: string | string[]) => {
    pushHistory();
    replaceDenseLabelExcludedIds((current) => eligible
      ? current.filter((id) => id !== elementId)
      : [...current, elementId]);
    if (!eligible && clusterKeys) resetDenseLabelPosition(clusterKeys);
    setSelectedDenseLabelId(null);
    const element = elementsRef.current.find((item) => item.id === elementId);
    setToast(eligible ? `${element?.name ?? "장소"}을(를) 자동 통합 대상으로 되돌렸습니다.` : `${element?.name ?? "장소"}을(를) 개별 라벨로 분리했습니다.`);
  }, [pushHistory, replaceDenseLabelExcludedIds, resetDenseLabelPosition]);

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
      const patched = { ...element, ...patch };
      const next = { ...patched, status: reviewStatusForCoordinateLock(patched.locked) };
      const name = normalizePlaceName(next.name);
      if (!isCoreLandmarkName(name) && !isPrimaryHubLabel(name)) return next;
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
      if (element.placeRequestId && !element.directoryId && !index.has(element.placeRequestId)) index.set(element.placeRequestId, element);
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
  // 이하는 화면 크기와 초기 로딩 상태를 실제 화면에 맞춰 동기화하는 코드입니다.
  useLayoutEffect(() => {
    selectedStoryKeyRef.current = selectedStoryKey;
  }, [selectedStoryKey]);
  const publicPlaceDetailLoading = publicLayoutAccess === "viewer"
    && Boolean(selectedStoryKey)
    && (placeStoriesLoadedKey !== selectedStoryKey || placeEventsLoadedKey !== selectedStoryKey);
  const selectedUsesMapDisplayName = Boolean(selected && selectedDirectoryPlace && (
    selectedDirectoryPlace.id === selected.directoryId
    || (!selected.directoryId && normalizePlaceName(selectedDirectoryPlace.name) === normalizePlaceName(selected.name))
  ));
  const selectedDisplayName = selectedDirectoryPlace && !selectedUsesMapDisplayName
    ? publicDisplayName(selectedDirectoryPlace.name, selectedDirectoryPlace.featuredRole)
    : selected?.name ?? "";
  const activeUiTheme = uiThemes.find((theme) => theme.id === uiTheme) ?? uiThemes[0];
  const selectedHasThemeEasterEgg = UI_THEME_EASTER_EGG_PLACES.has(normalizePlaceName(selectedDirectoryPlace?.name ?? selectedDisplayName));
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
  const effectiveCalibrationPoints = useMemo(() => buildEffectiveCalibrationPoints(calibrationPoints, landmarkDefaultPositions, elements, directoryPlaces), [calibrationPoints, directoryPlaces, elements, landmarkDefaultPositions]);
  const secondaryCalibrationPoints = useMemo(() => effectiveCalibrationPoints.filter((point) => point.tier === "secondary"), [effectiveCalibrationPoints]);
  const tertiaryCalibrationPoints = useMemo(() => effectiveCalibrationPoints.filter((point) => point.tier === "tertiary"), [effectiveCalibrationPoints]);
  const calibrationReferenceNames = useMemo(() => new Set(effectiveCalibrationPoints.map((point) => point.name)), [effectiveCalibrationPoints]);
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
    return rows.sort((a, b) => Number(b.category === "landmark") - Number(a.category === "landmark") || a.name.localeCompare(b.name, "ko"));
  }, [directoryPlaces, elements]);

  const searchedUnifiedPlaceRows = useMemo(() => {
    const query = placeQuery.trim().toLocaleLowerCase("ko-KR");
    return allUnifiedPlaceRows.filter((row) => !query || `${row.name} ${row.address} ${row.area}`.toLocaleLowerCase("ko-KR").includes(query));
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
    const recommended = row.category === "landmark" || setting?.recommended === true || (!setting && /추천|우선/.test(row.place?.priority ?? ""));
    const recommendationMatches = recommendationFilter === "all" || (recommendationFilter === "recommended" ? recommended : !recommended);
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

  useEffect(() => {
    if (publicLayoutAccess !== "viewer") return;
    const timer = window.setInterval(() => setReviewBadgeNow(Date.now()), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [publicLayoutAccess]);

  // 이하는 화면 좌표를 지도 좌표로 바꾸고 선택된 장소 정보를 동기화하는 코드입니다.
  const clientToMap = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return {
      x: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }, []);

  const syncReviewedPlaceRequestLocation = useCallback(async (placeRequestId: string, x: number, y: number) => {
    try {
      const response = await fetch(PLACE_REGISTRATION_REQUESTS_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: placeRequestId, action: "move-marker", markerX: x, markerY: y }),
      });
      const payload = await response.json().catch(() => null) as PlaceRegistrationRequestsPayload | null;
      if (!response.ok || !payload?.request) return;
      setPlaceRequests((current) => current.map((request) => request.id === placeRequestId ? payload.request! : request));
    } catch {
      // The editor document and device recovery copy still retain the position.
    }
  }, [setPlaceRequests]);

  const updatePlaceStoryPhoto = useCallback((file: File | null) => {
    setPlaceStoryPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
    setPlaceStoryPhoto(file);
  }, []);

  const retainPlaceStoryPhoto = useCallback(async (sourceFile: File | null) => {
    if (!sourceFile) return;
    const token = placeStoryPhotoRetainTokenRef.current + 1;
    placeStoryPhotoRetainTokenRef.current = token;
    setPlaceStoryPhotoRetaining(true);
    try {
      if (sourceFile.size > STORY_PHOTO_MAX_SOURCE_BYTES) throw new Error("photo-source-too-large");
      const bytes = await sourceFile.arrayBuffer();
      if (!bytes.byteLength) throw new Error("photo-read-failed");
      if (placeStoryPhotoRetainTokenRef.current !== token) return;
      const retainedFile = new File([bytes], sourceFile.name || `wondosim-photo-${Date.now()}`, {
        type: sourceFile.type,
        lastModified: sourceFile.lastModified || Date.now(),
      });
      updatePlaceStoryPhoto(retainedFile);
      setToast("선택한 사진을 후기 등록 전까지 앱의 임시 메모리에 보관합니다.");
    } catch (error) {
      if (placeStoryPhotoRetainTokenRef.current !== token) return;
      updatePlaceStoryPhoto(null);
      const errorCode = error instanceof Error && error.message === "photo-source-too-large" ? "photo-source-too-large" : "photo-read-failed";
      const storyKey = selectedStoryKeyRef.current;
      const diagnosticReference = storyKey ? await sendPlaceStoryUploadDiagnostic({
        placeKey: storyKey,
        stage: "prepare",
        errorCode,
        responseStatus: 0,
        sourceFile,
        preparedFile: null,
      }) : null;
      const diagnosticSuffix = diagnosticReference ? ` · 오류 ID ${diagnosticReference}` : "";
      setToast((errorCode === "photo-source-too-large"
        ? "원본 사진이 30MB를 넘습니다. 더 작은 사진을 선택해 주세요."
        : "선택한 사진을 앱의 임시 메모리로 가져오지 못했습니다. 사진 접근을 다시 허용해 선택해 주세요.") + diagnosticSuffix);
    } finally {
      if (placeStoryPhotoRetainTokenRef.current === token) setPlaceStoryPhotoRetaining(false);
    }
  }, [updatePlaceStoryPhoto]);

  const updatePlaceEventPhoto = useCallback((file: File | null) => {
    setPlaceEventPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
    setPlaceEventPhoto(file);
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

  const selectUiTheme = useCallback((theme: UiThemeId) => {
    setUiTheme(theme);
    try {
      window.localStorage.setItem(UI_THEME_STORAGE_KEY, theme);
    } catch {
      // 테마 선택은 저장소가 차단된 환경에서도 현재 화면에 바로 적용합니다.
    }
  }, []);

  useEffect(() => {
    if (!expandedAdditionalCategoryItemId) return;
    const closeAdditionalCategoryPopover = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".public-place-additional-category")) return;
      setExpandedAdditionalCategoryItemId(null);
    };
    document.addEventListener("pointerdown", closeAdditionalCategoryPopover, true);
    return () => document.removeEventListener("pointerdown", closeAdditionalCategoryPopover, true);
  }, [expandedAdditionalCategoryItemId, setExpandedAdditionalCategoryItemId]);

  useEffect(() => {
    let restoreFrame = 0;
    try {
      const savedTheme = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
      if (isUiThemeId(savedTheme)) restoreFrame = window.requestAnimationFrame(() => setUiTheme(savedTheme));
    } catch {
      // 스토리지 사용이 불가능하면 기본 테마를 유지합니다.
    }
    return () => window.cancelAnimationFrame(restoreFrame);
  }, []);

  const togglePlaceEventMapSelection = useCallback((elementId: string) => {
    const element = elementsRef.current.find((item) => item.id === elementId && item.mapVisible);
    if (!element) return;
    const place = { placeKey: placeContentKey(element), placeName: element.name };
    setPlaceEventPlaces((current) => {
      if (current.some((item) => item.placeKey === place.placeKey)) return current.length > 1 ? current.filter((item) => item.placeKey !== place.placeKey) : current;
      if (current.length >= 20) {
        setToast("한 행사에는 장소를 최대 20곳까지 지정할 수 있습니다.");
        return current;
      }
      return [...current, place];
    });
  }, [setPlaceEventPlaces]);

  useEffect(() => {
    const previousKey = placeStoryDraftKeyRef.current;
    if (previousKey && previousKey !== selectedStoryKey) writePlaceStoryDraft(previousKey, placeStoryTextRef.current);
    placeStoryDraftKeyRef.current = selectedStoryKey;
    const nextDraft = readPlaceStoryDraft(selectedStoryKey);
    placeStoryTextRef.current = nextDraft;
    const timer = window.setTimeout(() => setPlaceStoryText(nextDraft), 0);
    return () => window.clearTimeout(timer);
  }, [selectedStoryKey]);

  useEffect(() => {
    placeStoryTextRef.current = placeStoryText;
    const draftKey = selectedStoryKey;
    const timer = window.setTimeout(() => writePlaceStoryDraft(draftKey, placeStoryText), 180);
    return () => {
      window.clearTimeout(timer);
      writePlaceStoryDraft(draftKey, placeStoryText);
    };
  }, [placeStoryText, selectedStoryKey]);

  useEffect(() => {
    const run = ++storyRequestRunRef.current;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!selectedStoryKey || publicLayoutAccess !== "viewer") {
        setPlaceStories([]);
        setPlaceStoriesCanModerate(false);
        setPlaceStoriesLoading(false);
        setPlaceStoriesLoadedKey(null);
        return null;
      }
      const requestKey = selectedStoryKey;
      setPlaceStoriesLoading(true);
      setPlaceStoriesLoadedKey(null);
      setPlaceStories([]);
      setPlaceStoryFormOpen(false);
      updatePlaceStoryPhoto(null);
      return fetch(`${PLACE_STORIES_API}?placeKey=${encodeURIComponent(selectedStoryKey)}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json().catch(() => null) as PlaceStoriesPayload | null;
          if (!response.ok && response.status !== 503) throw new Error(payload?.error ?? "story load failed");
          return payload;
        })
        .then((payload) => {
          if (storyRequestRunRef.current !== run) return;
          setPlaceStories(Array.isArray(payload?.stories) ? payload.stories : []);
          setPlaceStoriesCanModerate(Boolean(payload?.canModerate));
        })
        .catch((error) => {
          if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError") || storyRequestRunRef.current !== run) return;
          setPlaceStories([]);
          setPlaceStoriesCanModerate(false);
        })
        .finally(() => {
          if (!controller.signal.aborted && storyRequestRunRef.current === run) {
            setPlaceStoriesLoading(false);
            setPlaceStoriesLoadedKey(requestKey);
          }
        });
    });
    return () => controller.abort();
  }, [publicLayoutAccess, selectedStoryKey, updatePlaceStoryPhoto]);

  useEffect(() => {
    const run = ++eventRequestRunRef.current;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!selectedStoryKey || publicLayoutAccess !== "viewer") {
        setPlaceEvents([]);
        setPlaceEventsCanManage(false);
        setPlaceEventsLoading(false);
        setPlaceEventsLoadedKey(null);
        return null;
      }
      const requestKey = selectedStoryKey;
      setPlaceEventsLoading(true);
      setPlaceEventsLoadedKey(null);
      setPlaceEvents([]);
      setPlaceEventFormOpen(false);
      setPlaceEventEditingId(null);
      setPlaceEventNoPlace(false);
      setPlaceEventMultiPlace(false);
      setPlaceEventPlaces([]);
      setPlaceEventName("");
      setPlaceEventInfo("");
      setPlaceEventExistingPhotoUrl(null);
      updatePlaceEventPhoto(null);
      return fetch(`${PLACE_EVENTS_API}?placeKey=${encodeURIComponent(selectedStoryKey)}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json().catch(() => null) as PlaceEventsPayload | null;
          if (!response.ok && response.status !== 503) throw new Error(payload?.error ?? "event load failed");
          return payload;
        })
        .then((payload) => {
          if (eventRequestRunRef.current !== run) return;
          setPlaceEvents(Array.isArray(payload?.events) ? payload.events : []);
          setPlaceEventsCanManage(Boolean(payload?.canManage));
        })
        .catch((error) => {
          if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError") || eventRequestRunRef.current !== run) return;
          setPlaceEvents([]);
          setPlaceEventsCanManage(false);
        })
        .finally(() => {
          if (!controller.signal.aborted && eventRequestRunRef.current === run) {
            setPlaceEventsLoading(false);
            setPlaceEventsLoadedKey(requestKey);
          }
        });
    });
    return () => controller.abort();
  }, [placeEventsRefreshKey, publicLayoutAccess, selectedStoryKey, updatePlaceEventPhoto]);

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

  const baseMapViewportWidth = viewportDimensions.width > 0
    ? viewportDimensions.width
    : typeof window !== "undefined"
      ? window.innerWidth
      : 0;
  const lowTierMobileBaseMap = publicLayoutAccess === "viewer"
    && mobileRenderBudget.tier === "low"
    && baseMapViewportWidth > 0
    && baseMapViewportWidth <= 760;
  const useMobileLandmarkAssets = publicLayoutAccess === "viewer" && publicAssetProfile === "mobile";
  const highResolutionBaseMapSource = uploadedBaseMap?.screen4096Url ?? "";
  const compactBaseMapPreferred = lowTierMobileBaseMap
    && (!highResolutionBaseMapSource || decodedHighResolutionBaseMapSource !== highResolutionBaseMapSource);
  const activeBaseMapSrc = baseMap === "svg"
    ? MAP_SVG
    : baseMap === "png"
      ? MAP_PNG
      : uploadedBaseMapDisplaySource(uploadedBaseMap, compactBaseMapPreferred) || MAP_SVG;
  const lowTierBaseMapUpgradeNeeded = baseMap === "uploaded"
    && lowTierMobileBaseMap
    && Boolean(highResolutionBaseMapSource)
    && decodedHighResolutionBaseMapSource !== highResolutionBaseMapSource
    && stageDimensions.width <= 1600
    && lowTierBaseMapNeedsHighResolution({
      tier: mobileRenderBudget.tier,
      viewportWidth: baseMapViewportWidth,
      stageWidth: stageDimensions.width,
      zoom,
      devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
    });

  useEffect(() => {
    if (!lowTierBaseMapUpgradeNeeded || !highResolutionBaseMapSource) return;
    let cancelled = false;
    let finished = false;
    const image = new Image();
    const finish = async () => {
      if (finished) return;
      finished = true;
      try {
        await image.decode();
      } catch {
        // A completed image can still be reused when explicit decode is unavailable.
      }
      if (!cancelled) setDecodedHighResolutionBaseMapSource(highResolutionBaseMapSource);
    };
    image.decoding = "async";
    image.fetchPriority = "low";
    image.onload = () => { void finish(); };
    image.onerror = () => { finished = true; };
    image.src = highResolutionBaseMapSource;
    if (image.complete && image.naturalWidth > 0) void finish();
    return () => { cancelled = true; };
  }, [decodedHighResolutionBaseMapSource, highResolutionBaseMapSource, lowTierBaseMapUpgradeNeeded]);

  useEffect(() => {
    const image = baseMapImgRef.current;
    if (image?.complete && image.naturalWidth > 0) setMapLoaded(true);
  }, [activeBaseMapSrc]);

  useEffect(() => {
    if (publicLayoutAccess === "loading" || !hydrated || startupLoadCompletedRef.current) return;
    let cancelled = false;
    const mapSource = activeBaseMapSrc;
    if (!mapSource) return;
    const primaryHub = visibleElements.find((element) => isPrimaryHubLabel(element.name));
    const primaryHubAsset = primaryHub?.assetId ? assetsById.get(primaryHub.assetId) : undefined;
    const sources = [...new Set([
      JFAC_SIGNATURE_B_SVG,
      mapSource,
      useMobileLandmarkAssets
        ? primaryHubAsset?.mobileSrc ?? primaryHubAsset?.screenSrc ?? primaryHubAsset?.src
        : primaryHubAsset?.screenSrc ?? primaryHubAsset?.src,
    ].filter((source): source is string => Boolean(source)))];
    const preload = (source: string) => new Promise<void>((resolve) => {
      const image = new Image();
      let finished = false;
      let timeout = 0;
      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        if (!cancelled) setStartupLoadDone((current) => current + 1);
        resolve();
      };
      timeout = window.setTimeout(finish, 15000);
      image.decoding = "async";
      image.onload = finish;
      image.onerror = finish;
      image.src = source;
      if (image.complete) finish();
    });

    queueMicrotask(() => {
      if (cancelled) return;
      // Reset before starting preloads. Cached PWA images can complete
      // synchronously, so starting them first could increment to 3 and then be
      // overwritten back to 0 by the delayed reset.
      setStartupLoadDone(0);
      setStartupLoadTotal(sources.length);
      void Promise.all(sources.map(preload)).then(() => {
        if (cancelled) return;
        setStartupLoadDone(sources.length);
        setMapLoaded(true);
        window.requestAnimationFrame(() => {
          if (cancelled) return;
          startupLoadCompletedRef.current = true;
          setStartupAssetsReady(true);
        });
      });
    });
    return () => { cancelled = true; };
  }, [activeBaseMapSrc, assetsById, hydrated, publicAssetProfile, publicLayoutAccess, useMobileLandmarkAssets, viewportDimensions.width, visibleElements]);

  useEffect(() => {
    const stageWrap = stageWrapRef.current;
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    if (!stageWrap || !stage || !viewport) return;
    const measure = () => {
      // The wrapper retains the canonical on-screen base size while the stage
      // itself grows with zoom. Measuring the wrapper prevents zoom from
      // feeding back into fit calculations and coordinate conversion.
      const width = stageWrap.offsetWidth;
      const height = width / MAP_ASPECT;
      const viewportWidth = viewport.clientWidth;
      const viewportHeight = viewport.clientHeight;
      if (width > 0 && height > 0) {
        setStageDimensions((current) => (
          Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
            ? current
            : { width, height }
        ));
      }
      if (viewportWidth > 0 && viewportHeight > 0) {
        setViewportDimensions((current) => (
          Math.abs(current.width - viewportWidth) < 0.5 && Math.abs(current.height - viewportHeight) < 0.5
            ? current
            : { width: viewportWidth, height: viewportHeight }
        ));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stageWrap);
    observer.observe(viewport);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [publicLayoutAccess]);

  useEffect(() => {
    if (viewportDimensions.width <= 0 || viewportDimensions.height <= 0) return;
    const previousFitZoom = fitZoomRef.current;
    const wasAtFit = Math.abs(zoom - previousFitZoom) <= 0.018;
    fitZoomRef.current = fitZoom;
    if (!fitZoomAppliedRef.current || wasAtFit || (publicLayoutAccess === "viewer" && zoom < fitZoom - 0.002)) {
      fitZoomAppliedRef.current = true;
      const frame = window.requestAnimationFrame(() => {
        zoomRef.current = fitZoom;
        setZoom(fitZoom);
        if (publicLayoutAccess === "editor") setEditorMapPan({ x: 0, y: 0 });
        else setMapPan({ x: 0, y: 0 });
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [fitZoom, publicLayoutAccess, setEditorMapPan, setMapPan, viewportDimensions.height, viewportDimensions.width, zoom]);

  useEffect(() => {
    if (
      publicInitialViewAppliedRef.current
      || !hydrated
      || !startupAssetsReady
      || publicLayoutAccess !== "viewer"
      || viewportDimensions.width <= 0
      || viewportDimensions.height <= 0
    ) return;
    const primaryHub = elements.find((element) => isPrimaryHubLabel(element.name) && element.mapVisible);
    if (stageDimensions.width <= 0 || stageDimensions.height <= 0) return;
    if (!primaryHub) {
      publicInitialViewAppliedRef.current = true;
      setStartupInitialViewTarget({ zoom: zoomRef.current, pan: { ...panRef.current } });
      return;
    }

    const compact = viewportDimensions.width <= 760;
    const viewportFillZoom = Math.max(
      viewportDimensions.width / stageDimensions.width,
      viewportDimensions.height / stageDimensions.height,
    );
    const targetZoom = compact
      ? clamp(Math.max(fitZoom * 2.35, viewportFillZoom * 1.28), fitZoom, Math.max(fitZoom, 1.38))
      : clamp(Math.max(fitZoom * 1.32, viewportFillZoom * 1.02), fitZoom, Math.max(fitZoom, 1.32));
    const desiredScreen = compact
      ? { x: viewportDimensions.width * 0.5, y: viewportDimensions.height * 0.48 }
      : { x: viewportDimensions.width * 0.52, y: viewportDimensions.height * 0.48 };
    const rawPan = {
      x: desiredScreen.x - viewportDimensions.width / 2
        - ((primaryHub.x - 50) / 100) * stageDimensions.width * targetZoom,
      y: desiredScreen.y - viewportDimensions.height / 2
        - ((primaryHub.y - 50) / 100) * stageDimensions.height * targetZoom,
    };
    const horizontalTravel = Math.max(0, (stageDimensions.width * targetZoom - viewportDimensions.width) / 2) + viewportDimensions.width * 0.05;
    const verticalTravel = Math.max(0, (stageDimensions.height * targetZoom - viewportDimensions.height) / 2) + viewportDimensions.height * 0.05;
    const targetPan = {
      x: clamp(rawPan.x, -horizontalTravel, horizontalTravel),
      y: clamp(rawPan.y, -verticalTravel, verticalTravel),
    };

    const frame = window.requestAnimationFrame(() => {
      if (publicInitialViewAppliedRef.current) return;
      publicInitialViewAppliedRef.current = true;
      zoomRef.current = targetZoom;
      panRef.current = targetPan;
      setStartupInitialViewTarget({ zoom: targetZoom, pan: targetPan });
      setZoom(targetZoom);
      setMapPan(targetPan);
      setMapRenderPan(targetPan);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [elements, fitZoom, hydrated, publicLayoutAccess, setMapPan, stageDimensions.height, stageDimensions.width, startupAssetsReady, viewportDimensions.height, viewportDimensions.width]);

  useLayoutEffect(() => {
    if (
      publicLayoutAccess !== "viewer"
      || !startupAssetsReady
      || !startupInitialViewTarget
      || startupInitialViewReady
      || Math.abs(zoom - startupInitialViewTarget.zoom) > 0.002
      || Math.abs(settledLabelZoom - startupInitialViewTarget.zoom) > 0.002
    ) return;
    const target = startupInitialViewTarget;
    panRef.current = target.pan;
    setMapPan(target.pan);
    const stage = stageRef.current;
    const stageWrap = stageWrapRef.current;
    if (!stage || !stageWrap || stageWrap.offsetWidth <= 0) return;
    // Mobile PWA viewport changes can leave a percentage width one layout frame
    // behind the target state. Apply the already calculated target directly so
    // the loading overlay cannot wait forever on a stale rounded measurement.
    setMapLayoutZoom(target.zoom);
    let settledFrame = 0;
    const committedFrame = window.requestAnimationFrame(() => {
      setMapPan(target.pan);
      setMapLayoutZoom(target.zoom);
      settledFrame = window.requestAnimationFrame(() => {
        // The target width and pan have now been painted for two frames. A
        // second integer pixel comparison is redundant and can deadlock on
        // mobile device-pixel rounding even though the view is already correct.
        setStartupInitialViewReady(true);
      });
    });
    return () => {
      window.cancelAnimationFrame(committedFrame);
      if (settledFrame) window.cancelAnimationFrame(settledFrame);
    };
  }, [publicLayoutAccess, setMapLayoutZoom, setMapPan, settledLabelZoom, startupAssetsReady, startupInitialViewReady, startupInitialViewTarget, zoom]);

  useEffect(() => {
    if (publicLayoutAccess !== "editor" || !startupAssetsReady) return;
    const readyFrame = window.requestAnimationFrame(() => setStartupInitialViewReady(true));
    return () => window.cancelAnimationFrame(readyFrame);
  }, [publicLayoutAccess, startupAssetsReady]);

  useEffect(() => {
    if (publicLayoutAccess === "loading" || !startupAssetsReady || !startupInitialViewReady) return;
    const readyFrame = window.requestAnimationFrame(() => setStartupRevealReady(true));
    return () => window.cancelAnimationFrame(readyFrame);
  }, [publicLayoutAccess, startupAssetsReady, startupInitialViewReady]);

  useEffect(() => {
    if (publicLayoutAccess !== "viewer" || !startupRevealReady || performanceStartupSentRef.current) return;
    performanceStartupSentRef.current = true;
    const completedAt = performance.now();
    const timer = window.setTimeout(() => sendPerformanceDiagnostic({
      metric: "startup",
      durationMs: completedAt - performanceStartedAtRef.current,
      elementCount: visibleElements.length,
      labelCount: stageLabelElements.length,
      viewportWidth: viewportDimensions.width,
      viewportHeight: viewportDimensions.height,
    }), 0);
    return () => window.clearTimeout(timer);
  }, [publicLayoutAccess, stageLabelElements.length, startupRevealReady, viewportDimensions.height, viewportDimensions.width, visibleElements.length]);

  useEffect(() => {
    if (printPreviewMode) return;
    const timer = window.setTimeout(() => {
      setForceIndividualLabels((current) => current ? labelDetailRatio >= 2.45 : labelDetailRatio >= 2.7);
    }, 90);
    return () => window.clearTimeout(timer);
  }, [labelDetailRatio, printPreviewMode]);

  useEffect(() => {
    if (publicLayoutAccess !== "viewer") {
      const timer = window.setTimeout(() => {
        startTransition(() => {
          setSettledLabelZoom(zoom);
          setSettledLabelPan((current) => (
            current.x === mapRenderPan.x && current.y === mapRenderPan.y
              ? current
              : { x: mapRenderPan.x, y: mapRenderPan.y }
          ));
        });
      }, 140);
      return () => window.clearTimeout(timer);
    }

    const labelFrame = window.requestAnimationFrame(() => {
      setSettledLabelZoom(zoom);
      setSettledLabelPan((current) => (
        current.x === mapRenderPan.x && current.y === mapRenderPan.y
          ? current
          : { x: mapRenderPan.x, y: mapRenderPan.y }
      ));
    });
    return () => window.cancelAnimationFrame(labelFrame);
  }, [mapRenderPan.x, mapRenderPan.y, publicLayoutAccess, zoom]);

  useEffect(() => {
    calibrationLiveApplyRef.current = calibrationLiveApply;
  }, [calibrationLiveApply]);

  // 이하는 모바일 드래그·핀치와 지도 확대·이동을 처리하는 코드입니다.
  const {
    activeTouchPointersRef,
    pinchGestureRef,
    panInteractionRef,
    queueTouchMapTransform,
    scheduleTouchLayerRelease,
    beginTouchMapTransform,
    commitTouchMapTransform,
    beginPinchGesture,
    handleWheel,
    commitPendingWheelTransform,
    finishProgrammaticMapFocus,
    startProgrammaticMapFocus,
  } = useMapTransformController({
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

  const recordMapSettle = useCallback((metric: "pan-settle" | "pinch-settle") => {
    if (publicLayoutAccess !== "viewer") return;
    const startedAt = performance.now();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const durationMs = performance.now() - startedAt;
      if (viewportDimensions.width > 0 && viewportDimensions.width <= 760) {
        if (durationMs >= 80) mobileSlowSettleSamplesRef.current = Math.min(2, mobileSlowSettleSamplesRef.current + 1);
        else if (durationMs <= 50) mobileSlowSettleSamplesRef.current = Math.max(0, mobileSlowSettleSamplesRef.current - 1);
        if (mobileSlowSettleSamplesRef.current >= 2) {
          setMobileRenderBudget((current) => current.tier === "low" ? current : LOW_MOBILE_RENDER_BUDGET);
        }
      }
      const sampleKey = metric === "pinch-settle" ? "pinch" : "pan";
      const sampleNumber = performanceSettleSamplesRef.current[sampleKey] + 1;
      performanceSettleSamplesRef.current[sampleKey] = sampleNumber;
      if (!shouldSendMapSettleDiagnostic(sampleNumber, durationMs)) return;
      sendPerformanceDiagnostic({
        metric,
        durationMs,
        elementCount: visibleElements.length,
        labelCount: stageLabelElements.length,
        viewportWidth: viewportDimensions.width,
        viewportHeight: viewportDimensions.height,
      });
    }));
  }, [publicLayoutAccess, stageLabelElements.length, viewportDimensions.height, viewportDimensions.width, visibleElements.length]);

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

  useEffect(() => {
    let moveFrame: number | null = null;
    let pendingMove: { clientX: number; clientY: number } | null = null;
    const applyMove = ({ clientX, clientY }: { clientX: number; clientY: number }) => {
      const panInteraction = panInteractionRef.current;
      if (panInteraction) {
        queueTouchMapTransform(zoomRef.current, {
          x: panInteraction.panX + clientX - panInteraction.startX,
          y: panInteraction.panY + clientY - panInteraction.startY,
        });
        return;
      }
      if (!interaction) return;
      if (interaction.type === "pan") {
        setEditorMapPan({
          x: interaction.panX + clientX - interaction.startX,
          y: interaction.panY + clientY - interaction.startY,
        });
        return;
      }
      if (interaction.type === "label") {
        updateElement(interaction.id, {
          labelOffsetX: clamp(interaction.offsetX + (clientX - interaction.startX) / Math.max(fitZoom, 0.22), -240, 240),
          labelOffsetY: clamp(interaction.offsetY + (clientY - interaction.startY) / Math.max(fitZoom, 0.22), -240, 240),
        }, false);
        return;
      }
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const deltaX = ((clientX - interaction.startX) / rect.width) * 100;
      if (interaction.type === "resize") {
        updateElement(interaction.id, { size: clamp(interaction.startSize + deltaX * 2, 0.8, 15) }, false);
        return;
      }
      const deltaY = ((clientY - interaction.startY) / rect.height) * 100;
      if (interaction.type === "dense-label") {
        updateDenseLabelPosition(
          interaction.key,
          interaction.elementIds,
          clamp(interaction.x + deltaX, interaction.halfWidth, 100 - interaction.halfWidth),
          clamp(interaction.y + deltaY, interaction.halfHeight, 100 - interaction.halfHeight),
        );
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
    const flushMove = () => {
      if (moveFrame !== null) {
        window.cancelAnimationFrame(moveFrame);
        moveFrame = null;
      }
      const next = pendingMove;
      pendingMove = null;
      if (next) applyMove(next);
    };
    const handleMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" && activeTouchPointersRef.current.has(event.pointerId)) {
        activeTouchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
        const pinch = pinchGestureRef.current;
        if (pinch) {
          const first = activeTouchPointersRef.current.get(pinch.pointerIds[0]);
          const second = activeTouchPointersRef.current.get(pinch.pointerIds[1]);
          const viewport = viewportRef.current?.getBoundingClientRect();
          if (first && second && viewport) {
            event.preventDefault();
            const distance = Math.max(12, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY));
            const centerX = (first.clientX + second.clientX) / 2 - viewport.left - viewport.width / 2;
            const centerY = (first.clientY + second.clientY) / 2 - viewport.top - viewport.height / 2;
            const rawZoom = clamp(pinch.startZoom * distance / pinch.startDistance, fitZoom, 4);
            const ratio = rawZoom / Math.max(pinch.startZoom, 0.01);
            const rawPan = {
              x: centerX - (pinch.startCenterX - pinch.startPanX) * ratio,
              y: centerY - (pinch.startCenterY - pinch.startPanY) * ratio,
            };
            // Touch coordinates can alternate by a fraction of a pixel even when
            // both fingers appear stationary. A light low-pass filter keeps the
            // map and every marker on one visual trajectory without changing the
            // settled layout or raster quality.
            const nextZoom = zoomRef.current + (rawZoom - zoomRef.current) * 0.82;
            const nextPan = {
              x: panRef.current.x + (rawPan.x - panRef.current.x) * 0.82,
              y: panRef.current.y + (rawPan.y - panRef.current.y) * 0.82,
            };
            queueTouchMapTransform(nextZoom, nextPan);
          }
          return;
        }
      }
      if (!interaction && !panInteractionRef.current) return;
      pendingMove = { clientX: event.clientX, clientY: event.clientY };
      if (moveFrame !== null) return;
      moveFrame = window.requestAnimationFrame(() => {
        moveFrame = null;
        const next = pendingMove;
        pendingMove = null;
        if (next) applyMove(next);
      });
    };
    const handleUp = (event: PointerEvent) => {
      const trackedTouch = event.pointerType === "touch" && activeTouchPointersRef.current.has(event.pointerId);
      const pinch = pinchGestureRef.current;
      if (trackedTouch) activeTouchPointersRef.current.delete(event.pointerId);
      if (pinch && pinch.pointerIds.includes(event.pointerId)) {
        pinchGestureRef.current = null;
        commitTouchMapTransform();
        recordMapSettle("pinch-settle");
        const remaining = activeTouchPointersRef.current.values().next().value as { clientX: number; clientY: number } | undefined;
        if (remaining) {
          panInteractionRef.current = {
            startX: remaining.clientX,
            startY: remaining.clientY,
            panX: panRef.current.x,
            panY: panRef.current.y,
          };
          viewportRef.current?.classList.add("is-panning");
        } else {
          panInteractionRef.current = null;
          viewportRef.current?.classList.remove("is-panning");
          setInteraction(null);
        }
        return;
      }
      if (trackedTouch && pinch) return;
      flushMove();
      const panInteraction = panInteractionRef.current;
      if (panInteraction) {
        commitTouchMapTransform();
        recordMapSettle("pan-settle");
      }
      if (panInteraction?.pendingPublicPlaceId) {
        const moved = Math.hypot(event.clientX - panInteraction.startX, event.clientY - panInteraction.startY);
        if (moved <= 6) {
          if (placeEventFormOpen && !placeEventNoPlace && placeEventMultiPlace) {
            togglePlaceEventMapSelection(panInteraction.pendingPublicPlaceId);
          } else {
            selectPublicMarker(panInteraction.pendingPublicPlaceId);
          }
        }
      }
      if (panInteraction?.pendingPlaceRequestLocation) {
        const moved = Math.hypot(event.clientX - panInteraction.startX, event.clientY - panInteraction.startY);
        if (moved <= 6) {
          const point = clientToMap(event.clientX, event.clientY);
          setPlaceRequestLocation({ x: Math.round(point.x * 1000) / 1000, y: Math.round(point.y * 1000) / 1000 });
          setToast("요청할 마커 위치를 지정했습니다. 필요하면 지도를 이동·확대한 뒤 다시 눌러 조정하세요.");
        }
      }
      if (panInteraction) {
        panInteractionRef.current = null;
        viewportRef.current?.classList.remove("is-panning");
        scheduleTouchLayerRelease();
        return;
      }
      if (interaction?.type === "drag") {
        const draggedId = interaction.id;
        window.requestAnimationFrame(() => {
          const element = elementsRef.current.find((item) => item.id === draggedId && item.placeRequestId && !item.directoryId);
          if (element?.placeRequestId) void syncReviewedPlaceRequestLocation(element.placeRequestId, element.x, element.y);
        });
      }
      setInteraction(null);
    };
    const handleCancel = (event: PointerEvent) => {
      if (event.pointerType === "touch") activeTouchPointersRef.current.delete(event.pointerId);
      if (pinchGestureRef.current?.pointerIds.includes(event.pointerId)) pinchGestureRef.current = null;
      pendingMove = null;
      if (moveFrame !== null) window.cancelAnimationFrame(moveFrame);
      moveFrame = null;
      if (panInteractionRef.current || event.pointerType === "touch") commitTouchMapTransform();
      panInteractionRef.current = null;
      viewportRef.current?.classList.remove("is-panning");
      scheduleTouchLayerRelease();
      setInteraction(null);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      if (moveFrame !== null) window.cancelAnimationFrame(moveFrame);
      panInteractionRef.current = null;
      viewportRef.current?.classList.remove("is-panning");
    };
  }, [clientToMap, commitTouchMapTransform, fitZoom, interaction, placeEventFormOpen, placeEventMultiPlace, placeEventNoPlace, queueTouchMapTransform, recordMapSettle, scheduleTouchLayerRelease, selectPublicMarker, setEditorMapPan, syncReviewedPlaceRequestLocation, togglePlaceEventMapSelection, updateCalibrationPoint, updateDenseLabelPosition, updateElement]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const interactiveControl = Boolean(target?.closest("input, textarea, select, button, a, [contenteditable='true']"));
      if (publicLayoutAccess !== "editor" || databaseEditorOpen || publicHistoryOpen || shortcutHelpOpen || placeEventFormOpen || !selectedId || interactiveControl) return;
      const element = elementsRef.current.find((item) => item.id === selectedId);
      if (!element) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (event.repeat) return;
        if (element.locked) {
          updateElement(element.id, { locked: false });
          setCalibrationDirty(true);
          setToast(`${element.name} 좌표 고정을 해제했습니다. 지도에서 삭제하려면 한 번 더 누르세요.`);
          return;
        }
        if (isMainHubPersistenceTarget(element)) {
          setToast("제주소통협력센터는 주요 거점이므로 지도에서 삭제할 수 없습니다.");
          return;
        }
        pushHistory();
        setPlacementOverride(element, "deleted");
        replaceElements((current) => current.filter((item) => item.id !== element.id));
        setSelectedId(null);
        setToast(`${element.name} 마커를 지도 배치에서 삭제했습니다. 통합 장소 DB는 보존됩니다.`);
        return;
      }

      const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const direction = directions[event.key];
      if (!direction) return;
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
  }, [databaseEditorOpen, placeEventFormOpen, publicHistoryOpen, publicLayoutAccess, pushHistory, replaceElements, resourceOutputDragMode, selectedId, setPlacementOverride, shortcutHelpOpen, updateCalibrationPoint, updateElement, updateElementAnchor]);

  // 이하는 관리자 편집의 실행 취소, 다시 실행, 휠·포인터 조작 코드입니다.
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
    handleWheel(event, recordMapSettle);
  };

  const startPan = (event: ReactPointerEvent<HTMLElement>, pendingPublicPlaceId?: string, pendingPlaceRequestLocation = false) => {
    if (event.button !== 0 || memoMode) return;
    event.preventDefault();
    event.stopPropagation();
    commitPendingWheelTransform();
    if (publicLayoutAccess === "editor") {
      setSelectedId(null); setSelectedFacilityId(null); setSelectedNoteId(null); setSelectedDenseLabelId(null);
      setInteraction({
        type: "pan",
        startX: event.clientX,
        startY: event.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
      });
      return;
    }
    if (event.pointerType === "touch") {
      event.currentTarget.setPointerCapture(event.pointerId);
      activeTouchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
      if (activeTouchPointersRef.current.size >= 2 && beginPinchGesture()) return;
    }
    if (!pendingPublicPlaceId) {
      if (publicLayoutAccess === "viewer" && selected) {
        if (!confirmDiscardStoryPhoto()) return;
        const current = (window.history.state ?? {}) as PublicHistoryState;
        if (publicPanelIsPlace(current.wondosimPanel)) window.history.back();
        else {
          setSelectedId(null); setSelectedFacilityId(null); setPublicPlaceExpanded(false);
        }
        return;
      }
      setSelectedId(null); setSelectedFacilityId(null); setSelectedNoteId(null); setSelectedDenseLabelId(null);
    }
    beginTouchMapTransform();
    panInteractionRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
      pendingPublicPlaceId,
      pendingPlaceRequestLocation,
    };
    viewportRef.current?.classList.add("is-panning");
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
    startPan(event, undefined, placeRequestPickingLocation && publicLayoutAccess === "viewer");
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
    const renderScale = denseLabelRenderScale(zoom, stageDimensions, true);
    setInteraction({
      type: "dense-label",
      key: cluster.id,
      elementIds: cluster.elementIds,
      startX: event.clientX,
      startY: event.clientY,
      x: cluster.x,
      y: cluster.y,
      halfWidth: cluster.width / 2 * renderScale.x,
      halfHeight: cluster.height / 2 * renderScale.y,
    });
  };

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>, element: MapElement) => {
    event.stopPropagation();
    pushHistory();
    setInteraction({ type: "resize", id: element.id, startX: event.clientX, startSize: element.size });
  };

  const focusMapPosition = (
    x: number,
    y: number,
    elementId: string,
    focusOptions: { publicNavigation?: boolean; showDetails?: boolean } = {},
  ) => {
    const stageRect = stageRef.current?.getBoundingClientRect();
    const viewport = viewportRef.current?.getBoundingClientRect();
    const viewportWidth = viewport?.width ?? viewportDimensions.width;
    const viewportHeight = viewport?.height ?? viewportDimensions.height;
    const compact = viewportWidth <= 760;
    const currentZoom = zoomRef.current;
    const unscaledWidth = stageRect
      ? stageRect.width / Math.max(currentZoom, 0.01)
      : stageDimensions.width;
    const unscaledHeight = stageRect
      ? stageRect.height / Math.max(currentZoom, 0.01)
      : stageDimensions.height;
    if (publicLayoutAccess === "editor") {
      const targetZoom = 1.55;
      const targetPan = unscaledWidth > 0 && unscaledHeight > 0
        ? {
            x: -((x - 50) / 100) * unscaledWidth * targetZoom,
            y: -((y - 50) / 100) * unscaledHeight * targetZoom,
          }
        : panRef.current;
      finishProgrammaticMapFocus();
      zoomRef.current = targetZoom;
      setEditorMapPan(targetPan);
      setZoom(targetZoom);
      setFocusPulseId(elementId);
      window.setTimeout(() => setFocusPulseId((current) => current === elementId ? null : current), 1300);
      return;
    }
    const targetZoom = focusOptions.publicNavigation
      ? publicPlaceFocusZoom({
        fitZoom,
        viewportWidth,
        viewportHeight,
        stageWidth: unscaledWidth,
        stageHeight: unscaledHeight,
      })
      : compact
        ? clamp(Math.max(currentZoom, fitZoom * 1.8), fitZoom, Math.max(fitZoom, 1.16))
        : clamp(Math.max(currentZoom, fitZoom * 1.38), fitZoom, Math.max(fitZoom, 1.42));
    let targetPan = panRef.current;
    if (unscaledWidth > 0 && unscaledHeight > 0) {
      const horizontalSafeOffset = compact
        ? 0
        : focusOptions.publicNavigation
          ? -Math.min(195, viewportWidth * 0.2)
          : globalStoriesOpen
            ? Math.min(215, viewportWidth * 0.22)
            : selected
              ? -Math.min(195, viewportWidth * 0.2)
              : 0;
      const verticalSafeOffset = compact && focusOptions.publicNavigation
        ? -viewportHeight * (focusOptions.showDetails ? 0.26 : 0.18)
        : compact && (globalStoriesOpen || selected)
          ? -viewportHeight * (publicPanelExpanded || publicPlaceExpanded ? 0.26 : 0.18)
          : 0;
      const rawPan = {
        x: horizontalSafeOffset - ((x - 50) / 100) * unscaledWidth * targetZoom,
        y: verticalSafeOffset - ((y - 50) / 100) * unscaledHeight * targetZoom,
      };
      const horizontalTravel = Math.max(0, (unscaledWidth * targetZoom - viewportWidth) / 2) + viewportWidth * 0.3;
      const verticalTravel = Math.max(0, (unscaledHeight * targetZoom - viewportHeight) / 2) + viewportHeight * 0.3;
      targetPan = {
        x: clamp(rawPan.x, -horizontalTravel, horizontalTravel),
        y: clamp(rawPan.y, -verticalTravel, verticalTravel),
      };
    }
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    startProgrammaticMapFocus({ zoom: targetZoom, pan: targetPan }, viewportWidth, Boolean(reduceMotion));
    setFocusPulseId(elementId);
    window.setTimeout(() => setFocusPulseId((current) => current === elementId ? null : current), reduceMotion ? 80 : 900);
  };

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
      const displaySize = mapElementDisplaySize(element);
      const elementHeight = displaySize * MAP_ASPECT / 1.12;
      return { id: element.id, category: element.category, rect: {
        left: element.x + (leftFactor - 0.5) * displaySize,
        right: element.x + (rightFactor - 0.5) * displaySize,
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
      const labelWidth = measuredLabel?.width ?? clamp((characterCount * 0.66 + 0.55) / Math.max(zoom, 0.22), 2, 26);
      const labelHeight = measuredLabel?.height ?? 1.3 / Math.max(zoom, 0.22);
      const displaySize = mapElementDisplaySize(element);
      const elementHeight = displaySize * MAP_ASPECT / 1.12;
      const visualRect = {
        left: element.x + (leftFactor - 0.5) * displaySize,
        right: element.x + (rightFactor - 0.5) * displaySize,
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
    pushHistory();
    replaceDenseLabelPositions(() => []);
    setSelectedDenseLabelId(null);
    window.requestAnimationFrame(() => {
      autoArrangeLabels(false, true);
    });
  };

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

  useEffect(() => {
    adminShortcutActionsRef.current = {
      saveDraft: () => { void saveEditorDraft(); },
      undo,
      redo,
    };
  });

  useEffect(() => {
    const handleAdminShortcut = (event: KeyboardEvent) => {
      if (publicLayoutAccess !== "editor") return;

      const target = event.target as HTMLElement | null;
      const editingText = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const blockingDialogOpen = adminLoginOpen || placeRequestFormOpen || placeEventFormOpen || databaseEditorOpen || publicHistoryOpen;

      if (modifier && !event.altKey && !event.shiftKey && key === "s") {
        event.preventDefault();
        if (!editorDraftSaving) adminShortcutActionsRef.current.saveDraft();
        return;
      }

      if (!editingText && !modifier && !event.altKey && event.key === "?" && !blockingDialogOpen) {
        event.preventDefault();
        setShortcutHelpOpen((current) => !current);
        return;
      }

      if (shortcutHelpOpen) return;

      if (databaseEditorOpen) {
        if (!editingText && !modifier && !event.altKey && !event.shiftKey && event.key === "/") {
          event.preventDefault();
          databaseEditorQueryInputRef.current?.focus();
        }
        return;
      }

      if (adminLoginOpen || placeRequestFormOpen || placeEventFormOpen) return;

      if (modifier && !event.altKey && key === "z" && !editingText) {
        event.preventDefault();
        if (event.shiftKey) adminShortcutActionsRef.current.redo();
        else adminShortcutActionsRef.current.undo();
        return;
      }

      if (!editingText && !modifier && !event.altKey && !event.shiftKey && event.key === "/") {
        event.preventDefault();
        setLeftOpen(true);
        setLeftPanelMode("places");
        setCalibrationMode(false);
        window.requestAnimationFrame(() => {
          leftPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          window.requestAnimationFrame(() => placeQueryInputRef.current?.focus());
        });
      }
    };

    window.addEventListener("keydown", handleAdminShortcut);
    return () => window.removeEventListener("keydown", handleAdminShortcut);
  }, [adminLoginOpen, databaseEditorOpen, editorDraftSaving, placeEventFormOpen, placeRequestFormOpen, publicHistoryOpen, publicLayoutAccess, shortcutHelpOpen]);

  // 방문 후기·사진 신고와 관리자 진단 변경은 콘텐츠 작업공간에서 조립합니다.
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
  } = usePlaceStoryActions({
    selected,
    selectedDirectoryPlace,
    selectedStoryKey,
    placeStoryFormOpen,
    placeStoryAuthor,
    placeStoryText,
    placeStoryPhoto,
    placeStorySubmitting,
    storyCameraPermission,
    storyReportTarget,
    storyReportReason,
    storyReportDetail,
    storyReportSubmitting,
    reportedStoryIds,
    placeStoryActionId,
    uploadDiagnosticActionId,
    performanceDiagnosticActionId,
    uploadDiagnostics,
    performanceDiagnostics,
    placeStoryTextRef,
    updatePlaceStoryPhoto,
    setPlaceStoryFormOpen,
    setPlaceStoryAuthor,
    setPlaceStoryText,
    setPlaceStorySubmitting,
    setStoryCameraPermission,
    setPlaceStories,
    setReviewCountsByPlace,
    setGlobalStoriesPage,
    setGlobalStoriesRefreshKey,
    setStoryReportTarget,
    setStoryReportReason,
    setStoryReportDetail,
    setStoryReportSubmitting,
    setReportedStoryIds,
    setPlaceStoryActionId,
    setGlobalStories,
    setUploadDiagnosticActionId,
    setUploadDiagnostics,
    setPerformanceDiagnosticActionId,
    setPerformanceDiagnostics,
    setToast,
  });

  // 행사 관리와 장소 등록 요청 검수는 콘텐츠 작업공간에서 조립합니다.
  const {
    closePlaceEventForm,
    openUnassignedPlaceEventForm,
    editPlaceEvent,
    startPlaceEventDialogDrag,
    movePlaceEventDialog,
    endPlaceEventDialogDrag,
    submitPlaceEvent,
    moderatePlaceEvent,
    deletePlaceEvent,
    submitPlaceRegistrationRequest,
    updatePlaceRequestDraft,
    savePlaceRequestEdits,
    startPlaceRequestReview,
    approvePlaceRequest,
    rejectPlaceRequest,
    deletePlaceRequest,
  } = usePlaceEventRequestActions({
    placeEventEditingId,
    placeEventNoPlace,
    placeEventPlaces,
    placeEventDialogOffset,
    placeEventName,
    placeEventInfo,
    placeEventStartsAt,
    placeEventEndsAt,
    placeEventVisibleFrom,
    placeEventVisibleUntil,
    placeEventPhoto,
    placeEventSubmitting,
    placeEventActionId,
    placeRequestSubmitting,
    placeRequestName,
    placeRequestArea,
    placeRequestAddress,
    placeRequestDescription,
    placeRequestCategory,
    placeRequestMarkerStyle,
    placeRequestLocation,
    placeRequestActionId,
    markerGroupSize,
    selectedId,
    elementsRef,
    updatePlaceEventPhoto,
    mergeDirectoryRecords,
    replaceElements,
    replaceDirectoryPlaces,
    pushHistory,
    focusMapPosition,
    setPlaceEventFormOpen,
    setPlaceEventEditingId,
    setPlaceEventNoPlace,
    setPlaceEventMultiPlace,
    setPlaceEventPlaces,
    setPlaceEventName,
    setPlaceEventInfo,
    setPlaceEventStartsAt,
    setPlaceEventEndsAt,
    setPlaceEventVisibleFrom,
    setPlaceEventVisibleUntil,
    setPlaceEventExistingPhotoUrl,
    setPlaceEventDialogOffset,
    setPlaceEventSubmitting,
    setPlaceEventActionId,
    setPlaceEvents,
    setPlaceEventsRefreshKey,
    setGlobalEvents,
    setGlobalEventsPage,
    setGlobalEventsRefreshKey,
    setPlaceRequestSubmitting,
    setPlaceRequestName,
    setPlaceRequestArea,
    setPlaceRequestAddress,
    setPlaceRequestDescription,
    setPlaceRequestCategory,
    setPlaceRequestMarkerStyle,
    setPlaceRequestLocation,
    setPlaceRequestPickingLocation,
    setPlaceRequestFormOpen,
    setPlaceRequestActionId,
    setPlaceRequests,
    setPlaceRequestsRefreshKey,
    setSelectedId,
    setSelectedNoteId,
    setSelectedDenseLabelId,
    setRightOpen,
    setGlobalStoriesOpen,
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

  useEffect(() => {
    if (publicLayoutAccess !== "viewer") return;

    const handleViewerShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      const modifier = event.ctrlKey || event.metaKey || event.altKey;
      const blockingDialogOpen = adminLoginOpen || placeRequestFormOpen || placeRequestPickingLocation;

      if (!editingText && !modifier && event.key === "?" && !blockingDialogOpen) {
        event.preventDefault();
        setShortcutHelpOpen((current) => !current);
        return;
      }
      if (editingText || modifier || blockingDialogOpen || shortcutHelpOpen) return;

      if (event.key === "/") {
        event.preventDefault();
        if (globalStoriesOpen) setGlobalContentTab("places");
        else openPublicPlaceList();
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => publicPlaceQueryInputRef.current?.focus());
        });
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((value) => clamp(value * 1.16, fitZoom, 4));
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        setZoom((value) => clamp(value / 1.16, fitZoom, 4));
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        setZoom(fitZoom);
        setMapPan({ x: 0, y: 0 });
        setMapRenderPan({ x: 0, y: 0 });
      }
    };

    window.addEventListener("keydown", handleViewerShortcut);
    return () => window.removeEventListener("keydown", handleViewerShortcut);
  }, [adminLoginOpen, fitZoom, globalStoriesOpen, openPublicPlaceList, placeRequestFormOpen, placeRequestPickingLocation, publicLayoutAccess, publicPlaceQueryInputRef, setMapPan, shortcutHelpOpen]);

  useEffect(() => {
    if (publicLayoutAccess !== "viewer" || !publicPlaceItems.length) return;

    const applyPanel = (state: PublicHistoryState) => {
      const preserveCurrentMapView = publicPreserveMapViewOnNextPopRef.current;
      publicPreserveMapViewOnNextPopRef.current = false;
      const panel = state.wondosimPanel ?? "map";
      const item = publicPanelIsPlace(panel)
        ? publicPlaceItems.find((candidate) => candidate.id === state.wondosimPlaceId)
        : undefined;
      if (publicPanelIsPlace(panel) && !item) {
        window.history.replaceState({ wondosimPanel: "map" } satisfies PublicHistoryState, "", publicUrlWithPlace(window.location.href, null));
        setSelectedId(null);
        setSelectedFacilityId(null);
        setPublicPlaceExpanded(false);
        setGlobalStoriesOpen(false);
        setPublicPanelExpanded(false);
        restorePublicMapView(true);
        return;
      }
      if (item) {
        const alreadySelected = selectedId === item.anchor.id && currentPublicPlaceId() === item.id;
        setSelectedId(item.anchor.id);
        setSelectedFacilityId(item.place.id === item.anchor.directoryId ? null : item.place.id);
        setSelectedNoteId(null);
        setSelectedDenseLabelId(null);
        setGlobalStoriesOpen(false);
        setPublicPanelExpanded(false);
        setPublicPlaceExpanded(panel === "place-expanded");
        if (!alreadySelected) {
          focusMapPosition(item.anchor.x, item.anchor.y, item.anchor.id, {
            publicNavigation: true,
            showDetails: panel === "place-expanded",
          });
        }
        return;
      }
      setSelectedId(null);
      setSelectedFacilityId(null);
      setPublicPlaceExpanded(false);
      setGlobalContentTab("places");
      setGlobalStoriesOpen(publicPanelIsExplorer(panel));
      setPublicPanelExpanded(panel === "explorer-expanded");
      if (preserveCurrentMapView) publicMapViewBeforeFocusRef.current = null;
      else restorePublicMapView(panel === "map");
    };

    const pushPendingExplorer = () => {
      const expanded = window.innerWidth <= 760;
      const baseUrl = publicUrlWithPlace(window.location.href, null);
      window.history.pushState({ wondosimPanel: expanded ? "explorer-expanded" : "explorer" } satisfies PublicHistoryState, "", baseUrl);
      applyPanel({ wondosimPanel: expanded ? "explorer-expanded" : "explorer" });
    };

    const handlePopState = (event: PopStateEvent) => {
      if (publicNavigationAfterPopRef.current === "explorer") {
        publicNavigationAfterPopRef.current = null;
        publicNavigationApplyingRef.current = true;
        pushPendingExplorer();
        window.requestAnimationFrame(() => { publicNavigationApplyingRef.current = false; });
        return;
      }
      const urlPlaceId = new URL(window.location.href).searchParams.get("place");
      const state = (event.state ?? {}) as PublicHistoryState;
      const target: PublicHistoryState = state.wondosimPanel
        ? state
        : urlPlaceId ? { wondosimPanel: "place", wondosimPlaceId: urlPlaceId, wondosimFrom: "map" } : { wondosimPanel: "map" };
      const nextPlaceId = publicPanelIsPlace(target.wondosimPanel) ? target.wondosimPlaceId ?? null : null;
      if (!confirmDiscardStoryPhoto(nextPlaceId)) {
        window.history.forward();
        return;
      }
      publicNavigationApplyingRef.current = true;
      applyPanel(target);
      window.requestAnimationFrame(() => { publicNavigationApplyingRef.current = false; });
    };

    if (!publicNavigationInitializedRef.current) {
      const requestedPlaceId = new URL(window.location.href).searchParams.get("place");
      const requestedItem = requestedPlaceId ? publicPlaceItems.find((item) => item.id === requestedPlaceId) : undefined;
      const baseUrl = publicUrlWithPlace(window.location.href, null);
      window.history.replaceState({ wondosimPanel: "map" } satisfies PublicHistoryState, "", baseUrl);
      publicNavigationInitializedRef.current = true;
      if (requestedItem) {
        rememberPublicMapView();
        const placeState: PublicHistoryState = { wondosimPanel: "place", wondosimPlaceId: requestedItem.id, wondosimFrom: "map" };
        window.history.pushState(placeState, "", publicUrlWithPlace(window.location.href, requestedItem.id));
        publicNavigationApplyingRef.current = true;
        applyPanel(placeState);
        window.requestAnimationFrame(() => { publicNavigationApplyingRef.current = false; });
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [closePublicExplorerPanel, closePublicPlacePanel, confirmDiscardStoryPhoto, currentPublicPlaceId, focusMapPosition, publicLayoutAccess, publicMapViewBeforeFocusRef, publicPlaceItems, publicPreserveMapViewOnNextPopRef, rememberPublicMapView, restorePublicMapView, selectedId, setPublicPanelExpanded, setPublicPlaceExpanded]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      const dismiss = (action: () => void) => {
        event.preventDefault();
        event.stopPropagation();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        action();
      };

      if (storyReportTarget) {
        dismiss(closePlaceStoryReport);
        return;
      }
      if (publicHistoryOpen) {
        dismiss(() => setPublicHistoryOpen(false));
        return;
      }
      if (shortcutHelpOpen) {
        dismiss(() => setShortcutHelpOpen(false));
        return;
      }
      if (adminLoginOpen) {
        dismiss(() => {
          setAdminLoginOpen(false);
          setAdminLoginError("");
        });
        return;
      }
      if (placeRequestFormOpen) {
        dismiss(() => {
          setPlaceRequestFormOpen(false);
          setPlaceRequestPickingLocation(false);
        });
        return;
      }
      if (placeRequestPickingLocation) {
        dismiss(() => {
          setPlaceRequestLocation(placeRequestLocationBeforePickingRef.current);
          setPlaceRequestPickingLocation(false);
          setPlaceRequestFormOpen(true);
        });
        return;
      }
      if (databaseEditorOpen) {
        dismiss(closeDatabaseEditor);
        return;
      }
      if (placeEventFormOpen) {
        dismiss(closePlaceEventForm);
        return;
      }
      if (publicLayoutAccess !== "viewer") return;

      const state = (window.history.state ?? {}) as PublicHistoryState;
      const panel: PublicPanelHistory = selectedId
        ? publicPlaceExpanded ? "place-expanded" : "place"
        : globalStoriesOpen ? publicPanelExpanded ? "explorer-expanded" : "explorer" : "map";
      if (panel === "map") return;

      dismiss(() => {
        if (publicPanelIsExpanded(panel)) {
          if (state.wondosimPanel === panel && state.wondosimExpandedFromCollapsed) window.history.back();
          else setPublicPanelExpansion(publicPanelIsPlace(panel) ? "place" : "explorer", false);
        } else if (publicPanelIsPlace(panel)) {
          closePublicPlacePanel();
        } else if (publicPanelIsExplorer(panel)) {
          closePublicExplorerPanel();
        }
      });
    };

    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [adminLoginOpen, closeDatabaseEditor, closePlaceEventForm, closePlaceStoryReport, closePublicExplorerPanel, closePublicPlacePanel, databaseEditorOpen, globalStoriesOpen, placeEventFormOpen, placeRequestFormOpen, placeRequestPickingLocation, publicHistoryOpen, publicLayoutAccess, publicPanelExpanded, publicPlaceExpanded, selectedId, setPublicPanelExpansion, shortcutHelpOpen, storyReportTarget]);

  const submitSharedAdminLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adminPassword) {
      setAdminLoginError("공유 관리자 비밀번호를 입력해 주세요.");
      return;
    }
    setAdminLoginSubmitting(true);
    setAdminLoginError("");
    try {
      const response = await fetch(ADMIN_SESSION_API, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setAdminLoginError(response.status === 429
          ? "입력 횟수가 많습니다. 15분 뒤 다시 시도해 주세요."
          : response.status === 401
            ? "비밀번호가 맞지 않습니다."
            : payload?.error === "shared admin login unavailable"
              ? "공유 관리자 로그인이 아직 설정되지 않았습니다."
              : "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      window.location.reload();
    } catch {
      setAdminLoginError("로그인 연결을 확인하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setAdminLoginSubmitting(false);
    }
  };

  const signOutSharedAdmin = async () => {
    try {
      await fetch(ADMIN_SESSION_API, { method: "DELETE", credentials: "same-origin" });
    } finally {
      window.location.reload();
    }
  };

  // 이하는 공개·관리자 화면 전환과 최종 지도 렌더링 자료를 준비하는 코드입니다.
  const switchPublicView = (enabled: boolean) => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${PUBLIC_VIEW_COOKIE}=${enabled ? "1" : ""}; Path=/; SameSite=Strict; Max-Age=${enabled ? 43_200 : 0}${secure}`;
    window.location.reload();
  };

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
                <img ref={baseMapImgRef} className="base-map" src={activeBaseMapSrc} alt="제주 원도심 검수용 베이스맵" draggable={false} decoding="async" fetchPriority="high" onLoad={() => setMapLoaded(true)} />
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
          {publicLayoutAccess === "viewer" && selected && !globalStoriesOpen && <PublicPlaceSheet
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
          />}
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
      <PublicExplorerPanel
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
      />
      {publicLayoutAccess === "viewer" && storyReportTarget && <div className="story-report-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePlaceStoryReport(); }}>
        <section className="story-report-dialog" role="dialog" aria-modal="true" aria-labelledby="story-report-title" aria-describedby="story-report-note">
          <header><div><strong id="story-report-title">후기·사진 신고</strong><span>{storyReportTarget.placeName} · {storyReportTarget.authorName}</span></div><button type="button" disabled={storyReportSubmitting} onClick={closePlaceStoryReport} aria-label="신고 창 닫기">×</button></header>
          <div className="story-report-dialog-body">
            <p className="story-report-preview">{storyReportTarget.reviewText}</p>
            <label>신고 사유<select value={storyReportReason} onChange={(event) => setStoryReportReason(event.target.value as StoryReportReason)}>{storyReportReasons.map((reason) => <option value={reason.id} key={reason.id}>{reason.label}</option>)}</select></label>
            <label>추가 설명 <span>선택</span><textarea value={storyReportDetail} maxLength={300} onChange={(event) => setStoryReportDetail(event.target.value)} placeholder="관리자가 확인할 내용을 적어주세요." /><small>{storyReportDetail.length}/300</small></label>
            <p id="story-report-note">신고 즉시 삭제되지는 않으며, 관리자 검수 후 숨김 또는 삭제됩니다. 같은 후기는 한 번만 신고할 수 있습니다.</p>
          </div>
          <footer><button type="button" disabled={storyReportSubmitting} onClick={closePlaceStoryReport}>취소</button><button type="button" className="primary" disabled={storyReportSubmitting} onClick={() => void submitPlaceStoryReport()}>{storyReportSubmitting ? "접수 중…" : "신고 접수"}</button></footer>
        </section>
      </div>}
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
      {publicLayoutAccess === "viewer" && placeRequestFormOpen && <div className="place-request-backdrop" role="presentation">
        <section className="place-request-dialog" role="dialog" aria-modal="true" aria-labelledby="place-request-dialog-title">
          <header><div><strong id="place-request-dialog-title">장소 등록 요청</strong><span>지도에 추가되면 좋을 원도심 장소를 알려주세요.</span></div><button type="button" onClick={() => { setPlaceRequestFormOpen(false); setPlaceRequestPickingLocation(false); }} aria-label="장소 등록 요청 닫기">×</button></header>
          <div className="place-request-dialog-scroll">
            <div className="place-request-marker-section"><div><strong>마커 형태</strong><span>장소의 주된 운영 목적에 맞는 기본분류 하나를 선택해 주세요.</span></div><label>기본분류<select value={placeRequestCategory} onChange={(event) => setPlaceRequestCategory(event.target.value as BundledMarkerCategory)}>{categories.filter((category) => (["culture", "cafe", "food", "shop"] as string[]).includes(category.id)).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><div className="place-request-style-grid" role="radiogroup" aria-label="마커 형태 선택">{(["v2", "01", "02", "03"] as BundledMarkerStyle[]).map((style) => <button type="button" role="radio" aria-checked={placeRequestMarkerStyle === style} className={placeRequestMarkerStyle === style ? "active" : ""} key={style} onClick={() => setPlaceRequestMarkerStyle(style)}><img src={markerAssetSrc(style, placeRequestCategory)} alt="" /><span>{style === "v2" ? "리뉴얼 최종" : `형태 ${style}`}</span></button>)}</div></div>
            <section className={`place-request-location-field ${placeRequestLocation ? "selected" : ""}`}><div><img src={markerAssetSrc(placeRequestMarkerStyle, placeRequestCategory)} alt="" /><span><strong>지도에서 마커 위치 지정 <em>필수</em></strong><small>{placeRequestLocation ? `위치 선택됨 · ${placeRequestLocation.x.toFixed(2)}, ${placeRequestLocation.y.toFixed(2)}` : "실제 장소가 있는 지점을 지도에서 눌러 주세요."}</small></span></div><button type="button" onClick={() => { placeRequestLocationBeforePickingRef.current = placeRequestLocation; setPlaceRequestFormOpen(false); setGlobalStoriesOpen(false); setSelectedId(null); setPlaceRequestPickingLocation(true); }}>{placeRequestLocation ? "위치 다시 지정" : "지도에서 지정"}</button></section>
            <label>장소 이름 <em>필수</em><input value={placeRequestName} maxLength={120} placeholder="예: 카페단단" onChange={(event) => setPlaceRequestName(event.target.value)} /></label>
            <label>권역·세부지역 <em>필수 · 기존 값 선택</em><select value={placeRequestArea} aria-label="장소 등록 요청 권역·세부지역 선택" onChange={(event) => setPlaceRequestArea(event.target.value)}><option value="">선택해 주세요</option>{placeRequestAreaOptions.map((area) => <option value={area} key={area}>{area}</option>)}</select></label>
            <label>주소 <em>필수</em><input value={placeRequestAddress} maxLength={260} placeholder="도로명 주소를 적어주세요." onChange={(event) => setPlaceRequestAddress(event.target.value)} /></label>
            <label>장소 설명 <em>필수</em><textarea value={placeRequestDescription} maxLength={800} placeholder="어떤 장소인지, 지도에 소개할 핵심 내용을 짧게 적어주세요." onChange={(event) => setPlaceRequestDescription(event.target.value)} /><small>{placeRequestDescription.length}/800</small></label>
            <p>요청은 곧바로 공개되지 않습니다. 관리자가 장소 정보와 마커를 수정·검수한 뒤 지도 편집 초안에 반영합니다.</p>
          </div>
          <footer><button type="button" onClick={() => { setPlaceRequestFormOpen(false); setPlaceRequestPickingLocation(false); }}>취소</button><button type="button" className="primary" disabled={placeRequestSubmitting || !placeRequestLocation || !placeRequestArea || placeRequestName.trim().length < 2 || placeRequestAddress.trim().length < 5 || placeRequestDescription.trim().length < 10} onClick={() => void submitPlaceRegistrationRequest()}>{placeRequestSubmitting ? "요청 저장 중…" : "등록 요청 보내기"}</button></footer>
        </section>
      </div>}
      {publicLayoutAccess === "viewer" && adminLoginOpen && <div className="admin-login-backdrop" role="presentation">
        <section className="admin-login-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-login-title">
          <header><div><strong id="admin-login-title">관리자 로그인</strong><span>지도 편집과 리뷰·행사·장소 요청 관리</span></div><button type="button" onClick={() => setAdminLoginOpen(false)} aria-label="관리자 로그인 닫기">×</button></header>
          <form onSubmit={(event) => void submitSharedAdminLogin(event)}>
            <label htmlFor="shared-admin-password">공유 관리자 비밀번호</label>
            <input id="shared-admin-password" type="password" value={adminPassword} autoComplete="current-password" autoFocus maxLength={200} onChange={(event) => { setAdminPassword(event.target.value); setAdminLoginError(""); }} />
            {adminLoginError && <p role="alert">{adminLoginError}</p>}
            <button type="submit" disabled={adminLoginSubmitting}>{adminLoginSubmitting ? "확인 중…" : "관리자 화면 들어가기"}</button>
          </form>
          <footer><span>사이트 소유자는 기존 계정으로도 들어갈 수 있습니다.</span><a href="/signin-with-chatgpt?return_to=/">소유자 계정 로그인</a></footer>
        </section>
      </div>}
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
