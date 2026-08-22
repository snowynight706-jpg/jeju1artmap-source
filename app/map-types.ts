import type { CategoryId } from "./map-model";

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
