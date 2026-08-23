"use client";
/* eslint-disable @next/next/no-img-element */

import {
  memo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { normalizePlaceName } from "./core-landmarks";
import { distanceAwareConnectorOpacity, distanceAwareConnectorWidth } from "./label-connector.mjs";
import { MAP_ASPECT } from "./map/calibration/model";
import {
  EXPORT_CANONICAL_WIDTH,
  categoryOf,
  isPrimaryHubLabel,
  mapElementDisplaySize,
  mobileMarkerPlaceholderColor,
  placeContentKey,
} from "./map/core/model";
import type {
  DenseLabelCluster,
  DenseLabelRow,
  LabelPosition,
  MapAsset,
  MapElement,
  MapLabelStatus,
  PublicLayoutAccess,
  StageDimensions,
  ViewMode,
  VisualBounds,
} from "./map/core/types";

const PUBLIC_DENSE_LABEL_CONNECTOR_OPACITY = 0.84;
const EMPTY_MAP_LABEL_STATUS: MapLabelStatus = Object.freeze({
  hasEvent: false,
  reviewCount: 0,
  hasNewReview: false,
});

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

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

function denseLabelScreenTarget(
  cluster: Pick<DenseLabelCluster, "x" | "y">,
  row: Pick<DenseLabelRow, "targetX" | "targetY">,
  zoom: number,
  stageDimensions: StageDimensions,
  labelKeepsScreenSize = true,
) {
  const inverseZoom = labelKeepsScreenSize ? 1 / Math.max(zoom, 0.22) : 1;
  const scaleX = EXPORT_CANONICAL_WIDTH / Math.max(stageDimensions.width, 1) * inverseZoom;
  const scaleY = (EXPORT_CANONICAL_WIDTH / MAP_ASPECT) / Math.max(stageDimensions.height, 1) * inverseZoom;
  return {
    x: cluster.x + (row.targetX - cluster.x) * scaleX,
    y: cluster.y + (row.targetY - cluster.y) * scaleY,
  };
}

export type MapRenderActions = {
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
  useMobileLandmarkAssets: boolean;
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
  useMobileLandmarkAssets,
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
    {showMarker && <div className="icon-visual">{asset ? <img className="placed-asset" src={useMobileLandmarkAssets ? asset.mobileSrc ?? asset.screenSrc ?? asset.src : asset.screenSrc ?? asset.src} alt="" draggable={false} decoding="async" onLoad={(event) => actionsRef.current?.measureAssetBounds(asset.id, event.currentTarget)} /> : <div className={`dummy-symbol ${element.category === "landmark" ? "landmark" : "marker"}`}><span>{metaGlyph}</span></div>}</div>}
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
  useMobileLandmarkAssets: boolean;
  viewMode: ViewMode;
  visibleElements: MapElement[];
  zoom: number;
};

export const MapElementLayer = memo(function MapElementLayer(props: MapElementLayerProps) {
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
      useMobileLandmarkAssets={props.useMobileLandmarkAssets && element.category === "landmark"}
      viewMode={props.viewMode}
      zoom={props.zoom}
    />;
  })}</div>;
});

type MobileMarkerPlaceholderLayerProps = {
  actionsRef: MapRenderActionsRef;
  elements: MapElement[];
  layerRef: { current: HTMLDivElement | null };
};

export const MobileMarkerPlaceholderLayer = memo(function MobileMarkerPlaceholderLayer({
  actionsRef,
  elements,
  layerRef,
}: MobileMarkerPlaceholderLayerProps) {
  if (!elements.length) return null;
  return <div ref={layerRef} className="mobile-marker-placeholder-layer" data-render-isolation="mobile-marker-placeholder-layer" aria-label="간략 장소 마커">
    {elements.map((element) => <button
      type="button"
      className="mobile-marker-placeholder"
      key={element.id}
      style={{ left: `${element.x}%`, top: `${element.y}%`, "--mobile-marker-color": mobileMarkerPlaceholderColor(element.category) } as CSSProperties}
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

export const MapConnectorLayer = memo(function MapConnectorLayer({
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
    const publicConnector = publicLayoutAccess === "viewer";
    const connectorOpacity = publicConnector
      ? PUBLIC_DENSE_LABEL_CONNECTOR_OPACITY
      : element
        ? distanceAwareConnectorOpacity(element.x, element.y, target.x, target.y, MAP_ASPECT)
        : 0.34;
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

export const DenseLabelLayer = memo(function DenseLabelLayer({
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
