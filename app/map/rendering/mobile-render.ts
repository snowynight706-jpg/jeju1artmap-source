import { isPrimaryHubLabel } from "../core/model";
import type { DenseLabelCluster, MapElement, PublicLayoutAccess, StageDimensions } from "../core/types";

export type MobileRenderBudget = {
  tier: "low" | "standard" | "high";
  overscanRatio: number;
  minimumOverscan: number;
};

export type MobileMapRenderBounds = {
  centerX: number;
  centerY: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export function calculateMobileMapRenderBounds(options: {
  publicLayoutAccess: PublicLayoutAccess;
  printPreviewMode: boolean;
  viewportDimensions: StageDimensions;
  stageDimensions: StageDimensions;
  zoom: number;
  mapRenderPan: { x: number; y: number };
  renderBudget: MobileRenderBudget;
}): MobileMapRenderBounds | null {
  const {
    publicLayoutAccess,
    printPreviewMode,
    viewportDimensions,
    stageDimensions,
    zoom,
    mapRenderPan,
    renderBudget,
  } = options;
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
  const overscanX = Math.max(renderBudget.minimumOverscan, viewportDimensions.width * renderBudget.overscanRatio);
  const overscanY = Math.max(renderBudget.minimumOverscan, viewportDimensions.height * renderBudget.overscanRatio);
  return {
    centerX: 50 - mapRenderPan.x / renderedWidth * 100,
    centerY: 50 - mapRenderPan.y / renderedHeight * 100,
    left: 50 + (-viewportDimensions.width / 2 - overscanX - mapRenderPan.x) / renderedWidth * 100,
    right: 50 + (viewportDimensions.width / 2 + overscanX - mapRenderPan.x) / renderedWidth * 100,
    top: 50 + (-viewportDimensions.height / 2 - overscanY - mapRenderPan.y) / renderedHeight * 100,
    bottom: 50 + (viewportDimensions.height / 2 + overscanY - mapRenderPan.y) / renderedHeight * 100,
  };
}

export function filterMobileMapCandidateElements(
  elements: MapElement[],
  bounds: MobileMapRenderBounds | null,
  selectedId: string | null,
) {
  if (!bounds) return elements;
  return elements.filter((element) => (
    element.id === selectedId
    || element.category === "landmark"
    || isPrimaryHubLabel(element.name)
    || (
      element.x >= bounds.left
      && element.x <= bounds.right
      && element.y >= bounds.top
      && element.y <= bounds.bottom
    )
  ));
}

export function partitionMobileMapElements(
  elements: MapElement[],
  bounds: MobileMapRenderBounds | null,
  overviewSimplified: boolean,
) {
  if (!bounds) return { rendered: elements, placeholders: [] as MapElement[] };
  if (!overviewSimplified) return { rendered: elements, placeholders: [] as MapElement[] };
  const rendered: MapElement[] = [];
  const placeholders: MapElement[] = [];
  elements.forEach((element) => {
    if (element.category === "landmark") rendered.push(element);
    else placeholders.push(element);
  });
  return { rendered, placeholders };
}

export function filterRenderedDenseLabelClusters(
  clusters: DenseLabelCluster[],
  bounds: MobileMapRenderBounds | null,
  renderedElementsById: ReadonlyMap<string, MapElement>,
  selectedClusterId: string | null,
) {
  if (!bounds) return clusters;
  return clusters.filter((cluster) => (
    cluster.id === selectedClusterId
    || (cluster.elementIds.length > 0 && cluster.elementIds.every((elementId) => renderedElementsById.has(elementId)))
  ));
}

export function countRenderedIndividualLabels(
  labelElements: MapElement[],
  clusters: DenseLabelCluster[],
) {
  const clusteredIds = new Set(clusters.flatMap((cluster) => cluster.elementIds));
  return labelElements.reduce((count, element) => count + Number(!clusteredIds.has(element.id)), 0);
}
