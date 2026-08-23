import { MAP_ASPECT } from "../calibration/model";
import { EXPORT_CANONICAL_WIDTH, mapElementDisplaySize } from "../core/model";
import type {
  DenseLabelCluster,
  DenseLabelPosition,
  DenseLabelRow,
  MapElement,
  StageDimensions,
} from "../core/types";
import { denseLabelConnections } from "./dense-density.mjs";
import { chooseDenseLabelPlacement, denseLabelPlacementOptions } from "./dense-placement.mjs";
import { fitDenseLabelCenter } from "./dense-viewport.mjs";
import type { NormalizedRect } from "./geometry";

export type DenseLabelLayoutOptions = {
  maximumItems?: number;
  renderScale?: { x: number; y: number };
  singleColumn?: boolean;
  compactSingleColumn?: boolean;
  viewportBounds?: NormalizedRect;
};

type Segment = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  id: string;
  elementId?: string;
};

const DENSE_LABEL_SINGLE_COLUMN_CONNECTOR_INSET_X = 0.46;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function denseLabelKey(elements: Array<Pick<MapElement, "id">>) {
  return elements.map((element) => element.id).sort().join("|");
}

export function denseLabelRenderScale(
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

function compactDenseLabelLayout(group: MapElement[], singleColumn = false, compactSingleColumn = false) {
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
    return compactSingleColumn
      ? Math.max(3.2, longestName * 0.64 + 0.72)
      : Math.max(5.2, longestName * 0.72 + 1.15);
  });
  const rowCount = Math.max(...columns.map((column) => column.length));
  const measuredWidth = columnWidths.reduce((sum, value) => sum + value, 0) + Math.max(0, columns.length - 1) * 0.34 + 0.68;
  const width = compactSingleColumn ? measuredWidth : Math.max(7.2, measuredWidth);
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

export function buildDenseLabelClusters(
  labelElements: MapElement[],
  iconElements: MapElement[],
  positionOverrides: DenseLabelPosition[] = [],
  excludedElementIds: Iterable<string> = [],
  densityScale = 1,
  persistentOnly = false,
  layoutOptions: DenseLabelLayoutOptions = {},
): DenseLabelCluster[] {
  // A fixed label still belongs to its ordinary marker and can be represented by a
  // dense-label cluster. The lock protects saved direction/gap/offset only.
  const excludedIds = new Set(excludedElementIds);
  const iconElementIds = new Set(iconElements.map((element) => element.id));
  const candidates = labelElements.filter((element) => (
    element.category !== "landmark" && iconElementIds.has(element.id) && !excludedIds.has(element.id)
  ));
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
      const layout = compactDenseLabelLayout(group, layoutOptions.singleColumn, layoutOptions.compactSingleColumn);
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
          const rawTargetX = columnIndex < midpoint
            ? placementX - width / 2
            : columnIndex > midpoint
              ? placementX + width / 2
              : element.x <= placementX ? placementX - width / 2 : placementX + width / 2;
          const targetX = layoutOptions.compactSingleColumn && layout.columnCount === 1
            ? rawTargetX + (rawTargetX < placementX
              ? DENSE_LABEL_SINGLE_COLUMN_CONNECTOR_INSET_X
              : -DENSE_LABEL_SINGLE_COLUMN_CONNECTOR_INSET_X)
            : rawTargetX;
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
