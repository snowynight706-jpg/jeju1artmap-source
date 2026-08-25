"use client";

import { useCallback, useMemo } from "react";
import { normalizePlaceName } from "../../core-landmarks";
import type { PlaceEventPlace, PlaceReviewCount } from "../../content/types";
import type { OptionalLabelScaleStep } from "../../editor/persistence/public-layout-client";
import { MAP_ASPECT } from "../calibration/model";
import {
  isPrimaryHubLabel,
  mapElementDisplaySize,
  placeContentKey,
  type CategoryId,
} from "../core/model";
import type {
  DenseLabelPosition,
  DirectoryPlace,
  MapElement,
  PublicLayoutAccess,
  StageDimensions,
  ViewMode,
} from "../core/types";
import {
  buildDenseLabelClusters,
  denseLabelRenderScale,
} from "../labels/clusters";
import {
  chooseScaleAwareLabelIds,
  optionalLabelBudgetForScale,
} from "../labels/density.mjs";
import { publicDenseLabelViewport } from "../labels/dense-viewport.mjs";
import { buildPrintAudit } from "../print/audit";
import {
  printSettingKey,
  type PrintPlaceSetting,
} from "../print/settings";
import { mobileLabelBudgetForScale, mobileOverviewIsSimplified } from "../rendering/mobile-marker-density.mjs";
import {
  calculateMobileMapRenderBounds,
  countRenderedIndividualLabels,
  filterMobileMapCandidateElements,
  filterRenderedDenseLabelClusters,
  partitionMobileMapElements,
  type MobileRenderBudget,
} from "../rendering/mobile-render";
import { horizontalMapFitZoom } from "../interaction/stage-transform.mjs";

const RECENT_REVIEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

type Point = { x: number; y: number };

type MapWorkspaceModelOptions = {
  elements: MapElement[];
  directoryPlaces: DirectoryPlace[];
  viewportDimensions: StageDimensions;
  stageDimensions: StageDimensions;
  publicLayoutAccess: PublicLayoutAccess;
  printPreviewMode: boolean;
  settledLabelZoom: number;
  settledLabelPan: Point;
  zoom: number;
  mapRenderPan: Point;
  mapRenderRefreshRevision: number;
  activeCategory: CategoryId | "all";
  viewMode: ViewMode;
  screenRecommendedOnly: boolean;
  markerLabelsVisible: boolean;
  selectedId: string | null;
  editorScaleLabelLimitsEnabled: boolean;
  optionalLabelScaleSteps: OptionalLabelScaleStep[];
  mobileRenderBudget: MobileRenderBudget;
  printSettings: PrintPlaceSetting[];
  printLandmarks: boolean;
  printMarkers: boolean;
  printLabels: boolean;
  printRecommendedOnly: boolean;
  denseLabelPositions: DenseLabelPosition[];
  denseLabelExcludedIds: string[];
  mergeDenseLabels: boolean;
  forceIndividualLabels: boolean;
  exportWidth: number;
  eventLinkedPlaces: PlaceEventPlace[];
  reviewCountsByPlace: PlaceReviewCount[];
  reviewBadgeNow: number;
  selectedDenseLabelId: string | null;
};

export function useMapWorkspaceModel(options: MapWorkspaceModelOptions) {
  const {
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
  } = options;

  const mapVisibleElements = useMemo(
    () => elements.filter((element) => element.mapVisible),
    [elements],
  );
  const placedCategoryCounts = useMemo(() => mapVisibleElements.reduce<Record<CategoryId, number>>((counts, element) => {
    counts[element.category] += 1;
    return counts;
  }, { landmark: 0, culture: 0, cafe: 0, food: 0, shop: 0, parking: 0, park: 0, utility: 0 }), [mapVisibleElements]);

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
  // The footer describes the committed map geometry, not the deferred label
  // composition. This keeps its scale in lockstep with the post-gesture width.
  const mapScaleRatio = Math.max(1, zoom / Math.max(fitZoom, 0.22));
  const mapScaleRatioLabel = mapScaleRatio.toFixed(2).replace(/\.?0+$/, "");
  const mapVisiblePercent = Math.max(1, Math.min(100, Math.round(100 / mapScaleRatio)));
  const labelCompositionSettled = Math.abs(settledLabelZoom - zoom) <= 0.002
    && Math.abs(settledLabelPan.x - mapRenderPan.x) <= 0.5
    && Math.abs(settledLabelPan.y - mapRenderPan.y) <= 0.5;
  const labelContentReady = publicLayoutAccess !== "viewer" || labelCompositionSettled;
  const labelDetailsReady = labelContentReady;
  const labelViewportSettled = labelCompositionSettled;

  const labelViewportBounds = useMemo(() => {
    if (
      publicLayoutAccess === "loading"
      || printPreviewMode
      || viewportDimensions.width <= 0
      || viewportDimensions.height <= 0
      || stageDimensions.width <= 0
      || stageDimensions.height <= 0
    ) return null;
    void mapRenderRefreshRevision;
    return publicDenseLabelViewport({
      panX: settledLabelPan.x,
      panY: settledLabelPan.y,
      zoom: settledLabelZoom,
      stageWidth: stageDimensions.width,
      stageHeight: stageDimensions.height,
      viewportWidth: viewportDimensions.width,
      viewportHeight: viewportDimensions.height,
    });
  }, [mapRenderRefreshRevision, printPreviewMode, publicLayoutAccess, settledLabelPan.x, settledLabelPan.y, settledLabelZoom, stageDimensions.height, stageDimensions.width, viewportDimensions.height, viewportDimensions.width]);
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
      panX: settledLabelPan.x,
      panY: settledLabelPan.y,
      zoom: labelRenderZoom,
      stageWidth: stageDimensions.width,
      stageHeight: stageDimensions.height,
      viewportWidth: viewportDimensions.width,
      viewportHeight: viewportDimensions.height,
      paddingX: compact ? 12 : 18,
      paddingY: compact ? 14 : 18,
    });
  }, [labelRenderZoom, printPreviewMode, publicLayoutAccess, settledLabelPan.x, settledLabelPan.y, stageDimensions.height, stageDimensions.width, viewportDimensions.height, viewportDimensions.width]);
  const denseLabelLayoutOptions = useMemo(() => {
    if (printPreviewMode || publicLayoutAccess === "loading") return undefined;
    if (publicLayoutAccess === "editor") return {
      maximumItems: 18,
      renderScale: denseLabelRenderScale(labelRenderZoom, stageDimensions, true),
      singleColumn: true,
      compactSingleColumn: true,
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

  const printSettingsByKey = useMemo(
    () => new Map(printSettings.map((setting) => [setting.key, setting])),
    [printSettings],
  );
  const directoryPriorityById = useMemo(
    () => new Map(directoryPlaces.map((place) => [place.id, place.priority ?? ""])),
    [directoryPlaces],
  );
  const directoryPriorityByName = useMemo(
    () => new Map(directoryPlaces.map((place) => [normalizePlaceName(place.name), place.priority ?? ""])),
    [directoryPlaces],
  );
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

  const { recommendedPlaceCount, screenHiddenMarkerCount } = useMemo(() => mapVisibleElements.reduce((counts, element) => {
    if (element.category === "landmark") return counts;
    if (printPolicyFor(element).recommended) counts.recommendedPlaceCount += 1;
    else counts.screenHiddenMarkerCount += 1;
    return counts;
  }, { recommendedPlaceCount: 0, screenHiddenMarkerCount: 0 }), [mapVisibleElements, printPolicyFor]);

  const editorVisibleElements = useMemo(() => [...mapVisibleElements]
    .filter((element) => activeCategory === "all" || element.category === activeCategory)
    .filter((element) => !screenRecommendedOnly || element.category === "landmark" || printPolicyFor(element).recommended)
    .filter((element) => viewMode !== "landmarks" || element.category === "landmark")
    .filter((element) => viewMode !== "markers" || element.category !== "landmark")
    .sort((a, b) => a.z - b.z), [activeCategory, mapVisibleElements, printPolicyFor, screenRecommendedOnly, viewMode]);
  const printMarkerElements = useMemo(
    () => mapVisibleElements.filter((element) => printPolicyFor(element).marker).sort((a, b) => a.z - b.z),
    [mapVisibleElements, printPolicyFor],
  );
  const printLabelElements = useMemo(
    () => mapVisibleElements.filter((element) => printPolicyFor(element).label).sort((a, b) => a.z - b.z),
    [mapVisibleElements, printPolicyFor],
  );
  const editorLabelCandidates = useMemo(() => editorVisibleElements.filter((element) => {
    if (labelViewportBounds && (
      element.x < labelViewportBounds.left
      || element.x > labelViewportBounds.right
      || element.y < labelViewportBounds.top
      || element.y > labelViewportBounds.bottom
    )) return false;
    if (mobileOverviewSimplified && element.category !== "landmark") return false;
    const selectedLabel = selectedId === element.id;
    const primaryHub = isPrimaryHubLabel(element.name);
    const publicLandmarkLabel = publicLayoutAccess === "viewer" && element.category === "landmark";
    return (element.labelVisible || selectedLabel || publicLandmarkLabel || (publicLayoutAccess === "viewer" && primaryHub))
      && (element.category === "landmark" || markerLabelsVisible || primaryHub || selectedLabel);
  }), [editorVisibleElements, labelViewportBounds, markerLabelsVisible, mobileOverviewSimplified, publicLayoutAccess, selectedId]);
  const scaleLabelLimitActive = publicLayoutAccess === "viewer"
    || (publicLayoutAccess === "editor" && editorScaleLabelLimitsEnabled);
  const scaleMainHubLabelIds = useMemo(
    () => editorLabelCandidates.filter((element) => isPrimaryHubLabel(element.name)).map((element) => element.id),
    [editorLabelCandidates],
  );
  const scaleLabelBudget = useMemo(() => {
    const baseBudget = optionalLabelBudgetForScale(
      labelRenderZoom,
      fitZoom,
      editorLabelCandidates.length,
      scaleLabelLimitActive,
      optionalLabelScaleSteps,
    );
    if (publicLayoutAccess !== "viewer" || viewportDimensions.width <= 0 || viewportDimensions.width > 760) return baseBudget;
    return mobileLabelBudgetForScale(labelRenderZoom, fitZoom, baseBudget, editorLabelCandidates.length, mobileRenderBudget.tier);
  }, [editorLabelCandidates.length, fitZoom, labelRenderZoom, mobileRenderBudget.tier, optionalLabelScaleSteps, publicLayoutAccess, scaleLabelLimitActive, viewportDimensions.width]);
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
  const outputLabelCount = stageLabelElements.length;
  const stageMarkerIds = useMemo(
    () => new Set(stageMarkerElements.map((element) => element.id)),
    [stageMarkerElements],
  );
  const stageLabelIds = useMemo(
    () => new Set(stageLabelElements.map((element) => element.id)),
    [stageLabelElements],
  );
  const visibleElementIds = useMemo(
    () => new Set(visibleElements.map((element) => element.id)),
    [visibleElements],
  );
  const publicSelectedMarkerZIndex = useMemo(
    () => visibleElements.reduce((highest, element) => Math.max(highest, element.z), 0) + 1,
    [visibleElements],
  );

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
  const printDenseLabelClusters = useMemo(() => mergeDenseLabels
    ? buildDenseLabelClusters(printLabelElements, printMarkerElements, denseLabelPositions, denseLabelExcludedIds)
    : [], [denseLabelExcludedIds, denseLabelPositions, mergeDenseLabels, printLabelElements, printMarkerElements]);
  const printAudit = useMemo(
    () => buildPrintAudit(printMarkerElements, printLabelElements, printDenseLabelClusters, exportWidth),
    [exportWidth, printDenseLabelClusters, printLabelElements, printMarkerElements],
  );

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
          hard.add(a.id);
          hard.add(b.id);
        } else if (dx < halfWidth * 1.3 && dyAsWidth < halfHeight * 1.3) {
          clearance.add(a.id);
          clearance.add(b.id);
        }
      }
    }
    return { hard, clearance };
  }, [publicLayoutAccess, stageMarkerElements]);

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

  const mobileMapRenderBounds = useMemo(() => calculateMobileMapRenderBounds({
    publicLayoutAccess,
    printPreviewMode,
    viewportDimensions,
    stageDimensions,
    zoom,
    mapRenderPan,
    renderBudget: mobileRenderBudget,
  }), [mapRenderPan, mobileRenderBudget, printPreviewMode, publicLayoutAccess, stageDimensions, viewportDimensions, zoom]);
  const mobileMapCandidateElements = useMemo(
    () => filterMobileMapCandidateElements(visibleElements, mobileMapRenderBounds, selectedId),
    [mobileMapRenderBounds, selectedId, visibleElements],
  );
  const mobileMapElementPartition = useMemo(
    () => partitionMobileMapElements(mobileMapCandidateElements, mobileMapRenderBounds, mobileOverviewSimplified),
    [mobileMapCandidateElements, mobileMapRenderBounds, mobileOverviewSimplified],
  );
  const renderedMapElements = mobileMapElementPartition.rendered;
  const mobilePlaceholderElements = mobileMapElementPartition.placeholders;
  const renderedMapElementsById = useMemo(
    () => new Map(renderedMapElements.map((element) => [element.id, element])),
    [renderedMapElements],
  );
  const renderedDenseLabelClusters = useMemo(
    () => filterRenderedDenseLabelClusters(
      denseLabelClusters,
      mobileMapRenderBounds,
      renderedMapElementsById,
      selectedDenseLabelId,
    ),
    [denseLabelClusters, mobileMapRenderBounds, renderedMapElementsById, selectedDenseLabelId],
  );
  const renderedClusteredLabelElementIds = useMemo(
    () => new Set(renderedDenseLabelClusters.flatMap((cluster) => cluster.elementIds)),
    [renderedDenseLabelClusters],
  );
  const renderedIndividualLabelCount = useMemo(
    () => countRenderedIndividualLabels(stageLabelElements, renderedDenseLabelClusters),
    [renderedDenseLabelClusters, stageLabelElements],
  );

  return {
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
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
