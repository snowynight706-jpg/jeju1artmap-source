import type { CalibrationPoint } from "./map-calibration";
import type { CategoryId } from "./map-model";
import type {
  AdditionalCategoryId,
  ConvenienceAttributeId,
} from "./place-taxonomy";

export type AssetStatus = "approved" | "review" | "unchecked";
export type LabelPosition = "top" | "bottom" | "left" | "right";
export type ViewMode = "all" | "landmarks" | "markers" | "labels" | "anchors" | "clearance" | "collisions" | "dim" | "gray" | "nomap";
export type PublicLayoutAccess = "loading" | "editor" | "viewer";

export type MapAsset = {
  id: string;
  name: string;
  category: CategoryId;
  status: AssetStatus;
  src: string;
  screenSrc?: string;
  mobileSrc?: string;
  fileType: "png" | "svg" | "image";
  placeName?: string;
  address?: string;
  addressSourceUrl?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  builtIn?: boolean;
};

export type MapElement = {
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

export type DenseLabelPosition = {
  key: string;
  elementIds: string[];
  x: number;
  y: number;
};

export type DenseLabelRow = {
  elementId: string;
  name: string;
  category: CategoryId;
  targetX: number;
  targetY: number;
  column: number;
  rowIndex: number;
};

export type DenseLabelCluster = {
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

export type StageDimensions = {
  width: number;
  height: number;
};

export type VisualBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type MapLabelStatus = {
  hasEvent: boolean;
  reviewCount: number;
  hasNewReview: boolean;
};

export type DirectoryPlace = {
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

export type ReviewStatus = "delete" | "weaken" | "keep" | "hierarchy";

export type ReviewNote = {
  id: string;
  x: number;
  y: number;
  status: ReviewStatus;
  text: string;
};

export type LandmarkDefaultPosition = {
  elementId: string;
  name: string;
  x: number;
  y: number;
  confirmed?: boolean;
};

export type LockedCoordinateSetting = {
  key: string;
  directoryId?: string;
  name: string;
  category: CategoryId;
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
};

export type PlacementState = "unplaced" | "deleted";

export type PlacementOverride = {
  key: string;
  directoryId?: string;
  name: string;
  state: PlacementState;
};

export type DocumentState = {
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
