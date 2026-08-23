import { MAP_ASPECT } from "../calibration/model";
import { EXPORT_CANONICAL_WIDTH, mapElementDisplaySize } from "../core/model";
import type { DenseLabelCluster, MapElement } from "../core/types";
import { segmentsCross } from "../labels/dense-placement.mjs";
import { rectsOverlap, type NormalizedRect } from "../labels/geometry";

type Segment = { fromX: number; fromY: number; toX: number; toY: number; id: string };

export type PrintAuditIssue = {
  id: string;
  kind: "clipping" | "overlap" | "crossing" | "text";
  label: string;
  elementId?: string;
  clusterId?: string;
};

export type PrintAuditReport = {
  issues: PrintAuditIssue[];
  clippingCount: number;
  overlapCount: number;
  crossingCount: number;
  minimumTextPixels: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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

export function buildPrintAudit(
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
