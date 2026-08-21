"use client";
/* eslint-disable @next/next/no-img-element */

import {
  ChangeEvent,
  type CSSProperties,
  FormEvent,
  memo,
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
import { bundledLandmarkAssets } from "./landmark-assets";
import {
  bundledMarkerAssets,
  markerAssetIdForPlace,
  markerAssetSrc,
  markerAssetStatus,
  recommendedMarkerStyle,
  type BundledMarkerCategory,
  type BundledMarkerStyle,
} from "./marker-assets";
import type { MasterDirectoryRow } from "./master-directory";
import { geocodedPlaces, projectGeographicCoordinates } from "./geocoded-places";
import { categoryForPlace, isCoreLandmarkName, normalizePlaceName } from "./core-landmarks";
import { parseVersionedLocalAutosave, shouldRestoreLocalAutosave } from "./local-autosave.mjs";
import { chooseEditorRestoreSource } from "./editor-draft-restore.mjs";
import {
  chooseScaleAwareLabelIds,
  normalizeOptionalLabelScaleSteps,
  optionalLabelBudgetForScale,
} from "./label-density.mjs";
import { denseLabelConnections } from "./dense-label-density.mjs";
import { chooseDenseLabelPlacement, denseLabelPlacementOptions, segmentsCross } from "./dense-label-placement.mjs";
import { fitDenseLabelCenter, publicDenseLabelViewport } from "./dense-label-viewport.mjs";
import { distanceAwareConnectorOpacity, distanceAwareConnectorWidth } from "./label-connector.mjs";
import { placesForPublicCategory } from "./public-place-category.mjs";
import { publicPlaceFocusZoom } from "./public-place-focus.mjs";
import { horizontalMapFitZoom, mapStageGestureTransform } from "./map-stage-transform.mjs";
import {
  LOW_MOBILE_RENDER_BUDGET,
  STANDARD_MOBILE_RENDER_BUDGET,
  mobileRenderBudgetForDevice,
} from "./mobile-render-budget.mjs";
import {
  chooseMobileMarkerRenderIds,
  mobileLabelBudgetForScale,
  mobileMarkerBudgetForScale,
  mobileOverviewIsSimplified,
} from "./mobile-marker-density.mjs";
import {
  publicPanelAfterDrag,
  publicPanelIsExpanded,
  publicPanelIsExplorer,
  publicPanelIsPlace,
  publicPlaceDirectionsUrl,
  publicUrlWithPlace,
} from "./public-convenience.mjs";
import { ensureIndependentMapElementIdentity, sameMapPlaceIdentity } from "./map-element-identity.mjs";
import {
  consolidateMainHubDirectoryPlaces,
  isMainHubPersistenceTarget,
  stableMainHubResourceSize,
  withoutMainHubPlacementOverrides,
} from "./main-hub-persistence.mjs";
import {
  ART_PLATFORM_FACILITY_NAMES,
  ART_PLATFORM_GROUP_ID,
  LPP_CANONICAL_NAME,
  MAIN_HUB_CANONICAL_NAME,
  MAIN_HUB_ROLE,
  additionalCategoryDefinitions,
  convenienceAttributeDefinitions,
  directoryMetadataDefaults,
  isPrimaryPublicCategory,
  mergeDirectoryMetadata,
  normalizeDirectoryCategory,
  publicDisplayName,
  sanitizeAdditionalCategories,
  sanitizeConvenienceAttributes,
  type AdditionalCategoryId,
  type ConvenienceAttributeId,
} from "./place-taxonomy";
import type { DatabaseEditorCategoryFilter } from "./admin-database-editor";

const AdminDatabaseEditor = lazy(() => import("./admin-database-editor"));
const AdminDiagnosticsPanel = lazy(() => import("./admin-diagnostics-panel"));
const AdminFolder = lazy(() => import("./admin-folder"));
const AdminPlaceEventDialog = lazy(() => import("./admin-place-event-dialog"));
const PublicPlaceDetailContent = lazy(() => import("./public-place-detail-content"));
const PublicExplorerActivityContent = lazy(() => import("./public-explorer-activity-content"));

const MAP_ASPECT = 8944 / 7324;
const MAP_SVG = "/maps/제주원도심_랜드마크탐색_베이스맵_v15_골목추가정리_검수본_마스터벡터.svg";
const MAP_PNG = "/maps/제주원도심_랜드마크탐색_베이스맵_v15_골목추가정리_검수본_초고해상도.png";
const UPLOADED_MAP_API = "/api/base-map";
const CALIBRATION_SETTINGS_API = "/api/calibration-settings";
const LOCKED_COORDINATE_SETTINGS_API = "/api/locked-coordinate-settings";
const PLACE_DIRECTORY_API = "/api/place-directory";
const PRINT_SETTINGS_API = "/api/print-settings";
const DENSE_LABEL_SETTINGS_API = "/api/dense-label-settings";
const PLACEMENT_SETTINGS_API = "/api/placement-settings";
const PUBLIC_LAYOUT_API = "/api/public-layout";
const PLACE_STORIES_API = "/api/place-stories";
const PLACE_EVENTS_API = "/api/place-events";
const PLACE_REGISTRATION_REQUESTS_API = "/api/place-registration-requests";
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
const EXPORT_CANONICAL_WIDTH = 1180;
const AUTOSAVE_KEY = "jeju-wondosim-map-review:autosave:v3";
const CALIBRATION_SETTINGS_KEY = "jeju-wondosim-map-review:calibration-settings:v1";
const LOCKED_COORDINATE_SETTINGS_KEY = "jeju-wondosim-map-review:locked-coordinate-settings:v1";
const GEOCODE_CACHE_KEY = "jeju-wondosim-map-review:geocode-cache:v1";
const VISIBILITY_GROUPS_KEY = "jeju-wondosim-map-review:visibility-groups:v1";
const CALIBRATION_GROUPS_KEY = "jeju-wondosim-map-review:calibration-groups:v1";
const MAP_VIEW_SETTINGS_KEY = "jeju-wondosim-map-review:map-view-settings:v1";
const DENSE_LABEL_SETTINGS_KEY = "jeju-wondosim-map-review:dense-label-settings:v1";
const PLACEMENT_SETTINGS_KEY = "jeju-wondosim-map-review:placement-settings:v1";
const PLACE_STORY_VISITOR_KEY = "jeju-wondosim-map-review:story-visitor:v1";
const PLACE_STORY_AUTHOR_KEY = "jeju-wondosim-map-review:story-author:v1";
const PLACE_STORY_DRAFTS_KEY = "jeju-wondosim-map-review:story-drafts:v1";
const UI_THEME_STORAGE_KEY = "jeju-wondosim-map-review:ui-theme:v1";
const STORY_PHOTO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const STORY_PHOTO_MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const STORY_PHOTO_MAX_EDGE = 1280;
const STORY_PHOTO_TARGET_BYTES = 1.5 * 1024 * 1024;
const PUBLIC_PANEL_MOTION_MS = 240;
const RECENT_REVIEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const STORY_PHOTO_ENCODING_ATTEMPTS = [
  { maximumEdge: STORY_PHOTO_MAX_EDGE, type: "image/webp", quality: 0.82 },
  { maximumEdge: STORY_PHOTO_MAX_EDGE, type: "image/webp", quality: 0.7 },
  { maximumEdge: STORY_PHOTO_MAX_EDGE, type: "image/jpeg", quality: 0.78 },
  { maximumEdge: 1080, type: "image/webp", quality: 0.7 },
  { maximumEdge: 1080, type: "image/jpeg", quality: 0.7 },
  { maximumEdge: 900, type: "image/jpeg", quality: 0.64 },
  { maximumEdge: 720, type: "image/jpeg", quality: 0.56 },
  { maximumEdge: 640, type: "image/jpeg", quality: 0.5 },
] as const;
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

type UiThemeId = (typeof uiThemes)[number]["id"];

function isUiThemeId(value: unknown): value is UiThemeId {
  return typeof value === "string" && uiThemes.some((theme) => theme.id === value);
}

function UiThemeSwatch({ colors }: { colors: readonly string[] }) {
  return <span className="ui-theme-swatch" aria-hidden="true">{colors.map((color, index) => <i style={{ background: color }} key={`${color}-${index}`} />)}</span>;
}

function MagnifierIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="m14.75 14.75 4.5 4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
  </svg>;
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

const markerCategoryColors = {
  culture: "#58AEB0",
  cafe: "#D49A55",
  food: "#E36B58",
  shop: "#9A6DAE",
  parking: "#557AA8",
  park: "#69A56D",
  utility: "#8F7EA7",
} as const;

const categories = [
  { id: "landmark", name: "핵심 랜드마크", color: markerCategoryColors.culture, glyph: "景" },
  { id: "culture", name: "일반 문화시설", color: markerCategoryColors.culture, glyph: "文" },
  { id: "cafe", name: "카페", color: markerCategoryColors.cafe, glyph: "珈" },
  { id: "food", name: "음식점", color: markerCategoryColors.food, glyph: "食" },
  { id: "shop", name: "소품샵", color: markerCategoryColors.shop, glyph: "物" },
  { id: "parking", name: "주차장", color: markerCategoryColors.parking, glyph: "P" },
  { id: "park", name: "공원·광장", color: markerCategoryColors.park, glyph: "休" },
  { id: "utility", name: "기타 편의시설", color: markerCategoryColors.utility, glyph: "＋" },
] as const;

const publicListCategories: ReadonlyArray<{
  id: PublicPlaceCategoryFilter;
  name: string;
  color: string;
  iconSrc: string;
}> = [
  { id: "culture", name: "문화공간", color: markerCategoryColors.culture, iconSrc: "/category-icons/category_ui_culture_book_brush_note_v03_ui-96px.png" },
  { id: "food", name: "음식점", color: markerCategoryColors.food, iconSrc: "/category-icons/category_ui_restaurant_v02_ui-96px.png" },
  { id: "cafe", name: "카페", color: markerCategoryColors.cafe, iconSrc: "/category-icons/category_ui_cafe_v03_ui-96px.png" },
  { id: "shop", name: "소품샵", color: markerCategoryColors.shop, iconSrc: "/category-icons/category_ui_goods_shop_v03_ui-96px.png" },
  { id: "convenience", name: "편의시설", color: markerCategoryColors.utility, iconSrc: "/category-icons/category_ui_amenities_v01_ui-96px.png" },
] as const;

type PublicPlaceCategoryFilter = "culture" | "food" | "cafe" | "shop" | "convenience";
type PublicPlaceCategoryScope = "all" | PublicPlaceCategoryFilter;
type PublicPanelHistory = "map" | "explorer" | "explorer-expanded" | "place" | "place-expanded";
type PublicHistoryState = {
  wondosimPanel?: PublicPanelHistory;
  wondosimPlaceId?: string;
  wondosimFrom?: "map" | "explorer" | "explorer-expanded";
  wondosimExpandedFromCollapsed?: boolean;
};
type CategoryId = (typeof categories)[number]["id"];
type AssetStatus = "approved" | "review" | "unchecked";
type LabelPosition = "top" | "bottom" | "left" | "right";
type ReviewStatus = "delete" | "weaken" | "keep" | "hierarchy";
type ViewMode = "all" | "landmarks" | "markers" | "labels" | "anchors" | "clearance" | "collisions" | "dim" | "gray" | "nomap";
type BaseMapMode = "svg" | "png" | "uploaded";
type CoordinateLockFilter = "all" | "unlocked" | "locked";
type PlacementFilter = "all" | "placed" | "unplaced";
type RecommendationFilter = "all" | "recommended" | "standard";
type CalibrationGroupId = "primary" | "secondary" | "tertiary";
type PrintMode = "auto" | "include" | "exclude";
type PlacementState = "unplaced" | "deleted";
type PublicLayoutAccess = "loading" | "editor" | "viewer";
type GlobalContentTab = "places" | "reviews" | "events" | "place-requests";
type StoryReportReason = "inappropriate" | "privacy" | "copyright" | "spam" | "other";

type UploadedBaseMap = {
  available: boolean;
  canUpload?: boolean;
  name: string;
  width: number;
  height: number;
  uploadedAt: string;
  size: number;
  contentType: string;
  originalUrl?: string;
  screen2048Url?: string;
  screen4096Url?: string;
};

type MapAsset = {
  id: string;
  name: string;
  category: CategoryId;
  status: AssetStatus;
  src: string;
  screenSrc?: string;
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
  placeRequestId?: string;
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
  additionalCategories?: AdditionalCategoryId[];
  convenienceAttributes?: ConvenienceAttributeId[];
  locationGroupId?: string;
  mapAnchorId?: string;
  featuredRole?: string;
  aliases?: string[];
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
  additionalCategories: AdditionalCategoryId[];
  convenienceAttributes: ConvenienceAttributeId[];
  locationGroupId: string;
  mapAnchorId: string;
  featuredRole: string;
  aliases: string[];
};

type PublicPlaceListItem = {
  id: string;
  place: DirectoryPlace;
  anchor: MapElement;
  displayName: string;
  categoryId: PublicPlaceCategoryFilter;
  isMainHub: boolean;
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

type PlacementOverride = {
  key: string;
  directoryId?: string;
  name: string;
  state: PlacementState;
};

type DenseLabelRow = {
  elementId: string;
  name: string;
  category: CategoryId;
  targetX: number;
  targetY: number;
  column: number;
  rowIndex: number;
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
  rows: DenseLabelRow[];
  columnCount: number;
  rowCount: number;
  columnWidths: number[];
  positionKeys: string[];
};

type StageDimensions = {
  width: number;
  height: number;
};

type MobileRenderBudget = {
  tier: "low" | "standard" | "high";
  overscanRatio: number;
  minimumOverscan: number;
};

type PrintAuditIssue = {
  id: string;
  kind: "clipping" | "overlap" | "crossing" | "text";
  label: string;
  elementId?: string;
  clusterId?: string;
};

type PrintAuditReport = {
  issues: PrintAuditIssue[];
  clippingCount: number;
  overlapCount: number;
  crossingCount: number;
  minimumTextPixels: number;
};

type DocumentState = {
  elements: MapElement[];
  assets: MapAsset[];
  reviewNotes: ReviewNote[];
  directoryPlaces?: DirectoryPlace[];
  calibrationPoints?: CalibrationPoint[];
  landmarkDefaultPositions?: LandmarkDefaultPosition[];
  denseLabelPositions?: DenseLabelPosition[];
  denseLabelExcludedIds?: string[];
  placementOverrides?: PlacementOverride[];
};

type OptionalLabelScaleStep = {
  maximumRatio: number;
  limit: number;
};

type PublicViewSettings = {
  baseMap: BaseMapMode;
  markerLabelsVisible: boolean;
  mergeDenseLabels: boolean;
  screenRecommendedOnly: boolean;
  defaultMarkerSize: number;
  optionalLabelScaleSteps?: OptionalLabelScaleStep[];
};

type EditorDraftPayload = {
  document: DocumentState;
  view: PublicViewSettings;
  updatedAt: string;
  revision: number;
  hasPrevious: boolean;
};

type PublicLayoutHistoryItem = {
  id: string;
  kind: "snapshot" | "published" | "restored" | "legacy";
  sourceRevision: number;
  elementCount: number;
  placedCount: number;
  createdAt: string;
  createdBy: string;
};

type PublicLayoutHistoryEntry = PublicLayoutHistoryItem & {
  document: DocumentState;
  view: PublicViewSettings;
};

type PublicLayoutPayload = {
  document?: DocumentState | null;
  view?: PublicViewSettings;
  draft?: EditorDraftPayload | null;
  canEdit?: boolean;
  accessMethod?: "owner" | "shared" | null;
  persistent?: boolean;
  publishedAt?: string | null;
  revision?: number;
  hasPrevious?: boolean;
  history?: PublicLayoutHistoryItem[];
  historyEntry?: PublicLayoutHistoryItem | PublicLayoutHistoryEntry;
  reviewCompletedCount?: number;
  contentSummary?: {
    reviews: number;
    events: number;
    placeRequests: number;
    refreshedAt: string;
  } | null;
  eventLinkedPlaces?: PlaceEventPlace[];
  reviewCountsByPlace?: PlaceReviewCount[];
  uploadedBaseMap?: UploadedBaseMap | null;
  error?: string;
};

type LocalAutosavePayload = {
  schemaVersion: 4;
  savedAt: string;
  baseRevision: number;
  document: DocumentState;
};

type PlaceStory = {
  id: string;
  placeKey: string;
  placeName: string;
  authorName: string;
  reviewText: string;
  photoUrl: string | null;
  status: "published" | "hidden";
  reportCount?: number;
  reportSummary?: string;
  createdAt: string;
  updatedAt: string;
};

type PlaceStoriesPayload = {
  stories?: PlaceStory[];
  story?: PlaceStory;
  canModerate?: boolean;
  persistent?: boolean;
  page?: number;
  pageSize?: number;
  pageCount?: number;
  total?: number;
  error?: string;
};

type PlaceStoryUploadDiagnostic = {
  id: string;
  placeKey: string;
  stage: "prepare" | "request" | "response" | "unknown";
  errorCode: string;
  responseStatus: number;
  sourceSize: number;
  preparedSize: number | null;
  sourceType: string;
  preparedType: string | null;
  online: number;
  userAgent: string;
  createdAt: string;
};

type PlaceStoryDiagnosticsPayload = {
  diagnostics?: PlaceStoryUploadDiagnostic[];
  error?: string;
};

type PerformanceDiagnostic = {
  id: string;
  metric: "startup" | "pan-settle" | "pinch-settle";
  durationMs: number;
  elementCount: number;
  labelCount: number;
  viewportWidth: number;
  viewportHeight: number;
  deviceMemory: number | null;
  hardwareConcurrency: number;
  connectionType: string;
  standalone: number;
  online: number;
  createdAt: string;
};

type PerformanceDiagnosticsPayload = {
  diagnostics?: PerformanceDiagnostic[];
  error?: string;
};

type StoryCameraPermissionState = "unknown" | "requesting" | "granted" | "denied" | "unavailable";

const storyReportReasons: Array<{ id: StoryReportReason; label: string }> = [
  { id: "inappropriate", label: "부적절한 내용" },
  { id: "privacy", label: "개인정보 노출" },
  { id: "copyright", label: "사진·저작권 문제" },
  { id: "spam", label: "광고·도배" },
  { id: "other", label: "기타" },
];

type PlaceEventPlace = {
  placeKey: string;
  placeName: string;
};

type PlaceReviewCount = PlaceEventPlace & {
  count: number;
  latestCreatedAt: string | null;
};

type PlaceEvent = {
  id: string;
  placeKey: string;
  placeName: string;
  places: PlaceEventPlace[];
  eventName: string;
  eventInfo: string;
  photoUrl: string;
  startsAt: string;
  endsAt: string;
  visibleFrom: string;
  visibleUntil: string;
  status: "active" | "hidden";
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
};

type PlaceEventsPayload = {
  events?: PlaceEvent[];
  event?: PlaceEvent;
  linkedPlaces?: PlaceEventPlace[];
  canManage?: boolean;
  persistent?: boolean;
  page?: number;
  pageSize?: number;
  pageCount?: number;
  total?: number;
  error?: string;
};

type PlaceRegistrationRequest = {
  id: string;
  submittedName: string;
  submittedArea: string;
  submittedAddress: string;
  submittedDescription: string;
  submittedCategory: BundledMarkerCategory;
  submittedMarkerStyle: BundledMarkerStyle;
  submittedX: number | null;
  submittedY: number | null;
  name: string;
  area: string;
  address: string;
  description: string;
  category: BundledMarkerCategory;
  markerStyle: BundledMarkerStyle;
  markerX: number | null;
  markerY: number | null;
  status: "pending" | "reviewing" | "approved" | "rejected";
  directoryId: string | null;
  rejectionNote: string;
  createdAt: string;
  updatedAt: string;
  reviewStartedAt: string | null;
  reviewedAt: string | null;
};

type PlaceRegistrationRequestsPayload = {
  requests?: PlaceRegistrationRequest[];
  request?: PlaceRegistrationRequest;
  directory?: PlaceDirectoryRecord;
  canManage?: boolean;
  persistent?: boolean;
  page?: number;
  pageSize?: number;
  pageCount?: number;
  total?: number;
  error?: string;
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

const GENERAL_MARKER_DISPLAY_SCALE = 1.25;

function mapElementDisplaySize(element: Pick<MapElement, "category" | "size">) {
  return element.category === "landmark" ? element.size : element.size * GENERAL_MARKER_DISPLAY_SCALE;
}

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

function withDirectoryMetadata(place: DirectoryPlace): DirectoryPlace {
  const category = directoryCategory(place.category);
  const defaults = directoryMetadataDefaults(place.name, category, place.subtype, place.description);
  const metadata = mergeDirectoryMetadata({
    ...(Object.prototype.hasOwnProperty.call(place, "additionalCategories") ? { additionalCategories: place.additionalCategories } : {}),
    ...(Object.prototype.hasOwnProperty.call(place, "convenienceAttributes") ? { convenienceAttributes: place.convenienceAttributes } : {}),
    locationGroupId: place.locationGroupId,
    mapAnchorId: place.mapAnchorId,
    featuredRole: place.featuredRole,
    ...(Object.prototype.hasOwnProperty.call(place, "aliases") ? { aliases: place.aliases } : {}),
  }, defaults);
  return { ...place, category, ...metadata };
}

function ensureSystemDirectoryPlaces(places: DirectoryPlace[]) {
  const normalized = consolidateMainHubDirectoryPlaces(places.map(withDirectoryMetadata)) as DirectoryPlace[];
  const names = new Set(normalized.map((place) => normalizePlaceName(place.name)));
  const hasArtPlatform = names.has("제주아트플랫폼");
  const additions = legacyDirectoryPlaces
    .filter((place) => normalizePlaceName(place.name) === LPP_CANONICAL_NAME
      || (hasArtPlatform && (ART_PLATFORM_FACILITY_NAMES as readonly string[]).includes(normalizePlaceName(place.name))))
    .filter((place) => !names.has(normalizePlaceName(place.name)))
    .map(withDirectoryMetadata);
  return [...normalized, ...additions];
}

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
        category: directoryCategory(row.category),
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
  return ensureSystemDirectoryPlaces([
    ...built,
    ...legacyDirectoryPlaces.filter((place) => !names.has(normalizePlaceName(place.name))).map((place) => {
      const geocoded = geocodedPlaces[normalizePlaceName(place.name)];
      const category = directoryCategory(place.category);
      return geocoded
        ? { ...place, ...geocoded, category, coordinateStatus: isCoreLandmarkName(place.name) ? "landmark" as const : "geocoded" as const }
        : { ...place, category, coordinateStatus: isCoreLandmarkName(place.name) ? "landmark" as const : place.coordinateStatus };
    }),
    ...supportDirectoryPlaces.filter((place) => !names.has(normalizePlaceName(place.name))).map((place) => {
      const geocoded = geocodedPlaces[place.name];
      return geocoded ? { ...place, ...geocoded, coordinateStatus: "geocoded" as const } : { ...place, coordinateStatus: "unresolved" as const };
    }),
  ]);
}

// Keep the public viewer's initial bundle lean. The full master directory is
// loaded only when an editor needs the bundled database fallback.
const defaultDirectoryPlaces = buildDirectoryPlaces([]).map((place) => {
  const mapped = calibratedPlaceCoordinates(place.name, place.latitude, place.longitude, initialCalibrationPoints);
  return mapped ? { ...place, ...mapped } : place;
});

function directoryRecordFromPlace(place: DirectoryPlace): PlaceDirectoryRecord {
  const name = normalizePlaceName(place.name);
  const decorated = withDirectoryMetadata({ ...place, name });
  return {
    id: decorated.id,
    name,
    category: directoryCategory(decorated.category),
    area: decorated.area ?? "",
    address: decorated.address ?? "",
    subtype: decorated.subtype ?? "",
    priority: decorated.priority ?? "",
    description: decorated.description ?? "",
    operatingInfo: decorated.operatingInfo ?? "",
    notes: decorated.notes ?? "",
    sourceUrl: decorated.sourceUrl ?? "",
    mapUrl: decorated.mapUrl ?? "",
    checkedAt: decorated.checkedAt ?? "",
    additionalCategories: sanitizeAdditionalCategories(decorated.additionalCategories),
    convenienceAttributes: sanitizeConvenienceAttributes(decorated.convenienceAttributes),
    locationGroupId: decorated.locationGroupId ?? "",
    mapAnchorId: decorated.mapAnchorId ?? "",
    featuredRole: decorated.featuredRole ?? "",
    aliases: decorated.aliases ?? [],
  };
}

function mergeDirectoryRecords(records: PlaceDirectoryRecord[], current: DirectoryPlace[]): DirectoryPlace[] {
  const currentById = new Map(current.map((place) => [place.id, place]));
  const currentByName = new Map(current.map((place) => [normalizePlaceName(place.name), place]));
  const defaultById = new Map(defaultDirectoryPlaces.map((place) => [place.id, place]));
  const defaultByName = new Map(defaultDirectoryPlaces.map((place) => [normalizePlaceName(place.name), place]));
  return ensureSystemDirectoryPlaces(records.map((record) => {
    const name = normalizePlaceName(record.name);
    const category = directoryCategory(record.category);
    const geocoded = geocodedPlaces[name];
    const calibrated = calibratedPlaceCoordinates(name, geocoded?.latitude, geocoded?.longitude, initialCalibrationPoints);
    const base = currentById.get(record.id)
      ?? currentByName.get(name)
      ?? defaultById.get(record.id)
      ?? defaultByName.get(name);
    const addressChanged = Boolean(base && base.address.trim() !== record.address.trim());
    return withDirectoryMetadata({
      ...(base ?? {
        x: calibrated?.x ?? geocoded?.x ?? 50,
        y: calibrated?.y ?? geocoded?.y ?? 50,
        coordinateStatus: geocoded ? "geocoded" as const : "unresolved" as const,
        latitude: geocoded?.latitude,
        longitude: geocoded?.longitude,
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
    });
  }));
}

const directoryByName = new Map(defaultDirectoryPlaces.map((place) => [normalizePlaceName(place.name), place]));

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
    sourceLabel: asset.id === MAIN_HUB_LANDMARK_ASSET_ID
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

function isBundledMarkerCategory(category: CategoryId): category is BundledMarkerCategory {
  return category !== "landmark";
}

function defaultMarkerAssetId(category: CategoryId, style: BundledMarkerStyle = recommendedMarkerStyle, descriptor = "") {
  return isBundledMarkerCategory(category) ? markerAssetIdForPlace(style, category, descriptor) : null;
}

function assetIdAfterDirectoryCategoryChange(element: MapElement, category: CategoryId) {
  if (category === "landmark") {
    if (element.assetId && !canonicalMarkerAssetIds.has(element.assetId)) return element.assetId;
    return landmarkLocationByName.get(normalizePlaceName(element.name))?.assetId ?? null;
  }
  if (element.category === category) return element.assetId;
  if (element.category === "landmark" || canonicalMarkerAssetIds.has(element.assetId ?? "")) {
    return defaultMarkerAssetId(category, recommendedMarkerStyle, element.name);
  }
  return element.assetId;
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
    size: LANDMARK_RESOURCE_SIZE,
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

const statusText: Record<AssetStatus, string> = { approved: "승인 완료", review: "검수 중", unchecked: "미검수" };
const reviewStatusText: Record<ReviewStatus, string> = { delete: "삭제 검토", weaken: "약화 검토", keep: "유지", hierarchy: "도로 위계 조정" };

function reviewStatusForCoordinateLock(locked: boolean): AssetStatus {
  return locked ? "approved" : "unchecked";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function categoryOf(id: CategoryId) {
  return categories.find((category) => category.id === id) ?? categories[categories.length - 1];
}

function mobileMarkerPlaceholderColor(id: CategoryId) {
  return categoryOf(id).color;
}

function directoryCategory(category: CategoryId): CategoryId {
  return normalizeDirectoryCategory(category) as CategoryId;
}

function databaseEditorCategoryForPlace(place: Pick<DirectoryPlace, "category">): Exclude<DatabaseEditorCategoryFilter, "all"> {
  const category = directoryCategory(place.category);
  return isPrimaryPublicCategory(category) ? category : "other";
}

function mapCategoryForDirectoryPlace(place: Pick<DirectoryPlace, "name" | "category" | "featuredRole">): CategoryId {
  return isCoreLandmarkName(place.name) || place.featuredRole === MAIN_HUB_ROLE || isPrimaryHubLabel(place.name)
    ? "landmark"
    : place.category;
}

function publicCategoryIdForPlace(place: DirectoryPlace, anchor: MapElement): PublicPlaceCategoryFilter {
  const primary = place.category === "landmark" ? anchor.category : place.category;
  if (
    primary === "culture"
    || primary === "landmark"
    || isCoreLandmarkName(place.name)
    || place.featuredRole === MAIN_HUB_ROLE
    || isPrimaryHubLabel(place.name)
  ) return "culture";
  if (primary === "food") return "food";
  if (primary === "cafe") return "cafe";
  if (primary === "shop") return "shop";
  return "convenience";
}

function publicCategoryMetaForPlace(place: DirectoryPlace, anchor: MapElement) {
  const id = publicCategoryIdForPlace(place, anchor);
  return publicListCategories.find((category) => category.id === id) ?? publicListCategories[0];
}

function isPrimaryHubLabel(name: string) {
  return normalizePlaceName(name) === "제주시소통협력센터";
}

function placeContentKey(element: Pick<MapElement, "id" | "directoryId">) {
  return element.directoryId?.trim() ? `directory:${element.directoryId.trim()}` : `element:${element.id}`;
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

function localDateTimeInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function eventPlaceList(event: PlaceEvent): PlaceEventPlace[] {
  return Array.isArray(event.places) && event.places.length
    ? event.places
    : event.placeKey && event.placeName ? [{ placeKey: event.placeKey, placeName: event.placeName }] : [];
}

let volatileVisitorId = "";

function newVisitorId() {
  return `${crypto.randomUUID().replaceAll("-", "")}${Date.now().toString(36)}`;
}

function persistentVisitorId() {
  try {
    const existing = localStorage.getItem(PLACE_STORY_VISITOR_KEY)?.trim();
    if (existing && /^[a-zA-Z0-9_-]{24,100}$/.test(existing)) return existing;
    const next = volatileVisitorId || newVisitorId();
    volatileVisitorId = next;
    localStorage.setItem(PLACE_STORY_VISITOR_KEY, next);
    return next;
  } catch {
    volatileVisitorId ||= newVisitorId();
    return volatileVisitorId;
  }
}

async function sendPlaceStoryUploadDiagnostic(details: {
  placeKey: string;
  stage: "prepare" | "request" | "response";
  errorCode: string;
  responseStatus: number;
  sourceFile: File | null;
  preparedFile: File | null;
}) {
  try {
    const response = await fetch(PLACE_STORIES_API, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "upload-diagnostic",
        visitorId: persistentVisitorId(),
        placeKey: details.placeKey,
        stage: details.stage,
        errorCode: details.errorCode,
        responseStatus: details.responseStatus,
        sourceSize: details.sourceFile?.size ?? 0,
        preparedSize: details.preparedFile?.size ?? null,
        sourceType: details.sourceFile?.type ?? "",
        preparedType: details.preparedFile?.type ?? null,
        online: navigator.onLine,
      }),
    });
    const payload = await response.json().catch(() => null) as { reference?: unknown } | null;
    return response.ok && typeof payload?.reference === "string" ? payload.reference : null;
  } catch {
    return null;
  }
}

function sendPerformanceDiagnostic(details: {
  metric: "startup" | "pan-settle" | "pinch-settle";
  durationMs: number;
  elementCount: number;
  labelCount: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  try {
    const deviceNavigator = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { effectiveType?: string };
      standalone?: boolean;
    };
    const report = () => {
      void fetch(PLACE_STORIES_API, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "performance-diagnostic",
          visitorId: persistentVisitorId(),
          metric: details.metric,
          durationMs: Math.round(details.durationMs),
          elementCount: details.elementCount,
          labelCount: details.labelCount,
          viewportWidth: Math.round(details.viewportWidth),
          viewportHeight: Math.round(details.viewportHeight),
          deviceMemory: Number.isFinite(deviceNavigator.deviceMemory) ? deviceNavigator.deviceMemory : null,
          hardwareConcurrency: deviceNavigator.hardwareConcurrency || 0,
          connectionType: deviceNavigator.connection?.effectiveType ?? "",
          standalone: window.matchMedia("(display-mode: standalone)").matches || deviceNavigator.standalone === true,
          online: navigator.onLine,
        }),
      }).catch(() => undefined);
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(report, { timeout: 2000 });
    else window.setTimeout(report, 500);
  } catch {
    // Performance reporting must never interrupt map interaction.
  }
}

function readPlaceStoryDraft(placeKey: string | null) {
  if (!placeKey) return "";
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PLACE_STORY_DRAFTS_KEY) ?? "{}") as Record<string, unknown>;
    return typeof parsed[placeKey] === "string" ? parsed[placeKey].slice(0, 220) : "";
  } catch {
    return "";
  }
}

function writePlaceStoryDraft(placeKey: string | null, value: string) {
  if (!placeKey) return;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PLACE_STORY_DRAFTS_KEY) ?? "{}") as Record<string, unknown>;
    const next = Object.fromEntries(Object.entries(parsed).filter(([, draft]) => typeof draft === "string"));
    if (value.trim()) next[placeKey] = value.slice(0, 220);
    else delete next[placeKey];
    sessionStorage.setItem(PLACE_STORY_DRAFTS_KEY, JSON.stringify(next));
  } catch {
    // 세션 저장소가 차단된 환경에서는 현재 입력 상태만 유지합니다.
  }
}

type VisualBounds = { left: number; top: number; right: number; bottom: number };

function smoothstep(edge0: number, edge1: number, value: number) {
  const progress = clamp((value - edge0) / Math.max(edge1 - edge0, 0.0001), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function labelAnchor(position: LabelPosition, bounds: VisualBounds) {
  const centerX = ((bounds.left + bounds.right) / 2) * 100;
  const centerY = ((bounds.top + bounds.bottom) / 2) * 100;
  if (position === "top") return { x: centerX, y: bounds.top * 100, translateX: -50, translateY: -100 };
  if (position === "bottom") return { x: centerX, y: bounds.bottom * 100, translateX: -50, translateY: 0 };
  if (position === "left") return { x: bounds.left * 100, y: centerY, translateX: -100, translateY: -50 };
  return { x: bounds.right * 100, y: centerY, translateX: 0, translateY: -50 };
}

function detailedLabelPosition(position: LabelPosition, offsetY: number): LabelPosition {
  if (position === "top" || position === "bottom") return position;
  return offsetY < -10 ? "top" : "bottom";
}

function labelStyle(
  position: LabelPosition,
  gap: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  fitZoom: number,
  bounds: VisualBounds = { left: 0, top: 0, right: 1, bottom: 1 },
  adaptive = true,
  keepScreenSize = false,
) {
  const safeZoom = Math.max(zoom, 0.22);
  const safeFitZoom = Math.max(fitZoom, 0.22);
  const detailRatio = safeZoom / safeFitZoom;
  const detailProgress = adaptive ? smoothstep(1.35, 2.65, detailRatio) : 0;
  // The stage is enlarged through layout dimensions instead of a composited
  // transform. Keep screen-space label gaps equivalent to the previous zoom
  // model without inverse-scaling the text into a blurry texture.
  const screenDistanceScale = adaptive ? safeFitZoom : safeZoom;
  const start = labelAnchor(position, bounds);
  const endPosition = detailedLabelPosition(position, offsetY);
  const end = labelAnchor(endPosition, bounds);
  const startGapX = position === "left" ? -gap : position === "right" ? gap : 0;
  const startGapY = position === "top" ? -gap : position === "bottom" ? gap : 0;
  const endGap = clamp(gap, 2, 10);
  const endGapY = endPosition === "top" ? -endGap : endGap;
  const mix = (from: number, to: number) => from + (to - from) * detailProgress;
  const anchorX = mix(start.x, end.x);
  const anchorY = mix(start.y, end.y);
  const pixelX = mix(offsetX + startGapX, 0) * screenDistanceScale;
  const pixelY = mix(offsetY + startGapY, endGapY) * screenDistanceScale;
  const translateX = mix(start.translateX, end.translateX);
  const translateY = mix(start.translateY, end.translateY);
  const inverseScale = keepScreenSize ? ` scale(${(1 / safeZoom).toFixed(4)})` : "";
  return {
    left: `calc(${anchorX.toFixed(4)}% + ${pixelX.toFixed(3)}px)`,
    top: `calc(${anchorY.toFixed(4)}% + ${pixelY.toFixed(3)}px)`,
    transform: `translate(${translateX.toFixed(3)}%, ${translateY.toFixed(3)}%)${inverseScale}`,
  };
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

function uploadedBaseMapOriginalSource(metadata: UploadedBaseMap | null) {
  if (!metadata?.available) return "";
  return metadata.originalUrl ?? `${UPLOADED_MAP_API}?v=${encodeURIComponent(metadata.uploadedAt)}`;
}

function uploadedBaseMapDisplaySource(metadata: UploadedBaseMap | null) {
  if (!metadata?.available) return "";
  // Keep one decoded base-map image for the whole session. Swapping the same
  // <img> between 2048px and 4096px variants after zoom settle can briefly
  // clear its painted texture on mobile. The 4096px screen derivative stays
  // sharp during compositor scaling without retaining a second map layer.
  return metadata.screen4096Url ?? metadata.screen2048Url ?? uploadedBaseMapOriginalSource(metadata);
}

async function prepareBaseMapScreenVariant(image: HTMLImageElement, maximumWidth: 2048 | 4096, quality: number) {
  const scale = Math.min(1, maximumWidth / Math.max(image.naturalWidth, 1));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  canvas.width = 1;
  canvas.height = 1;
  return blob?.type === "image/webp" ? { blob, width, height } : null;
}

function timedPhotoBlob(canvas: HTMLCanvasElement, type: "image/webp" | "image/jpeg", quality: number) {
  return new Promise<Blob | null>((resolve) => {
    let finished = false;
    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve(null);
    }, 12_000);
    canvas.toBlob((blob) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      resolve(blob);
    }, type, quality);
  });
}

function prepareStoryPhotoInWorker(file: File) {
  if (
    typeof Worker !== "function"
    || typeof OffscreenCanvas !== "function"
    || typeof createImageBitmap !== "function"
  ) return Promise.resolve<File | null>(null);

  return new Promise<File | null>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker("/story-photo-worker.js");
    } catch {
      resolve(null);
      return;
    }
    const requestId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;
    let timeout = 0;
    const finish = (result: File | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker.terminate();
      resolve(result);
    };
    timeout = window.setTimeout(() => finish(null), 30_000);
    worker.onerror = () => finish(null);
    worker.onmessage = (event: MessageEvent<{
      id?: string;
      ok?: boolean;
      blob?: Blob;
      type?: string;
    }>) => {
      const payload = event.data;
      if (payload?.id !== requestId) return;
      if (!payload.ok || !(payload.blob instanceof Blob)) {
        finish(null);
        return;
      }
      const extension = payload.type === "image/jpeg" ? "jpg" : "webp";
      finish(new File(
        [payload.blob],
        `${file.name.replace(/\.[^.]+$/, "") || "wondosim"}.${extension}`,
        { type: payload.type || payload.blob.type },
      ));
    };
    worker.postMessage({
      id: requestId,
      file,
      attempts: STORY_PHOTO_ENCODING_ATTEMPTS,
      targetBytes: STORY_PHOTO_TARGET_BYTES,
    });
  });
}

async function decodeStoryPhoto(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        drawable: bitmap as CanvasImageSource,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // 일부 HEIC·기기별 사진은 아래 이미지 요소 방식으로 다시 시도합니다.
    }
  }
  const source = URL.createObjectURL(file);
  try {
    const image = await loadImage(source);
    return {
      drawable: image as CanvasImageSource,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(source),
    };
  } catch (error) {
    URL.revokeObjectURL(source);
    throw error;
  }
}

async function prepareStoryPhoto(file: File) {
  if (file.size > STORY_PHOTO_MAX_SOURCE_BYTES) throw new Error("photo-source-too-large");
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= STORY_PHOTO_TARGET_BYTES) return file;
  const workerPrepared = await prepareStoryPhotoInWorker(file);
  if (workerPrepared) return workerPrepared;
  let canvas: HTMLCanvasElement | null = null;
  let release = () => {};
  try {
    const image = await decodeStoryPhoto(file).catch(() => {
      throw new Error("photo-decode-failed");
    });
    release = image.release;
    if (!image.width || !image.height) throw new Error("photo-decode-failed");
    canvas = document.createElement("canvas");
    let smallestBlob: Blob | null = null;
    let renderedWidth = 0;
    let renderedHeight = 0;

    for (const attempt of STORY_PHOTO_ENCODING_ATTEMPTS) {
      const scale = Math.min(1, attempt.maximumEdge / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      let blob: Blob | null = null;
      try {
        if (width !== renderedWidth || height !== renderedHeight) {
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) continue;
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image.drawable, 0, 0, width, height);
          renderedWidth = width;
          renderedHeight = height;
        }
        blob = await timedPhotoBlob(canvas, attempt.type, attempt.quality);
      } catch {
        // 한 인코더가 실패해도 더 작은 JPEG 단계까지 계속 시도합니다.
      }
      if (!blob || blob.type !== attempt.type) continue;
      if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
      if (blob.size <= STORY_PHOTO_TARGET_BYTES) {
        const extension = blob.type === "image/jpeg" ? "jpg" : "webp";
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "wondosim"}.${extension}`, { type: blob.type });
      }
    }

    if (smallestBlob) throw new Error("photo-compression-target-failed");
    throw new Error("photo-encode-failed");
  } catch (error) {
    if (error instanceof Error && [
      "photo-source-too-large",
      "photo-decode-failed",
      "photo-encode-failed",
      "photo-compression-target-failed",
    ].includes(error.message)) throw error;
    throw new Error("photo-encode-failed");
  } finally {
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
    release();
  }
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

function denseLabelRenderScale(
  zoom: number,
  stageDimensions: StageDimensions,
  labelKeepsScreenSize = true,
) {
  const inverseZoom = labelKeepsScreenSize ? 1 / Math.max(zoom, 0.22) : 1;
  return {
    x: EXPORT_CANONICAL_WIDTH / Math.max(stageDimensions.width, 1) * inverseZoom,
    y: (EXPORT_CANONICAL_WIDTH / MAP_ASPECT) / Math.max(stageDimensions.height, 1) * inverseZoom,
  };
}

function denseLabelScreenTarget(
  cluster: Pick<DenseLabelCluster, "x" | "y">,
  row: Pick<DenseLabelRow, "targetX" | "targetY">,
  zoom: number,
  stageDimensions: StageDimensions,
  labelKeepsScreenSize = true,
) {
  const scale = denseLabelRenderScale(zoom, stageDimensions, labelKeepsScreenSize);
  return {
    x: cluster.x + (row.targetX - cluster.x) * scale.x,
    y: cluster.y + (row.targetY - cluster.y) * scale.y,
  };
}

function partitionDenseGroup(group: MapElement[], maximumItems = 18) {
  if (group.length <= maximumItems) return [group];
  const remaining = [...group].sort((a, b) => a.y - b.y || a.x - b.x || a.name.localeCompare(b.name, "ko"));
  const chunks: MapElement[][] = [];
  const chunkCount = Math.ceil(remaining.length / maximumItems);
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const chunksLeft = chunkCount - chunkIndex;
    const targetSize = Math.ceil(remaining.length / chunksLeft);
    const chunk = [remaining.shift()!];
    while (chunk.length < targetSize && remaining.length) {
      const centerX = chunk.reduce((sum, element) => sum + element.x, 0) / chunk.length;
      const centerY = chunk.reduce((sum, element) => sum + element.y, 0) / chunk.length;
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      remaining.forEach((element, index) => {
        const distance = Math.hypot(element.x - centerX, (element.y - centerY) / MAP_ASPECT);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      chunk.push(remaining.splice(nearestIndex, 1)[0]);
    }
    chunks.push(chunk);
  }
  return chunks;
}

function compactDenseLabelLayout(group: MapElement[], singleColumn = false) {
  const columnCount = singleColumn ? 1 : group.length <= 6 ? 1 : group.length <= 14 ? 2 : 3;
  const byHorizontalPosition = [...group].sort((a, b) => a.x - b.x || a.y - b.y || a.name.localeCompare(b.name, "ko"));
  const perColumn = Math.ceil(byHorizontalPosition.length / columnCount);
  const columns = Array.from({ length: columnCount }, (_, columnIndex) => (
    byHorizontalPosition
      .slice(columnIndex * perColumn, Math.min((columnIndex + 1) * perColumn, byHorizontalPosition.length))
      .sort((a, b) => a.y - b.y || a.x - b.x || a.name.localeCompare(b.name, "ko"))
  )).filter((column) => column.length > 0);
  const columnWidths = columns.map((column) => {
    const longestName = Math.max(...column.map((element) => Array.from(element.name).length));
    return Math.max(5.2, longestName * 0.72 + 1.15);
  });
  const rowCount = Math.max(...columns.map((column) => column.length));
  const width = Math.max(7.2, columnWidths.reduce((sum, value) => sum + value, 0) + Math.max(0, columns.length - 1) * 0.34 + 0.68);
  const height = Math.max(3.2, 1.48 + rowCount * 0.9);
  return { columns, columnCount: columns.length, rowCount, columnWidths, width, height };
}

function denseLabelPositionOverride(group: MapElement[], positionOverrides: DenseLabelPosition[]) {
  const key = denseLabelKey(group);
  const exact = positionOverrides.find((position) => position.key === key);
  if (exact) return { position: exact, keys: [exact.key] };
  const ids = new Set(group.map((element) => element.id));
  const related = positionOverrides.flatMap((position) => {
    const overlap = position.elementIds.reduce((count, id) => count + Number(ids.has(id)), 0);
    return overlap >= 2 && overlap / Math.max(position.elementIds.length, 1) >= 0.5 ? [{ position, overlap }] : [];
  });
  if (!related.length) return { position: undefined, keys: [] as string[] };
  const weight = related.reduce((sum, item) => sum + item.overlap, 0);
  return {
    position: {
      key,
      elementIds: group.map((element) => element.id).sort(),
      x: related.reduce((sum, item) => sum + item.position.x * item.overlap, 0) / weight,
      y: related.reduce((sum, item) => sum + item.position.y * item.overlap, 0) / weight,
    },
    keys: related.map((item) => item.position.key),
  };
}

function buildDenseLabelClusters(
  labelElements: MapElement[],
  iconElements: MapElement[],
  positionOverrides: DenseLabelPosition[] = [],
  excludedElementIds: Iterable<string> = [],
  densityScale = 1,
  persistentOnly = false,
  layoutOptions: {
    maximumItems?: number;
    renderScale?: { x: number; y: number };
    singleColumn?: boolean;
    viewportBounds?: NormalizedRect;
  } = {},
): DenseLabelCluster[] {
  // A fixed label still belongs to its ordinary marker and can be represented by a
  // dense-label cluster. The lock protects the saved direction/gap/offset; it must
  // not opt the label out of the temporary screen/print presentation layer.
  const excludedIds = new Set(excludedElementIds);
  const iconElementIds = new Set(iconElements.map((element) => element.id));
  const candidates = labelElements.filter((element) => element.category !== "landmark" && iconElementIds.has(element.id) && !excludedIds.has(element.id));
  if (candidates.length < 2) return [];
  const parent = candidates.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const unite = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  const connections = denseLabelConnections(candidates, { mapAspect: MAP_ASPECT, densityScale });
  if (!persistentOnly) connections.adaptiveEdges.forEach(([index, other]: [number, number]) => unite(index, other));
  connections.persistentGroups.forEach((group: number[]) => group.slice(1).forEach((index) => unite(group[0], index)));
  const groups = new Map<number, MapElement[]>();
  candidates.forEach((element, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), element]);
  });
  const clusterGroups = [...groups.values()]
    .filter((group) => group.length >= 2)
    .flatMap((group) => partitionDenseGroup(group, layoutOptions.maximumItems ?? 18));
  const clusteredCandidateIds = new Set(clusterGroups.flatMap((group) => group.map((element) => element.id)));
  const renderScale = {
    x: clamp(layoutOptions.renderScale?.x ?? 1, 0.02, 8),
    y: clamp(layoutOptions.renderScale?.y ?? 1, 0.02, 8),
  };
  const iconRects = iconElements.map((element) => {
    const displaySize = mapElementDisplaySize(element);
    const height = displaySize * MAP_ASPECT / 1.12;
    return {
      id: element.id,
      category: element.category,
      rect: {
        left: element.x - displaySize * 0.48,
        right: element.x + displaySize * 0.48,
        top: element.y - height * 0.48,
        bottom: element.y + height * 0.48,
      },
    };
  });
  const labelRects = labelElements.filter((element) => !clusteredCandidateIds.has(element.id)).map((element) => {
    const width = clamp(Array.from(element.name).length * 0.76 + 0.7, 2.4, 24) * renderScale.x;
    const height = 1.34 * renderScale.y;
    const displaySize = mapElementDisplaySize(element);
    const elementHeight = displaySize * MAP_ASPECT / 1.12;
    const offsetX = element.labelOffsetX / EXPORT_CANONICAL_WIDTH * 100;
    const offsetY = element.labelOffsetY / (EXPORT_CANONICAL_WIDTH / MAP_ASPECT) * 100;
    const gapX = 0.6 + element.labelGap / EXPORT_CANONICAL_WIDTH * 100;
    const gapY = 0.6 + element.labelGap / (EXPORT_CANONICAL_WIDTH / MAP_ASPECT) * 100;
    let x = element.x + offsetX;
    let y = element.y + offsetY;
    if (element.labelPosition === "top") y -= elementHeight / 2 + gapY + height / 2;
    if (element.labelPosition === "bottom") y += elementHeight / 2 + gapY + height / 2;
    if (element.labelPosition === "left") x -= displaySize / 2 + gapX + width / 2;
    if (element.labelPosition === "right") x += displaySize / 2 + gapX + width / 2;
    return { id: element.id, rect: { left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 } };
  });
  const placed: NormalizedRect[] = [];
  const placedSegments: Segment[] = [];
  return clusterGroups
    .map((group) => {
      const key = denseLabelKey(group);
      const overrideMatch = denseLabelPositionOverride(group, positionOverrides);
      return { group, key, override: overrideMatch.position, positionKeys: overrideMatch.keys };
    })
    .sort((a, b) => Number(Boolean(b.override)) - Number(Boolean(a.override)) || b.group.length - a.group.length)
    .map(({ group, key, override, positionKeys }) => {
    const layout = compactDenseLabelLayout(group, layoutOptions.singleColumn);
    const orderedGroup = layout.columns.flat();
    const names = orderedGroup.map((element) => element.name);
    const groupIds = new Set(group.map((element) => element.id));
    const minX = Math.min(...orderedGroup.map((element) => element.x - mapElementDisplaySize(element) / 2));
    const maxX = Math.max(...orderedGroup.map((element) => element.x + mapElementDisplaySize(element) / 2));
    const minY = Math.min(...orderedGroup.map((element) => element.y - mapElementDisplaySize(element) * MAP_ASPECT / 2.24));
    const maxY = Math.max(...orderedGroup.map((element) => element.y + mapElementDisplaySize(element) * MAP_ASPECT / 2.24));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const { width, height } = layout;
    const placementWidth = width * renderScale.x;
    const placementHeight = height * renderScale.y;
    const rowsForPlacement = (placementX: number, placementY: number) => {
      const rowTop = placementY - height / 2 + 1.17;
      const rowHeight = 0.9;
      return layout.columns.flatMap((columnElements, columnIndex) => columnElements.map((element, rowIndex) => {
        const midpoint = (layout.columnCount - 1) / 2;
        const targetX = columnIndex < midpoint
          ? placementX - width / 2
          : columnIndex > midpoint
            ? placementX + width / 2
            : element.x <= placementX ? placementX - width / 2 : placementX + width / 2;
        return { element, targetX, targetY: rowTop + rowHeight * (rowIndex + 0.5), column: columnIndex, rowIndex };
      }));
    };
    const automaticOptions = denseLabelPlacementOptions({ minX, maxX, minY, maxY, width: placementWidth, height: placementHeight });
    const rawOptions = override
      ? layoutOptions.viewportBounds
        ? [{ x: override.x, y: override.y, gap: -0.16 }, ...automaticOptions]
        : [{ x: override.x, y: override.y, gap: 0 }]
      : automaticOptions;
    const viewportBounds = layoutOptions.viewportBounds;
    const groupTouchesViewport = Boolean(viewportBounds && orderedGroup.some((element) => (
      element.x >= viewportBounds.left - placementWidth / 2
      && element.x <= viewportBounds.right + placementWidth / 2
      && element.y >= viewportBounds.top - placementHeight / 2
      && element.y <= viewportBounds.bottom + placementHeight / 2
    )));
    const placementBounds = groupTouchesViewport && viewportBounds
      ? viewportBounds
      : { left: 0, right: 100, top: 0, bottom: 100 };
    const options = rawOptions.map((option: { x: number; y: number; gap?: number }) => ({
      ...option,
      ...fitDenseLabelCenter({
        x: option.x,
        y: option.y,
        width: placementWidth,
        height: placementHeight,
        bounds: placementBounds,
      }),
    }));
    const connectorSegmentsFor = (option: { x: number; y: number }) => rowsForPlacement(option.x, option.y).map(({ element, targetX, targetY }) => ({
      fromX: element.x,
      fromY: element.y,
      toX: option.x + (targetX - option.x) * renderScale.x,
      toY: option.y + (targetY - option.y) * renderScale.y,
      id: `${key}:${element.id}`,
      elementId: element.id,
    }));
    const best = chooseDenseLabelPlacement({
      options,
      width: placementWidth,
      height: placementHeight,
      centerX,
      centerY,
      mapAspect: MAP_ASPECT,
      groupIds,
      connectorSegmentsFor,
      iconObstacles: iconRects,
      labelObstacles: labelRects,
      placedRects: placed,
      placedSegments,
    });
    placed.push(best.rect);
    placedSegments.push(...best.segments);
    const x = best.x;
    const y = best.y;
    const rows = rowsForPlacement(x, y).map(({ element, targetX, targetY, column, rowIndex }): DenseLabelRow => ({
      elementId: element.id,
      name: element.name,
      category: element.category,
      targetX,
      targetY,
      column,
      rowIndex,
    }));
    return {
      id: key,
      elementIds: orderedGroup.map((element) => element.id),
      names,
      x,
      y,
      width,
      height,
      manuallyPositioned: Boolean(override),
      hasCollision: best.hasCollision,
      rows,
      columnCount: layout.columnCount,
      rowCount: layout.rowCount,
      columnWidths: layout.columnWidths,
      positionKeys: positionKeys.length ? positionKeys : (override ? [key] : []),
    };
  });
}

function normalizedIconRect(element: MapElement): NormalizedRect {
  const displaySize = mapElementDisplaySize(element);
  const height = displaySize * MAP_ASPECT / 1.12;
  return {
    left: element.x - displaySize * 0.48,
    right: element.x + displaySize * 0.48,
    top: element.y - height * 0.48,
    bottom: element.y + height * 0.48,
  };
}

function normalizedLabelRect(element: MapElement): NormalizedRect {
  const width = clamp(Array.from(element.name).length * 0.76 + 0.7, 2.4, 24);
  const height = 1.34;
  const displaySize = mapElementDisplaySize(element);
  const elementHeight = displaySize * MAP_ASPECT / 1.12;
  const offsetX = element.labelOffsetX / EXPORT_CANONICAL_WIDTH * 100;
  const offsetY = element.labelOffsetY / (EXPORT_CANONICAL_WIDTH / MAP_ASPECT) * 100;
  const gapX = 0.6 + element.labelGap / EXPORT_CANONICAL_WIDTH * 100;
  const gapY = 0.6 + element.labelGap / (EXPORT_CANONICAL_WIDTH / MAP_ASPECT) * 100;
  let x = element.x + offsetX;
  let y = element.y + offsetY;
  if (element.labelPosition === "top") y -= elementHeight / 2 + gapY + height / 2;
  if (element.labelPosition === "bottom") y += elementHeight / 2 + gapY + height / 2;
  if (element.labelPosition === "left") x -= displaySize / 2 + gapX + width / 2;
  if (element.labelPosition === "right") x += displaySize / 2 + gapX + width / 2;
  return { left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 };
}

function rectOutsideMap(rect: NormalizedRect) {
  return rect.left < 0 || rect.top < 0 || rect.right > 100 || rect.bottom > 100;
}

type Segment = { fromX: number; fromY: number; toX: number; toY: number; id: string; elementId?: string };

function buildPrintAudit(
  markerElements: MapElement[],
  labelElements: MapElement[],
  clusters: DenseLabelCluster[],
  exportWidth: number,
): PrintAuditReport {
  const issues: PrintAuditIssue[] = [];
  const clusteredIds = new Set(clusters.flatMap((cluster) => cluster.elementIds));
  const individualLabels = labelElements.filter((element) => !clusteredIds.has(element.id));
  const iconRects = markerElements.map((element) => ({ element, rect: normalizedIconRect(element) }));
  const labelRects = individualLabels.map((element) => ({ element, rect: normalizedLabelRect(element) }));

  iconRects.forEach(({ element, rect }) => {
    if (rectOutsideMap(rect)) issues.push({ id: `clip-icon-${element.id}`, kind: "clipping", label: `${element.name} 마커가 지도 밖으로 잘립니다.`, elementId: element.id });
  });
  labelRects.forEach(({ element, rect }) => {
    if (rectOutsideMap(rect)) issues.push({ id: `clip-label-${element.id}`, kind: "clipping", label: `${element.name} 라벨이 지도 밖으로 잘립니다.`, elementId: element.id });
    if (iconRects.some((icon) => rectsOverlap(rect, icon.rect, 0.18))) {
      issues.push({ id: `overlap-marker-${element.id}`, kind: "overlap", label: `${element.name} 라벨이 마커·랜드마크 이미지를 가립니다.`, elementId: element.id });
    }
  });
  for (let index = 0; index < labelRects.length; index += 1) {
    for (let other = index + 1; other < labelRects.length; other += 1) {
      if (!rectsOverlap(labelRects[index].rect, labelRects[other].rect, 0.12)) continue;
      issues.push({
        id: `overlap-label-${labelRects[index].element.id}-${labelRects[other].element.id}`,
        kind: "overlap",
        label: `${labelRects[index].element.name}·${labelRects[other].element.name} 라벨이 겹칩니다.`,
        elementId: labelRects[index].element.id,
      });
    }
  }
  clusters.forEach((cluster) => {
    const rect = { left: cluster.x - cluster.width / 2, right: cluster.x + cluster.width / 2, top: cluster.y - cluster.height / 2, bottom: cluster.y + cluster.height / 2 };
    if (rectOutsideMap(rect)) issues.push({ id: `clip-cluster-${cluster.id}`, kind: "clipping", label: `${cluster.names.join("·")} 통합 라벨이 지도 밖으로 잘립니다.`, clusterId: cluster.id });
    if (cluster.hasCollision) issues.push({ id: `overlap-cluster-${cluster.id}`, kind: "overlap", label: `${cluster.names.join("·")} 통합 라벨 위치에 겹침이 있습니다.`, clusterId: cluster.id });
  });

  const byId = new Map(markerElements.map((element) => [element.id, element]));
  const segments: Segment[] = clusters.flatMap((cluster) => cluster.rows.flatMap((row) => {
    const element = byId.get(row.elementId);
    return element ? [{ fromX: element.x, fromY: element.y, toX: row.targetX, toY: row.targetY, id: `${cluster.id}:${row.elementId}` }] : [];
  }));
  for (let index = 0; index < segments.length; index += 1) {
    for (let other = index + 1; other < segments.length; other += 1) {
      if (!segmentsCross(segments[index], segments[other])) continue;
      issues.push({ id: `cross-${segments[index].id}-${segments[other].id}`, kind: "crossing", label: "통합 라벨 연결선이 서로 교차합니다." });
    }
  }

  const minimumTextPixels = exportWidth / EXPORT_CANONICAL_WIDTH * 7;
  if (minimumTextPixels < 28) issues.push({ id: "small-text", kind: "text", label: `가장 작은 글자가 ${minimumTextPixels.toFixed(0)}px로 출력 기준보다 작습니다.` });
  return {
    issues,
    clippingCount: issues.filter((issue) => issue.kind === "clipping").length,
    overlapCount: issues.filter((issue) => issue.kind === "overlap").length,
    crossingCount: issues.filter((issue) => issue.kind === "crossing").length,
    minimumTextPixels,
  };
}

function cloneDocument(document: DocumentState): DocumentState {
  return JSON.parse(JSON.stringify(document)) as DocumentState;
}

function uniqueRuntimeId(prefix: "element" | "asset" | "review" | "db-place" | "requested-place", existingIds: Iterable<string>) {
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
  return ensureIndependentMapElementIdentity(elements, { recoverId: recoveredElementId }) as MapElement[];
}

function isSameMapPlace(left: Pick<MapElement, "directoryId" | "name">, right: Pick<MapElement, "directoryId" | "name">) {
  return sameMapPlaceIdentity(left, right, normalizePlaceName);
}

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
    const migrateLegacyPresentation = existingHub.memo === LEGACY_MAIN_HUB_MEMO;
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
        labelGap: migrateLegacyPresentation ? LANDMARK_LABEL_GAP : element.labelGap,
        labelOffsetX: migrateLegacyPresentation ? 0 : element.labelOffsetX,
        labelOffsetY: migrateLegacyPresentation ? 0 : element.labelOffsetY,
        assetId: MAIN_HUB_LANDMARK_ASSET_ID,
        status: "approved" as const,
        mapVisible: true,
        address: hubPlace.address,
        addressSourceUrl: hubPlace.sourceUrl ?? "https://www.jejusotong.kr/",
        memo: STANDARD_MAIN_HUB_MEMO,
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
    size: LANDMARK_RESOURCE_SIZE,
    z: Math.max(0, ...elements.map((element) => element.z)) + 1,
    labelVisible: true,
    labelLocked: false,
    labelPosition: "bottom" as const,
    labelGap: LANDMARK_LABEL_GAP,
    labelOffsetX: 0,
    labelOffsetY: 0,
    assetId: MAIN_HUB_LANDMARK_ASSET_ID,
    status: "approved" as const,
    mapVisible: true,
    address: hubPlace.address,
    addressSourceUrl: hubPlace.sourceUrl ?? "",
    memo: STANDARD_MAIN_HUB_MEMO,
  }];
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
    status: "approved",
    memo: "LPP 공식 주소·카카오맵 좌표 확인 · 2차 공개 탐색 패치",
  }];
}

function sanitizeDocument(document: DocumentState): DocumentState {
  const storedAssetStatuses = new Map(document.assets.map((asset) => [asset.id, asset.status]));
  const sanitizedElements = document.elements
    .filter((element) => !DELETED_PLACE_NAMES.has(element.name.trim()))
    .map((element) => {
      const normalized = {
        ...elementDefaults,
        ...element,
        locked: Boolean(element.locked),
        status: reviewStatusForCoordinateLock(Boolean(element.locked)),
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
      .filter((place) => !DELETED_PLACE_NAMES.has(place.name.trim()))
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
      .filter((position) => position && typeof position.key === "string" && position.key.length > 0 && Array.isArray(position.elementIds) && position.elementIds.length >= 2 && position.elementIds.length <= 4)
      .map((position) => [position.key, {
        key: position.key,
        elementIds: [...new Set(position.elementIds.filter((id) => typeof id === "string" && id.length > 0))].sort(),
        x: clamp(position.x, 0, 100),
        y: clamp(position.y, 0, 100),
      }])).values()].filter((position) => position.elementIds.length >= 2),
    denseLabelExcludedIds: [...new Set((document.denseLabelExcludedIds ?? []).filter((id) => typeof id === "string" && id.length > 0))],
    placementOverrides: sanitizePlacementOverrides(document.placementOverrides),
  };
}

function placementKey(target: MapElement | DirectoryPlace) {
  const directoryId = "coordinateStatus" in target ? target.id?.trim() : target.directoryId?.trim();
  return directoryId
    ? `directory:${directoryId}`
    : `name:${target.category}:${normalizePlaceName(target.name)}`;
}

function sanitizePlacementOverrides(value: unknown): PlacementOverride[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.flatMap((item): PlacementOverride[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<PlacementOverride>;
    const key = typeof candidate.key === "string" ? candidate.key.trim().slice(0, 220) : "";
    const name = typeof candidate.name === "string" ? normalizePlaceName(candidate.name).slice(0, 160) : "";
    if (!key || !name || (candidate.state !== "unplaced" && candidate.state !== "deleted")) return [];
    const directoryId = typeof candidate.directoryId === "string" && candidate.directoryId.trim()
      ? candidate.directoryId.trim().slice(0, 180)
      : undefined;
    return [{ key, ...(directoryId ? { directoryId } : {}), name, state: candidate.state }];
  });
  return withoutMainHubPlacementOverrides(
    [...new Map(normalized.map((item) => [item.key, item])).values()],
  ).sort((a, b) => a.key.localeCompare(b.key));
}

function applyPlacementOverrides(elements: MapElement[], overrides: PlacementOverride[], authoritative = false) {
  const byKey = new Map(overrides.map((setting) => [setting.key, setting.state]));
  return elements.flatMap((element): MapElement[] => {
    const state = byKey.get(placementKey(element));
    if (state === "deleted") return [];
    return [{ ...element, ...(state === "unplaced" ? { mapVisible: false } : authoritative ? { mapVisible: true } : {}) }];
  });
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
  placementOverrides: PlacementOverride[] = [],
) {
  const deletedKeys = new Set(placementOverrides.filter((item) => item.state === "deleted").map((item) => item.key));
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));
  const byName = new Map(settings.map((setting) => [normalizePlaceName(setting.name), setting]));
  const consumedSettingKeys = new Set<string>();
  const restored = elements.map((element) => {
    if (PRIMARY_CALIBRATION_NAMES.has(normalizePlaceName(element.name))) return element;
    const setting = byKey.get(lockedCoordinateKey(element)) ?? byName.get(normalizePlaceName(element.name));
    // The layout and editor draft also persist the lock switch. A missing row
    // in this coordinate-only store must not silently unlock an element during
    // refresh, deployment, or a partial server restore.
    if (!setting) return element;
    consumedSettingKeys.add(setting.key);
    return {
      ...element,
      locked: true,
      status: "approved",
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
    const settingPlacementKey = setting.directoryId
      ? `directory:${setting.directoryId}`
      : `name:${setting.category}:${normalizePlaceName(setting.name)}`;
    if (deletedKeys.has(settingPlacementKey)) return;
    const place = (setting.directoryId ? placesById.get(setting.directoryId) : undefined) ?? placesByName.get(setting.name);
    const category = place?.category ?? setting.category;
    const assetId = defaultMarkerAssetId(category, recommendedMarkerStyle, `${place?.name ?? setting.name} ${place?.subtype ?? ""}`);
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
      status: "approved",
      labelVisible: category === "landmark" || category === "culture" || category === "parking",
      assetId,
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
    values.forEach((raw, index) => {
      if (!Array.isArray(raw) || raw.length < 4) return;
      const name = normalizePlaceName(String(raw[1] ?? ""));
      const address = String(raw[2] ?? "");
      const subtype = String(raw[3] ?? "");
      if (!name || !address || closed.has(name) || DELETED_PLACE_NAMES.has(name)) return;
      const isShop = section === "food" && /소품샵|편집숍|기념품|굿즈숍|상업공간/.test(subtype) && !/식음|카페|커피|음식/.test(subtype);
      rows.push({
        id: `import-${section}-${index + 1}`,
        name,
        address,
        area: String(raw[0] ?? "기타"),
        subtype,
        priority: String(raw[6] ?? ""),
        description: String(raw[4] ?? ""),
        operatingInfo: String(raw[5] ?? ""),
        notes: String(raw[7] ?? ""),
        sourceUrl: String(raw[section === "culture" ? 11 : 10] ?? ""),
        mapUrl: "",
        checkedAt: "",
        sourceSheet: section === "culture" ? "문화공간" : "카페·음식점·소품샵",
        category: section === "culture" ? "culture" : isShop ? "shop" : /카페|커피|로스터|티하우스|북카페|디저트/.test(subtype) ? "cafe" : "food",
      });
    });
  };
  readSection("culture");
  readSection("food");
  if (!rows.length) throw new Error("no supported rows");
  return [...new Map(rows.map((row) => [row.name, row])).values()];
}

type MapRenderActions = {
  measureAssetBounds: (assetId: string, image: HTMLImageElement) => void;
  selectPublicMarker: (elementId: string) => void;
  startDenseLabelDrag: (event: ReactPointerEvent<HTMLDivElement>, cluster: DenseLabelCluster) => void;
  startDrag: (event: ReactPointerEvent<HTMLDivElement>, element: MapElement) => void;
  startLabelDrag: (event: ReactPointerEvent<HTMLDivElement>, element: MapElement) => void;
  startPan: (event: ReactPointerEvent<HTMLElement>, pendingPublicPlaceId?: string, pendingPlaceRequestLocation?: boolean) => void;
  startResize: (event: ReactPointerEvent<HTMLButtonElement>, element: MapElement) => void;
  togglePlaceEventMapSelection: (elementId: string) => void;
};

type MapRenderActionsRef = { current: MapRenderActions | null };
type MobileMarkerPlaceholderLayerRef = { current: HTMLDivElement | null };
type MapLabelStatus = { hasEvent: boolean; reviewCount: number; hasNewReview: boolean };

const EMPTY_MAP_LABEL_STATUS: MapLabelStatus = Object.freeze({ hasEvent: false, reviewCount: 0, hasNewReview: false });

type MapElementMarkerProps = {
  actionsRef: MapRenderActionsRef;
  asset?: MapAsset;
  assetBounds?: VisualBounds;
  collisionClass: string;
  editingEnabled: boolean;
  element: MapElement;
  eventPlacePicked: boolean;
  eventPlaceSelectionMode: boolean;
  fitZoom: number;
  focusPulse: boolean;
  isCalibrationReference: boolean;
  isPublicSelected: boolean;
  isSelected: boolean;
  labelClustered: boolean;
  labelStatus: MapLabelStatus;
  metaColor: string;
  metaGlyph: string;
  placeRequestPickingLocation: boolean;
  printPreviewMode: boolean;
  publicLayoutAccess: PublicLayoutAccess;
  publicSelectedMarkerZIndex: number;
  showLabel: boolean;
  showMarker: boolean;
  viewMode: ViewMode;
  zoom: number;
};

const MapElementMarker = memo(function MapElementMarker({
  actionsRef,
  asset,
  assetBounds,
  collisionClass,
  editingEnabled,
  element,
  eventPlacePicked,
  eventPlaceSelectionMode,
  fitZoom,
  focusPulse,
  isCalibrationReference,
  isPublicSelected,
  isSelected,
  labelClustered,
  labelStatus,
  metaColor,
  metaGlyph,
  placeRequestPickingLocation,
  printPreviewMode,
  publicLayoutAccess,
  publicSelectedMarkerZIndex,
  showLabel,
  showMarker,
  viewMode,
  zoom,
}: MapElementMarkerProps) {
  const isMainHub = isPrimaryHubLabel(element.name);
  const publicElementName = isMainHub ? "제주소통협력센터" : element.name;
  const keyboardSelectable = publicLayoutAccess === "viewer" || eventPlaceSelectionMode;
  const displaySize = mapElementDisplaySize(element);

  return <div
    data-element-id={element.id}
    className={`map-element ${element.category !== "landmark" ? "general-marker" : ""} ${isSelected ? "selected" : ""} ${isPublicSelected ? "public-active" : ""} ${publicLayoutAccess === "viewer" ? "public-interactive" : ""} ${isMainHub ? "main-hub" : ""} ${eventPlacePicked ? "event-place-picked" : ""} ${focusPulse ? "focus-pulse" : ""} ${element.locked && editingEnabled ? "locked" : ""} ${isCalibrationReference ? "calibration-reference" : ""} ${editingEnabled && viewMode === "collisions" ? collisionClass : ""} ${!showMarker || (editingEnabled && viewMode === "labels") ? "label-only" : ""}`}
    style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${displaySize}%`, zIndex: isPublicSelected ? publicSelectedMarkerZIndex : element.z, color: metaColor, opacity: element.opacity / 100 }}
    onPointerDown={eventPlaceSelectionMode
      ? (event) => actionsRef.current?.startPan(event, element.id)
      : editingEnabled
        ? (event) => actionsRef.current?.startDrag(event, element)
        : publicLayoutAccess === "viewer"
          ? (event) => actionsRef.current?.startPan(event, placeRequestPickingLocation ? undefined : element.id, placeRequestPickingLocation)
          : undefined}
    role={keyboardSelectable ? "button" : undefined}
    tabIndex={keyboardSelectable ? 0 : undefined}
    aria-label={eventPlaceSelectionMode ? `${element.name} 행사 장소 ${eventPlacePicked ? "선택 해제" : "추가"}` : publicLayoutAccess === "viewer" ? `${publicElementName} 상세보기` : undefined}
    onKeyDown={keyboardSelectable ? (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (eventPlaceSelectionMode) actionsRef.current?.togglePlaceEventMapSelection(element.id);
      else actionsRef.current?.selectPublicMarker(element.id);
    } : undefined}
  >
    {editingEnabled && (viewMode === "clearance" || (viewMode === "collisions" && collisionClass)) && <span className={`clearance-zone ${viewMode === "clearance" ? "visible" : collisionClass}`} />}
    {showMarker && <div className="icon-visual">{asset ? <img className="placed-asset" src={asset.screenSrc ?? asset.src} alt="" draggable={false} decoding="async" onLoad={(event) => actionsRef.current?.measureAssetBounds(asset.id, event.currentTarget)} /> : <div className={`dummy-symbol ${element.category === "landmark" ? "landmark" : "marker"}`}><span>{metaGlyph}</span></div>}</div>}
    {publicLayoutAccess === "viewer" && (isMainHub || isPublicSelected) && <span className={`map-focus-pointer ${isMainHub ? "main-hub-badge" : "located-place-badge"} ${isPublicSelected ? "located" : ""}`} aria-label={isPublicSelected ? "현재 찾은 장소 ▼" : "주요 거점 ▼"}>{isPublicSelected && <span className="map-focus-pointer-label">찾은 장소</span>}<svg className="main-hub-pointer-icon" viewBox="0 0 24 22" aria-hidden="true"><path d="M5 4.5Q5 3 6.5 3h11Q19 3 19 4.5v1.2q0 .8-.45 1.45l-5.15 10.1Q12 20 10.6 17.25L5.45 7.15Q5 6.5 5 5.7Z" /></svg></span>}
    {editingEnabled && !element.locked && viewMode !== "labels" && (element.category === "landmark" || isSelected) && <span className="review-flag">검수 필요</span>}
    {showLabel && !labelClustered && <div className={`label ${isMainHub ? "primary-hub-label" : ""} ${isSelected ? "label-editable" : ""}`} data-label-id={element.id} style={labelStyle(element.labelPosition, element.labelGap, element.labelOffsetX, element.labelOffsetY, zoom, fitZoom, printPreviewMode ? undefined : assetBounds, !printPreviewMode, publicLayoutAccess === "editor")} onPointerDown={isSelected ? (event) => actionsRef.current?.startLabelDrag(event, element) : undefined} title={isSelected ? "드래그하여 맞춤 화면 기준 라벨 위치 조정" : publicLayoutAccess === "viewer" ? `${publicElementName} 상세보기` : undefined}><span className="map-label-name">{publicElementName}</span>{publicLayoutAccess === "viewer" && !printPreviewMode && (labelStatus.hasEvent || labelStatus.reviewCount > 0) && <span className="map-label-status-rail">{labelStatus.hasEvent && <span className="map-label-status event" aria-label={`${publicElementName} 행사 있음`} title="행사 있음">EVENT</span>}{labelStatus.reviewCount > 0 && <span className={`map-label-status reviews ${labelStatus.hasNewReview ? "new" : ""}`} aria-label={labelStatus.hasNewReview ? `${publicElementName} 최근 3일 내 새 후기 있음` : `${publicElementName} 후기 ${labelStatus.reviewCount}개`} title={labelStatus.hasNewReview ? "최근 3일 내 새 후기" : `후기 ${labelStatus.reviewCount}개`}>{labelStatus.hasNewReview ? "NEW" : labelStatus.reviewCount > 99 ? "99+" : labelStatus.reviewCount}</span>}</span>}</div>}
    {isSelected && !element.locked && <button className="resize-handle" aria-label="크기 조절" onPointerDown={(event) => actionsRef.current?.startResize(event, element)} />}
  </div>;
});

type MapElementLayerProps = {
  actionsRef: MapRenderActionsRef;
  assetVisualBounds: Record<string, VisualBounds>;
  assetsById: Map<string, MapAsset>;
  calibrationMode: boolean;
  calibrationReferenceNames: Set<string>;
  clusteredLabelElementIds: Set<string>;
  collisions: { hard: Set<string>; clearance: Set<string> };
  editingEnabled: boolean;
  eventPlaceKeySet: Set<string>;
  eventPlaceSelectionMode: boolean;
  fitZoom: number;
  focusPulseId: string | null;
  mapLabelStatusByElementId: Map<string, MapLabelStatus>;
  placeRequestPickingLocation: boolean;
  printPreviewMode: boolean;
  publicLayoutAccess: PublicLayoutAccess;
  publicSelectedMarkerZIndex: number;
  selectedId: string | null;
  stageLabelIds: Set<string>;
  stageMarkerIds: Set<string>;
  viewMode: ViewMode;
  visibleElements: MapElement[];
  zoom: number;
};

const MapElementLayer = memo(function MapElementLayer(props: MapElementLayerProps) {
  return <div className="element-layer" data-render-isolation="marker-layer">{props.visibleElements.map((element) => {
    const meta = categoryOf(element.category);
    const asset = element.assetId ? props.assetsById.get(element.assetId) : undefined;
    const collisionClass = props.collisions.hard.has(element.id) ? "collision-hard" : props.collisions.clearance.has(element.id) ? "collision-near" : "";
    return <MapElementMarker
      key={element.id}
      actionsRef={props.actionsRef}
      asset={asset}
      assetBounds={asset ? props.assetVisualBounds[asset.id] : undefined}
      collisionClass={collisionClass}
      editingEnabled={props.editingEnabled}
      element={element}
      eventPlacePicked={props.eventPlaceSelectionMode && props.eventPlaceKeySet.has(placeContentKey(element))}
      eventPlaceSelectionMode={props.eventPlaceSelectionMode}
      fitZoom={props.fitZoom}
      focusPulse={props.editingEnabled && props.focusPulseId === element.id}
      isCalibrationReference={props.editingEnabled && props.calibrationMode && props.calibrationReferenceNames.has(normalizePlaceName(element.name))}
      isPublicSelected={props.publicLayoutAccess === "viewer" && props.selectedId === element.id}
      isSelected={props.editingEnabled && props.selectedId === element.id}
      labelClustered={props.clusteredLabelElementIds.has(element.id)}
      labelStatus={props.mapLabelStatusByElementId.get(element.id) ?? EMPTY_MAP_LABEL_STATUS}
      metaColor={meta.color}
      metaGlyph={meta.glyph}
      placeRequestPickingLocation={props.placeRequestPickingLocation}
      printPreviewMode={props.printPreviewMode}
      publicLayoutAccess={props.publicLayoutAccess}
      publicSelectedMarkerZIndex={props.publicSelectedMarkerZIndex}
      showLabel={props.stageLabelIds.has(element.id)}
      showMarker={props.stageMarkerIds.has(element.id)}
      viewMode={props.viewMode}
      zoom={props.zoom}
    />;
  })}</div>;
});

type MobileMarkerPlaceholderLayerProps = {
  actionsRef: MapRenderActionsRef;
  elements: MapElement[];
  layerRef: MobileMarkerPlaceholderLayerRef;
};

const MobileMarkerPlaceholderLayer = memo(function MobileMarkerPlaceholderLayer({
  actionsRef,
  elements,
  layerRef,
}: MobileMarkerPlaceholderLayerProps) {
  if (!elements.length) return null;
  return <div
    ref={layerRef}
    className="mobile-marker-placeholder-layer"
    data-render-isolation="mobile-marker-placeholder-layer"
    aria-label="간략 장소 마커"
  >
    {elements.map((element) => <button
      type="button"
      className="mobile-marker-placeholder"
      key={element.id}
      style={{
        left: `${element.x}%`,
        top: `${element.y}%`,
        "--mobile-marker-color": mobileMarkerPlaceholderColor(element.category),
      } as CSSProperties}
      onPointerDown={(event) => actionsRef.current?.startPan(event, element.id)}
      aria-label={`${element.name} 간략 마커`}
      title={`${element.name} · 확대하면 일반 마커로 표시`}
    />)}
  </div>;
});

type MapConnectorLayerProps = {
  denseLabelClusters: DenseLabelCluster[];
  printPreviewMode: boolean;
  publicLayoutAccess: PublicLayoutAccess;
  selectedDenseLabelId: string | null;
  selectedId: string | null;
  stageDimensions: StageDimensions;
  viewMode: ViewMode;
  visibleElements: MapElement[];
  visibleElementsById: Map<string, MapElement>;
  zoom: number;
};

const MapConnectorLayer = memo(function MapConnectorLayer({
  denseLabelClusters,
  printPreviewMode,
  publicLayoutAccess,
  selectedDenseLabelId,
  selectedId,
  stageDimensions,
  viewMode,
  visibleElements,
  visibleElementsById,
  zoom,
}: MapConnectorLayerProps) {
  return <svg className="connector-layer" data-render-isolation="connector-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{!printPreviewMode && visibleElements.map((element) => {
    const showAnchor = viewMode === "anchors" || element.connectorVisible || selectedId === element.id;
    if (!showAnchor) return null;
    const showLine = element.connectorVisible && (Math.abs(element.x - element.anchorX) > 0.05 || Math.abs(element.y - element.anchorY) > 0.05);
    return <g key={`anchor-${element.id}`} opacity={element.opacity / 100}>{showLine && <line x1={element.anchorX} y1={element.anchorY} x2={element.x} y2={element.y} stroke={element.connectorColor} strokeWidth={element.connectorWidth / 10} vectorEffect="non-scaling-stroke" />}{selectedId !== element.id && <><circle cx={element.anchorX} cy={element.anchorY} r="0.42" fill="white" stroke={element.connectorColor} strokeWidth="0.13" vectorEffect="non-scaling-stroke" /><circle cx={element.anchorX} cy={element.anchorY} r="0.12" fill={element.connectorColor} /></>}</g>;
  })}{denseLabelClusters.flatMap((cluster) => cluster.rows.map((row) => {
    const element = visibleElementsById.get(row.elementId);
    const color = categoryOf(row.category).color;
    const target = denseLabelScreenTarget(
      cluster,
      row,
      zoom,
      stageDimensions,
      publicLayoutAccess !== "loading",
    );
    const connectorOpacity = element
      ? distanceAwareConnectorOpacity(element.x, element.y, target.x, target.y, MAP_ASPECT)
      : 0.34;
    const publicConnector = publicLayoutAccess === "viewer";
    const connectorWidth = element
      ? distanceAwareConnectorWidth(element.x, element.y, target.x, target.y, MAP_ASPECT, publicConnector ? 1.5 : 2.5)
      : 1.1;
    const selectedConnector = selectedDenseLabelId === cluster.id;
    return element ? <g key={`dense-connector-${cluster.id}-${row.elementId}`} className={`dense-label-connector ${selectedConnector ? "selected" : ""}`} style={{ color }}><line x1={element.x} y1={element.y} x2={target.x} y2={target.y} stroke="currentColor" style={{ opacity: selectedConnector ? Math.max(0.9, connectorOpacity) : connectorOpacity, strokeWidth: selectedConnector ? publicConnector ? 1.55 : 2.5 : connectorWidth }} vectorEffect="non-scaling-stroke" /><circle cx={element.x} cy={element.y} r="0.16" fill="currentColor" vectorEffect="non-scaling-stroke" /></g> : null;
  }))}</svg>;
});

type DenseLabelLayerProps = {
  actionsRef: MapRenderActionsRef;
  denseLabelClusters: DenseLabelCluster[];
  editingEnabled: boolean;
  mapLabelStatusByElementId: Map<string, MapLabelStatus>;
  mobileSingleColumn: boolean;
  placeRequestPickingLocation: boolean;
  printPreviewMode: boolean;
  publicLayoutAccess: PublicLayoutAccess;
  selectedDenseLabelId: string | null;
  zoom: number;
};

const DenseLabelLayer = memo(function DenseLabelLayer({
  actionsRef,
  denseLabelClusters,
  editingEnabled,
  mapLabelStatusByElementId,
  mobileSingleColumn,
  placeRequestPickingLocation,
  printPreviewMode,
  publicLayoutAccess,
  selectedDenseLabelId,
  zoom,
}: DenseLabelLayerProps) {
  if (!denseLabelClusters.length) return null;
  return <div className="dense-label-layer" data-render-isolation="dense-label-layer" aria-label="통합 라벨">
    {denseLabelClusters.map((cluster) => <div
      key={cluster.id}
      className={`dense-label ${cluster.columnCount === 1 ? "single-column" : ""} ${mobileSingleColumn ? "mobile-single-column" : ""} ${cluster.manuallyPositioned ? "manual" : ""} ${cluster.hasCollision ? "collision" : ""} ${selectedDenseLabelId === cluster.id ? "selected" : ""}`}
      style={{ left: `${cluster.x}%`, top: `${cluster.y}%`, width: `${cluster.width / 100 * EXPORT_CANONICAL_WIDTH}px`, height: `${cluster.height / 100 * (EXPORT_CANONICAL_WIDTH / MAP_ASPECT)}px`, transform: `translate(-50%, -50%)${publicLayoutAccess === "editor" ? ` scale(${(1 / Math.max(zoom, 0.22)).toFixed(4)})` : ""}` }}
      onPointerDown={editingEnabled ? (event) => actionsRef.current?.startDenseLabelDrag(event, cluster) : undefined}
      title={editingEnabled ? `${cluster.names.join(" · ")} · 드래그하여 위치 조절` : cluster.names.join(" · ")}
      role={editingEnabled ? "button" : undefined}
      aria-label={editingEnabled ? `${cluster.names.length}곳 묶음 라벨. 드래그하여 위치 조절` : `${cluster.names.length}곳 묶음 라벨`}
    ><span className="dense-label-count">{cluster.names.length}곳</span><strong style={{ gridTemplateColumns: cluster.columnWidths.map((width) => `${width / 100 * EXPORT_CANONICAL_WIDTH}px`).join(" "), gridTemplateRows: `repeat(${cluster.rowCount}, minmax(0, 1fr))` }}>{cluster.rows.map((row) => {
      const rowStatus = mapLabelStatusByElementId.get(row.elementId) ?? EMPTY_MAP_LABEL_STATUS;
      const dotOnRight = row.targetX > cluster.x;
      return <span key={row.elementId} className={`${publicLayoutAccess === "viewer" ? "public-dense-row " : ""}${dotOnRight ? "dense-row-dot-right" : ""}`} style={{ gridColumn: row.column + 1, gridRow: row.rowIndex + 1 }} onPointerDown={publicLayoutAccess === "viewer" ? (event) => actionsRef.current?.startPan(event, placeRequestPickingLocation ? undefined : row.elementId, placeRequestPickingLocation) : undefined} role={publicLayoutAccess === "viewer" ? "button" : undefined} tabIndex={publicLayoutAccess === "viewer" ? 0 : undefined} onKeyDown={publicLayoutAccess === "viewer" && !placeRequestPickingLocation ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); actionsRef.current?.selectPublicMarker(row.elementId); } } : undefined}><i style={{ background: categoryOf(row.category).color }} /><b className="dense-row-name">{row.name}</b>{publicLayoutAccess === "viewer" && !printPreviewMode && rowStatus.hasEvent && <em className="dense-map-event" aria-label={`${row.name} 행사 있음`}>EVENT</em>}{publicLayoutAccess === "viewer" && !printPreviewMode && rowStatus.reviewCount > 0 && <em className={`dense-map-reviews ${rowStatus.hasNewReview ? "new" : ""}`} aria-label={rowStatus.hasNewReview ? `${row.name} 최근 3일 내 새 후기 있음` : `${row.name} 후기 ${rowStatus.reviewCount}개`}>{rowStatus.hasNewReview ? "NEW" : rowStatus.reviewCount > 99 ? "99+" : rowStatus.reviewCount}</em>}</span>;
    })}</strong></div>)}
  </div>;
});

export default function Home() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mobileMarkerPlaceholderLayerRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLElement>(null);
  const printPanelRef = useRef<HTMLElement>(null);
  const baseMapImgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const dbInputRef = useRef<HTMLInputElement>(null);
  const placeQueryInputRef = useRef<HTMLInputElement>(null);
  const publicPlaceQueryInputRef = useRef<HTMLInputElement>(null);
  const databaseEditorQueryInputRef = useRef<HTMLInputElement>(null);
  const mapUploadInputRef = useRef<HTMLInputElement>(null);
  const adminShortcutActionsRef = useRef({ saveDraft: () => {}, undo: () => {}, redo: () => {} });
  const mapRenderActionsRef = useRef<MapRenderActions | null>(null);
  const placeRequestLocationBeforePickingRef = useRef<{ x: number; y: number } | null>(null);
  const eventDialogDragRef = useRef<{ pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const activeTouchPointersRef = useRef(new Map<number, { clientX: number; clientY: number }>());
  const pinchGestureRef = useRef<{
    pointerIds: [number, number];
    startDistance: number;
    startCenterX: number;
    startCenterY: number;
    startZoom: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const panInteractionRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    pendingPublicPlaceId?: string;
    pendingPlaceRequestLocation?: boolean;
  } | null>(null);
  const publicInitialViewAppliedRef = useRef(false);
  const publicNavigationInitializedRef = useRef(false);
  const publicNavigationApplyingRef = useRef(false);
  const publicNavigationAfterPopRef = useRef<"explorer" | null>(null);
  const publicPreserveMapViewOnNextPopRef = useRef(false);
  const publicMapViewBeforeFocusRef = useRef<{ zoom: number; pan: { x: number; y: number } } | null>(null);
  const publicPanelDragRef = useRef<{
    pointerId: number;
    startY: number;
    target: "place" | "explorer";
    startExpanded: boolean;
  } | null>(null);
  const publicPlacePanelRef = useRef<HTMLElement>(null);
  const publicExplorerPanelRef = useRef<HTMLElement>(null);
  const publicPanelMotionFrameRef = useRef<Record<"place" | "explorer", number | null>>({ place: null, explorer: null });
  const publicPanelMotionAnimationRef = useRef<Record<"place" | "explorer", Animation | null>>({ place: null, explorer: null });
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
  const touchTransformBaseZoomRef = useRef(0.72);
  const touchTransformFrameRef = useRef<number | null>(null);
  const touchLayerReleaseFrameRef = useRef<number | null>(null);
  const touchLayerReleaseTimerRef = useRef<number | null>(null);
  const pendingTouchTransformRef = useRef<{ zoom: number; pan: { x: number; y: number } } | null>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const wheelCommitTimerRef = useRef<number | null>(null);
  const editorLabelRevealTimerRef = useRef<number | null>(null);
  const editorLabelZoomRef = useRef(0.72);
  const wheelGestureAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const focusTransitionFrameRef = useRef<number | null>(null);
  const focusTransitionTimerRef = useRef<number | null>(null);
  const focusTransitionTargetRef = useRef<{ zoom: number; pan: { x: number; y: number } } | null>(null);
  const pendingWheelRef = useRef<{ deltaY: number; cursorX: number; cursorY: number } | null>(null);
  const placeDirectoryLoadedRef = useRef(false);
  const directoryTaxonomySaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const directoryTaxonomySaveRunRef = useRef(0);
  const printSettingsRef = useRef<PrintPlaceSetting[]>([]);
  const denseLabelPositionsRef = useRef<DenseLabelPosition[]>([]);
  const denseLabelExcludedIdsRef = useRef<string[]>([]);
  const placementOverridesRef = useRef<PlacementOverride[]>([]);
  const publishedLayoutDocumentRef = useRef<DocumentState | null>(null);
  const publishedLayoutViewRef = useRef<PublicViewSettings | null>(null);
  const publishedLayoutRevisionRef = useRef(0);
  const editorDraftDocumentRef = useRef<DocumentState | null>(null);
  const editorDraftViewRef = useRef<PublicViewSettings | null>(null);
  const editorDraftRevisionRef = useRef(0);

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
  const [stageDimensions, setStageDimensions] = useState<StageDimensions>({
    width: EXPORT_CANONICAL_WIDTH,
    height: EXPORT_CANONICAL_WIDTH / MAP_ASPECT,
  });
  const [viewportDimensions, setViewportDimensions] = useState<StageDimensions>({ width: 0, height: 0 });
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
  const [printSettings, setPrintSettings] = useState<PrintPlaceSetting[]>([]);
  const [printSettingsCanEdit, setPrintSettingsCanEdit] = useState(false);
  const [printSettingsStorage, setPrintSettingsStorage] = useState<"loading" | "persistent" | "local">("loading");
  const [denseLabelPositions, setDenseLabelPositions] = useState<DenseLabelPosition[]>([]);
  const [denseLabelExcludedIds, setDenseLabelExcludedIds] = useState<string[]>([]);
  const [placementOverrides, setPlacementOverrides] = useState<PlacementOverride[]>([]);
  const [selectedDenseLabelId, setSelectedDenseLabelId] = useState<string | null>(null);
  const [denseLabelSettingsCanEdit, setDenseLabelSettingsCanEdit] = useState(false);
  const [denseLabelSettingsStorage, setDenseLabelSettingsStorage] = useState<"loading" | "persistent" | "local">("loading");
  const [denseLabelSettingsRemoteReady, setDenseLabelSettingsRemoteReady] = useState(false);
  const [forceIndividualLabels, setForceIndividualLabels] = useState(false);
  const [placementSettingsRemoteReady, setPlacementSettingsRemoteReady] = useState(false);
  const [publicLayoutAccess, setPublicLayoutAccess] = useState<PublicLayoutAccess>("loading");
  const [publicLayoutPublishedAt, setPublicLayoutPublishedAt] = useState<string | null>(null);
  const [publicLayoutRevision, setPublicLayoutRevision] = useState(0);
  const [publicLayoutHasPrevious, setPublicLayoutHasPrevious] = useState(false);
  const [publicLayoutPublishing, setPublicLayoutPublishing] = useState(false);
  const [editorDraftUpdatedAt, setEditorDraftUpdatedAt] = useState<string | null>(null);
  const [editorDraftRevision, setEditorDraftRevision] = useState(0);
  const [editorDraftHasPrevious, setEditorDraftHasPrevious] = useState(false);
  const [editorDraftSaving, setEditorDraftSaving] = useState(false);
  const [editorDraftSyncState, setEditorDraftSyncState] = useState<"ready" | "saving" | "saved" | "error" | "conflict">("ready");
  const [placeStories, setPlaceStories] = useState<PlaceStory[]>([]);
  const [placeStoriesLoading, setPlaceStoriesLoading] = useState(false);
  const [placeStoriesLoadedKey, setPlaceStoriesLoadedKey] = useState<string | null>(null);
  const [, setPlaceStoriesCanModerate] = useState(false);
  const [globalStoriesOpen, setGlobalStoriesOpen] = useState(false);
  const [publicPanelExpanded, setPublicPanelExpanded] = useState(false);
  const [publicPlaceExpanded, setPublicPlaceExpanded] = useState(false);
  const [publicPanelDrag, setPublicPanelDrag] = useState<{ target: "place" | "explorer"; offsetY: number } | null>(null);
  const [publicPlaceQuery, setPublicPlaceQuery] = useState("");
  const [publicPlaceCategory, setPublicPlaceCategory] = useState<PublicPlaceCategoryScope>("all");
  const [expandedAdditionalCategoryItemId, setExpandedAdditionalCategoryItemId] = useState<string | null>(null);
  const [globalStories, setGlobalStories] = useState<PlaceStory[]>([]);
  const [globalStoriesPage, setGlobalStoriesPage] = useState(1);
  const [globalStoriesPageCount, setGlobalStoriesPageCount] = useState(0);
  const [globalStoriesTotal, setGlobalStoriesTotal] = useState<number | null>(null);
  const [globalStoriesCanModerate, setGlobalStoriesCanModerate] = useState(false);
  const [globalStoriesLoading, setGlobalStoriesLoading] = useState(false);
  const [globalStoriesError, setGlobalStoriesError] = useState(false);
  const [globalStoriesRefreshKey, setGlobalStoriesRefreshKey] = useState(0);
  const [uploadDiagnostics, setUploadDiagnostics] = useState<PlaceStoryUploadDiagnostic[]>([]);
  const [uploadDiagnosticsLoading, setUploadDiagnosticsLoading] = useState(false);
  const [uploadDiagnosticsError, setUploadDiagnosticsError] = useState(false);
  const [uploadDiagnosticsRefreshKey, setUploadDiagnosticsRefreshKey] = useState(0);
  const [uploadDiagnosticActionId, setUploadDiagnosticActionId] = useState<string | null>(null);
  const [performanceDiagnostics, setPerformanceDiagnostics] = useState<PerformanceDiagnostic[]>([]);
  const [performanceDiagnosticsLoading, setPerformanceDiagnosticsLoading] = useState(false);
  const [performanceDiagnosticsError, setPerformanceDiagnosticsError] = useState(false);
  const [performanceDiagnosticsRefreshKey, setPerformanceDiagnosticsRefreshKey] = useState(0);
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
  const [globalContentTab, setGlobalContentTab] = useState<GlobalContentTab>("places");
  const [globalEvents, setGlobalEvents] = useState<PlaceEvent[]>([]);
  const [globalEventsPage, setGlobalEventsPage] = useState(1);
  const [globalEventsPageCount, setGlobalEventsPageCount] = useState(0);
  const [globalEventsTotal, setGlobalEventsTotal] = useState<number | null>(null);
  const [globalEventsCanManage, setGlobalEventsCanManage] = useState(false);
  const [globalEventsLoading, setGlobalEventsLoading] = useState(false);
  const [globalEventsError, setGlobalEventsError] = useState(false);
  const [globalEventsRefreshKey, setGlobalEventsRefreshKey] = useState(0);
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
  const [placeRequests, setPlaceRequests] = useState<PlaceRegistrationRequest[]>([]);
  const [placeRequestsPage, setPlaceRequestsPage] = useState(1);
  const [placeRequestsPageCount, setPlaceRequestsPageCount] = useState(0);
  const [placeRequestsTotal, setPlaceRequestsTotal] = useState<number | null>(null);
  const [placeRequestsLoading, setPlaceRequestsLoading] = useState(false);
  const [placeRequestsError, setPlaceRequestsError] = useState(false);
  const [placeRequestsRefreshKey, setPlaceRequestsRefreshKey] = useState(0);
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
  const [startupAssetsReady, setStartupAssetsReady] = useState(false);
  const [startupInitialViewTarget, setStartupInitialViewTarget] = useState<{ zoom: number; pan: { x: number; y: number } } | null>(null);
  const [startupInitialViewReady, setStartupInitialViewReady] = useState(false);
  const [startupRevealReady, setStartupRevealReady] = useState(false);
  const [startupLoadDone, setStartupLoadDone] = useState(0);
  const [startupLoadTotal, setStartupLoadTotal] = useState(0);
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
  const [, setPrimaryCalibrationStorage] = useState<"loading" | "persistent" | "local">("loading");
  const [primaryCalibrationRemoteReady, setPrimaryCalibrationRemoteReady] = useState(false);
  const [, setLockedCoordinateStorage] = useState<"loading" | "persistent" | "local">("loading");
  const [lockedCoordinatesRemoteReady, setLockedCoordinatesRemoteReady] = useState(false);
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

  const replacePlacementOverrides = useCallback((updater: (current: PlacementOverride[]) => PlacementOverride[]) => {
    setPlacementOverrides((current) => {
      const next = sanitizePlacementOverrides(updater(current));
      placementOverridesRef.current = next;
      return next;
    });
  }, []);

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

  const selected = elements.find((element) => element.id === selectedId) ?? null;
  const selectedNote = reviewNotes.find((note) => note.id === selectedNoteId) ?? null;
  const selectedAnchorDirectoryPlace = selected ? directoryPlaces.find((place) => (
    (selected.directoryId && place.id === selected.directoryId)
    || normalizePlaceName(place.name) === normalizePlaceName(selected.name)
  )) ?? null : null;
  const selectedFacilityPlace = selectedFacilityId
    ? directoryPlaces.find((place) => place.id === selectedFacilityId) ?? null
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
  const selectedLocationGroupPlaces = (() => {
    const groupId = selectedLocationGroupId;
    if (!groupId) return [];
    return directoryPlaces
      .filter((place) => place.locationGroupId === groupId)
      .sort((a, b) => {
        const order = (ART_PLATFORM_FACILITY_NAMES as readonly string[]).indexOf(normalizePlaceName(a.name));
        const otherOrder = (ART_PLATFORM_FACILITY_NAMES as readonly string[]).indexOf(normalizePlaceName(b.name));
        return (order < 0 ? 99 : order) - (otherOrder < 0 ? 99 : otherOrder) || a.name.localeCompare(b.name, "ko");
      });
  })();
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
  const fitZoom = useMemo(() => {
    if (viewportDimensions.width <= 0 || viewportDimensions.height <= 0) return 0.72;
    const compactViewport = viewportDimensions.width <= 760;
    const horizontalPadding = compactViewport ? 18 : 34;
    if (publicLayoutAccess === "viewer") {
      return horizontalMapFitZoom(viewportDimensions.width, stageDimensions.width, horizontalPadding);
    }
    const verticalPadding = compactViewport ? 24 : 34;
    return clamp(Math.min(
      (viewportDimensions.width - horizontalPadding) / Math.max(stageDimensions.width, 1),
      (viewportDimensions.height - verticalPadding) / Math.max(stageDimensions.height, 1),
    ), 0.22, 1.12);
  }, [publicLayoutAccess, stageDimensions.height, stageDimensions.width, viewportDimensions.height, viewportDimensions.width]);
  const labelRenderZoom = publicLayoutAccess === "viewer" ? settledLabelZoom : zoom;
  const labelDetailRatio = labelRenderZoom / Math.max(fitZoom, 0.22);
  const publicDenseLabelViewportBounds = useMemo(() => {
    if (
      publicLayoutAccess !== "viewer"
      || printPreviewMode
      || viewportDimensions.width <= 0
      || viewportDimensions.height <= 0
      || stageDimensions.width <= 0
      || stageDimensions.height <= 0
    ) return undefined;
    const compact = viewportDimensions.width <= 760;
    return publicDenseLabelViewport({
      panX: mapRenderPan.x,
      panY: mapRenderPan.y,
      zoom: labelRenderZoom,
      stageWidth: stageDimensions.width,
      stageHeight: stageDimensions.height,
      viewportWidth: viewportDimensions.width,
      viewportHeight: viewportDimensions.height,
      paddingX: compact ? 12 : 18,
      paddingY: compact ? 14 : 18,
    });
  }, [labelRenderZoom, mapRenderPan.x, mapRenderPan.y, printPreviewMode, publicLayoutAccess, stageDimensions.height, stageDimensions.width, viewportDimensions.height, viewportDimensions.width]);
  const denseLabelLayoutOptions = useMemo(() => {
    if (printPreviewMode || publicLayoutAccess === "loading") return undefined;
    if (publicLayoutAccess === "editor") return {
      maximumItems: 18,
      renderScale: denseLabelRenderScale(labelRenderZoom, stageDimensions, true),
      singleColumn: true,
    };
    if (!publicDenseLabelViewportBounds) return undefined;
    const mobileSingleColumn = viewportDimensions.width <= 760;
    return {
      maximumItems: mobileSingleColumn ? 10 : 18,
      renderScale: denseLabelRenderScale(labelRenderZoom, stageDimensions, true),
      singleColumn: mobileSingleColumn,
      viewportBounds: publicDenseLabelViewportBounds,
    };
  }, [labelRenderZoom, printPreviewMode, publicDenseLabelViewportBounds, publicLayoutAccess, stageDimensions, viewportDimensions.width]);
  const mobileOverviewSimplified = publicLayoutAccess === "viewer"
    && viewportDimensions.width > 0
    && viewportDimensions.width <= 760
    && mobileOverviewIsSimplified(settledLabelZoom, fitZoom);

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

  const editorVisibleElements = useMemo(() => [...elements]
    .filter((element) => element.mapVisible)
    .filter((element) => activeCategory === "all" || element.category === activeCategory)
    .filter((element) => !screenRecommendedOnly || element.category === "landmark" || printPolicyFor(element).recommended)
    .filter((element) => viewMode !== "landmarks" || element.category === "landmark")
    .filter((element) => viewMode !== "markers" || element.category !== "landmark")
    .sort((a, b) => a.z - b.z), [activeCategory, elements, printPolicyFor, screenRecommendedOnly, viewMode]);
  const printMarkerElements = useMemo(() => elements.filter((element) => element.mapVisible && printPolicyFor(element).marker).sort((a, b) => a.z - b.z), [elements, printPolicyFor]);
  const printLabelElements = useMemo(() => elements.filter((element) => element.mapVisible && printPolicyFor(element).label).sort((a, b) => a.z - b.z), [elements, printPolicyFor]);
  const editorLabelCandidates = useMemo(() => editorVisibleElements.filter((element) => {
    if (mobileOverviewSimplified && element.category !== "landmark") return false;
    const selectedLabel = selectedId === element.id;
    const primaryHub = isPrimaryHubLabel(element.name);
    return (element.labelVisible || selectedLabel || (publicLayoutAccess === "viewer" && primaryHub))
      && (element.category === "landmark" || markerLabelsVisible || primaryHub || selectedLabel);
  }), [editorVisibleElements, markerLabelsVisible, mobileOverviewSimplified, publicLayoutAccess, selectedId]);
  const scaleLabelLimitActive = publicLayoutAccess === "viewer";
  const scaleMainHubLabelIds = useMemo(
    () => editorLabelCandidates.filter((element) => isPrimaryHubLabel(element.name)).map((element) => element.id),
    [editorLabelCandidates],
  );
  const scaleMandatoryLabelCount = useMemo(() => {
    const mainHubIds = new Set(scaleMainHubLabelIds);
    return editorLabelCandidates.filter((element) => (
      element.category === "landmark"
      || element.id === selectedId
      || mainHubIds.has(element.id)
    )).length;
  }, [editorLabelCandidates, scaleMainHubLabelIds, selectedId]);
  const scaleLabelBudget = useMemo(() => {
    const optionalLabelCount = Math.max(0, editorLabelCandidates.length - scaleMandatoryLabelCount);
    const baseBudget = scaleMandatoryLabelCount
      + optionalLabelBudgetForScale(
        labelRenderZoom,
        fitZoom,
        optionalLabelCount,
        scaleLabelLimitActive,
        optionalLabelScaleSteps,
      );
    if (publicLayoutAccess !== "viewer" || viewportDimensions.width <= 0 || viewportDimensions.width > 760) return baseBudget;
    return mobileLabelBudgetForScale(labelRenderZoom, fitZoom, baseBudget, editorLabelCandidates.length, mobileRenderBudget.tier);
  }, [editorLabelCandidates.length, fitZoom, labelRenderZoom, mobileRenderBudget.tier, optionalLabelScaleSteps, publicLayoutAccess, scaleLabelLimitActive, scaleMandatoryLabelCount, viewportDimensions.width]);
  const scaleAwareLabelSelection = useMemo(() => chooseScaleAwareLabelIds(editorLabelCandidates, {
    limit: scaleLabelBudget,
    selectedId,
    mainHubIds: scaleMainHubLabelIds,
  }), [editorLabelCandidates, scaleLabelBudget, scaleMainHubLabelIds, selectedId]);
  const editorLabelElements = useMemo(() => {
    if (!scaleAwareLabelSelection.limited) return editorLabelCandidates;
    const selectedLabelIds = new Set(scaleAwareLabelSelection.ids);
    return editorLabelCandidates.filter((element) => selectedLabelIds.has(element.id));
  }, [editorLabelCandidates, scaleAwareLabelSelection]);
  const visibleElements = useMemo(() => {
    if (!printPreviewMode) return editorVisibleElements;
    const byId = new Map([...printMarkerElements, ...printLabelElements].map((element) => [element.id, element]));
    return [...byId.values()].sort((a, b) => a.z - b.z);
  }, [editorVisibleElements, printLabelElements, printMarkerElements, printPreviewMode]);
  const stageMarkerElements = printPreviewMode ? printMarkerElements : editorVisibleElements;
  const stageLabelElements = printPreviewMode ? printLabelElements : editorLabelElements;
  const stageMarkerIds = useMemo(() => new Set(stageMarkerElements.map((element) => element.id)), [stageMarkerElements]);
  const stageLabelIds = useMemo(() => new Set(stageLabelElements.map((element) => element.id)), [stageLabelElements]);
  const visibleElementIds = useMemo(() => new Set(visibleElements.map((element) => element.id)), [visibleElements]);
  const publicSelectedMarkerZIndex = useMemo(
    () => visibleElements.reduce((highest, element) => Math.max(highest, element.z), 0) + 1,
    [visibleElements],
  );

  const publicPlaceItems = useMemo<PublicPlaceListItem[]>(() => {
    const placesById = new Map(directoryPlaces.map((place) => [place.id, place]));
    const placesByName = new Map(directoryPlaces.map((place) => [normalizePlaceName(place.name), place]));
    const placesByGroup = new Map<string, DirectoryPlace[]>();
    directoryPlaces.forEach((place) => {
      if (!place.locationGroupId) return;
      const group = placesByGroup.get(place.locationGroupId) ?? [];
      group.push(place);
      placesByGroup.set(place.locationGroupId, group);
    });
    const items = new Map<string, PublicPlaceListItem>();
    visibleElements.forEach((anchor) => {
      const ownPlace = (anchor.directoryId ? placesById.get(anchor.directoryId) : undefined)
        ?? placesByName.get(normalizePlaceName(anchor.name));
      const candidates = ownPlace?.locationGroupId
        ? placesByGroup.get(ownPlace.locationGroupId) ?? [ownPlace]
        : ownPlace
          ? [ownPlace]
          : [{
            id: `element-${anchor.id}`,
            name: anchor.name,
            category: anchor.category,
            area: anchor.category === "landmark" ? "랜드마크" : "지도 배치",
            address: anchor.address,
            x: anchor.x,
            y: anchor.y,
            coordinateStatus: anchor.category === "landmark" ? "landmark" as const : "review" as const,
            sourceLabel: "공개 지도",
            additionalCategories: [],
          } satisfies DirectoryPlace];
      candidates.forEach((candidate) => {
        const place = withDirectoryMetadata(candidate);
        const itemId = place.id || `element-${anchor.id}`;
        if (items.has(itemId)) return;
        const isMainHub = place.featuredRole === MAIN_HUB_ROLE || isPrimaryHubLabel(place.name);
        const usesMapDisplayName = Boolean(ownPlace && place.id === ownPlace.id);
        items.set(itemId, {
          id: itemId,
          place,
          anchor,
          displayName: usesMapDisplayName ? anchor.name : publicDisplayName(place.name, place.featuredRole),
          categoryId: publicCategoryIdForPlace(place, anchor),
          isMainHub,
        });
      });
    });
    return [...items.values()].sort((a, b) => (
      Number(b.isMainHub) - Number(a.isMainHub)
      || Number(a.place.locationGroupId !== ART_PLATFORM_GROUP_ID) - Number(b.place.locationGroupId !== ART_PLATFORM_GROUP_ID)
      || a.displayName.localeCompare(b.displayName, "ko")
    ));
  }, [directoryPlaces, visibleElements]);

  const eventLinkedPublicPlaceIds = useMemo(() => {
    if (!eventLinkedPlaces.length) return new Set<string>();
    const linkedKeys = new Set(eventLinkedPlaces.map((place) => place.placeKey));
    const linkedNames = new Set(eventLinkedPlaces.map((place) => normalizePlaceName(place.placeName)));
    return new Set(publicPlaceItems.flatMap((item) => {
      const directKey = `directory:${item.place.id}`;
      const anchorKey = placeContentKey(item.anchor);
      const referenceKeys = item.place.id === item.anchor.directoryId || !item.anchor.directoryId
        ? [directKey, anchorKey]
        : [directKey];
      const referenceNames = [item.place.name, item.displayName, ...(item.place.aliases ?? [])]
        .map((name) => normalizePlaceName(name));
      return referenceKeys.some((key) => linkedKeys.has(key)) || referenceNames.some((name) => linkedNames.has(name))
        ? [item.id]
        : [];
    }));
  }, [eventLinkedPlaces, publicPlaceItems]);

  const mapLabelStatusByElementId = useMemo(() => {
    const eventKeys = new Set(eventLinkedPlaces.map((place) => place.placeKey));
    const eventNames = new Set(eventLinkedPlaces.map((place) => normalizePlaceName(place.placeName)));
    const reviewsByKey = new Map(reviewCountsByPlace.map((place) => [place.placeKey, place]));
    const reviewsByName = new Map<string, PlaceReviewCount>();
    reviewCountsByPlace.forEach((place) => {
      const name = normalizePlaceName(place.placeName);
      const current = reviewsByName.get(name);
      if (!current) {
        reviewsByName.set(name, place);
        return;
      }
      const latest = Date.parse(place.latestCreatedAt ?? "") > Date.parse(current.latestCreatedAt ?? "") ? place : current;
      reviewsByName.set(name, { ...latest, count: Math.max(current.count, place.count) });
    });
    return new Map(elements.map((element) => {
      const contentKey = placeContentKey(element);
      const directoryKey = element.directoryId ? `directory:${element.directoryId}` : null;
      const normalizedName = normalizePlaceName(element.name);
      const hasEvent = Boolean(
        (directoryKey && eventKeys.has(directoryKey))
        || eventKeys.has(contentKey)
        || eventNames.has(normalizedName),
      );
      const review = (directoryKey ? reviewsByKey.get(directoryKey) : undefined)
        ?? reviewsByKey.get(contentKey)
        ?? reviewsByName.get(normalizedName);
      const reviewCount = Math.max(0, review?.count ?? 0);
      const latestReviewTimestamp = Date.parse(review?.latestCreatedAt ?? "");
      const hasNewReview = reviewCount > 0
        && Number.isFinite(latestReviewTimestamp)
        && latestReviewTimestamp >= reviewBadgeNow - RECENT_REVIEW_WINDOW_MS;
      return [element.id, { hasEvent, reviewCount, hasNewReview }] as const;
    }));
  }, [elements, eventLinkedPlaces, reviewBadgeNow, reviewCountsByPlace]);

  useLayoutEffect(() => {
    if (!performanceStartedAtRef.current) performanceStartedAtRef.current = performance.now();
  }, []);

  useEffect(() => {
    if (publicLayoutAccess !== "viewer") return;
    const timer = window.setInterval(() => setReviewBadgeNow(Date.now()), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [publicLayoutAccess]);

  const publicPlaceCategoryCounts = useMemo(() => publicListCategories.reduce<Record<PublicPlaceCategoryFilter, number>>((counts, category) => {
    counts[category.id] = placesForPublicCategory(publicPlaceItems, category.id, eventLinkedPublicPlaceIds).length;
    return counts;
  }, Object.fromEntries(publicListCategories.map((category) => [category.id, 0])) as Record<PublicPlaceCategoryFilter, number>), [eventLinkedPublicPlaceIds, publicPlaceItems]);

  const filteredPublicPlaceItems = useMemo(() => {
    const query = publicPlaceQuery.trim().toLocaleLowerCase("ko-KR");
    const scopedItems: PublicPlaceListItem[] = publicPlaceCategory === "all"
      ? publicPlaceItems
      : placesForPublicCategory(publicPlaceItems, publicPlaceCategory, eventLinkedPublicPlaceIds) as PublicPlaceListItem[];
    return scopedItems.filter((item) => {
      if (!query) return true;
      const tags = additionalCategoryDefinitions
        .filter((definition) => sanitizeAdditionalCategories(item.place.additionalCategories).includes(definition.id))
        .map((definition) => definition.name)
        .join(" ");
      const conveniences = convenienceAttributeDefinitions
        .filter((definition) => sanitizeConvenienceAttributes(item.place.convenienceAttributes).includes(definition.id))
        .map((definition) => definition.name)
        .join(" ");
      return `${item.displayName} ${item.place.name} ${(item.place.aliases ?? []).join(" ")} ${item.place.address} ${item.place.area} ${tags} ${conveniences}`.toLocaleLowerCase("ko-KR").includes(query);
    });
  }, [eventLinkedPublicPlaceIds, publicPlaceCategory, publicPlaceItems, publicPlaceQuery]);

  const displayDenseLabelExcludedIds = useMemo(() => [...new Set([
    ...denseLabelExcludedIds,
    ...(publicLayoutAccess === "viewer" ? editorVisibleElements.filter((element) => isPrimaryHubLabel(element.name)).map((element) => element.id) : []),
    ...(selectedId ? [selectedId] : []),
  ])], [denseLabelExcludedIds, editorVisibleElements, publicLayoutAccess, selectedId]);
  const denseLabelClusters = useMemo(() => mergeDenseLabels
    ? buildDenseLabelClusters(
        stageLabelElements,
        stageMarkerElements,
        denseLabelPositions,
        printPreviewMode ? denseLabelExcludedIds : displayDenseLabelExcludedIds,
        printPreviewMode ? 1 : fitZoom / Math.max(labelRenderZoom, 0.22),
        !printPreviewMode && forceIndividualLabels,
        denseLabelLayoutOptions,
      )
    : [], [denseLabelExcludedIds, denseLabelLayoutOptions, denseLabelPositions, displayDenseLabelExcludedIds, fitZoom, forceIndividualLabels, labelRenderZoom, mergeDenseLabels, printPreviewMode, stageLabelElements, stageMarkerElements]);
  const selectedDenseLabel = useMemo(
    () => denseLabelClusters.find((cluster) => cluster.id === selectedDenseLabelId) ?? null,
    [denseLabelClusters, selectedDenseLabelId],
  );
  const denseLabelCollisionCount = useMemo(() => denseLabelClusters.filter((cluster) => cluster.hasCollision).length, [denseLabelClusters]);
  const detachedDenseLabelElements = useMemo(() => denseLabelExcludedIds.flatMap((id) => {
    const element = elements.find((item) => item.id === id);
    return element && element.category !== "landmark" ? [element] : [];
  }).sort((a, b) => a.name.localeCompare(b.name, "ko")), [denseLabelExcludedIds, elements]);

  const printDenseLabelClusters = useMemo(() => mergeDenseLabels
    ? buildDenseLabelClusters(printLabelElements, printMarkerElements, denseLabelPositions, denseLabelExcludedIds)
    : [], [denseLabelExcludedIds, denseLabelPositions, mergeDenseLabels, printLabelElements, printMarkerElements]);
  const printAudit = useMemo(() => buildPrintAudit(printMarkerElements, printLabelElements, printDenseLabelClusters, exportWidth), [exportWidth, printDenseLabelClusters, printLabelElements, printMarkerElements]);

  const collisions = useMemo(() => {
    const hard = new Set<string>();
    const clearance = new Set<string>();
    if (publicLayoutAccess === "viewer") return { hard, clearance };
    const ordered = [...stageMarkerElements].sort((a, b) => a.x - b.x);
    const maximumSize = ordered.reduce((maximum, element) => Math.max(maximum, mapElementDisplaySize(element)), 0);
    for (let index = 0; index < ordered.length; index += 1) {
      const a = ordered[index];
      const aSize = mapElementDisplaySize(a);
      const maximumRelevantDx = (aSize + maximumSize) / 2 * 1.3;
      for (let other = index + 1; other < ordered.length; other += 1) {
        const b = ordered[other];
        const bSize = mapElementDisplaySize(b);
        const dx = Math.abs(a.x - b.x);
        if (dx >= maximumRelevantDx) break;
        const dyAsWidth = Math.abs(a.y - b.y) / MAP_ASPECT;
        const halfWidth = (aSize + bSize) / 2;
        const halfHeight = halfWidth / 1.12;
        if (dx < halfWidth && dyAsWidth < halfHeight) {
          hard.add(a.id); hard.add(b.id);
        } else if (dx < halfWidth * 1.3 && dyAsWidth < halfHeight * 1.3) {
          clearance.add(a.id); clearance.add(b.id);
        }
      }
    }
    return { hard, clearance };
  }, [publicLayoutAccess, stageMarkerElements]);

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
  }, []);

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

  const currentPublicPlaceId = () => {
    const item = publicPlaceItems.find((candidate) => (
      candidate.anchor.id === selectedId
      && (!selectedFacilityId || candidate.place.id === selectedFacilityId)
      && (selectedFacilityId || candidate.place.id === candidate.anchor.directoryId || !candidate.anchor.directoryId)
    ));
    return item?.id ?? selectedFacilityId ?? selectedDirectoryPlace?.id ?? null;
  };

  const confirmDiscardStoryPhoto = (nextPlaceId: string | null = null) => {
    if (!placeStoryPhoto || (nextPlaceId && nextPlaceId === currentPublicPlaceId())) return true;
    if (!window.confirm("선택한 사진은 장소를 벗어나면 사라집니다. 사진을 버리고 이동할까요?\n작성한 후기 문장은 이 세션에 임시 저장됩니다.")) return false;
    updatePlaceStoryPhoto(null);
    return true;
  };

  const rememberPublicMapView = useCallback(() => {
    if (!publicMapViewBeforeFocusRef.current) {
      publicMapViewBeforeFocusRef.current = {
        zoom: zoomRef.current,
        pan: { ...panRef.current },
      };
    }
  }, []);

  const restorePublicMapView = useCallback((clear = false) => {
    const previous = publicMapViewBeforeFocusRef.current;
    const nextZoom = clamp(previous?.zoom ?? fitZoomRef.current, fitZoomRef.current, 4);
    const nextPan = previous?.pan ?? { x: 0, y: 0 };
    zoomRef.current = nextZoom;
    panRef.current = nextPan;
    setZoom(nextZoom);
    setMapPan(nextPan);
    setMapRenderPan(nextPan);
    if (clear) publicMapViewBeforeFocusRef.current = null;
  }, [setMapPan]);

  const writePublicHistory = useCallback((
    panel: PublicPanelHistory,
    placeId: string | null = null,
    mode: "push" | "replace" = "push",
    from?: PublicHistoryState["wondosimFrom"],
    expandedFromCollapsed = false,
  ) => {
    if (!publicNavigationInitializedRef.current || publicNavigationApplyingRef.current) return;
    const current = (window.history.state ?? {}) as PublicHistoryState;
    const currentExplorer = current.wondosimPanel === "explorer" || current.wondosimPanel === "explorer-expanded"
      ? current.wondosimPanel
      : undefined;
    const origin: NonNullable<PublicHistoryState["wondosimFrom"]> = from
      ?? currentExplorer
      ?? current.wondosimFrom
      ?? "map";
    const state: PublicHistoryState = {
      wondosimPanel: panel,
      ...(publicPanelIsPlace(panel) && placeId ? { wondosimPlaceId: placeId, wondosimFrom: origin } : {}),
      ...(publicPanelIsExpanded(panel) && expandedFromCollapsed ? { wondosimExpandedFromCollapsed: true } : {}),
    };
    const url = publicUrlWithPlace(window.location.href, publicPanelIsPlace(panel) ? placeId : null);
    window.history[mode === "push" ? "pushState" : "replaceState"](state, "", url);
  }, []);

  const queuePublicPanelSnap = useCallback((target: "place" | "explorer", expanded: boolean) => {
    const element = target === "place" ? publicPlacePanelRef.current : publicExplorerPanelRef.current;
    if (
      !element
      || typeof element.animate !== "function"
      || !window.matchMedia("(max-width: 760px)").matches
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) return;
    const currentTransform = window.getComputedStyle(element).transform;
    const fromTransform = currentTransform && currentTransform !== "none"
      ? currentTransform
      : `translate3d(0, ${expanded ? 10 : -7}px, 0)`;
    const pendingFrame = publicPanelMotionFrameRef.current[target];
    if (pendingFrame !== null) window.cancelAnimationFrame(pendingFrame);
    publicPanelMotionAnimationRef.current[target]?.cancel();
    publicPanelMotionFrameRef.current[target] = window.requestAnimationFrame(() => {
      publicPanelMotionFrameRef.current[target] = null;
      const panel = target === "place" ? publicPlacePanelRef.current : publicExplorerPanelRef.current;
      if (!panel) return;
      panel.getAnimations().forEach((animation) => animation.cancel());
      const animation = panel.animate([
        { transform: fromTransform, opacity: 0.96 },
        { transform: "translate3d(0, 0, 0)", opacity: 1 },
      ], {
        duration: PUBLIC_PANEL_MOTION_MS,
        easing: "cubic-bezier(.22, .78, .28, 1)",
      });
      publicPanelMotionAnimationRef.current[target] = animation;
      animation.addEventListener("finish", () => {
        if (publicPanelMotionAnimationRef.current[target] === animation) publicPanelMotionAnimationRef.current[target] = null;
      }, { once: true });
    });
  }, []);

  const setPublicPanelExpansion = (target: "place" | "explorer", expanded: boolean) => {
    queuePublicPanelSnap(target, expanded);
    if (target === "place") setPublicPlaceExpanded(expanded);
    else setPublicPanelExpanded(expanded);
    if (!publicNavigationInitializedRef.current || publicNavigationApplyingRef.current) return;
    const current = (window.history.state ?? {}) as PublicHistoryState;
    const collapsedPanel = target;
    const expandedPanel = `${target}-expanded` as PublicPanelHistory;
    if (!expanded && current.wondosimPanel === expandedPanel && current.wondosimExpandedFromCollapsed) {
      window.history.back();
      return;
    }
    writePublicHistory(
      expanded ? expandedPanel : collapsedPanel,
      target === "place" ? current.wondosimPlaceId ?? currentPublicPlaceId() : null,
      current.wondosimPanel === collapsedPanel && expanded ? "push" : "replace",
      current.wondosimFrom,
      expanded && current.wondosimPanel === collapsedPanel,
    );
  };

  useEffect(() => () => {
    (Object.keys(publicPanelMotionFrameRef.current) as Array<"place" | "explorer">).forEach((target) => {
      const pendingFrame = publicPanelMotionFrameRef.current[target];
      if (pendingFrame !== null) window.cancelAnimationFrame(pendingFrame);
      publicPanelMotionAnimationRef.current[target]?.cancel();
    });
  }, []);

  const startPublicPanelDrag = (event: ReactPointerEvent<HTMLDivElement>, target: "place" | "explorer", startExpanded: boolean) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const pendingFrame = publicPanelMotionFrameRef.current[target];
    if (pendingFrame !== null) window.cancelAnimationFrame(pendingFrame);
    publicPanelMotionFrameRef.current[target] = null;
    publicPanelMotionAnimationRef.current[target]?.cancel();
    publicPanelMotionAnimationRef.current[target] = null;
    (target === "place" ? publicPlacePanelRef.current : publicExplorerPanelRef.current)?.getAnimations().forEach((animation) => animation.cancel());
    event.currentTarget.setPointerCapture(event.pointerId);
    publicPanelDragRef.current = { pointerId: event.pointerId, startY: event.clientY, target, startExpanded };
    setPublicPanelDrag({ target, offsetY: 0 });
  };

  const movePublicPanelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = publicPanelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPublicPanelDrag({ target: drag.target, offsetY: clamp(event.clientY - drag.startY, -96, 96) });
  };

  const finishPublicPanelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = publicPanelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaY = event.clientY - drag.startY;
    const nextPanel = publicPanelAfterDrag(drag.target, drag.startExpanded, deltaY);
    publicPanelDragRef.current = null;
    setPublicPanelDrag(null);
    setPublicPanelExpansion(drag.target, publicPanelIsExpanded(nextPanel));
  };

  const selectPublicMarker = (elementId: string) => {
    const item = publicPlaceItems.find((candidate) => (
      candidate.anchor.id === elementId
      && (candidate.place.id === candidate.anchor.directoryId || !candidate.anchor.directoryId)
    )) ?? publicPlaceItems.find((candidate) => candidate.anchor.id === elementId);
    if (!item || !confirmDiscardStoryPhoto(item.id)) return;
    rememberPublicMapView();
    const current = (window.history.state ?? {}) as PublicHistoryState;
    const from: NonNullable<PublicHistoryState["wondosimFrom"]> = current.wondosimPanel === "explorer" || current.wondosimPanel === "explorer-expanded"
      ? current.wondosimPanel
      : "map";
    setSelectedId(elementId);
    setSelectedFacilityId(null);
    setPublicPlaceExpanded(false);
    setGlobalStoriesOpen(false);
    setPublicPanelExpanded(false);
    setSelectedNoteId(null);
    setSelectedDenseLabelId(null);
    writePublicHistory("place", item.id, publicPanelIsPlace(current.wondosimPanel) ? "replace" : "push", from);
  };

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
  }, [expandedAdditionalCategoryItemId]);

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

  useEffect(() => {
    if (publicLayoutAccess === "loading") return;
    if (globalEventsRefreshKey === 0 && eventPlaceIndexBootstrappedRef.current) return;
    const controller = new AbortController();
    void fetch(`${PLACE_EVENTS_API}?scope=place-index`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as PlaceEventsPayload | null;
        if (!response.ok && response.status !== 503) throw new Error(payload?.error ?? "event place index load failed");
        return payload;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setEventLinkedPlaces(Array.isArray(payload?.linkedPlaces) ? payload.linkedPlaces : []);
      })
      .catch((error) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setEventLinkedPlaces([]);
      });
    return () => controller.abort();
  }, [globalEventsRefreshKey, publicLayoutAccess]);

  useEffect(() => {
    if (publicLayoutAccess === "loading" || !globalStoriesOpen || globalContentTab !== "reviews") return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      setGlobalStoriesLoading(true);
      setGlobalStoriesError(false);
      return fetch(`${PLACE_STORIES_API}?scope=all&page=${globalStoriesPage}`, { cache: "no-store", signal: controller.signal });
    })
      .then(async (response) => {
        if (!response) return null;
        const payload = await response.json().catch(() => null) as PlaceStoriesPayload | null;
        if (!response.ok) throw new Error(payload?.error ?? "global story load failed");
        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted || !payload) return;
        setGlobalStories(Array.isArray(payload?.stories) ? payload.stories : []);
        setGlobalStoriesTotal(Math.max(0, Number(payload?.total ?? 0)));
        setGlobalStoriesPageCount(Math.max(0, Number(payload?.pageCount ?? 0)));
        setGlobalStoriesCanModerate(Boolean(payload?.canModerate));
        const normalizedPage = Math.max(1, Number(payload?.page ?? globalStoriesPage));
        if (normalizedPage !== globalStoriesPage) setGlobalStoriesPage(normalizedPage);
      })
      .catch((error) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setGlobalStories([]);
        setGlobalStoriesCanModerate(false);
        setGlobalStoriesError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setGlobalStoriesLoading(false);
      });
    return () => controller.abort();
  }, [globalContentTab, globalStoriesOpen, globalStoriesPage, globalStoriesRefreshKey, publicLayoutAccess]);

  useEffect(() => {
    if (publicLayoutAccess !== "editor" || !globalStoriesOpen || globalContentTab !== "reviews") return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      setUploadDiagnosticsLoading(true);
      setUploadDiagnosticsError(false);
      return fetch(`${PLACE_STORIES_API}?scope=upload-diagnostics`, { cache: "no-store", signal: controller.signal });
    })
      .then(async (response) => {
        if (!response) return null;
        const payload = await response.json().catch(() => null) as PlaceStoryDiagnosticsPayload | null;
        if (!response.ok) throw new Error(payload?.error ?? "upload diagnostics load failed");
        return payload;
      })
      .then((payload) => {
        if (!controller.signal.aborted && payload) setUploadDiagnostics(Array.isArray(payload.diagnostics) ? payload.diagnostics : []);
      })
      .catch((error) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setUploadDiagnosticsError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setUploadDiagnosticsLoading(false);
      });
    return () => controller.abort();
  }, [globalContentTab, globalStoriesOpen, publicLayoutAccess, uploadDiagnosticsRefreshKey]);

  useEffect(() => {
    if (publicLayoutAccess !== "editor" || !globalStoriesOpen || globalContentTab !== "reviews") return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      setPerformanceDiagnosticsLoading(true);
      setPerformanceDiagnosticsError(false);
      return fetch(`${PLACE_STORIES_API}?scope=performance-diagnostics`, { cache: "no-store", signal: controller.signal });
    })
      .then(async (response) => {
        if (!response) return null;
        const payload = await response.json().catch(() => null) as PerformanceDiagnosticsPayload | null;
        if (!response.ok) throw new Error(payload?.error ?? "performance diagnostics load failed");
        return payload;
      })
      .then((payload) => {
        if (!controller.signal.aborted && payload) setPerformanceDiagnostics(Array.isArray(payload.diagnostics) ? payload.diagnostics : []);
      })
      .catch((error) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setPerformanceDiagnosticsError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPerformanceDiagnosticsLoading(false);
      });
    return () => controller.abort();
  }, [globalContentTab, globalStoriesOpen, performanceDiagnosticsRefreshKey, publicLayoutAccess]);

  useEffect(() => {
    if (publicLayoutAccess === "loading" || !globalStoriesOpen || globalContentTab !== "events") return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      setGlobalEventsLoading(true);
      setGlobalEventsError(false);
      return fetch(`${PLACE_EVENTS_API}?scope=all&page=${globalEventsPage}`, { cache: "no-store", signal: controller.signal });
    })
      .then(async (response) => {
        if (!response) return null;
        const payload = await response.json().catch(() => null) as PlaceEventsPayload | null;
        if (!response.ok) throw new Error(payload?.error ?? "global event load failed");
        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted || !payload) return;
        setGlobalEvents(Array.isArray(payload?.events) ? payload.events : []);
        setGlobalEventsTotal(Math.max(0, Number(payload?.total ?? 0)));
        setGlobalEventsPageCount(Math.max(0, Number(payload?.pageCount ?? 0)));
        setGlobalEventsCanManage(Boolean(payload?.canManage));
        const normalizedPage = Math.max(1, Number(payload?.page ?? globalEventsPage));
        if (normalizedPage !== globalEventsPage) setGlobalEventsPage(normalizedPage);
      })
      .catch((error) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setGlobalEvents([]);
        setGlobalEventsCanManage(false);
        setGlobalEventsError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setGlobalEventsLoading(false);
      });
    return () => controller.abort();
  }, [globalContentTab, globalEventsPage, globalEventsRefreshKey, globalStoriesOpen, publicLayoutAccess]);

  useEffect(() => {
    if (publicLayoutAccess !== "editor" || !globalStoriesOpen || globalContentTab !== "place-requests") return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      setPlaceRequestsLoading(true);
      setPlaceRequestsError(false);
      return fetch(`${PLACE_REGISTRATION_REQUESTS_API}?page=${placeRequestsPage}`, { cache: "no-store", signal: controller.signal });
    })
      .then(async (response) => {
        if (!response) return null;
        const payload = await response.json().catch(() => null) as PlaceRegistrationRequestsPayload | null;
        if (!response.ok) throw new Error(payload?.error ?? "place request load failed");
        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted || !payload) return;
        setPlaceRequests(Array.isArray(payload.requests) ? payload.requests : []);
        setPlaceRequestsTotal(Math.max(0, Number(payload.total ?? 0)));
        setPlaceRequestsPageCount(Math.max(0, Number(payload.pageCount ?? 0)));
        const normalizedPage = Math.max(1, Number(payload.page ?? placeRequestsPage));
        if (normalizedPage !== placeRequestsPage) setPlaceRequestsPage(normalizedPage);
      })
      .catch((error) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setPlaceRequests([]);
        setPlaceRequestsError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPlaceRequestsLoading(false);
      });
    return () => controller.abort();
  }, [globalContentTab, globalStoriesOpen, placeRequestsPage, placeRequestsRefreshKey, publicLayoutAccess]);

  useEffect(() => {
    let cancelled = false;
    fetch(PUBLIC_LAYOUT_API, { cache: "no-cache" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as PublicLayoutPayload | null;
        if (!response.ok && response.status !== 503) throw new Error(payload?.error ?? "public layout load failed");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        const canEdit = Boolean(payload?.canEdit);
        setAdminAccessMethod(payload?.accessMethod ?? null);
        const publishedDocument = payload?.document && Array.isArray(payload.document.elements)
          ? sanitizeDocument(payload.document)
          : null;
        publishedLayoutDocumentRef.current = publishedDocument;
        publishedLayoutViewRef.current = payload?.view ?? null;
        setPublicLayoutPublishedAt(payload?.publishedAt ?? null);
        const revision = typeof payload?.revision === "number" ? payload.revision : 0;
        publishedLayoutRevisionRef.current = revision;
        setPublicLayoutRevision(revision);
        setPublicLayoutHasPrevious(Boolean(payload?.hasPrevious));
        setPublicHistory(Array.isArray(payload?.history) ? payload.history : []);
        const serverDraft = payload?.draft?.document && Array.isArray(payload.draft.document.elements)
          ? sanitizeDocument(payload.draft.document)
          : null;
        editorDraftDocumentRef.current = serverDraft;
        editorDraftViewRef.current = payload?.draft?.view ?? null;
        const draftRevision = typeof payload?.draft?.revision === "number" ? payload.draft.revision : 0;
        editorDraftRevisionRef.current = draftRevision;
        setEditorDraftRevision(draftRevision);
        setEditorDraftUpdatedAt(payload?.draft?.updatedAt ?? null);
        setEditorDraftHasPrevious(Boolean(payload?.draft?.hasPrevious));
        setEditorDraftSyncState(serverDraft ? "saved" : "ready");
        if (payload?.contentSummary) {
          setGlobalStoriesTotal(Math.max(0, Number(payload.contentSummary.reviews ?? 0)));
          setGlobalEventsTotal(Math.max(0, Number(payload.contentSummary.events ?? 0)));
          setPlaceRequestsTotal(Math.max(0, Number(payload.contentSummary.placeRequests ?? 0)));
        }
        if (Array.isArray(payload?.eventLinkedPlaces)) {
          eventPlaceIndexBootstrappedRef.current = true;
          setEventLinkedPlaces(payload.eventLinkedPlaces);
        }
        if (Array.isArray(payload?.reviewCountsByPlace)) {
          setReviewCountsByPlace(payload.reviewCountsByPlace);
        }
        if (payload?.uploadedBaseMap?.available) {
          setUploadedBaseMap(payload.uploadedBaseMap);
          setBaseMapCanUpload(Boolean(payload.uploadedBaseMap.canUpload));
        }
        if (canEdit) {
          setPublicLayoutAccess("editor");
          return;
        }
        setPublicLayoutAccess("viewer");
        if (publishedDocument) {
          setDocument(publishedDocument);
          if (payload?.view) {
            setBaseMap(payload.view.baseMap);
            setMarkerLabelsVisible(payload.view.markerLabelsVisible);
            setMergeDenseLabels(payload.view.mergeDenseLabels);
            setScreenRecommendedOnly(payload.view.screenRecommendedOnly);
            setMarkerGroupSize(clamp(payload.view.defaultMarkerSize, 0.8, 15));
            setOptionalLabelScaleSteps(normalizeOptionalLabelScaleSteps(payload.view.optionalLabelScaleSteps));
          }
          setSaveState("공개 배치본");
        } else {
          setDocument({
            elements: initialElements,
            assets: builtInAssets,
            reviewNotes: [],
            directoryPlaces: defaultDirectoryPlaces,
            calibrationPoints: initialCalibrationPoints,
            landmarkDefaultPositions: factoryLandmarkDefaultPositions,
            denseLabelPositions: [],
            denseLabelExcludedIds: [],
            placementOverrides: [],
          });
          setSaveState("공개 배치본 준비 중");
        }
        setLeftOpen(false);
        setRightOpen(false);
        setSelectedId(null);
        setHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPublicLayoutAccess("viewer");
        setLeftOpen(false);
        setRightOpen(false);
        setSelectedId(null);
        setSaveState("공개 배치본을 불러오지 못함");
        setHydrated(true);
      });
    return () => { cancelled = true; };
  }, [setDocument]);

  useEffect(() => {
    if (publicLayoutAccess !== "editor") return;
    const timer = window.setTimeout(() => {
      try {
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
        const persistentDenseLabels = (() => {
          try {
            return JSON.parse(localStorage.getItem(DENSE_LABEL_SETTINGS_KEY) ?? "null") as { positions?: DenseLabelPosition[]; excludedElementIds?: string[]; updatedAt?: string } | null;
          } catch {
            return null;
          }
        })();
        localDenseLabelsUpdatedAtRef.current = Date.parse(persistentDenseLabels?.updatedAt ?? "") || 0;
        const persistentPlacement = (() => {
          try {
            return JSON.parse(localStorage.getItem(PLACEMENT_SETTINGS_KEY) ?? "null") as { settings?: PlacementOverride[]; updatedAt?: string } | null;
          } catch {
            return null;
          }
        })();
        localPlacementUpdatedAtRef.current = Date.parse(persistentPlacement?.updatedAt ?? "") || 0;

        const raw = localStorage.getItem(AUTOSAVE_KEY);
        const localAutosave = raw ? parseVersionedLocalAutosave(raw) as { document: Partial<DocumentState>; baseRevision: number | null; savedAt?: string } | null : null;
        const hasPublishedServerDocument = Boolean(publishedLayoutDocumentRef.current);
        const canRestoreLocalAutosave = shouldRestoreLocalAutosave(localAutosave, hasPublishedServerDocument, publishedLayoutRevisionRef.current);
        const restoreChoice = chooseEditorRestoreSource({
          localAutosave,
          canRestoreLocalAutosave,
          serverDraftDocument: editorDraftDocumentRef.current,
          serverDraftUpdatedAt: editorDraftUpdatedAt,
          publishedAt: publicLayoutPublishedAt,
        }) as { document: Partial<DocumentState> | null; source: "local" | "server" | "none" };
        const parsed = restoreChoice.document;
        const restoredFromServerDraft = restoreChoice.source === "server";
        if (parsed && Array.isArray(parsed.elements)) {
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
                return { ...restored, assetId: LATEST_TAPDONG_SEASIDE_STAGE_ASSET_ID, status: "approved" as AssetStatus, directoryId: "place-tapdong-seaside-stage" };
              }
              const markerDefault = defaultMarkerAssetId(restored.category, recommendedMarkerStyle, restored.name);
              if (!restored.assetId && markerDefault) {
                return { ...restored, assetId: markerDefault, status: markerAssetStatus(recommendedMarkerStyle) };
              }
              return restored;
            });
            const hasExplicitPlacementState = Array.isArray(persistentPlacement?.settings) || Array.isArray(parsed.placementOverrides);
            const migratedPlacementOverrides = hasExplicitPlacementState
              ? sanitizePlacementOverrides(persistentPlacement?.settings ?? parsed.placementOverrides)
              : sanitizePlacementOverrides([
                  ...parsedElements
                    .filter((item) => item.mapVisible === false)
                    .map((item) => ({ key: placementKey(item), ...(item.directoryId ? { directoryId: item.directoryId } : {}), name: item.name, state: "unplaced" as const })),
                  ...initialElements
                    .filter((defaultItem) => !parsedElements.some((item) => isSameMapPlace(item, defaultItem)))
                    .map((item) => ({ key: placementKey(item), ...(item.directoryId ? { directoryId: item.directoryId } : {}), name: item.name, state: "deleted" as const })),
                  ...(persistentLockedCoordinates?.settings ?? [])
                    .filter((setting) => !parsedElements.some((item) => lockedCoordinateKey(item) === setting.key))
                    .map((setting) => ({
                      key: setting.directoryId ? `directory:${setting.directoryId}` : `name:${setting.category}:${normalizePlaceName(setting.name)}`,
                      ...(setting.directoryId ? { directoryId: setting.directoryId } : {}),
                      name: setting.name,
                      state: "deleted" as const,
                    })),
                ]);
            if (!hasExplicitPlacementState && migratedPlacementOverrides.length) {
              const updatedAt = new Date().toISOString();
              localPlacementUpdatedAtRef.current = Date.parse(updatedAt);
              localStorage.setItem(PLACEMENT_SETTINGS_KEY, JSON.stringify({ settings: migratedPlacementOverrides, updatedAt }));
            }
            const deletedPlacementKeys = new Set(migratedPlacementOverrides.filter((item) => item.state === "deleted").map((item) => item.key));
            const mergedElements = [
              ...parsedElements,
              ...initialElements.filter((defaultItem) => (
                !deletedPlacementKeys.has(placementKey(defaultItem))
                && !parsedElements.some((item) => isSameMapPlace(item, defaultItem))
              )),
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
              denseLabelPositions: persistentDenseLabels?.positions ?? parsed.denseLabelPositions,
              denseLabelExcludedIds: persistentDenseLabels?.excludedElementIds ?? parsed.denseLabelExcludedIds,
              placementOverrides: migratedPlacementOverrides,
            });
            if (restoredFromServerDraft) {
              const draftView = editorDraftViewRef.current;
              if (draftView) {
                setBaseMap(draftView.baseMap);
                setMarkerLabelsVisible(draftView.markerLabelsVisible);
                setMergeDenseLabels(draftView.mergeDenseLabels);
                setScreenRecommendedOnly(draftView.screenRecommendedOnly);
                setMarkerGroupSize(clamp(draftView.defaultMarkerSize, 0.8, 15));
                setOptionalLabelScaleSteps(normalizeOptionalLabelScaleSteps(draftView.optionalLabelScaleSteps));
              }
              setSaveState("서버 초안에서 편집 시작");
            } else {
              setSaveState("기기 임시 복구본 적용");
            }
        } else if (publishedLayoutDocumentRef.current) {
          setDocument(cloneDocument(publishedLayoutDocumentRef.current));
          const publishedView = publishedLayoutViewRef.current;
          if (publishedView) {
            setBaseMap(publishedView.baseMap);
            setMarkerLabelsVisible(publishedView.markerLabelsVisible);
            setMergeDenseLabels(publishedView.mergeDenseLabels);
            setScreenRecommendedOnly(publishedView.screenRecommendedOnly);
            setMarkerGroupSize(clamp(publishedView.defaultMarkerSize, 0.8, 15));
            setOptionalLabelScaleSteps(normalizeOptionalLabelScaleSteps(publishedView.optionalLabelScaleSteps));
          }
          setSaveState("공개 배치본에서 편집 시작");
        } else if (persistentCalibration?.calibrationPoints?.length || persistentDenseLabels || persistentPlacement?.settings?.length) {
          setDocument({
            elements: initialElements,
            assets: builtInAssets,
            reviewNotes: [],
            directoryPlaces: defaultDirectoryPlaces,
            calibrationPoints: persistentCalibration?.calibrationPoints,
            landmarkDefaultPositions: persistentCalibration?.landmarkDefaultPositions,
            denseLabelPositions: persistentDenseLabels?.positions,
            denseLabelExcludedIds: persistentDenseLabels?.excludedElementIds,
            placementOverrides: persistentPlacement?.settings,
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
  }, [editorDraftUpdatedAt, publicLayoutAccess, publicLayoutPublishedAt, setDocument]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor") return;
    let idleId: number | null = null;
    const timer = window.setTimeout(() => {
      const save = () => {
        try {
          const autosave: LocalAutosavePayload = {
            schemaVersion: 4,
            savedAt: new Date().toISOString(),
            baseRevision: publishedLayoutRevisionRef.current,
            document: currentDocument(),
          };
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(autosave));
          setSaveState("자동 저장됨");
        } catch {
          setSaveState("저장 공간 부족");
          setToast("대용량 업로드 자산 때문에 브라우저 저장 공간이 부족합니다. JSON을 내려받아 보관해 주세요.");
        }
      };
      if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(save, { timeout: 1200 });
      else save();
    }, 320);
    return () => {
      window.clearTimeout(timer);
      if (idleId !== null && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
    };
  }, [assets, calibrationPoints, currentDocument, denseLabelExcludedIds, denseLabelPositions, directoryPlaces, elements, hydrated, landmarkDefaultPositions, placementOverrides, publicLayoutAccess, reviewNotes]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor") return;
    try {
      localStorage.setItem(VISIBILITY_GROUPS_KEY, JSON.stringify(expandedVisibilityGroups));
    } catch {}
  }, [expandedVisibilityGroups, hydrated, publicLayoutAccess]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor") return;
    try {
      localStorage.setItem(CALIBRATION_GROUPS_KEY, JSON.stringify(expandedCalibrationGroups));
    } catch {}
  }, [expandedCalibrationGroups, hydrated, publicLayoutAccess]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor") return;
    try {
      localStorage.setItem(MAP_VIEW_SETTINGS_KEY, JSON.stringify({
        markerLabelsVisible,
        mergeDenseLabels,
        expandedPlacedMarkerGroups,
      }));
    } catch {}
  }, [expandedPlacedMarkerGroups, hydrated, markerLabelsVisible, mergeDenseLabels, publicLayoutAccess]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor" || placeDirectoryLoadedRef.current) return;
    placeDirectoryLoadedRef.current = true;
    let cancelled = false;
    const applyBundledDirectory = async () => {
      let bundledPlaces = defaultDirectoryPlaces;
      try {
        const { masterDirectoryRows } = await import("./master-directory");
        bundledPlaces = buildDirectoryPlaces(masterDirectoryRows).map((place) => {
          const mapped = calibratedPlaceCoordinates(place.name, place.latitude, place.longitude, initialCalibrationPoints);
          return mapped ? { ...place, ...mapped } : place;
        });
      } catch {}
      if (cancelled) return;
      const bundledRecords = bundledPlaces.map(directoryRecordFromPlace);
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
          void applyBundledDirectory();
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
        setPlaceDirectoryStorage("persistent");
      })
      .catch(() => {
        if (!cancelled) void applyBundledDirectory();
      });
    return () => { cancelled = true; };
  }, [hydrated, publicLayoutAccess, replaceDirectoryPlaces, replaceElements]);

  useEffect(() => {
    if (!hydrated || (publicLayoutAccess === "viewer" && !screenRecommendedOnly)) return;
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
  }, [hydrated, publicLayoutAccess, screenRecommendedOnly]);

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
    if (!hydrated || publicLayoutAccess !== "editor") return;
    let cancelled = false;
    fetch(DENSE_LABEL_SETTINGS_API, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as {
          positions?: DenseLabelPosition[];
          excludedElementIds?: string[];
          persistent?: boolean;
          canEdit?: boolean;
          updatedAt?: string | null;
        } | null;
        if (!response.ok && response.status !== 503) throw new Error("dense label settings load failed");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        const remoteUpdatedAt = Date.parse(payload?.updatedAt ?? "") || 0;
        const shouldRestoreRemote = remoteUpdatedAt > 0
          && (localDenseLabelsUpdatedAtRef.current === 0 || remoteUpdatedAt >= localDenseLabelsUpdatedAtRef.current);
        if (shouldRestoreRemote) {
          const positions = Array.isArray(payload?.positions) ? payload!.positions : [];
          const excludedElementIds = Array.isArray(payload?.excludedElementIds) ? payload!.excludedElementIds : [];
          denseLabelPositionsRef.current = positions;
          denseLabelExcludedIdsRef.current = excludedElementIds;
          setDenseLabelPositions(positions);
          setDenseLabelExcludedIds(excludedElementIds);
          localDenseLabelsUpdatedAtRef.current = remoteUpdatedAt;
        }
        setDenseLabelSettingsCanEdit(Boolean(payload?.canEdit));
        setDenseLabelSettingsStorage(payload?.persistent ? "persistent" : "local");
        setDenseLabelSettingsRemoteReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setDenseLabelSettingsStorage("local");
        setDenseLabelSettingsRemoteReady(true);
      });
    return () => { cancelled = true; };
  }, [hydrated, publicLayoutAccess]);

  const denseLabelSettingsSignature = useMemo(() => JSON.stringify({
    positions: denseLabelPositions,
    excludedElementIds: denseLabelExcludedIds,
  }), [denseLabelExcludedIds, denseLabelPositions]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor" || !denseLabelSettingsRemoteReady) return;
    const updatedAt = new Date().toISOString();
    localDenseLabelsUpdatedAtRef.current = Date.parse(updatedAt);
    try {
      localStorage.setItem(DENSE_LABEL_SETTINGS_KEY, JSON.stringify({
        positions: denseLabelPositionsRef.current,
        excludedElementIds: denseLabelExcludedIdsRef.current,
        updatedAt,
      }));
    } catch {}
    if (!denseLabelSettingsCanEdit) return;
    const timer = window.setTimeout(() => {
      void fetch(DENSE_LABEL_SETTINGS_API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          positions: denseLabelPositionsRef.current,
          excludedElementIds: denseLabelExcludedIdsRef.current,
        }),
      }).then((response) => setDenseLabelSettingsStorage(response.ok ? "persistent" : "local"))
        .catch(() => setDenseLabelSettingsStorage("local"));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [denseLabelSettingsCanEdit, denseLabelSettingsRemoteReady, denseLabelSettingsSignature, hydrated, publicLayoutAccess]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor" || !primaryCalibrationRemoteReady) return;
    try {
      const updatedAt = new Date().toISOString();
      localCalibrationUpdatedAtRef.current = Date.parse(updatedAt);
      localStorage.setItem(CALIBRATION_SETTINGS_KEY, JSON.stringify({
        calibrationPoints,
        landmarkDefaultPositions,
        updatedAt,
      }));
    } catch {}
  }, [calibrationPoints, hydrated, landmarkDefaultPositions, primaryCalibrationRemoteReady, publicLayoutAccess]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor") return;
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
  }, [hydrated, publicLayoutAccess, replaceElements, replaceLandmarkDefaults]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor" || !primaryCalibrationRemoteReady) return;
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
  }, [calibrationPoints, hydrated, primaryCalibrationRemoteReady, publicLayoutAccess]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor") return;
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
          replaceElements((current) => applyLockedCoordinateSettings(current, remoteSettings, placesRef.current, placementOverridesRef.current));
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
  }, [hydrated, publicLayoutAccess, replaceElements]);

  const lockedCoordinateSignature = useMemo(() => JSON.stringify(lockedCoordinateSettingsFor(elements)), [elements]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor" || !lockedCoordinatesRemoteReady) return;
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
  }, [hydrated, lockedCoordinateSignature, lockedCoordinatesRemoteReady, publicLayoutAccess]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor") return;
    let cancelled = false;
    fetch(PLACEMENT_SETTINGS_API, { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { settings?: PlacementOverride[]; updatedAt?: string | null } : null)
      .then((payload) => {
        if (cancelled) return;
        const remoteSettings = sanitizePlacementOverrides(payload?.settings);
        const remoteUpdatedAt = Date.parse(payload?.updatedAt ?? "") || 0;
        const shouldRestoreRemote = remoteUpdatedAt > 0
          && (localPlacementUpdatedAtRef.current === 0 || remoteUpdatedAt >= localPlacementUpdatedAtRef.current);
        if (shouldRestoreRemote) {
          placementOverridesRef.current = remoteSettings;
          setPlacementOverrides(remoteSettings);
          replaceElements((current) => ensureMainHubMapElement(
            applyPlacementOverrides(current, remoteSettings, true),
            placesRef.current,
          ));
          localPlacementUpdatedAtRef.current = remoteUpdatedAt;
          try {
            localStorage.setItem(PLACEMENT_SETTINGS_KEY, JSON.stringify({ settings: remoteSettings, updatedAt: payload!.updatedAt }));
          } catch {}
        }
        setPlacementSettingsRemoteReady(true);
      })
      .catch(() => {
        if (!cancelled) setPlacementSettingsRemoteReady(true);
      });
    return () => { cancelled = true; };
  }, [hydrated, publicLayoutAccess, replaceElements]);

  const placementSignature = useMemo(() => JSON.stringify(placementOverrides), [placementOverrides]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor" || !placementSettingsRemoteReady) return;
    const timer = window.setTimeout(() => {
      const settings = placementOverridesRef.current;
      const updatedAt = new Date().toISOString();
      localPlacementUpdatedAtRef.current = Date.parse(updatedAt);
      try {
        localStorage.setItem(PLACEMENT_SETTINGS_KEY, JSON.stringify({ settings, updatedAt }));
      } catch {}
      void fetch(PLACEMENT_SETTINGS_API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings }),
      }).catch(() => undefined);
    }, 550);
    return () => window.clearTimeout(timer);
  }, [hydrated, placementSettingsRemoteReady, placementSignature, publicLayoutAccess]);

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
    if (publicLayoutAccess === "loading" || !hydrated || startupLoadCompletedRef.current) return;
    let cancelled = false;
    const mapSource = baseMap === "svg"
      ? MAP_SVG
      : baseMap === "png"
        ? MAP_PNG
        : uploadedBaseMapDisplaySource(uploadedBaseMap);
    if (!mapSource) return;
    const primaryHub = visibleElements.find((element) => isPrimaryHubLabel(element.name));
    const primaryHubAsset = primaryHub?.assetId ? assetsById.get(primaryHub.assetId) : undefined;
    const sources = [...new Set([
      "/jfac-signature-b.png",
      mapSource,
      primaryHubAsset?.screenSrc ?? primaryHubAsset?.src,
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
  }, [assetsById, baseMap, hydrated, publicLayoutAccess, uploadedBaseMap, viewportDimensions.width, visibleElements]);

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
    const timer = window.setTimeout(() => {
      startTransition(() => setSettledLabelZoom(zoom));
    }, 140);
    return () => window.clearTimeout(timer);
  }, [zoom]);

  useEffect(() => {
    calibrationLiveApplyRef.current = calibrationLiveApply;
  }, [calibrationLiveApply]);

  const applyTouchMapTransform = useCallback((nextZoom: number, nextPan: { x: number; y: number }) => {
    const stageWrap = stageWrapRef.current;
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    if (!stageWrap || !stage || !viewport) return;
    const scale = nextZoom / Math.max(touchTransformBaseZoomRef.current, 0.01);
    stageWrap.style.transform = `translate3d(calc(-50% + ${nextPan.x}px), calc(-50% + ${nextPan.y}px), 0)`;
    stage.style.transform = mapStageGestureTransform(scale, viewport.clientWidth);
    mobileMarkerPlaceholderLayerRef.current?.style.setProperty("--mobile-marker-gesture-scale", `${1 / scale}`);
    viewport.classList.add("is-direct-manipulation");
  }, []);

  const flushTouchMapTransform = useCallback(() => {
    if (touchTransformFrameRef.current !== null) {
      window.cancelAnimationFrame(touchTransformFrameRef.current);
      touchTransformFrameRef.current = null;
    }
    const pending = pendingTouchTransformRef.current;
    pendingTouchTransformRef.current = null;
    if (pending) applyTouchMapTransform(pending.zoom, pending.pan);
  }, [applyTouchMapTransform]);

  const queueTouchMapTransform = useCallback((nextZoom: number, nextPan: { x: number; y: number }) => {
    zoomRef.current = nextZoom;
    panRef.current = nextPan;
    pendingTouchTransformRef.current = { zoom: nextZoom, pan: nextPan };
    viewportRef.current?.classList.add("is-map-labels-suspended");
    if (touchTransformFrameRef.current !== null) return;
    touchTransformFrameRef.current = window.requestAnimationFrame(() => {
      touchTransformFrameRef.current = null;
      const pending = pendingTouchTransformRef.current;
      pendingTouchTransformRef.current = null;
      if (pending) applyTouchMapTransform(pending.zoom, pending.pan);
    });
  }, [applyTouchMapTransform]);

  const cancelTouchLayerRelease = useCallback(() => {
    if (touchLayerReleaseFrameRef.current !== null) {
      window.cancelAnimationFrame(touchLayerReleaseFrameRef.current);
      touchLayerReleaseFrameRef.current = null;
    }
    if (touchLayerReleaseTimerRef.current !== null) {
      window.clearTimeout(touchLayerReleaseTimerRef.current);
      touchLayerReleaseTimerRef.current = null;
    }
  }, []);

  const scheduleTouchLayerRelease = useCallback((delayMs = 80) => {
    cancelTouchLayerRelease();
    touchLayerReleaseFrameRef.current = window.requestAnimationFrame(() => {
      touchLayerReleaseFrameRef.current = null;
      touchLayerReleaseTimerRef.current = window.setTimeout(() => {
        touchLayerReleaseTimerRef.current = null;
        if (activeTouchPointersRef.current.size > 0 || pinchGestureRef.current) return;
        viewportRef.current?.classList.remove("is-direct-manipulation", "is-map-labels-suspended");
      }, delayMs);
    });
  }, [cancelTouchLayerRelease]);

  const finishProgrammaticMapFocus = useCallback(() => {
    const target = focusTransitionTargetRef.current;
    if (!target) return;
    focusTransitionTargetRef.current = null;
    if (focusTransitionFrameRef.current !== null) {
      window.cancelAnimationFrame(focusTransitionFrameRef.current);
      focusTransitionFrameRef.current = null;
    }
    if (focusTransitionTimerRef.current !== null) {
      window.clearTimeout(focusTransitionTimerRef.current);
      focusTransitionTimerRef.current = null;
    }
    const stageWrap = stageWrapRef.current;
    const stage = stageRef.current;
    if (stageWrap) stageWrap.style.removeProperty("transition");
    if (stage) {
      stage.style.removeProperty("transition");
      stage.style.removeProperty("transform");
    }
    mobileMarkerPlaceholderLayerRef.current?.style.removeProperty("--mobile-marker-gesture-scale");
    setMapLayoutZoom(target.zoom);
    setMapPan(target.pan);
    setMapRenderPan(target.pan);
    touchTransformBaseZoomRef.current = target.zoom;
    zoomRef.current = target.zoom;
    startTransition(() => {
      setZoom(target.zoom);
    });
    scheduleTouchLayerRelease(viewportRef.current?.clientWidth && viewportRef.current.clientWidth <= 760 ? 170 : 80);
  }, [scheduleTouchLayerRelease, setMapLayoutZoom, setMapPan]);

  const beginTouchMapTransform = useCallback(() => {
    finishProgrammaticMapFocus();
    cancelTouchLayerRelease();
    flushTouchMapTransform();
    touchTransformBaseZoomRef.current = zoomRef.current;
    applyTouchMapTransform(zoomRef.current, panRef.current);
  }, [applyTouchMapTransform, cancelTouchLayerRelease, finishProgrammaticMapFocus, flushTouchMapTransform]);

  const commitTouchMapTransform = useCallback(() => {
    flushTouchMapTransform();
    const committedZoom = zoomRef.current;
    const committedPan = { ...panRef.current };
    const zoomChanged = Math.abs(committedZoom - touchTransformBaseZoomRef.current) > 0.002;
    setMapLayoutZoom(committedZoom);
    stageRef.current?.style.removeProperty("transform");
    mobileMarkerPlaceholderLayerRef.current?.style.removeProperty("--mobile-marker-gesture-scale");
    touchTransformBaseZoomRef.current = committedZoom;
    setMapPan(committedPan);
    setMapRenderPan((current) => (
      current.x === committedPan.x && current.y === committedPan.y ? current : committedPan
    ));
    startTransition(() => {
      setZoom(committedZoom);
    });
    scheduleTouchLayerRelease(zoomChanged && viewportRef.current?.clientWidth && viewportRef.current.clientWidth <= 760 ? 170 : 80);
  }, [flushTouchMapTransform, scheduleTouchLayerRelease, setMapLayoutZoom, setMapPan]);

  useLayoutEffect(() => {
    if (publicLayoutAccess === "viewer") setMapPan(panRef.current);
  }, [publicLayoutAccess, setMapPan]);

  useLayoutEffect(() => {
    zoomRef.current = zoom;
    if (publicLayoutAccess === "viewer") setMapLayoutZoom(zoom);
  }, [publicLayoutAccess, setMapLayoutZoom, zoom]);

  useEffect(() => {
    const previousZoom = editorLabelZoomRef.current;
    editorLabelZoomRef.current = zoom;
    if (publicLayoutAccess !== "editor" || Math.abs(previousZoom - zoom) <= 0.0001) return;
    viewportRef.current?.classList.add("is-map-labels-suspended");
    if (editorLabelRevealTimerRef.current !== null) window.clearTimeout(editorLabelRevealTimerRef.current);
    editorLabelRevealTimerRef.current = window.setTimeout(() => {
      editorLabelRevealTimerRef.current = null;
      viewportRef.current?.classList.remove("is-map-labels-suspended");
    }, 150);
  }, [publicLayoutAccess, zoom]);

  useEffect(() => () => {
    if (wheelFrameRef.current !== null) window.cancelAnimationFrame(wheelFrameRef.current);
    if (wheelCommitTimerRef.current !== null) window.clearTimeout(wheelCommitTimerRef.current);
    if (editorLabelRevealTimerRef.current !== null) window.clearTimeout(editorLabelRevealTimerRef.current);
    if (touchTransformFrameRef.current !== null) window.cancelAnimationFrame(touchTransformFrameRef.current);
    if (touchLayerReleaseFrameRef.current !== null) window.cancelAnimationFrame(touchLayerReleaseFrameRef.current);
    if (touchLayerReleaseTimerRef.current !== null) window.clearTimeout(touchLayerReleaseTimerRef.current);
    if (focusTransitionFrameRef.current !== null) window.cancelAnimationFrame(focusTransitionFrameRef.current);
    if (focusTransitionTimerRef.current !== null) window.clearTimeout(focusTransitionTimerRef.current);
    activeTouchPointersRef.current.clear();
    panInteractionRef.current = null;
    pinchGestureRef.current = null;
    pendingTouchTransformRef.current = null;
    wheelGestureAnchorRef.current = null;
    focusTransitionTargetRef.current = null;
  }, []);

  const beginPinchGesture = useCallback(() => {
    const viewport = viewportRef.current?.getBoundingClientRect();
    const pointers = [...activeTouchPointersRef.current.entries()];
    if (!viewport || pointers.length < 2) return false;
    const [[firstId, first], [secondId, second]] = pointers;
    const centerClientX = (first.clientX + second.clientX) / 2;
    const centerClientY = (first.clientY + second.clientY) / 2;
    pinchGestureRef.current = {
      pointerIds: [firstId, secondId],
      startDistance: Math.max(12, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)),
      startCenterX: centerClientX - viewport.left - viewport.width / 2,
      startCenterY: centerClientY - viewport.top - viewport.height / 2,
      startZoom: zoomRef.current,
      startPanX: panRef.current.x,
      startPanY: panRef.current.y,
    };
    beginTouchMapTransform();
    panInteractionRef.current = null;
    viewportRef.current?.classList.remove("is-panning");
    setInteraction(null);
    return true;
  }, [beginTouchMapTransform]);

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
      const existingSamples = performanceSettleSamplesRef.current[sampleKey];
      if (existingSamples >= 2 && durationMs < 80) return;
      performanceSettleSamplesRef.current[sampleKey] = existingSamples + 1;
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
    if (publicLayoutAccess === "editor") {
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      const nextZoom = clamp(currentZoom * Math.exp(-event.deltaY * 0.0012), 0.22, 4);
      const ratio = nextZoom / Math.max(currentZoom, 0.01);
      zoomRef.current = nextZoom;
      setEditorMapPan({
        x: cursorX - (cursorX - currentPan.x) * ratio,
        y: cursorY - (cursorY - currentPan.y) * ratio,
      });
      setZoom(nextZoom);
      return;
    }
    if (wheelCommitTimerRef.current === null) {
      beginTouchMapTransform();
      wheelGestureAnchorRef.current = { x: cursorX, y: cursorY };
    }
    const wheelAnchor = wheelGestureAnchorRef.current ?? { x: cursorX, y: cursorY };
    const pending = pendingWheelRef.current;
    pendingWheelRef.current = {
      deltaY: (pending?.deltaY ?? 0) + event.deltaY,
      cursorX: wheelAnchor.x,
      cursorY: wheelAnchor.y,
    };
    if (wheelFrameRef.current !== null) return;
    wheelFrameRef.current = window.requestAnimationFrame(() => {
      wheelFrameRef.current = null;
      const next = pendingWheelRef.current;
      pendingWheelRef.current = null;
      if (!next) return;
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      const nextZoom = clamp(currentZoom * Math.exp(-next.deltaY * 0.0012), fitZoom, 4);
      const ratio = nextZoom / currentZoom;
      const nextPan = {
        x: next.cursorX - (next.cursorX - currentPan.x) * ratio,
        y: next.cursorY - (next.cursorY - currentPan.y) * ratio,
      };
      // Keep wheel zoom on the same composited coordinate system as pinch.
      // React layout, marker labels, and dense-label collision work are committed
      // once after the wheel stream settles instead of once per wheel frame.
      queueTouchMapTransform(nextZoom, nextPan);
    });
    if (wheelCommitTimerRef.current !== null) window.clearTimeout(wheelCommitTimerRef.current);
    wheelCommitTimerRef.current = window.setTimeout(() => {
      wheelCommitTimerRef.current = null;
      wheelGestureAnchorRef.current = null;
      commitTouchMapTransform();
      recordMapSettle("pinch-settle");
    }, 110);
  };

  const startPan = (event: ReactPointerEvent<HTMLElement>, pendingPublicPlaceId?: string, pendingPlaceRequestLocation = false) => {
    if (event.button !== 0 || memoMode) return;
    event.preventDefault();
    event.stopPropagation();
    if (wheelCommitTimerRef.current !== null) {
      window.clearTimeout(wheelCommitTimerRef.current);
      wheelCommitTimerRef.current = null;
      wheelGestureAnchorRef.current = null;
      commitTouchMapTransform();
    }
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
    finishProgrammaticMapFocus();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const stageWrap = stageWrapRef.current;
    const stage = stageRef.current;
    const viewportElement = viewportRef.current;
    const currentLayoutZoom = Math.max(zoomRef.current, 0.01);
    focusTransitionTargetRef.current = { zoom: targetZoom, pan: targetPan };
    if (reduceMotion || !stageWrap || !stage || !viewportElement) {
      finishProgrammaticMapFocus();
    } else {
      cancelTouchLayerRelease();
      viewportElement.classList.add("is-direct-manipulation");
      viewportElement.classList.add("is-map-labels-suspended");
      stageWrap.style.transition = "transform .3s cubic-bezier(.22, .78, .28, 1)";
      stage.style.transition = "transform .3s cubic-bezier(.22, .78, .28, 1)";
      stage.style.transform = mapStageGestureTransform(1, viewportWidth);
      void stage.offsetWidth;
      focusTransitionFrameRef.current = window.requestAnimationFrame(() => {
        focusTransitionFrameRef.current = null;
        if (!focusTransitionTargetRef.current) return;
        stageWrap.style.transform = `translate3d(calc(-50% + ${targetPan.x}px), calc(-50% + ${targetPan.y}px), 0)`;
        stage.style.transform = mapStageGestureTransform(targetZoom / currentLayoutZoom, viewportWidth);
      });
      focusTransitionTimerRef.current = window.setTimeout(finishProgrammaticMapFocus, 320);
    }
    setFocusPulseId(elementId);
    window.setTimeout(() => setFocusPulseId((current) => current === elementId ? null : current), reduceMotion ? 80 : 900);
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
    const queuedSave = directoryTaxonomySaveQueueRef.current
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
    const queuedSave = directoryTaxonomySaveQueueRef.current
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
    const queuedSave = directoryTaxonomySaveQueueRef.current
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
        current
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

  const addAssetElement = (asset: MapAsset) => {
    pushHistory();
    const count = elementsRef.current.filter((item) => item.assetId === asset.id).length + 1;
    const size = asset.category === "landmark" ? 6.4 : markerGroupSize;
    const next: MapElement = {
      ...elementDefaults, id: uniqueRuntimeId("element", elementsRef.current.map((item) => item.id)), name: asset.placeName ?? (count > 1 ? `${asset.name} ${count}` : asset.name),
      category: asset.category, x: 50, y: 50, anchorX: 50, anchorY: 50, size,
      z: Math.max(0, ...elementsRef.current.map((item) => item.z)) + 1, labelVisible: asset.category === "landmark",
      assetId: asset.id, status: "unchecked", address: asset.address ?? "", addressSourceUrl: asset.addressSourceUrl ?? "",
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
    updateElement(existing.id, { assetId: asset.id });
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
      const screen2048 = await prepareBaseMapScreenVariant(image, 2048, 0.86).catch(() => null);
      const screen4096 = await prepareBaseMapScreenVariant(image, 4096, 0.88).catch(() => null);
      const params = new URLSearchParams({ name: file.name, width: String(width), height: String(height) });
      const response = await fetch(`${UPLOADED_MAP_API}?${params.toString()}`, {
        method: "POST",
        headers: { "content-type": file.type || "image/png" },
        body: file,
      });
      if (!response.ok) throw new Error(`upload ${response.status}`);
      let metadata = await response.json() as UploadedBaseMap;
      const uploadScreenVariant = async (variant: "screen-2048" | "screen-4096", prepared: { blob: Blob; width: number; height: number } | null) => {
        if (!prepared) return false;
        const variantParams = new URLSearchParams({
          variant,
          sourceVersion: metadata.uploadedAt,
          width: String(prepared.width),
          height: String(prepared.height),
        });
        const variantResponse = await fetch(`${UPLOADED_MAP_API}?${variantParams.toString()}`, {
          method: "POST",
          headers: { "content-type": "image/webp" },
          body: prepared.blob,
        });
        return variantResponse.ok;
      };
      const variantResults = await Promise.allSettled([
        uploadScreenVariant("screen-2048", screen2048),
        uploadScreenVariant("screen-4096", screen4096),
      ]);
      if (variantResults.some((result) => result.status === "fulfilled" && result.value)) {
        const metadataResponse = await fetch(`${UPLOADED_MAP_API}?meta=1`, { cache: "no-store" });
        if (metadataResponse.ok) metadata = await metadataResponse.json() as UploadedBaseMap;
      }
      setUploadedBaseMap(metadata);
      setBaseMapCanUpload(Boolean(metadata.canUpload));
      setMapLoaded(false);
      setBaseMap("uploaded");
      setToast(`${file.name}을(를) 저장하고 화면용 경량 지도를 함께 준비했습니다.`);
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
      const place = item.directoryId
        ? directoryPlaces.find((candidate) => candidate.id === item.directoryId)
        : directoryPlaces.find((candidate) => normalizePlaceName(candidate.name) === normalizePlaceName(item.name));
      const nextAssetId = defaultMarkerAssetId(item.category, style, `${item.name} ${place?.subtype ?? ""}`);
      return nextAssetId ? { ...item, assetId: nextAssetId } : item;
    }));
    const styleName = style === "v2" ? "리뉴얼 최종 원형" : style === "01" ? "기본 핀형" : style === "02" ? "아치 배지형" : "유기적 원형";
    setToast(`범용 마커를 ${styleName}으로 통일했습니다.`);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    pushHistory();
    const duplicate = {
      ...selected,
      id: uniqueRuntimeId("element", elementsRef.current.map((item) => item.id)),
      directoryId: undefined,
      name: `${selected.name} 복사본`,
      locked: false,
      status: "unchecked" as const,
      x: clamp(selected.x + 1.2, 0, 100),
      y: clamp(selected.y + 1.2, 0, 100),
      z: Math.max(0, ...elementsRef.current.map((item) => item.z)) + 1,
    };
    replaceElements((current) => [...current, duplicate]); setSelectedId(duplicate.id);
  };

  const toggleSelectedCoordinateReview = () => {
    if (!selected) return;
    const locked = !selected.locked;
    updateElement(selected.id, { locked });
    setCalibrationDirty(true);
    if (locked) setResourceOutputDragMode(false);
    setToast(locked
      ? `${selected.name} 좌표를 고정하고 최종 검수를 완료했습니다.`
      : `${selected.name} 좌표 고정을 해제해 검수 필요 상태로 돌렸습니다.`);
  };

  const deleteSelected = () => {
    if (!selected || selected.locked) return;
    if (isMainHubPersistenceTarget(selected)) {
      setPlacementOverride(selected, null);
      updateElement(selected.id, { mapVisible: true });
      setToast("제주소통협력센터는 주요 거점이므로 지도에서 삭제할 수 없습니다.");
      return;
    }
    pushHistory();
    setPlacementOverride(selected, "deleted");
    replaceElements((current) => current.filter((item) => item.id !== selected.id));
    setSelectedId(null);
  };

  const deleteSelectedNote = () => {
    if (!selectedNote) return;
    pushHistory(); replaceNotes((current) => current.filter((note) => note.id !== selectedNote.id)); setSelectedNoteId(null);
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
    setPrintAuditOpen(true);
    if (printAudit.issues.length > 0 && !window.confirm(`인쇄 전 자동 점검에서 ${printAudit.issues.length}건을 확인했습니다. 현재 상태로도 PNG를 만들까요?`)) {
      setPrintPreviewMode(true);
      setToast("점검 항목을 확인한 뒤 다시 출력해 주세요.");
      return;
    }
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

      const mapSrc = baseMap === "svg" ? MAP_SVG : baseMap === "png" ? MAP_PNG : uploadedBaseMapOriginalSource(uploadedBaseMap) || MAP_SVG;
      const baseImage = await loadImage(mapSrc);
      context.drawImage(baseImage, 0, 0, exportWidth, outputHeight);

      const placedElements = elementsRef.current.filter((element) => element.mapVisible);
      const exportMarkerElements = placedElements.filter((element) => printPolicyFor(element).marker);
      const exportLabelElements = placedElements.filter((element) => printPolicyFor(element).label);
      if (!exportMarkerElements.length && !exportLabelElements.length) throw new Error("empty print composition");
      const labelOnlyCount = exportLabelElements.filter((element) => !exportMarkerElements.some((marker) => marker.id === element.id)).length;
      if (labelOnlyCount) setToast(`마커 없이 라벨만 출력되는 장소가 ${labelOnlyCount}곳 있습니다. 고화질 사본을 계속 합성합니다.`);
      const exportClusters = mergeDenseLabels ? buildDenseLabelClusters(exportLabelElements, exportMarkerElements, denseLabelPositionsRef.current, denseLabelExcludedIdsRef.current) : [];
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
        const boxWidth = exportWidth * mapElementDisplaySize(element) / 100;
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
        context.lineWidth = Math.max(1, exportWidth / EXPORT_CANONICAL_WIDTH * 1.1);
        context.setLineDash([exportWidth / EXPORT_CANONICAL_WIDTH * 3.5, exportWidth / EXPORT_CANONICAL_WIDTH * 2.5]);
        exportClusters.forEach((cluster) => cluster.rows.forEach((row) => {
          const element = placedElements.find((item) => item.id === row.elementId);
          if (!element) return;
          const fromX = exportWidth * element.x / 100;
          const fromY = outputHeight * element.y / 100;
          const toX = exportWidth * row.targetX / 100;
          const toY = outputHeight * row.targetY / 100;
          context.strokeStyle = categoryOf(row.category).color;
          context.fillStyle = categoryOf(row.category).color;
          context.globalAlpha = 0.58;
          context.beginPath();
          context.moveTo(fromX, fromY);
          context.lineTo(toX, toY);
          context.stroke();
          context.beginPath();
          context.arc(fromX, fromY, Math.max(1.2, exportWidth / EXPORT_CANONICAL_WIDTH * 1.5), 0, Math.PI * 2);
          context.fill();
        }));
        context.globalAlpha = 1;
        context.restore();
      }

      const drawLabels = (items: MapElement[]) => items.forEach((element) => {
        if (clusteredExportIds.has(element.id)) return;
        const fontSize = exportWidth / EXPORT_CANONICAL_WIDTH * 9.4;
        const paddingX = exportWidth / EXPORT_CANONICAL_WIDTH * 3;
        const paddingY = exportWidth / EXPORT_CANONICAL_WIDTH * 1.25;
        const gap = exportWidth / EXPORT_CANONICAL_WIDTH * element.labelGap;
        const offsetX = exportWidth / EXPORT_CANONICAL_WIDTH * element.labelOffsetX;
        const offsetY = exportWidth / EXPORT_CANONICAL_WIDTH * element.labelOffsetY;
        const centerX = exportWidth * element.x / 100;
        const centerY = outputHeight * element.y / 100;
        const boxWidth = exportWidth * mapElementDisplaySize(element) / 100;
        const boxHeight = boxWidth / 1.12;
        context.save();
        context.globalAlpha = element.opacity / 100;
        context.font = `700 ${fontSize}px Arial, "Noto Sans KR", sans-serif`;
        context.textBaseline = "middle";
        const metrics = context.measureText(element.name);
        const labelWidth = metrics.width + paddingX * 2;
        const labelHeight = fontSize * 1.1 + paddingY * 2;
        let x = centerX + offsetX;
        let y = centerY + offsetY;
        if (element.labelPosition === "top") y -= boxHeight / 2 + gap + labelHeight / 2;
        if (element.labelPosition === "bottom") y += boxHeight / 2 + gap + labelHeight / 2;
        if (element.labelPosition === "left") x -= boxWidth / 2 + gap + labelWidth / 2;
        if (element.labelPosition === "right") x += boxWidth / 2 + gap + labelWidth / 2;
        const primaryHub = isPrimaryHubLabel(element.name);
        context.fillStyle = primaryHub ? "rgba(255,226,92,.98)" : "rgba(255,255,255,.95)";
        context.strokeStyle = primaryHub ? "rgba(158,116,9,.52)" : "rgba(91,106,101,.24)";
        context.lineWidth = Math.max(1, exportWidth / EXPORT_CANONICAL_WIDTH);
        context.beginPath();
        context.roundRect(x - labelWidth / 2, y - labelHeight / 2, labelWidth, labelHeight, exportWidth / EXPORT_CANONICAL_WIDTH * 2);
        context.fill();
        context.stroke();
        context.fillStyle = primaryHub ? "#493807" : "#26332f";
        context.textAlign = "center";
        context.fillText(element.name, x, y + fontSize * 0.02);
        context.restore();
      });
      drawLabels(exportLabelElements.filter((element) => element.category !== "landmark"));
      drawLabels(exportLabelElements.filter((element) => element.category === "landmark"));

      exportClusters.forEach((cluster) => {
        const scale = exportWidth / EXPORT_CANONICAL_WIDTH;
        const fontSize = scale * 8.5;
        const smallSize = scale * 6.8;
        context.save();
        const labelWidth = exportWidth * cluster.width / 100;
        const labelHeight = outputHeight * cluster.height / 100;
        const x = exportWidth * cluster.x / 100;
        const y = outputHeight * cluster.y / 100;
        context.fillStyle = "rgba(255,255,255,.95)";
        context.strokeStyle = "rgba(91,106,101,.24)";
        context.lineWidth = Math.max(1, scale);
        context.beginPath();
        context.roundRect(x - labelWidth / 2, y - labelHeight / 2, labelWidth, labelHeight, scale * 2);
        context.fill();
        context.stroke();
        const labelLeft = x - labelWidth / 2;
        const labelTop = y - labelHeight / 2;
        context.fillStyle = "#61706b";
        context.textAlign = "left";
        context.textBaseline = "middle";
        context.font = `800 ${smallSize}px Arial, "Noto Sans KR", sans-serif`;
        context.fillText(`${cluster.names.length}곳`, labelLeft + scale * 4, labelTop + scale * 6.5);
        context.fillStyle = "#26332f";
        context.font = `700 ${fontSize}px Arial, "Noto Sans KR", sans-serif`;
        cluster.rows.forEach((row) => {
          const rowY = outputHeight * row.targetY / 100;
          const precedingWidth = cluster.columnWidths.slice(0, row.column).reduce((sum, width) => sum + exportWidth * width / 100, 0);
          const columnX = labelLeft + scale * 4 + precedingWidth + row.column * scale * 4;
          const dotX = columnX + scale * 2.5;
          context.fillStyle = categoryOf(row.category).color;
          context.beginPath();
          context.arc(dotX, rowY, Math.max(scale * 1.8, 1.4), 0, Math.PI * 2);
          context.fill();
          context.fillStyle = "#26332f";
          context.textAlign = "left";
          context.fillText(row.name, columnX + scale * 7, rowY);
        });
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
      schemaVersion: 8, exportedAt: new Date().toISOString(), map: { baseMap, aspect: MAP_ASPECT, coordinateSystem: "normalized-percent", calibration: "six-point-distance-weighted", landmarkDefaults: "user-editable", denseLabelPositions: "server-synced-user-editable", denseLabelGrouping: "all-names-compact-columns-manual-exclusion" },
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
          denseLabelExcludedIds: Array.isArray(parsed.denseLabelExcludedIds) ? parsed.denseLabelExcludedIds : [],
          placementOverrides: Array.isArray(parsed.placementOverrides) ? parsed.placementOverrides : [],
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

  const updateOptionalLabelScaleLimit = (index: number, value: number) => {
    if (!Number.isFinite(value)) return;
    setOptionalLabelScaleSteps((current) => normalizeOptionalLabelScaleSteps(current.map((step, stepIndex) => (
      stepIndex === index ? { ...step, limit: value } : step
    ))));
    setSaveState("배포본 라벨 단계 변경됨");
    setEditorDraftSyncState("ready");
  };

  const resetOptionalLabelScaleLimits = () => {
    setOptionalLabelScaleSteps(normalizeOptionalLabelScaleSteps(undefined));
    setSaveState("배포본 라벨 단계 기본값 복원됨");
    setEditorDraftSyncState("ready");
    setToast("배포본 축척별 일반 라벨 개수를 기본값으로 복원했습니다.");
  };

  const currentPublicViewSettings = (): PublicViewSettings => ({
    baseMap,
    markerLabelsVisible,
    mergeDenseLabels,
    screenRecommendedOnly,
    defaultMarkerSize: markerGroupSize,
    optionalLabelScaleSteps: normalizeOptionalLabelScaleSteps(optionalLabelScaleSteps),
  });

  const applyPublicViewSettings = (view: PublicViewSettings | null | undefined) => {
    if (!view) return;
    setBaseMap(view.baseMap);
    setMarkerLabelsVisible(view.markerLabelsVisible);
    setMergeDenseLabels(view.mergeDenseLabels);
    setScreenRecommendedOnly(view.screenRecommendedOnly);
    setMarkerGroupSize(clamp(view.defaultMarkerSize, 0.8, 15));
    setOptionalLabelScaleSteps(normalizeOptionalLabelScaleSteps(view.optionalLabelScaleSteps));
  };

  const rememberEditorDraft = (draft: EditorDraftPayload) => {
    const document = sanitizeDocument(draft.document);
    editorDraftDocumentRef.current = document;
    editorDraftViewRef.current = draft.view;
    editorDraftRevisionRef.current = draft.revision;
    setEditorDraftRevision(draft.revision);
    setEditorDraftUpdatedAt(draft.updatedAt);
    setEditorDraftHasPrevious(draft.hasPrevious);
    setEditorDraftSyncState("saved");
    return document;
  };

  const rememberPublicHistoryItem = (item: PublicLayoutHistoryItem | undefined) => {
    if (!item) return;
    setPublicHistory((current) => [item, ...current.filter((candidate) => candidate.id !== item.id)]);
  };

  const refreshPublicHistory = async () => {
    try {
      const response = await fetch(PUBLIC_LAYOUT_API, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as PublicLayoutPayload | null;
      if (response.ok && Array.isArray(payload?.history)) setPublicHistory(payload.history);
    } catch {
      // The just-created entry remains visible even if this non-critical refresh fails.
    }
  };

  const saveEditorDraft = async () => {
    if (publicLayoutAccess !== "editor" || editorDraftSaving) return;
    setEditorDraftSaving(true);
    setEditorDraftSyncState("saving");
    try {
      const response = await fetch(PUBLIC_LAYOUT_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save-history",
          document: cloneDocument(currentDocument()),
          view: currentPublicViewSettings(),
        }),
      });
      const payload = await response.json().catch(() => null) as PublicLayoutPayload | null;
      if (!response.ok || !payload?.draft || !payload.historyEntry) throw new Error(payload?.error ?? "history save failed");
      rememberEditorDraft(payload.draft);
      rememberPublicHistoryItem(payload.historyEntry as PublicLayoutHistoryItem);
      setSaveState("공개본 기록 저장됨");
      setToast("현재 편집 상태를 공개본 기록에 저장했습니다. 공개 화면은 변경되지 않았습니다.");
    } catch {
      setEditorDraftSyncState("error");
      setToast("공개본 기록을 저장하지 못했습니다. 기기 임시 복구본은 유지됩니다.");
    } finally {
      setEditorDraftSaving(false);
    }
  };

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

  const loadEditorDraft = () => {
    const draft = editorDraftDocumentRef.current;
    if (!draft) {
      setToast("아직 저장된 서버 초안이 없습니다.");
      return;
    }
    if (!window.confirm("현재 편집 상태를 서버 초안으로 바꿀까요? 현재 기기 상태는 임시 복구본에 남습니다.")) return;
    pushHistory();
    setDocument(cloneDocument(draft));
    applyPublicViewSettings(editorDraftViewRef.current);
    setLayoutName("서버 초안");
    setSaveState("서버 초안 불러옴");
    setToast("서버 초안을 현재 편집 화면에 불러왔습니다.");
  };

  const restorePreviousEditorDraft = async () => {
    if (publicLayoutAccess !== "editor" || editorDraftSaving || !editorDraftHasPrevious) return;
    if (!window.confirm("직전 서버 초안으로 되돌릴까요? 현재 초안은 다시 복원할 수 있도록 교체 보관됩니다.")) return;
    setEditorDraftSaving(true);
    setEditorDraftSyncState("saving");
    try {
      const response = await fetch(PUBLIC_LAYOUT_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore-previous-draft", baseDraftRevision: editorDraftRevisionRef.current }),
      });
      const payload = await response.json().catch(() => null) as PublicLayoutPayload | null;
      if (!response.ok || !payload?.draft) throw new Error(payload?.error ?? "draft restore failed");
      const restored = rememberEditorDraft(payload.draft);
      pushHistory();
      setDocument(restored);
      applyPublicViewSettings(payload.draft.view);
      setLayoutName("이전 서버 초안");
      setSaveState("이전 서버 초안 복원됨");
      setToast("직전 서버 초안으로 복원했습니다.");
    } catch {
      setEditorDraftSyncState("error");
      setToast("이전 서버 초안을 복원하지 못했습니다. 새로고침 후 다시 시도해 주세요.");
    } finally {
      setEditorDraftSaving(false);
    }
  };

  const publishCurrentLayout = async () => {
    if (publicLayoutAccess !== "editor" || publicLayoutPublishing) return;
    if (elementsRef.current.some((element) => element.placeRequestId && !element.directoryId)) {
      setToast("지도 검수 중인 장소 요청이 있습니다. 요청을 승인하거나 반려한 뒤 공개본을 업데이트해 주세요.");
      return;
    }
    setPublicLayoutPublishing(true);
    setToast("현재 편집 상태를 공개 배치본으로 저장하고 있습니다.");
    try {
      const document = cloneDocument(currentDocument());
      const view = currentPublicViewSettings();
      const response = await fetch(PUBLIC_LAYOUT_API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document, view, baseRevision: publicLayoutRevision }),
      });
      const payload = await response.json().catch(() => null) as PublicLayoutPayload | null;
      if (!response.ok) {
        if (response.status === 409) throw new Error("conflict");
        if (response.status === 422) throw new Error("pending-place-request");
        throw new Error(payload?.error ?? "publish failed");
      }
      const publishedDocument = payload?.document ? sanitizeDocument(payload.document) : document;
      publishedLayoutDocumentRef.current = publishedDocument;
      publishedLayoutViewRef.current = payload?.view ?? view;
      setPublicLayoutPublishedAt(payload?.publishedAt ?? new Date().toISOString());
      const nextRevision = payload?.revision ?? publicLayoutRevision + 1;
      publishedLayoutRevisionRef.current = nextRevision;
      setPublicLayoutRevision(nextRevision);
      setPublicLayoutHasPrevious(Boolean(payload?.hasPrevious));
      setDocument(publishedDocument);
      if (payload?.draft) rememberEditorDraft(payload.draft);
      rememberPublicHistoryItem(payload?.historyEntry as PublicLayoutHistoryItem | undefined);
      await refreshPublicHistory();
      const completedCount = Math.max(0, Number(payload?.reviewCompletedCount ?? 0));
      setToast(completedCount > 0
        ? `공개 배치본을 업데이트하고 미검수 ${completedCount}개를 검수완료로 전환했습니다.`
        : "공개 배치본을 업데이트했습니다. 모든 항목이 검수완료 상태입니다.");
    } catch (error) {
      setToast(error instanceof Error && error.message === "conflict"
        ? "다른 기기에서 공개본이 변경되었습니다. 새로고침해 최신 공개본을 확인한 뒤 다시 게시해 주세요."
        : error instanceof Error && error.message === "pending-place-request"
          ? "지도 검수 중인 장소 요청을 먼저 승인하거나 반려해 주세요."
        : "공개 배치본을 저장하지 못했습니다. 로그인 및 연결 상태를 확인해 주세요.");
    } finally {
      setPublicLayoutPublishing(false);
    }
  };

  const loadPublishedLayoutIntoDraft = () => {
    const published = publishedLayoutDocumentRef.current;
    if (!published) {
      setToast("아직 불러올 공개 배치본이 없습니다.");
      return;
    }
    if (!window.confirm("현재 기기 초안을 공개 배치본으로 바꿀까요? 이 작업 전 상태는 자동복구에 다시 저장될 수 없습니다.")) return;
    pushHistory();
    setDocument(published);
    applyPublicViewSettings(publishedLayoutViewRef.current);
    setSaveState("공개본을 편집 초안으로 불러옴");
    setToast("공개 배치본을 현재 편집 초안으로 불러왔습니다.");
  };

  const loadPublicHistoryEntry = async (item: PublicLayoutHistoryItem) => {
    if (publicLayoutAccess !== "editor" || publicHistoryActionId) return;
    if (!window.confirm(`${item.kind === "snapshot" ? "저장 기록" : "공개 기록"} ${new Date(item.createdAt).toLocaleString("ko-KR")} 상태를 편집 화면에 불러올까요? 현재 상태는 기기 자동복구에 유지됩니다.`)) return;
    setPublicHistoryActionId(item.id);
    try {
      const response = await fetch(`${PUBLIC_LAYOUT_API}?historyId=${encodeURIComponent(item.id)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as PublicLayoutPayload | null;
      const entry = payload?.historyEntry as PublicLayoutHistoryEntry | undefined;
      if (!response.ok || !entry?.document || !entry.view) throw new Error(payload?.error ?? "history load failed");
      pushHistory();
      setDocument(sanitizeDocument(entry.document));
      applyPublicViewSettings(entry.view);
      setLayoutName(`공개본 기록 · ${new Date(entry.createdAt).toLocaleString("ko-KR")}`);
      setSaveState("공개본 기록 불러옴");
      setPublicHistoryOpen(false);
      setToast("선택한 기록을 편집 화면에 불러왔습니다. 공개 화면은 아직 변경되지 않았습니다.");
    } catch {
      setToast("선택한 공개본 기록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
    } finally {
      setPublicHistoryActionId(null);
    }
  };

  const restorePreviousPublicLayout = async () => {
    if (publicLayoutAccess !== "editor" || !publicLayoutHasPrevious || publicLayoutPublishing) return;
    if (!window.confirm("직전 공개 배치본으로 되돌릴까요? 현재 공개본도 다시 복원할 수 있도록 교체 보관됩니다.")) return;
    setPublicLayoutPublishing(true);
    try {
      const response = await fetch(PUBLIC_LAYOUT_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore-previous", baseRevision: publicLayoutRevision }),
      });
      const payload = await response.json().catch(() => null) as PublicLayoutPayload | null;
      if (!response.ok || !payload?.document) throw new Error(payload?.error ?? "restore failed");
      const restored = sanitizeDocument(payload.document);
      publishedLayoutDocumentRef.current = restored;
      publishedLayoutViewRef.current = payload.view ?? null;
      setPublicLayoutPublishedAt(payload.publishedAt ?? new Date().toISOString());
      const nextRevision = payload.revision ?? publicLayoutRevision + 1;
      publishedLayoutRevisionRef.current = nextRevision;
      setPublicLayoutRevision(nextRevision);
      setPublicLayoutHasPrevious(Boolean(payload.hasPrevious));
      setDocument(restored);
      applyPublicViewSettings(payload.view);
      if (payload.draft) rememberEditorDraft(payload.draft);
      rememberPublicHistoryItem(payload.historyEntry as PublicLayoutHistoryItem | undefined);
      await refreshPublicHistory();
      setToast("직전 공개 배치본으로 복원했습니다.");
    } catch {
      setToast("이전 공개 배치본을 복원하지 못했습니다. 새로고침 후 다시 시도해 주세요.");
    } finally {
      setPublicLayoutPublishing(false);
    }
  };

  const togglePlaceStoryForm = () => {
    const next = !placeStoryFormOpen;
    if (next && !placeStoryAuthor.trim()) {
      try {
        setPlaceStoryAuthor(localStorage.getItem(PLACE_STORY_AUTHOR_KEY)?.slice(0, 20) ?? "");
      } catch {}
    }
    setPlaceStoryFormOpen(next);
  };

  const requestPlaceStoryCameraPermission = async () => {
    if (storyCameraPermission === "requesting") return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStoryCameraPermission("unavailable");
      setToast("이 기기의 PWA에서는 카메라 권한 확인 기능을 지원하지 않습니다. 사진 선택은 계속 사용할 수 있습니다.");
      return;
    }
    setStoryCameraPermission("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      stream.getTracks().forEach((track) => track.stop());
      setStoryCameraPermission("granted");
      setToast("카메라 권한이 허용되었습니다. ‘카메라 촬영’을 눌러 사진을 촬영할 수 있습니다.");
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      setStoryCameraPermission(denied ? "denied" : "unavailable");
      setToast(denied
        ? "카메라 권한이 차단되었습니다. 기기 설정의 원도심 아트맵 권한에서 카메라를 허용해 주세요."
        : "이 기기에서 카메라를 사용할 수 없습니다. 갤러리의 ‘사진 1장 선택’을 이용해 주세요.");
    }
  };

  const submitPlaceStory = async () => {
    if (!selected || !selectedStoryKey || placeStorySubmitting) return;
    const authorName = placeStoryAuthor.replace(/\s+/g, " ").trim().slice(0, 20);
    const reviewText = placeStoryText.replace(/\s+/g, " ").trim().slice(0, 220);
    const selectedStoryPlaceName = selectedDirectoryPlace?.name ?? selected.name;
    if (!authorName || reviewText.length < 2) {
      setToast("닉네임과 2자 이상의 짧은 후기를 입력해 주세요.");
      return;
    }
    setPlaceStorySubmitting(true);
    let uploadStage: "prepare" | "request" | "response" = "prepare";
    let preparedPhoto: File | null = null;
    let responseStatus = 0;
    try {
      const form = new FormData();
      form.set("placeKey", selectedStoryKey);
      form.set("placeName", selectedStoryPlaceName);
      form.set("authorName", authorName);
      form.set("reviewText", reviewText);
      form.set("visitorId", persistentVisitorId());
      if (placeStoryPhoto) {
        preparedPhoto = await prepareStoryPhoto(placeStoryPhoto);
        if (preparedPhoto.size > STORY_PHOTO_TARGET_BYTES) throw new Error("photo-compression-target-failed");
        form.set("photo", preparedPhoto);
      }
      uploadStage = "request";
      const response = await fetch(PLACE_STORIES_API, { method: "POST", body: form, cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => null) as PlaceStoriesPayload | null;
      responseStatus = response.status;
      uploadStage = "response";
      if (!response.ok || !payload?.story) {
        if (response.status === 429) throw new Error("rate-limit");
        if (response.status === 413) throw new Error("request-too-large");
        if (response.status === 415) throw new Error("photo-unsupported");
        if (response.status === 503) throw new Error("storage-unavailable");
        if (response.status === 404) throw new Error("place-not-found");
        if (response.status === 400) throw new Error("entry-invalid");
        if (response.status >= 500) throw new Error("server-error");
        throw new Error(payload?.error ?? "story-submit-failed");
      }
      setPlaceStories((current) => [payload.story!, ...current]);
      setReviewCountsByPlace((current) => {
        const matchedIndex = current.findIndex((place) => place.placeKey === selectedStoryKey);
        if (matchedIndex < 0) return [...current, { placeKey: selectedStoryKey, placeName: selectedStoryPlaceName, count: 1, latestCreatedAt: payload.story!.createdAt }];
        return current.map((place, index) => index === matchedIndex ? { ...place, count: place.count + 1, latestCreatedAt: payload.story!.createdAt } : place);
      });
      setGlobalStoriesPage(1);
      setGlobalStoriesRefreshKey((current) => current + 1);
      writePlaceStoryDraft(selectedStoryKey, "");
      placeStoryTextRef.current = "";
      setPlaceStoryText("");
      updatePlaceStoryPhoto(null);
      setPlaceStoryFormOpen(false);
      try { localStorage.setItem(PLACE_STORY_AUTHOR_KEY, authorName); } catch {}
      setToast("사진과 후기를 원도심 아카이브에 남겼습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const errorCode = !navigator.onLine ? "offline" : message || (uploadStage === "request" ? "network-error" : "unknown-error");
      const diagnosticReference = await sendPlaceStoryUploadDiagnostic({
        placeKey: selectedStoryKey,
        stage: uploadStage,
        errorCode,
        responseStatus,
        sourceFile: placeStoryPhoto,
        preparedFile: preparedPhoto,
      });
      const diagnosticSuffix = diagnosticReference ? ` · 오류 ID ${diagnosticReference}` : "";
      setToast((!navigator.onLine
        ? "인터넷 연결을 확인한 뒤 다시 시도해 주세요. 작성한 내용은 현재 화면에 유지됩니다."
        : message === "rate-limit"
        ? "짧은 시간에 등록이 많습니다. 잠시 뒤 다시 시도해 주세요."
        : message === "photo-too-large"
          ? "기기에서 사진 압축 결과를 만들지 못했습니다. 다른 사진 형식으로 다시 선택해 주세요."
          : message === "photo-decode-failed"
            ? "선택한 사진을 기기에서 열지 못했습니다. 사진을 다시 저장하거나 다른 사진을 선택해 주세요."
          : message === "photo-encode-failed"
            ? "기기에서 사진 변환을 완료하지 못했습니다. 원본은 전송하지 않았으며 다른 사진을 선택해 주세요."
          : message === "photo-compression-target-failed"
            ? "사진을 안전한 업로드 용량까지 줄이지 못했습니다. 원본은 전송하지 않았으며 다른 사진을 선택해 주세요."
          : message === "request-too-large"
            ? `사진은 ${preparedPhoto ? `${Math.max(1, Math.round(preparedPhoto.size / 1024))}KB로 준비됐지만 ` : ""}서버 요청 크기 제한에 걸렸습니다.`
          : message === "photo-source-too-large"
            ? "원본 사진이 30MB를 넘습니다. 더 작은 사진을 선택해 주세요."
            : message === "photo-unsupported"
              ? "이 사진 형식을 모바일에서 처리하지 못했습니다. JPEG·PNG·WebP 사진을 선택해 주세요."
              : message === "place-not-found"
                ? "선택한 장소 연결 정보가 현재 배포본과 일치하지 않습니다. 지도를 새로고침한 뒤 다시 시도해 주세요."
                : message === "entry-invalid"
                  ? "닉네임·후기 또는 장소 연결값을 서버가 확인하지 못했습니다. 입력 내용은 그대로 유지됩니다."
              : message === "storage-unavailable"
                ? "후기 저장 서버가 잠시 응답하지 않습니다. 작성한 내용을 유지한 채 잠시 후 다시 시도해 주세요."
                : message === "server-error"
                  ? "후기 저장 서버에서 오류가 발생했습니다. 입력 내용은 유지됩니다."
          : "후기를 저장하지 못했습니다. 입력 내용은 유지되며 오류 원인을 서버에 전송했습니다.") + diagnosticSuffix);
    } finally {
      setPlaceStorySubmitting(false);
    }
  };

  const closePlaceStoryReport = useCallback(() => {
    if (storyReportSubmitting) return;
    setStoryReportTarget(null);
    setStoryReportReason("inappropriate");
    setStoryReportDetail("");
  }, [setStoryReportDetail, setStoryReportReason, setStoryReportTarget, storyReportSubmitting]);

  const openPlaceStoryReport = (story: PlaceStory) => {
    if (reportedStoryIds.has(story.id)) {
      setToast("이미 신고를 접수한 후기입니다.");
      return;
    }
    setStoryReportTarget(story);
    setStoryReportReason("inappropriate");
    setStoryReportDetail("");
  };

  const submitPlaceStoryReport = async () => {
    if (!storyReportTarget || storyReportSubmitting) return;
    setStoryReportSubmitting(true);
    try {
      const response = await fetch(PLACE_STORIES_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "report",
          storyId: storyReportTarget.id,
          reason: storyReportReason,
          detail: storyReportDetail.trim().slice(0, 300),
          visitorId: persistentVisitorId(),
        }),
      });
      if (!response.ok && response.status !== 409) {
        if (response.status === 429) throw new Error("rate-limit");
        throw new Error("report-failed");
      }
      const reportedId = storyReportTarget.id;
      setReportedStoryIds((current) => new Set(current).add(reportedId));
      setStoryReportTarget(null);
      setStoryReportReason("inappropriate");
      setStoryReportDetail("");
      setToast(response.status === 409 ? "이미 접수된 신고입니다." : "신고를 접수했습니다. 관리자가 확인한 뒤 조치합니다.");
    } catch (error) {
      setToast(error instanceof Error && error.message === "rate-limit"
        ? "오늘 접수한 신고가 많습니다. 잠시 뒤 다시 시도해 주세요."
        : "신고를 접수하지 못했습니다. 연결 상태를 확인해 주세요.");
    } finally {
      setStoryReportSubmitting(false);
    }
  };

  const moderatePlaceStory = async (story: PlaceStory, status: "published" | "hidden") => {
    if (placeStoryActionId) return;
    setPlaceStoryActionId(story.id);
    try {
      const response = await fetch(PLACE_STORIES_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: story.id, status }),
      });
      if (!response.ok) {
        setToast("후기 공개 상태를 변경하지 못했습니다.");
        return;
      }
      setPlaceStories((current) => current.map((item) => item.id === story.id ? { ...item, status, reportCount: status === "hidden" ? 0 : item.reportCount, reportSummary: status === "hidden" ? undefined : item.reportSummary } : item));
      setGlobalStories((current) => current.map((item) => item.id === story.id ? { ...item, status, reportCount: status === "hidden" ? 0 : item.reportCount, reportSummary: status === "hidden" ? undefined : item.reportSummary } : item));
      setGlobalStoriesRefreshKey((current) => current + 1);
      setToast(status === "hidden" ? "후기를 공개 목록에서 숨겼습니다." : "후기를 다시 공개했습니다.");
    } catch {
      setToast("후기 공개 상태를 변경하지 못했습니다.");
    } finally {
      setPlaceStoryActionId(null);
    }
  };

  const deletePlaceStory = async (story: PlaceStory) => {
    if (placeStoryActionId || !window.confirm(`‘${story.placeName}’의 ${story.authorName} 후기${story.photoUrl ? "와 사진" : ""}을 서버에서 완전히 삭제할까요?`)) return;
    setPlaceStoryActionId(story.id);
    try {
      const response = await fetch(`${PLACE_STORIES_API}?id=${encodeURIComponent(story.id)}`, { method: "DELETE" });
      if (!response.ok) {
        setToast("후기를 삭제하지 못했습니다. 다시 시도해 주세요.");
        return;
      }
      setPlaceStories((current) => current.filter((item) => item.id !== story.id));
      setGlobalStories((current) => current.filter((item) => item.id !== story.id));
      setGlobalStoriesRefreshKey((current) => current + 1);
      setToast("사진과 후기를 서버에서 완전히 삭제했습니다.");
    } catch {
      setToast("후기를 삭제하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setPlaceStoryActionId(null);
    }
  };

  const deleteUploadDiagnostic = async (diagnosticId: string) => {
    if (uploadDiagnosticActionId) return;
    setUploadDiagnosticActionId(diagnosticId);
    try {
      const response = await fetch(`${PLACE_STORIES_API}?scope=upload-diagnostics`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete-one", id: diagnosticId }),
      });
      if (!response.ok) throw new Error("diagnostic cleanup failed");
      setUploadDiagnostics((current) => current.filter((diagnostic) => diagnostic.id !== diagnosticId));
      setToast("선택한 업로드 오류 로그를 삭제했습니다.");
    } catch {
      setToast("오류 로그를 삭제하지 못했습니다. 관리자 권한과 연결 상태를 확인해 주세요.");
    } finally {
      setUploadDiagnosticActionId(null);
    }
  };

  const clearUploadDiagnostics = async () => {
    if (uploadDiagnosticActionId || !uploadDiagnostics.length || !window.confirm(`해결된 업로드 오류 로그 ${uploadDiagnostics.length}건을 모두 삭제할까요? 삭제 후 복구할 수 없습니다.`)) return;
    setUploadDiagnosticActionId("all");
    try {
      const response = await fetch(`${PLACE_STORIES_API}?scope=upload-diagnostics`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear-all" }),
      });
      if (!response.ok) throw new Error("diagnostic cleanup failed");
      setUploadDiagnostics([]);
      setToast("해결된 업로드 오류 로그를 모두 정리했습니다.");
    } catch {
      setToast("오류 로그 전체 정리를 완료하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setUploadDiagnosticActionId(null);
    }
  };

  const deletePerformanceDiagnostic = async (diagnosticId: string) => {
    if (performanceDiagnosticActionId) return;
    setPerformanceDiagnosticActionId(diagnosticId);
    try {
      const response = await fetch(`${PLACE_STORIES_API}?scope=performance-diagnostics`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete-one", id: diagnosticId }),
      });
      if (!response.ok) throw new Error("performance diagnostic cleanup failed");
      setPerformanceDiagnostics((current) => current.filter((diagnostic) => diagnostic.id !== diagnosticId));
      setToast("선택한 성능 기록을 삭제했습니다.");
    } catch {
      setToast("성능 기록을 삭제하지 못했습니다. 관리자 권한과 연결 상태를 확인해 주세요.");
    } finally {
      setPerformanceDiagnosticActionId(null);
    }
  };

  const clearPerformanceDiagnostics = async () => {
    if (performanceDiagnosticActionId || !performanceDiagnostics.length || !window.confirm(`성능 기록 ${performanceDiagnostics.length}건을 모두 삭제할까요? 삭제 후 복구할 수 없습니다.`)) return;
    setPerformanceDiagnosticActionId("all");
    try {
      const response = await fetch(`${PLACE_STORIES_API}?scope=performance-diagnostics`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear-all" }),
      });
      if (!response.ok) throw new Error("performance diagnostic cleanup failed");
      setPerformanceDiagnostics([]);
      setToast("성능 기록을 모두 정리했습니다.");
    } catch {
      setToast("성능 기록 전체 정리를 완료하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setPerformanceDiagnosticActionId(null);
    }
  };

  const closePlaceEventForm = () => {
    setPlaceEventFormOpen(false);
    setPlaceEventEditingId(null);
    setPlaceEventNoPlace(false);
    setPlaceEventMultiPlace(false);
    setPlaceEventPlaces([]);
    setPlaceEventName("");
    setPlaceEventInfo("");
    setPlaceEventStartsAt("");
    setPlaceEventEndsAt("");
    setPlaceEventVisibleFrom("");
    setPlaceEventVisibleUntil("");
    setPlaceEventExistingPhotoUrl(null);
    updatePlaceEventPhoto(null);
    eventDialogDragRef.current = null;
  };

  const togglePlaceEventForm = () => {
    if (placeEventFormOpen) {
      closePlaceEventForm();
      return;
    }
    if (!selected || !selectedStoryKey) {
      setToast("행사를 등록할 장소를 먼저 선택해 주세요.");
      return;
    }
    const start = new Date();
    const eventEnd = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const visibilityEnd = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    setPlaceEventEditingId(null);
    setPlaceEventNoPlace(false);
    setPlaceEventMultiPlace(false);
    setPlaceEventPlaces([{ placeKey: selectedStoryKey, placeName: selected.name }]);
    setPlaceEventName("");
    setPlaceEventInfo("");
    setPlaceEventStartsAt(localDateTimeInputValue(start));
    setPlaceEventEndsAt(localDateTimeInputValue(eventEnd));
    setPlaceEventVisibleFrom(localDateTimeInputValue(start));
    setPlaceEventVisibleUntil(localDateTimeInputValue(visibilityEnd));
    setPlaceEventExistingPhotoUrl(null);
    updatePlaceEventPhoto(null);
    setPlaceEventDialogOffset({ x: 0, y: 0 });
    setPlaceEventFormOpen(true);
  };

  const openUnassignedPlaceEventForm = () => {
    const start = new Date();
    const eventEnd = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const visibilityEnd = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    setPlaceEventEditingId(null);
    setPlaceEventNoPlace(true);
    setPlaceEventMultiPlace(false);
    setPlaceEventPlaces([]);
    setPlaceEventName("");
    setPlaceEventInfo("");
    setPlaceEventStartsAt(localDateTimeInputValue(start));
    setPlaceEventEndsAt(localDateTimeInputValue(eventEnd));
    setPlaceEventVisibleFrom(localDateTimeInputValue(start));
    setPlaceEventVisibleUntil(localDateTimeInputValue(visibilityEnd));
    setPlaceEventExistingPhotoUrl(null);
    updatePlaceEventPhoto(null);
    setPlaceEventDialogOffset({ x: 0, y: 0 });
    setPlaceEventFormOpen(true);
  };

  const editPlaceEvent = (event: PlaceEvent) => {
    const places = eventPlaceList(event);
    setPlaceEventEditingId(event.id);
    setPlaceEventNoPlace(places.length === 0);
    setPlaceEventMultiPlace(places.length > 1);
    setPlaceEventPlaces(places);
    setPlaceEventName(event.eventName);
    setPlaceEventInfo(event.eventInfo);
    setPlaceEventStartsAt(localDateTimeInputValue(new Date(event.startsAt)));
    setPlaceEventEndsAt(localDateTimeInputValue(new Date(event.endsAt)));
    setPlaceEventVisibleFrom(localDateTimeInputValue(new Date(event.visibleFrom)));
    setPlaceEventVisibleUntil(localDateTimeInputValue(new Date(event.visibleUntil)));
    setPlaceEventExistingPhotoUrl(event.photoUrl);
    updatePlaceEventPhoto(null);
    setPlaceEventDialogOffset({ x: 0, y: 0 });
    setPlaceEventFormOpen(true);
  };

  const startPlaceEventDialogDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, input, textarea, label")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    eventDialogDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: placeEventDialogOffset.x,
      offsetY: placeEventDialogOffset.y,
    };
  };

  const movePlaceEventDialog = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = eventDialogDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const limitX = Math.max(0, window.innerWidth / 2 - 150);
    const limitY = Math.max(0, window.innerHeight / 2 - 90);
    setPlaceEventDialogOffset({
      x: clamp(drag.offsetX + event.clientX - drag.startX, -limitX, limitX),
      y: clamp(drag.offsetY + event.clientY - drag.startY, -limitY, limitY),
    });
  };

  const endPlaceEventDialogDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (eventDialogDragRef.current?.pointerId !== event.pointerId) return;
    eventDialogDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const submitPlaceEvent = async () => {
    if (placeEventSubmitting) return;
    const eventName = placeEventName.replace(/\s+/g, " ").trim().slice(0, 100);
    const eventInfo = placeEventInfo.trim().slice(0, 1200);
    const startsAtDate = new Date(placeEventStartsAt);
    const endsAtDate = new Date(placeEventEndsAt);
    const visibleFromDate = new Date(placeEventVisibleFrom);
    const visibleUntilDate = new Date(placeEventVisibleUntil);
    if (eventName.length < 2 || eventInfo.length < 2 || (!placeEventNoPlace && !placeEventPlaces.length) || (!placeEventEditingId && !placeEventPhoto)) {
      setToast(placeEventNoPlace ? "행사명·행사정보·사진을 모두 입력해 주세요." : "행사명·행사정보·장소·사진을 모두 입력해 주세요.");
      return;
    }
    if (Number.isNaN(startsAtDate.getTime()) || Number.isNaN(endsAtDate.getTime()) || endsAtDate <= startsAtDate) {
      setToast("행사 종료 시각은 시작 시각보다 뒤여야 합니다.");
      return;
    }
    if (Number.isNaN(visibleFromDate.getTime()) || Number.isNaN(visibleUntilDate.getTime()) || visibleUntilDate <= visibleFromDate) {
      setToast("노출 종료 시각은 시작 시각보다 뒤여야 합니다.");
      return;
    }
    setPlaceEventSubmitting(true);
    try {
      const form = new FormData();
      if (placeEventEditingId) form.set("id", placeEventEditingId);
      form.set("places", JSON.stringify(placeEventNoPlace ? [] : placeEventPlaces));
      form.set("eventName", eventName);
      form.set("eventInfo", eventInfo);
      form.set("startsAt", startsAtDate.toISOString());
      form.set("endsAt", endsAtDate.toISOString());
      form.set("visibleFrom", visibleFromDate.toISOString());
      form.set("visibleUntil", visibleUntilDate.toISOString());
      if (placeEventPhoto) {
        const prepared = await prepareStoryPhoto(placeEventPhoto);
        if (prepared.size > STORY_PHOTO_MAX_UPLOAD_BYTES) throw new Error("photo-too-large");
        form.set("photo", prepared);
      }
      const response = await fetch(PLACE_EVENTS_API, { method: placeEventEditingId ? "PATCH" : "POST", body: form });
      const payload = await response.json().catch(() => null) as PlaceEventsPayload | null;
      if (!response.ok || !payload?.event) {
        if (response.status === 413) throw new Error("photo-too-large");
        throw new Error(payload?.error ?? "event-submit-failed");
      }
      setGlobalEvents((current) => placeEventEditingId
        ? current.map((item) => item.id === payload.event!.id ? payload.event! : item)
        : [payload.event!, ...current.filter((item) => item.id !== payload.event!.id)]);
      setGlobalEventsPage(1);
      setGlobalEventsRefreshKey((current) => current + 1);
      setPlaceEventsRefreshKey((current) => current + 1);
      const wasEditing = Boolean(placeEventEditingId);
      closePlaceEventForm();
      setToast(wasEditing ? "행사 내용을 수정했습니다." : "행사를 저장했습니다. 설정한 노출 기간에 공개 화면에 표시됩니다.");
    } catch (error) {
      setToast(error instanceof Error && error.message === "photo-too-large"
        ? "사진을 처리해도 5MB를 넘습니다. 더 작은 사진을 선택해 주세요."
        : "행사를 저장하지 못했습니다. 장소 연결과 입력 내용을 확인해 주세요.");
    } finally {
      setPlaceEventSubmitting(false);
    }
  };

  const moderatePlaceEvent = async (event: PlaceEvent, status: "active" | "hidden") => {
    if (placeEventActionId) return;
    setPlaceEventActionId(event.id);
    try {
      const response = await fetch(PLACE_EVENTS_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: event.id, status }),
      });
      if (!response.ok) throw new Error("event moderation failed");
      const payload = await response.json().catch(() => null) as { updatedAt?: string } | null;
      const serverNow = Date.parse(payload?.updatedAt ?? "");
      const isVisible = status === "active" && Number.isFinite(serverNow) && Date.parse(event.visibleFrom) <= serverNow && Date.parse(event.visibleUntil) > serverNow;
      setPlaceEvents((current) => current.map((item) => item.id === event.id ? { ...item, status, isVisible } : item));
      setGlobalEvents((current) => current.map((item) => item.id === event.id ? { ...item, status, isVisible } : item));
      setGlobalEventsRefreshKey((current) => current + 1);
      setToast(status === "hidden" ? "행사를 공개 화면에서 숨겼습니다." : isVisible ? "행사를 다시 공개했습니다." : "행사를 활성화했습니다. 설정된 노출 기간에만 공개됩니다.");
    } catch {
      setToast("행사 공개 상태를 변경하지 못했습니다.");
    } finally {
      setPlaceEventActionId(null);
    }
  };

  const deletePlaceEvent = async (event: PlaceEvent) => {
    if (placeEventActionId || !window.confirm(`‘${event.eventName}’ 행사와 사진을 서버에서 완전히 삭제할까요?`)) return;
    setPlaceEventActionId(event.id);
    try {
      const response = await fetch(`${PLACE_EVENTS_API}?id=${encodeURIComponent(event.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("event delete failed");
      setPlaceEvents((current) => current.filter((item) => item.id !== event.id));
      setGlobalEvents((current) => current.filter((item) => item.id !== event.id));
      setGlobalEventsRefreshKey((current) => current + 1);
      setToast("행사와 사진을 서버에서 완전히 삭제했습니다.");
    } catch {
      setToast("행사를 삭제하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setPlaceEventActionId(null);
    }
  };

  const submitPlaceRegistrationRequest = async () => {
    if (placeRequestSubmitting) return;
    if (placeRequestName.trim().length < 2 || !placeRequestArea || placeRequestAddress.trim().length < 5 || placeRequestDescription.trim().length < 10) {
      setToast("권역·세부지역을 선택하고 장소명·주소·설명을 조금 더 자세히 적어 주세요.");
      return;
    }
    if (!placeRequestLocation) {
      setToast("지도에서 마커 위치를 먼저 지정해 주세요.");
      return;
    }
    setPlaceRequestSubmitting(true);
    try {
      const response = await fetch(PLACE_REGISTRATION_REQUESTS_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: placeRequestName,
          area: placeRequestArea,
          address: placeRequestAddress,
          description: placeRequestDescription,
          category: placeRequestCategory,
          markerStyle: placeRequestMarkerStyle,
          markerX: placeRequestLocation.x,
          markerY: placeRequestLocation.y,
          visitorId: persistentVisitorId(),
        }),
      });
      const payload = await response.json().catch(() => null) as PlaceRegistrationRequestsPayload | null;
      if (!response.ok) {
        if (response.status === 409) throw new Error("duplicate");
        if (response.status === 429) throw new Error("rate-limit");
        throw new Error(payload?.error ?? "request failed");
      }
      setPlaceRequestName("");
      setPlaceRequestArea("");
      setPlaceRequestAddress("");
      setPlaceRequestDescription("");
      setPlaceRequestCategory("culture");
      setPlaceRequestMarkerStyle(recommendedMarkerStyle);
      setPlaceRequestLocation(null);
      setPlaceRequestPickingLocation(false);
      setPlaceRequestFormOpen(false);
      setToast("장소 등록 요청을 보냈습니다. 관리자 검수 후 지도에 반영됩니다.");
    } catch (error) {
      setToast(error instanceof Error && error.message === "duplicate"
        ? "이미 등록된 장소이거나 같은 장소의 검수 요청이 대기 중입니다."
        : error instanceof Error && error.message === "rate-limit"
          ? "오늘 보낼 수 있는 장소 등록 요청 수를 초과했습니다."
          : "장소 등록 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPlaceRequestSubmitting(false);
    }
  };

  const updatePlaceRequestDraft = (id: string, patch: Partial<Pick<PlaceRegistrationRequest, "name" | "area" | "address" | "description" | "category" | "markerStyle" | "markerX" | "markerY">>) => {
    setPlaceRequests((current) => current.map((request) => request.id === id ? { ...request, ...patch } : request));
    const linked = elementsRef.current.find((element) => element.placeRequestId === id && !element.directoryId);
    if (!linked) return;
    const nextCategory = patch.category ?? linked.category;
    const nextStyle = patch.markerStyle ?? (linked.assetId?.match(/-(01|02|03|v2)-/)?.[1] as BundledMarkerStyle | undefined) ?? recommendedMarkerStyle;
    replaceElements((current) => current.map((element) => element.id === linked.id ? {
      ...element,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.address !== undefined ? { address: patch.address } : {}),
      ...(patch.category !== undefined || patch.markerStyle !== undefined ? {
        category: nextCategory,
        assetId: markerAssetIdForPlace(nextStyle, nextCategory, `${patch.name ?? linked.name} ${patch.description ?? ""}`),
        size: markerGroupSize,
      } : {}),
      ...(typeof patch.markerX === "number" ? { x: patch.markerX, anchorX: patch.markerX } : {}),
      ...(typeof patch.markerY === "number" ? { y: patch.markerY, anchorY: patch.markerY } : {}),
    } : element));
  };

  const savePlaceRequestEdits = async (request: PlaceRegistrationRequest) => {
    if (placeRequestActionId || request.status === "approved") return;
    setPlaceRequestActionId(request.id);
    try {
      const response = await fetch(PLACE_REGISTRATION_REQUESTS_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: request.id, action: "edit", name: request.name, area: request.area, address: request.address, description: request.description, category: request.category, markerStyle: request.markerStyle, markerX: request.markerX, markerY: request.markerY }),
      });
      const payload = await response.json().catch(() => null) as PlaceRegistrationRequestsPayload | null;
      if (!response.ok || !payload?.request) throw new Error(payload?.error ?? "save failed");
      setPlaceRequests((current) => current.map((item) => item.id === request.id ? payload.request! : item));
      setToast("장소 요청의 검수 내용을 저장했습니다.");
    } catch {
      setToast("장소 요청 수정 내용을 저장하지 못했습니다.");
    } finally {
      setPlaceRequestActionId(null);
    }
  };

  const startPlaceRequestReview = async (request: PlaceRegistrationRequest) => {
    if (placeRequestActionId || request.status === "approved" || request.status === "rejected") return;
    const existingElement = elementsRef.current.find((element) => element.placeRequestId === request.id && !element.directoryId);
    if (existingElement) {
      setSelectedId(existingElement.id);
      setSelectedNoteId(null);
      setSelectedDenseLabelId(null);
      setRightOpen(true);
      setGlobalStoriesOpen(false);
      focusMapPosition(existingElement.x, existingElement.y, existingElement.id);
      setToast("검수 중인 마커로 이동했습니다. 위치·크기·라벨을 조정한 뒤 장소 요청을 승인하세요.");
      return;
    }
    setPlaceRequestActionId(request.id);
    try {
      const response = await fetch(PLACE_REGISTRATION_REQUESTS_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: request.id,
          action: "start-review",
          name: request.name,
          area: request.area,
          address: request.address,
          description: request.description,
          category: request.category,
          markerStyle: request.markerStyle,
          markerX: request.markerX,
          markerY: request.markerY,
        }),
      });
      const payload = await response.json().catch(() => null) as PlaceRegistrationRequestsPayload | null;
      if (!response.ok || !payload?.request) throw new Error(payload?.error ?? "review start failed");
      const reviewing = payload.request;
      const x = typeof reviewing.markerX === "number" ? reviewing.markerX : 50;
      const y = typeof reviewing.markerY === "number" ? reviewing.markerY : 50;
      const nextElement: MapElement = {
        ...elementDefaults,
        id: `requested-place-${reviewing.id}`,
        placeRequestId: reviewing.id,
        name: reviewing.name,
        category: reviewing.category,
        x,
        y,
        anchorX: x,
        anchorY: y,
        size: markerGroupSize,
        z: Math.max(0, ...elementsRef.current.map((element) => element.z)) + 1,
        labelVisible: true,
        labelGap: 4,
        assetId: markerAssetIdForPlace(reviewing.markerStyle, reviewing.category, `${reviewing.name} ${reviewing.description}`),
        status: "unchecked",
        address: reviewing.address,
        memo: "장소 등록 요청 검수 중 · 위치·크기·라벨을 조정한 뒤 장소 요청 관리에서 승인하세요.",
      };
      pushHistory();
      replaceElements((current) => [...current.filter((element) => element.placeRequestId !== reviewing.id), nextElement]);
      setPlaceRequests((current) => current.map((item) => item.id === reviewing.id ? reviewing : item));
      setSelectedId(nextElement.id);
      setSelectedNoteId(null);
      setSelectedDenseLabelId(null);
      setRightOpen(true);
      setGlobalStoriesOpen(false);
      focusMapPosition(x, y, nextElement.id);
      setToast("요청자가 지정한 위치에 검수용 마커를 표시했습니다. 조정 후 장소 요청 관리에서 승인하세요.");
    } catch {
      setToast("장소 요청 검수를 시작하지 못했습니다.");
    } finally {
      setPlaceRequestActionId(null);
    }
  };

  const approvePlaceRequest = async (request: PlaceRegistrationRequest) => {
    const reviewElement = elementsRef.current.find((element) => element.placeRequestId === request.id && !element.directoryId);
    if (placeRequestActionId || request.status !== "reviewing" || !reviewElement) {
      if (!placeRequestActionId && request.status !== "approved") setToast("먼저 지도 검수를 시작해 마커 위치를 확인해 주세요.");
      return;
    }
    if (!window.confirm(`‘${request.name}’을(를) 검수한 위치대로 장소 DB와 지도 편집 초안에 반영할까요?`)) return;
    const reviewedCategory = reviewElement.category === "landmark" ? request.category : reviewElement.category as BundledMarkerCategory;
    const reviewedMarkerStyle = (reviewElement.assetId?.match(/^generic-marker-(01|02|03|v2)-/)?.[1] as BundledMarkerStyle | undefined) ?? request.markerStyle;
    setPlaceRequestActionId(request.id);
    try {
      const response = await fetch(PLACE_REGISTRATION_REQUESTS_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: request.id,
          action: "approve",
          name: reviewElement.name,
          area: request.area,
          address: reviewElement.address,
          description: request.description,
          category: reviewedCategory,
          markerStyle: reviewedMarkerStyle,
          markerX: reviewElement.x,
          markerY: reviewElement.y,
        }),
      });
      const payload = await response.json().catch(() => null) as PlaceRegistrationRequestsPayload | null;
      if (!response.ok || !payload?.request || !payload.directory) {
        if (response.status === 409) throw new Error("duplicate");
        throw new Error(payload?.error ?? "approve failed");
      }
      const approved = payload.request;
      const newPlace = mergeDirectoryRecords([payload.directory], [])[0];
      pushHistory();
      replaceDirectoryPlaces((current) => [...current.filter((place) => place.id !== newPlace.id), newPlace]);
      const x = reviewElement?.x ?? approved.markerX ?? 50;
      const y = reviewElement?.y ?? approved.markerY ?? 50;
      const nextElement: MapElement = reviewElement ? {
        ...reviewElement,
        directoryId: newPlace.id,
        name: approved.name,
        category: approved.category,
        x,
        y,
        anchorX: x,
        anchorY: y,
        assetId: markerAssetIdForPlace(approved.markerStyle, approved.category, `${approved.name} ${approved.description}`),
        status: "unchecked",
        address: approved.address,
        memo: "장소 등록 요청 승인 · 최종 표시 상태를 확인한 뒤 공개본을 업데이트하세요.",
      } : {
        ...elementDefaults,
        id: `requested-place-${approved.id}`,
        placeRequestId: approved.id,
        directoryId: newPlace.id,
        name: approved.name,
        category: approved.category,
        x,
        y,
        anchorX: x,
        anchorY: y,
        size: markerGroupSize,
        z: Math.max(0, ...elementsRef.current.map((element) => element.z)) + 1,
        labelVisible: true,
        labelGap: 4,
        assetId: markerAssetIdForPlace(approved.markerStyle, approved.category, `${approved.name} ${approved.description}`),
        status: "unchecked",
        address: approved.address,
        memo: "장소 등록 요청 승인 · 최종 표시 상태를 확인한 뒤 공개본을 업데이트하세요.",
      };
      replaceElements((current) => [...current.filter((element) => element.id !== nextElement.id && element.placeRequestId !== approved.id), nextElement]);
      setSelectedId(nextElement.id);
      setSelectedNoteId(null);
      setSelectedDenseLabelId(null);
      setRightOpen(true);
      setPlaceDirectoryUpdatedAt(approved.updatedAt);
      setPlaceDirectoryStorage("persistent");
      setPlaceRequests((current) => current.map((item) => item.id === request.id ? approved : item));
      setPlaceRequestsRefreshKey((current) => current + 1);
      setGlobalStoriesOpen(false);
      focusMapPosition(x, y, nextElement.id);
      setToast("검수한 위치와 마커를 장소 DB·편집 초안에 반영했습니다. 최종 확인 후 공개본을 업데이트해 주세요.");
    } catch (error) {
      setToast(error instanceof Error && error.message === "duplicate"
        ? "같은 이름의 장소가 이미 DB에 있습니다. 기존 장소를 먼저 확인해 주세요."
        : "장소 요청을 반영하지 못했습니다.");
    } finally {
      setPlaceRequestActionId(null);
    }
  };

  const rejectPlaceRequest = async (request: PlaceRegistrationRequest) => {
    if (placeRequestActionId || request.status === "approved") return;
    const rejectionNote = window.prompt("반려 사유를 내부 메모로 남길 수 있습니다.", request.rejectionNote || "") ?? null;
    if (rejectionNote === null) return;
    setPlaceRequestActionId(request.id);
    try {
      const response = await fetch(PLACE_REGISTRATION_REQUESTS_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: request.id, action: "reject", rejectionNote }),
      });
      const payload = await response.json().catch(() => null) as PlaceRegistrationRequestsPayload | null;
      if (!response.ok || !payload?.request) throw new Error(payload?.error ?? "reject failed");
      const linkedElement = elementsRef.current.find((element) => element.placeRequestId === request.id && !element.directoryId);
      if (linkedElement) {
        pushHistory();
        replaceElements((current) => current.filter((element) => element.id !== linkedElement.id));
        if (selectedId === linkedElement.id) setSelectedId(null);
      }
      setPlaceRequests((current) => current.map((item) => item.id === request.id ? payload.request! : item));
      setPlaceRequestsRefreshKey((current) => current + 1);
      setToast("장소 등록 요청을 반려 처리했습니다.");
    } catch {
      setToast("장소 등록 요청을 반려 처리하지 못했습니다.");
    } finally {
      setPlaceRequestActionId(null);
    }
  };

  const deletePlaceRequest = async (request: PlaceRegistrationRequest) => {
    if (placeRequestActionId || !window.confirm(`‘${request.name}’ 등록 요청 기록을 완전히 삭제할까요?\n승인된 장소 DB와 마커는 삭제되지 않습니다.`)) return;
    setPlaceRequestActionId(request.id);
    try {
      const response = await fetch(`${PLACE_REGISTRATION_REQUESTS_API}?id=${encodeURIComponent(request.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("delete failed");
      const linkedElement = elementsRef.current.find((element) => element.placeRequestId === request.id && !element.directoryId);
      if (linkedElement) {
        pushHistory();
        replaceElements((current) => current.filter((element) => element.id !== linkedElement.id));
        if (selectedId === linkedElement.id) setSelectedId(null);
      }
      setPlaceRequests((current) => current.filter((item) => item.id !== request.id));
      setPlaceRequestsRefreshKey((current) => current + 1);
      setToast("장소 등록 요청 기록을 삭제했습니다.");
    } catch {
      setToast("장소 등록 요청 기록을 삭제하지 못했습니다.");
    } finally {
      setPlaceRequestActionId(null);
    }
  };

  const closePublicExplorerPanel = () => {
    if (publicLayoutAccess !== "viewer") {
      setGlobalStoriesOpen(false);
      setPublicPanelExpanded(false);
      return;
    }
    if (!confirmDiscardStoryPhoto()) return;
    const current = (window.history.state ?? {}) as PublicHistoryState;
    if (publicPanelIsExplorer(current.wondosimPanel)) {
      setGlobalStoriesOpen(false);
      setPublicPanelExpanded(false);
      publicPreserveMapViewOnNextPopRef.current = true;
      window.history.go(current.wondosimPanel === "explorer-expanded" && current.wondosimExpandedFromCollapsed ? -2 : -1);
      return;
    }
    setGlobalStoriesOpen(false);
    setPublicPanelExpanded(false);
    publicMapViewBeforeFocusRef.current = null;
  };

  const toggleGlobalStories = () => {
    const next = !globalStoriesOpen;
    if (next) {
      if (publicLayoutAccess === "viewer" && !confirmDiscardStoryPhoto()) return;
      if (publicLayoutAccess === "viewer" && globalContentTab === "place-requests") setGlobalContentTab("places");
      if (publicLayoutAccess === "editor" && globalContentTab === "places") setGlobalContentTab("reviews");
      setGlobalStoriesPage(1);
      setGlobalEventsPage(1);
      setPlaceRequestsPage(1);
      setSelectedId(null);
      setSelectedFacilityId(null);
      setSelectedDenseLabelId(null);
      setPublicPanelExpanded(publicLayoutAccess === "viewer" && viewportDimensions.width <= 760);
      if (publicLayoutAccess === "viewer") {
        rememberPublicMapView();
        writePublicHistory(viewportDimensions.width <= 760 ? "explorer-expanded" : "explorer", null, "push");
      }
    } else if (publicLayoutAccess === "viewer") {
      closePublicExplorerPanel();
      return;
    }
    setGlobalStoriesOpen(next);
  };

  const openGlobalManagement = (tab: "reviews" | "events") => {
    setGlobalContentTab(tab);
    if (tab === "reviews") {
      setGlobalStoriesPage(1);
      setGlobalStoriesRefreshKey((current) => current + 1);
    } else {
      setGlobalEventsPage(1);
      setGlobalEventsRefreshKey((current) => current + 1);
    }
    setGlobalStoriesOpen(true);
    setPublicPanelExpanded(false);
    setSelectedDenseLabelId(null);
  };

  const openUnifiedContentManagement = () => {
    openGlobalManagement(globalContentTab === "events" ? "events" : "reviews");
  };

  const publicPlaceItemForReference = (placeKey: string, placeName: string) => {
    const directoryId = placeKey.startsWith("directory:") ? placeKey.slice("directory:".length) : "";
    const normalized = normalizePlaceName(placeName);
    return publicPlaceItems.find((item) => (
      (directoryId && item.place.id === directoryId)
      || normalizePlaceName(item.place.name) === normalized
      || item.place.aliases?.some((alias) => normalizePlaceName(alias) === normalized)
    ));
  };

  const focusPublicPlaceItem = (item: PublicPlaceListItem, showDetails = false) => {
    if (!confirmDiscardStoryPhoto(item.id)) return;
    rememberPublicMapView();
    const current = (window.history.state ?? {}) as PublicHistoryState;
    const from: NonNullable<PublicHistoryState["wondosimFrom"]> = current.wondosimPanel === "explorer" || current.wondosimPanel === "explorer-expanded"
      ? current.wondosimPanel
      : current.wondosimFrom ?? "map";
    writePublicHistory("place", item.id, publicPanelIsPlace(current.wondosimPanel) ? "replace" : "push", from);
    if (showDetails && viewportDimensions.width <= 760) writePublicHistory("place-expanded", item.id, "push", from, true);
    setSelectedId(item.anchor.id);
    setSelectedFacilityId(item.place.id === item.anchor.directoryId ? null : item.place.id);
    setSelectedNoteId(null);
    setSelectedDenseLabelId(null);
    setPublicPanelExpanded(false);
    setPublicPlaceExpanded(showDetails && viewportDimensions.width <= 760);
    setGlobalStoriesOpen(false);
    focusMapPosition(item.anchor.x, item.anchor.y, item.anchor.id, {
      publicNavigation: true,
      showDetails,
    });
  };

  const closePublicPlacePanel = () => {
    if (!confirmDiscardStoryPhoto()) return;
    const current = (window.history.state ?? {}) as PublicHistoryState;
    if (publicPanelIsPlace(current.wondosimPanel)) {
      const returnToExplorer = publicPanelIsExplorer(current.wondosimFrom);
      setSelectedId(null);
      setSelectedFacilityId(null);
      setPublicPlaceExpanded(false);
      setGlobalStoriesOpen(returnToExplorer);
      setPublicPanelExpanded(current.wondosimFrom === "explorer-expanded");
      if (returnToExplorer) setGlobalContentTab("places");
      publicPreserveMapViewOnNextPopRef.current = true;
      window.history.go(current.wondosimPanel === "place-expanded" && current.wondosimExpandedFromCollapsed ? -2 : -1);
      return;
    }
    setSelectedId(null);
    setSelectedFacilityId(null);
    setPublicPlaceExpanded(false);
    publicMapViewBeforeFocusRef.current = null;
  };

  const openPublicPlaceList = () => {
    if (!confirmDiscardStoryPhoto()) return;
    const current = (window.history.state ?? {}) as PublicHistoryState;
    const expanded = viewportDimensions.width <= 760;
    if (publicPanelIsPlace(current.wondosimPanel) && publicPanelIsExplorer(current.wondosimFrom)) {
      window.history.go(current.wondosimPanel === "place-expanded" && current.wondosimExpandedFromCollapsed ? -2 : -1);
      return;
    }
    if (current.wondosimPanel === "place-expanded") {
      publicNavigationAfterPopRef.current = "explorer";
      window.history.go(-2);
      return;
    }
    writePublicHistory(expanded ? "explorer-expanded" : "explorer", null, "replace");
    setSelectedId(null);
    setSelectedFacilityId(null);
    setPublicPlaceExpanded(false);
    setGlobalContentTab("places");
    setGlobalStoriesOpen(true);
    setPublicPanelExpanded(expanded);
    restorePublicMapView(false);
  };

  const resetPublicMap = () => {
    if (!confirmDiscardStoryPhoto()) return;
    publicNavigationAfterPopRef.current = null;
    publicMapViewBeforeFocusRef.current = null;
    const nextPan = { x: 0, y: 0 };
    zoomRef.current = fitZoom;
    panRef.current = nextPan;
    setZoom(fitZoom);
    setMapPan(nextPan);
    setMapRenderPan(nextPan);
    setSelectedId(null);
    setSelectedFacilityId(null);
    setSelectedDenseLabelId(null);
    setGlobalStoriesOpen(false);
    setPublicPanelExpanded(false);
    setPublicPlaceExpanded(false);
    writePublicHistory("map", null, "replace");
    setToast("전체 지도로 돌아왔습니다.");
  };

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
  }, [adminLoginOpen, fitZoom, globalStoriesOpen, openPublicPlaceList, placeRequestFormOpen, placeRequestPickingLocation, publicLayoutAccess, setMapPan, shortcutHelpOpen]);

  const copyPublicPlaceAddress = async () => {
    const address = selectedDirectoryPlace?.address || selected?.address || "";
    if (!address) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(address);
      else {
        const textarea = document.createElement("textarea");
        textarea.value = address;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setToast("주소를 복사했습니다.");
    } catch {
      setToast("주소를 복사하지 못했습니다. 길게 눌러 복사해 주세요.");
    }
  };

  const sharePublicPlace = async () => {
    const placeId = currentPublicPlaceId();
    if (!placeId) return;
    const url = new URL(publicUrlWithPlace(window.location.href, placeId), window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: `${selectedDisplayName} · 제주 원도심 아트맵`, text: `${selectedDisplayName} 장소 정보`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast("장소 링크를 복사했습니다.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setToast("장소 링크를 공유하지 못했습니다.");
    }
  };

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
  }, [closePublicExplorerPanel, closePublicPlacePanel, confirmDiscardStoryPhoto, currentPublicPlaceId, focusMapPosition, publicLayoutAccess, publicPlaceItems, rememberPublicMapView, restorePublicMapView, selectedId]);

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

  const openGlobalStoryPlace = (story: PlaceStory) => {
    const item = publicPlaceItemForReference(story.placeKey, story.placeName);
    if (!item) {
      setToast("현재 공개 지도에서 이 장소의 마커를 찾지 못했습니다.");
      return;
    }
    focusPublicPlaceItem(item);
  };

  const openGlobalEventPlace = (place: PlaceEventPlace) => {
    const item = publicPlaceItemForReference(place.placeKey, place.placeName);
    if (!item) {
      setToast("현재 공개 지도에서 이 장소의 마커를 찾지 못했습니다.");
      return;
    }
    focusPublicPlaceItem(item);
  };

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
  const activeBaseMapSrc = baseMap === "svg"
    ? MAP_SVG
    : baseMap === "png"
      ? MAP_PNG
      : uploadedBaseMapDisplaySource(uploadedBaseMap) || MAP_SVG;
  const mobileMapRenderBounds = useMemo(() => {
    if (
      publicLayoutAccess !== "viewer"
      || printPreviewMode
      || viewportDimensions.width <= 0
      || viewportDimensions.height <= 0
      || viewportDimensions.width > 760
      || stageDimensions.width <= 0
      || stageDimensions.height <= 0
    ) return null;
    const renderZoom = Math.max(zoom, 0.22);
    const renderedWidth = stageDimensions.width * renderZoom;
    const renderedHeight = stageDimensions.height * renderZoom;
    const overscanX = Math.max(mobileRenderBudget.minimumOverscan, viewportDimensions.width * mobileRenderBudget.overscanRatio);
    const overscanY = Math.max(mobileRenderBudget.minimumOverscan, viewportDimensions.height * mobileRenderBudget.overscanRatio);
    return {
      centerX: 50 - mapRenderPan.x / renderedWidth * 100,
      centerY: 50 - mapRenderPan.y / renderedHeight * 100,
      left: 50 + (-viewportDimensions.width / 2 - overscanX - mapRenderPan.x) / renderedWidth * 100,
      right: 50 + (viewportDimensions.width / 2 + overscanX - mapRenderPan.x) / renderedWidth * 100,
      top: 50 + (-viewportDimensions.height / 2 - overscanY - mapRenderPan.y) / renderedHeight * 100,
      bottom: 50 + (viewportDimensions.height / 2 + overscanY - mapRenderPan.y) / renderedHeight * 100,
    };
  }, [mapRenderPan.x, mapRenderPan.y, mobileRenderBudget.minimumOverscan, mobileRenderBudget.overscanRatio, printPreviewMode, publicLayoutAccess, stageDimensions.height, stageDimensions.width, viewportDimensions.height, viewportDimensions.width, zoom]);
  const mobileMapCandidateElements = useMemo(() => {
    if (!mobileMapRenderBounds) return visibleElements;
    return visibleElements.filter((element) => (
      element.id === selectedId
      || element.category === "landmark"
      || isPrimaryHubLabel(element.name)
      || (
        element.x >= mobileMapRenderBounds.left
        && element.x <= mobileMapRenderBounds.right
        && element.y >= mobileMapRenderBounds.top
        && element.y <= mobileMapRenderBounds.bottom
      )
    ));
  }, [mobileMapRenderBounds, selectedId, visibleElements]);
  const mobileFullMarkerIds = useMemo(() => {
    if (!mobileMapRenderBounds) return null;
    if (mobileOverviewSimplified) {
      return new Set(mobileMapCandidateElements
        .filter((element) => element.category === "landmark")
        .map((element) => element.id));
    }
    const markerBudget = mobileMarkerBudgetForScale(
      zoom,
      fitZoom,
      mobileMapCandidateElements.length,
      mobileRenderBudget.tier,
    );
    return new Set(chooseMobileMarkerRenderIds(mobileMapCandidateElements, {
      limit: markerBudget,
      selectedId,
      mainHubIds: mobileMapCandidateElements.filter((element) => isPrimaryHubLabel(element.name)).map((element) => element.id),
      centerX: mobileMapRenderBounds.centerX,
      centerY: mobileMapRenderBounds.centerY,
    }));
  }, [fitZoom, mobileMapCandidateElements, mobileMapRenderBounds, mobileOverviewSimplified, mobileRenderBudget.tier, selectedId, zoom]);
  const renderedMapElements = useMemo(() => (
    mobileFullMarkerIds
      ? mobileMapCandidateElements.filter((element) => mobileFullMarkerIds.has(element.id))
      : mobileMapCandidateElements
  ), [mobileFullMarkerIds, mobileMapCandidateElements]);
  const mobilePlaceholderElements = useMemo(() => (
    mobileFullMarkerIds
      ? mobileMapCandidateElements.filter((element) => element.category !== "landmark" && !mobileFullMarkerIds.has(element.id))
      : []
  ), [mobileFullMarkerIds, mobileMapCandidateElements]);
  const renderedMapElementsById = useMemo(
    () => new Map(renderedMapElements.map((element) => [element.id, element])),
    [renderedMapElements],
  );
  const renderedDenseLabelClusters = useMemo(() => {
    if (!mobileMapRenderBounds) return denseLabelClusters;
    return denseLabelClusters.filter((cluster) => (
      cluster.id === selectedDenseLabelId
      || (cluster.elementIds.length > 0 && cluster.elementIds.every((elementId) => renderedMapElementsById.has(elementId)))
    ));
  }, [denseLabelClusters, mobileMapRenderBounds, renderedMapElementsById, selectedDenseLabelId]);
  const renderedClusteredLabelElementIds = useMemo(
    () => new Set(renderedDenseLabelClusters.flatMap((cluster) => cluster.elementIds)),
    [renderedDenseLabelClusters],
  );
  const renderedIndividualLabelCount = useMemo(
    () => stageLabelElements.reduce((count, element) => count + Number(!renderedClusteredLabelElementIds.has(element.id)), 0),
    [renderedClusteredLabelElementIds, stageLabelElements],
  );
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
    <img className="public-loading-symbol" src="/jfac-signature-b.png" alt="제주문화예술재단 국문 시그니처 B" />
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

  return (
    <Suspense fallback={<main className="app-shell public-loading" data-ui-theme={uiTheme}>{startupLoadingCard}</main>}>
      <main className={`app-shell ${publicLayoutAccess === "viewer" ? "public-readonly-shell" : ""} ${publicLayoutAccess === "viewer" && selected ? "public-place-selected" : ""}`} data-ui-theme={uiTheme}>
      {!startupRevealReady && <div className="public-loading public-loading-overlay">{startupLoadingCard}</div>}
      {publicLayoutAccess === "editor" ? <header className="topbar">
        <div className="brand-block"><div className="brand-mark"><img src="/jfac-symbol.png" alt="" aria-hidden="true" /></div><div><strong>제주 원도심 아트맵 관리</strong><span>제주문화예술재단 · 내부 디자인 도구</span></div><details className="admin-theme-menu">
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
        <div className="brand-block"><div className="brand-mark"><img src="/jfac-symbol.png" alt="" aria-hidden="true" /></div><div><strong>제주 원도심 아트맵</strong><span>{publicLayoutPublishedAt ? `공개 배치본 · ${new Date(publicLayoutPublishedAt).toLocaleDateString("ko-KR")} 갱신` : "공개 배치본 준비 중"}</span></div></div>
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
              const activeAssetId = elements.find((element) => normalizePlaceName(element.name) === normalizePlaceName(placeName))?.assetId;
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
                </div>
                <section className="public-label-density-editor" aria-labelledby="public-label-density-title">
                  <header><span><b id="public-label-density-title">배포본 축척별 일반 라벨</b><small>랜드마크·주요 거점·현재 선택은 항상 별도 유지</small></span><button type="button" onClick={resetOptionalLabelScaleLimits}>기본값</button></header>
                  <output className="public-label-density-live" aria-live="polite">현재 화면 · 개별 {renderedIndividualLabelCount}개 · 통합 {renderedDenseLabelClusters.length}묶음</output>
                  <div className="public-label-density-steps">{optionalLabelScaleSteps.map((step, index) => <label key={step.maximumRatio}><span><b>맞춤 ×{step.maximumRatio}</b><small>지도 약 {Math.round(100 / step.maximumRatio)}% 이상 표시</small></span><input type="number" min="0" max="1200" step="1" value={step.limit} onChange={(event) => updateOptionalLabelScaleLimit(index, Number(event.target.value))} aria-label={`맞춤 축척 ${step.maximumRatio}배 일반 라벨 개수`} /><em>개</em></label>)}</div>
                  <p>각 값은 필수 라벨을 제외한 일반 라벨 상한입니다. 4.5배를 넘는 상세 화면에서는 표시 설정된 라벨 전체를 복구합니다.</p>
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
            <AdminFolder className="side-admin-folder print-target-panel" title="장소별 출력 항목" meta={`${elements.filter((element) => element.mapVisible).length}곳`} defaultOpen>
              <div className="print-target-list">{elements.filter((element) => element.mapVisible).map((element) => {
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
                <span className="marker-folder-icon" aria-hidden="true" /><i>2</i><strong>2차 확정 기준점</strong><span>{secondaryCalibrationPoints.length}</span>
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
                <span className="marker-folder-icon" aria-hidden="true" /><i>3</i><strong>3차 고정 좌표 기준점</strong><span>{tertiaryCalibrationPoints.length}</span>
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
          <div className={`map-viewport ${publicLayoutAccess === "editor" ? "editor-label-motion" : ""} ${interaction?.type === "pan" ? "is-panning" : ""} ${interaction?.type === "drag" ? "is-dragging-element" : ""} ${publicLayoutAccess === "viewer" && Math.abs(zoom - settledLabelZoom) > 0.002 ? "is-zooming" : ""} ${memoMode ? "memo-cursor" : ""} ${eventPlaceSelectionMode ? "event-place-selecting" : ""} ${placeRequestPickingLocation ? "place-request-location-selecting" : ""}`} ref={viewportRef} onWheel={onWheel} onPointerDown={startPan}>
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
                <MapConnectorLayer
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
                />
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
                  mapLabelStatusByElementId={mapLabelStatusByElementId}
                  placeRequestPickingLocation={placeRequestPickingLocation}
                  printPreviewMode={printPreviewMode}
                  publicLayoutAccess={publicLayoutAccess}
                  publicSelectedMarkerZIndex={publicSelectedMarkerZIndex}
                  selectedId={selectedId}
                  stageLabelIds={stageLabelIds}
                  stageMarkerIds={stageMarkerIds}
                  viewMode={viewMode}
                  visibleElements={renderedMapElements}
                  zoom={labelRenderZoom}
                />
                {placeRequestPickingLocation && placeRequestLocation && <div className="place-request-location-marker" style={{ left: `${placeRequestLocation.x}%`, top: `${placeRequestLocation.y}%` }} aria-label="요청할 마커 위치">
                  <img src={markerAssetSrc(placeRequestMarkerStyle, placeRequestCategory)} alt="" draggable={false} decoding="async" />
                  <span>제안 위치</span>
                </div>}
                <DenseLabelLayer
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
                />
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
          {publicLayoutAccess === "viewer" && selected && !globalStoriesOpen && <aside ref={publicPlacePanelRef} className={`public-place-sheet ${publicPlaceExpanded ? "expanded" : ""} ${publicPanelDrag?.target === "place" ? "dragging" : ""}`} style={{ "--panel-drag-y": `${publicPanelDrag?.target === "place" ? publicPanelDrag.offsetY : 0}px` } as CSSProperties} aria-label={`${selectedDisplayName} 장소 정보`} aria-busy={publicPlaceDetailLoading}>
            <div className="public-panel-drag-handle" role="separator" aria-orientation="horizontal" aria-label="위아래로 끌어 장소 정보 패널 높이 조절" onPointerDown={(event) => startPublicPanelDrag(event, "place", publicPlaceExpanded)} onPointerMove={movePublicPanelDrag} onPointerUp={finishPublicPanelDrag} onPointerCancel={finishPublicPanelDrag}><span /></div>
            <header className="public-place-sheet-head">
              <div><span style={{ color: selectedDirectoryPlace ? publicCategoryMetaForPlace(selectedDirectoryPlace, selected).color : categoryOf(selected.category).color }}>{selectedDirectoryPlace?.featuredRole === MAIN_HUB_ROLE ? "워크케이션 메인 거점" : selectedDirectoryPlace ? publicCategoryMetaForPlace(selectedDirectoryPlace, selected).name : categoryOf(selected.category).name}</span><strong>{selectedDisplayName}</strong></div>
              <div className="public-place-sheet-actions"><button type="button" className="public-place-list-back" onClick={openPublicPlaceList} aria-label="장소 목록으로 돌아가기">목록</button><button type="button" onClick={closePublicPlacePanel} aria-label="장소 정보 닫기">×</button></div>
            </header>
            <div className="public-place-sheet-scroll">
              <Suspense fallback={<div className="public-place-detail-loading" role="status" aria-live="polite"><span aria-hidden="true" /><strong>장소 화면을 준비하는 중입니다.</strong></div>}>
                <PublicPlaceDetailContent
                  loading={publicPlaceDetailLoading}
                  placeName={selectedDisplayName}
                  locationPlaces={selectedLocationGroupPlaces.map((place) => ({ id: place.id, name: place.name, active: place.id === selectedDirectoryPlace?.id }))}
                  address={selectedDirectoryPlace?.address || selected.address}
                  convenienceNames={convenienceAttributeDefinitions.filter((definition) => sanitizeConvenienceAttributes(selectedDirectoryPlace?.convenienceAttributes).includes(definition.id)).map((definition) => definition.name)}
                  description={selectedDirectoryPlace?.description ?? ""}
                  operatingInfo={selectedDirectoryPlace?.operatingInfo ?? ""}
                  notes={selectedDirectoryPlace?.notes ?? ""}
                  directionsUrl={publicPlaceDirectionsUrl(selectedDisplayName, selectedDirectoryPlace?.address || selected.address, selectedDirectoryPlace?.mapUrl)}
                  events={placeEvents.map((event) => ({ id: event.id, photoUrl: event.photoUrl, eventName: event.eventName, eventInfo: event.eventInfo, scheduleLabel: eventScheduleLabel(event.startsAt, event.endsAt) }))}
                  stories={publishedPlaceStories.map((story) => ({ id: story.id, authorName: story.authorName, reviewText: story.reviewText, photoUrl: story.photoUrl, createdAt: story.createdAt, dateLabel: storyDateLabel(story.createdAt), reported: reportedStoryIds.has(story.id) }))}
                  storiesLoading={placeStoriesLoading}
                  storyFormOpen={placeStoryFormOpen}
                  storyAuthor={placeStoryAuthor}
                  storyText={placeStoryText}
                  cameraPermissionClass={storyCameraPermission}
                  cameraPermissionLabel={storyCameraPermissionLabel(storyCameraPermission)}
                  cameraPermissionRequesting={storyCameraPermission === "requesting"}
                  cameraPermissionGranted={storyCameraPermission === "granted"}
                  photoRetaining={placeStoryPhotoRetaining}
                  photoSelected={Boolean(placeStoryPhoto)}
                  photoPreview={placeStoryPhotoPreview ?? ""}
                  storySubmitting={placeStorySubmitting}
                  storyCanSubmit={!placeStorySubmitting && !placeStoryPhotoRetaining && Boolean(placeStoryAuthor.trim()) && placeStoryText.trim().length >= 2}
                  themePicker={selectedHasThemeEasterEgg ? <UiThemePicker activeTheme={uiTheme} onSelect={selectUiTheme} /> : undefined}
                  onLocationSelect={(placeId) => { const item = publicPlaceItems.find((candidate) => candidate.place.id === placeId); if (item) focusPublicPlaceItem(item); }}
                  onCopyAddress={() => { void copyPublicPlaceAddress(); }}
                  onShare={() => { void sharePublicPlace(); }}
                  onToggleStoryForm={togglePlaceStoryForm}
                  onStoryAuthorChange={setPlaceStoryAuthor}
                  onStoryTextChange={setPlaceStoryText}
                  onRequestCameraPermission={() => { void requestPlaceStoryCameraPermission(); }}
                  onPhotoSelected={(file) => { void retainPlaceStoryPhoto(file); }}
                  onRemovePhoto={() => updatePlaceStoryPhoto(null)}
                  onSubmitStory={() => { void submitPlaceStory(); }}
                  onReportStory={(storyId) => { const story = publishedPlaceStories.find((candidate) => candidate.id === storyId); if (story) openPlaceStoryReport(story); }}
                />
              </Suspense>
            </div>
          </aside>}
          {publicLayoutAccess === "editor" ? <footer className="statusbar"><span className="status-ok"><i /> {baseMap === "uploaded" ? "업로드 베이스맵" : "기본 베이스맵"}</span><span className={editorSyncClass}>{editorSyncLabel}</span><span>{calibrationDirty ? "기준점 변경 · 보정 적용 대기" : `좌표 보정 ${6 + secondaryCalibrationPoints.length + tertiaryCalibrationPoints.length}점 적용`}</span><span>요소 {visibleElements.length}/{elements.length} · 장소 {directoryPlaces.length} · 메모 {reviewNotes.length}</span><span className="status-end">{saveState}</span></footer> : <footer className="statusbar public-statusbar"><span className="status-ok"><i /> 공개 배치본</span><span>장소 {publicPlaceItems.length} · 마커 {visibleElements.length}</span><span>{publicLayoutPublishedAt ? `${new Date(publicLayoutPublishedAt).toLocaleString("ko-KR")} 갱신` : "게시 준비 중"}</span><span className="status-end">확대하면 대부분 개별 표시되고, 밀집 구역은 통합 유지됩니다.</span></footer>}
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
      <>
        {publicLayoutAccess === "viewer" && !selected && <button type="button" className={`global-story-toggle ${globalStoriesOpen ? "active" : ""}`} onClick={toggleGlobalStories} aria-expanded={globalStoriesOpen} aria-controls="global-story-panel">
          <span aria-hidden="true">⌖</span><strong>{globalStoriesOpen ? "탐색 닫기" : "장소 · 리뷰 · 행사"}</strong>{publicPlaceItems.length > 0 && <em>{publicPlaceItems.length}</em>}
        </button>}
        {globalStoriesOpen && <aside ref={publicExplorerPanelRef} id="global-story-panel" className={`global-story-panel ${publicLayoutAccess === "editor" ? "moderation" : "public-explorer-panel"} ${publicLayoutAccess === "viewer" && publicPanelExpanded ? "expanded" : ""} ${publicPanelDrag?.target === "explorer" ? "dragging" : ""}`} style={{ "--panel-drag-y": `${publicPanelDrag?.target === "explorer" ? publicPanelDrag.offsetY : 0}px` } as CSSProperties} aria-label={publicLayoutAccess === "editor" ? "전체 장소 리뷰와 행사 관리" : "원도심 장소·리뷰·행사 탐색"}>
          {publicLayoutAccess === "viewer" && <div className="public-panel-drag-handle" role="separator" aria-orientation="horizontal" aria-label="위아래로 끌어 장소·리뷰·행사 패널 높이 조절" onPointerDown={(event) => startPublicPanelDrag(event, "explorer", publicPanelExpanded)} onPointerMove={movePublicPanelDrag} onPointerUp={finishPublicPanelDrag} onPointerCancel={finishPublicPanelDrag}><span /></div>}
          <header className="global-story-panel-head">
            <div><strong>{publicLayoutAccess === "editor" ? "리뷰·행사 관리" : "원도심 탐색"}</strong><span>{publicLayoutAccess === "editor" ? "전체 장소의 최신 기록과 현재 행사" : "목록을 보면서 지도 위치를 바로 확인하세요."}</span></div>
            <div className="global-story-panel-head-actions">
              {publicLayoutAccess === "viewer" && <button type="button" className="place-request-open-button" onClick={() => setPlaceRequestFormOpen(true)}>＋ 장소 등록 요청</button>}
              <button type="button" className="global-panel-close" onClick={closePublicExplorerPanel} aria-label="탐색 패널 닫기">×</button>
            </div>
          </header>
          <div className={`global-content-tabs ${publicLayoutAccess === "editor" ? "admin" : "public"}`} role="tablist" aria-label="장소와 리뷰, 행사 선택">
            {publicLayoutAccess === "viewer" && <button type="button" role="tab" aria-selected={globalContentTab === "places"} className={globalContentTab === "places" ? "active" : ""} onClick={() => setGlobalContentTab("places")}>장소 <span>{publicPlaceItems.length}</span></button>}
            <button type="button" role="tab" aria-selected={globalContentTab === "reviews"} className={globalContentTab === "reviews" ? "active" : ""} onClick={() => { setGlobalContentTab("reviews"); setGlobalStoriesPage(1); }}>최신 리뷰 <span>{globalStoriesTotal ?? "—"}</span></button>
            <button type="button" role="tab" aria-selected={globalContentTab === "events"} className={globalContentTab === "events" ? "active" : ""} onClick={() => { setGlobalContentTab("events"); setGlobalEventsPage(1); }}>행사 <span>{globalEventsTotal ?? "—"}</span></button>
            {publicLayoutAccess === "editor" && <button type="button" role="tab" aria-selected={globalContentTab === "place-requests"} className={globalContentTab === "place-requests" ? "active" : ""} onClick={() => { setGlobalContentTab("place-requests"); setPlaceRequestsPage(1); }}>장소 요청 <span>{placeRequestsTotal ?? "—"}</span></button>}
          </div>
          <div className="global-story-panel-scroll" aria-live="polite">
            {publicLayoutAccess === "editor" && globalContentTab === "events" && <div className="global-event-management-toolbar">
              <div><strong>새 행사 등록</strong><span>장소 연결 없이 원도심 공통 행사로 등록할 수도 있습니다.</span></div>
              <button type="button" disabled={!globalEventsCanManage} onClick={openUnassignedPlaceEventForm}>{globalEventsCanManage ? "＋ 행사 등록" : "권한 확인 중…"}</button>
            </div>}
            {publicLayoutAccess === "editor" && globalContentTab === "reviews" && <Suspense fallback={<div className="upload-diagnostic-state"><span className="global-story-spinner" /><strong>관리자 진단 도구를 불러오는 중입니다.</strong></div>}>
              <AdminDiagnosticsPanel
                uploadDiagnostics={uploadDiagnostics}
                uploadLoading={uploadDiagnosticsLoading}
                uploadError={uploadDiagnosticsError}
                uploadActionId={uploadDiagnosticActionId}
                onRefreshUploads={() => setUploadDiagnosticsRefreshKey((current) => current + 1)}
                onDeleteUpload={(id) => void deleteUploadDiagnostic(id)}
                onClearUploads={() => void clearUploadDiagnostics()}
                performanceDiagnostics={performanceDiagnostics}
                performanceLoading={performanceDiagnosticsLoading}
                performanceError={performanceDiagnosticsError}
                performanceActionId={performanceDiagnosticActionId}
                onRefreshPerformance={() => setPerformanceDiagnosticsRefreshKey((current) => current + 1)}
                onDeletePerformance={(id) => void deletePerformanceDiagnostic(id)}
                onClearPerformance={() => void clearPerformanceDiagnostics()}
              />
            </Suspense>}
            {globalContentTab === "places" ? <section className="public-place-explorer">
              <div className="public-place-search-row">
                <button type="button" className={`public-place-all-button ${publicPlaceCategory === "all" ? "active" : ""}`} onClick={() => { setPublicPlaceCategory("all"); setExpandedAdditionalCategoryItemId(null); }} aria-pressed={publicPlaceCategory === "all"}>전체 <em>{publicPlaceItems.length}</em></button>
                <div className="public-place-search"><span aria-hidden="true">⌕</span><input ref={publicPlaceQueryInputRef} value={publicPlaceQuery} onChange={(event) => { setPublicPlaceQuery(event.target.value); setExpandedAdditionalCategoryItemId(null); }} placeholder="장소명·주소·분류 검색" aria-label="공개 장소 검색" />{publicPlaceQuery && <button type="button" onClick={() => { setPublicPlaceQuery(""); setExpandedAdditionalCategoryItemId(null); }} aria-label="장소 검색어 지우기">×</button>}</div>
              </div>
              <div className="public-place-filter-summary">
                <span role="status">검색 결과 <strong>{filteredPublicPlaceItems.length}</strong>곳</span>
                {(publicPlaceCategory !== "all" || publicPlaceQuery) && <button type="button" className="public-place-filter-reset" onClick={() => { setPublicPlaceCategory("all"); setPublicPlaceQuery(""); setExpandedAdditionalCategoryItemId(null); }}>조건 초기화</button>}
              </div>
              <div className="public-place-category-chips" role="list" aria-label="장소 카테고리">{publicListCategories.map((category) => <button type="button" role="listitem" className={publicPlaceCategory === category.id ? "active" : ""} style={{ "--category-color": category.color } as CSSProperties} onClick={() => { setPublicPlaceCategory(category.id); setExpandedAdditionalCategoryItemId(null); }} key={category.id}><img src={category.iconSrc} alt="" aria-hidden="true" /><span>{category.name}</span><em>{publicPlaceCategoryCounts[category.id]}</em></button>)}</div>
              <div className="public-place-list-header" aria-hidden="true"><span>장소명</span><span>대분류</span><span>추가분류</span><span className="public-place-detail-heading" title="상세보기"><MagnifierIcon /></span></div>
              <div className="public-place-list" role="list" aria-label={`${publicPlaceCategory === "all" ? "전체 장소" : publicListCategories.find((category) => category.id === publicPlaceCategory)?.name ?? "장소"} 목록`}>
                {filteredPublicPlaceItems.map((item) => {
                  const meta = publicCategoryMetaForPlace(item.place, item.anchor);
                  const selectedItem = selectedId === item.anchor.id && selectedDirectoryPlace?.id === item.place.id;
                  const eventListedInCulture = publicPlaceCategory === "culture" && item.categoryId !== "culture" && eventLinkedPublicPlaceIds.has(item.id);
                  const tagNames = additionalCategoryDefinitions
                    .filter((definition) => sanitizeAdditionalCategories(item.place.additionalCategories).includes(definition.id))
                    .map((definition) => definition.name);
                  const tagLabel = tagNames.length ? tagNames.join(" · ") : "—";
                  const representativeTagNames = tagNames.slice(0, 2);
                  const remainingTagNames = tagNames.slice(2);
                  return <article className={`${selectedItem ? "selected" : ""} ${item.isMainHub ? "main-hub" : ""} ${eventListedInCulture ? "event-linked" : ""}`} key={item.id} role="listitem">
                    <button type="button" className="public-place-row-action" onClick={() => focusPublicPlaceItem(item)} aria-label={`${item.displayName} 지도에서 찾기`} aria-current={selectedItem ? "location" : undefined} />
                    <span className="public-place-identity"><i className="public-place-marker-key" style={{ background: categoryOf(item.anchor.category).color }} aria-hidden="true" /><strong title={item.displayName}>{item.displayName}</strong>{eventListedInCulture && <em className="public-place-event-badge">행사</em>}</span>
                    <span className="public-place-primary-category" style={{ color: meta.color }} title={meta.name}>{meta.name}</span>
                    <div className={`public-place-additional-category ${remainingTagNames.length ? "has-more" : ""} ${expandedAdditionalCategoryItemId === item.id ? "is-expanded" : ""}`} title={remainingTagNames.length ? undefined : tagNames.length ? tagLabel : "추가분류 없음"} onPointerEnter={() => {
                      setExpandedAdditionalCategoryItemId((current) => current && current !== item.id ? null : current);
                    }} onPointerLeave={(event) => {
                      if (event.pointerType === "mouse") setExpandedAdditionalCategoryItemId((current) => current === item.id ? null : current);
                    }}>
                      {remainingTagNames.length > 0 ? <>
                        <button type="button" className="public-place-additional-category-disclosure" aria-expanded={expandedAdditionalCategoryItemId === item.id} aria-label={`${representativeTagNames.join(", ")} 외 추가분류 ${remainingTagNames.length}개 더 보기`} title={`추가분류 ${remainingTagNames.length}개 더 보기`} onClick={() => {
                          setExpandedAdditionalCategoryItemId((current) => current === item.id ? null : item.id);
                        }}>
                          <span className="public-place-additional-category-preview">{representativeTagNames.join(" · ")}</span>
                          <span className="public-place-additional-category-count" aria-hidden="true">+{remainingTagNames.length}</span>
                        </button>
                        <div className="public-place-additional-category-popover" data-density={remainingTagNames.length <= 2 ? "compact" : "adaptive"} role="list" aria-label="나머지 추가분류">
                          {remainingTagNames.map((tagName) => <span role="listitem" key={tagName}>{tagName}</span>)}
                        </div>
                      </> : <span className="public-place-additional-category-preview">{representativeTagNames.length ? representativeTagNames.join(" · ") : "—"}</span>}
                    </div>
                    <button type="button" className="public-place-open-action" onClick={() => focusPublicPlaceItem(item, true)} aria-label={`${item.displayName} 상세보기`} title="상세보기" aria-current={selectedItem ? "true" : undefined}><MagnifierIcon /></button>
                  </article>;
                })}
                {!filteredPublicPlaceItems.length && <div className="public-place-empty"><strong>조건에 맞는 장소가 없습니다.</strong><span>검색어나 카테고리를 바꿔보세요.</span></div>}
              </div>
            </section> : globalContentTab === "reviews" || globalContentTab === "events" ? <Suspense fallback={<div className="global-story-state"><span className="global-story-spinner" /><strong>{globalContentTab === "reviews" ? "리뷰 화면을 준비하는 중입니다." : "행사 화면을 준비하는 중입니다."}</strong></div>}>
              <PublicExplorerActivityContent
                key={globalContentTab}
                tab={globalContentTab}
                access={publicLayoutAccess === "editor" ? "editor" : "viewer"}
                stories={globalStories}
                storiesLoading={globalStoriesLoading}
                storiesError={globalStoriesError}
                storiesCanModerate={globalStoriesCanModerate}
                reportedStoryIds={reportedStoryIds}
                storyActionId={placeStoryActionId}
                events={globalEvents}
                eventsLoading={globalEventsLoading}
                eventsError={globalEventsError}
                eventsCanManage={globalEventsCanManage}
                eventActionId={placeEventActionId}
                onRetryStories={() => setGlobalStoriesRefreshKey((current) => current + 1)}
                onOpenStoryPlace={openGlobalStoryPlace}
                onReportStory={openPlaceStoryReport}
                onModerateStory={moderatePlaceStory}
                onDeleteStory={deletePlaceStory}
                onRetryEvents={() => setGlobalEventsRefreshKey((current) => current + 1)}
                onOpenEventPlace={openGlobalEventPlace}
                onEditEvent={editPlaceEvent}
                onModerateEvent={moderatePlaceEvent}
                onDeleteEvent={deletePlaceEvent}
              />
            </Suspense>
                : (placeRequestsLoading ? <div className="global-story-state"><span className="global-story-spinner" /><strong>장소 등록 요청을 불러오는 중입니다.</strong></div>
                  : placeRequestsError ? <div className="global-story-state error"><strong>장소 등록 요청을 불러오지 못했습니다.</strong><button type="button" onClick={() => setPlaceRequestsRefreshKey((current) => current + 1)}>다시 시도</button></div>
                    : placeRequests.length ? <div className="place-request-admin-list">{placeRequests.map((request) => {
                      const statusLabel = request.status === "pending" ? "검수 대기" : request.status === "reviewing" ? "지도 검수 중" : request.status === "approved" ? "승인 완료" : "반려";
                      const closed = request.status === "approved" || request.status === "rejected";
                      const disabled = closed || placeRequestActionId !== null;
                      const linkedMarker = elements.find((element) => element.placeRequestId === request.id && !element.directoryId);
                      return <article className={`place-request-admin-card ${request.status}`} key={request.id}>
                        <header><div><span className={`place-request-status ${request.status}`}>{statusLabel}</span><time dateTime={request.createdAt}>{storyDateTimeLabel(request.createdAt)}</time></div><img src={markerAssetSrc(request.markerStyle, request.category)} alt="요청 마커 미리보기" loading="lazy" decoding="async" /></header>
                        <label>장소명<input value={request.name} maxLength={120} disabled={closed} onChange={(event) => updatePlaceRequestDraft(request.id, { name: event.target.value })} /></label>
                        <div className="place-request-admin-row"><label>마커 분류<select value={request.category} disabled={closed} onChange={(event) => updatePlaceRequestDraft(request.id, { category: event.target.value as BundledMarkerCategory })}>{categories.filter((category) => category.id !== "landmark").map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>형태<select value={request.markerStyle} disabled={closed} onChange={(event) => updatePlaceRequestDraft(request.id, { markerStyle: event.target.value as BundledMarkerStyle })}><option value="v2">리뉴얼 최종</option><option value="01">형태 01</option><option value="02">형태 02</option><option value="03">형태 03</option></select></label></div>
                        <label>권역·세부지역<select value={request.area} disabled={closed} onChange={(event) => updatePlaceRequestDraft(request.id, { area: event.target.value })}><option value="">선택해 주세요</option>{[...new Set([request.area, ...placeRequestAreaOptions])].filter(Boolean).map((area) => <option value={area} key={area}>{area}</option>)}</select></label>
                        <label>주소<input value={request.address} maxLength={260} disabled={closed} onChange={(event) => updatePlaceRequestDraft(request.id, { address: event.target.value })} /></label>
                        <label>설명<textarea value={request.description} maxLength={800} disabled={closed} onChange={(event) => updatePlaceRequestDraft(request.id, { description: event.target.value })} /></label>
                        <div className="place-request-coordinate-summary"><span>요청 위치</span><strong>{typeof request.submittedX === "number" && typeof request.submittedY === "number" ? `${request.submittedX.toFixed(2)}, ${request.submittedY.toFixed(2)}` : "기존 요청 · 위치 정보 없음"}</strong>{linkedMarker && <em>현재 검수 위치 {linkedMarker.x.toFixed(2)}, {linkedMarker.y.toFixed(2)}</em>}</div>
                        {(request.submittedName !== request.name || request.submittedArea !== request.area || request.submittedAddress !== request.address || request.submittedDescription !== request.description || request.submittedCategory !== request.category || request.submittedMarkerStyle !== request.markerStyle) && <details><summary>요청자가 보낸 원문 보기</summary><p><b>{request.submittedName}</b><br />{request.submittedArea || "권역 미선택"}<br />{request.submittedAddress}<br />{request.submittedDescription}</p></details>}
                        {request.rejectionNote && <p className="place-request-rejection-note"><b>반려 메모</b>{request.rejectionNote}</p>}
                        {request.status === "approved" && <p className="place-request-approved-note">장소 DB와 검수한 지도 위치 반영 완료</p>}
                        <footer><button type="button" className="review-start" disabled={disabled} onClick={() => void startPlaceRequestReview(request)}>{placeRequestActionId === request.id ? "처리 중…" : request.status === "reviewing" ? "지도 검수 계속" : "검수 시작"}</button><button type="button" disabled={disabled} onClick={() => void savePlaceRequestEdits(request)}>수정 저장</button><button type="button" className="approve" disabled={disabled || request.status !== "reviewing" || !linkedMarker} onClick={() => void approvePlaceRequest(request)}>검수 완료·DB 반영</button><button type="button" disabled={disabled} onClick={() => void rejectPlaceRequest(request)}>반려</button><button type="button" className="danger" disabled={placeRequestActionId !== null} onClick={() => void deletePlaceRequest(request)}>기록 삭제</button></footer>
                      </article>;
                    })}</div> : <div className="global-story-state"><strong>대기 중인 장소 등록 요청이 없습니다.</strong><span>방문자가 요청을 보내면 이 목록에서 수정·검수하고 편집 초안에 반영할 수 있습니다.</span></div>)}
          </div>
          {globalContentTab === "places" ? null : globalContentTab === "reviews" ? globalStoriesPageCount > 1 && <footer className="global-story-pagination" aria-label="최신 리뷰 페이지 이동"><button type="button" disabled={globalStoriesPage <= 1 || globalStoriesLoading} onClick={() => setGlobalStoriesPage((page) => Math.max(1, page - 1))}>이전</button><span><b>{globalStoriesPage}</b> / {globalStoriesPageCount}</span><button type="button" disabled={globalStoriesPage >= globalStoriesPageCount || globalStoriesLoading} onClick={() => setGlobalStoriesPage((page) => Math.min(globalStoriesPageCount, page + 1))}>다음</button></footer>
            : globalContentTab === "events" ? globalEventsPageCount > 1 && <footer className="global-story-pagination" aria-label="행사 페이지 이동"><button type="button" disabled={globalEventsPage <= 1 || globalEventsLoading} onClick={() => setGlobalEventsPage((page) => Math.max(1, page - 1))}>이전</button><span><b>{globalEventsPage}</b> / {globalEventsPageCount}</span><button type="button" disabled={globalEventsPage >= globalEventsPageCount || globalEventsLoading} onClick={() => setGlobalEventsPage((page) => Math.min(globalEventsPageCount, page + 1))}>다음</button></footer>
              : placeRequestsPageCount > 1 && <footer className="global-story-pagination" aria-label="장소 등록 요청 페이지 이동"><button type="button" disabled={placeRequestsPage <= 1 || placeRequestsLoading} onClick={() => setPlaceRequestsPage((page) => Math.max(1, page - 1))}>이전</button><span><b>{placeRequestsPage}</b> / {placeRequestsPageCount}</span><button type="button" disabled={placeRequestsPage >= placeRequestsPageCount || placeRequestsLoading} onClick={() => setPlaceRequestsPage((page) => Math.min(placeRequestsPageCount, page + 1))}>다음</button></footer>}
        </aside>}
      </>
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
