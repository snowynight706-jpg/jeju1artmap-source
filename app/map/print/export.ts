import { MAP_ASPECT } from "../calibration/model";
import {
  EXPORT_CANONICAL_WIDTH,
  categoryOf,
  isPrimaryHubLabel,
  mapElementDisplaySize,
} from "../core/model";
import type { DenseLabelPosition, MapAsset, MapElement } from "../core/types";
import { buildDenseLabelClusters } from "../labels/clusters";

export type HighResolutionMapExportOptions = {
  exportWidth: number;
  mapSource: string;
  placedElements: MapElement[];
  markerElements: MapElement[];
  labelElements: MapElement[];
  assets: MapAsset[];
  mergeDenseLabels: boolean;
  denseLabelPositions: DenseLabelPosition[];
  denseLabelExcludedIds: string[];
  loadImage: (src: string) => Promise<HTMLImageElement>;
};

export type HighResolutionMapExport = {
  blob: Blob;
  outputHeight: number;
};

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("png encoding failed")),
      "image/png",
    );
  });
}

export async function renderHighResolutionMapPng(
  options: HighResolutionMapExportOptions,
): Promise<HighResolutionMapExport> {
  const {
    exportWidth,
    mapSource,
    placedElements,
    markerElements,
    labelElements,
    assets,
    mergeDenseLabels,
    denseLabelPositions,
    denseLabelExcludedIds,
    loadImage,
  } = options;
  if (!markerElements.length && !labelElements.length) throw new Error("empty print composition");

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

  const baseImage = await loadImage(mapSource);
  context.drawImage(baseImage, 0, 0, exportWidth, outputHeight);

  const exportClusters = mergeDenseLabels
    ? buildDenseLabelClusters(labelElements, markerElements, denseLabelPositions, denseLabelExcludedIds)
    : [];
  const clusteredExportIds = new Set(exportClusters.flatMap((cluster) => cluster.elementIds));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const assetSources = [...new Set(markerElements
    .map((element) => element.assetId ? assetsById.get(element.assetId)?.src : undefined)
    .filter(Boolean) as string[])];
  const loadedAssets = new Map<string, HTMLImageElement>();
  await Promise.all(assetSources.map(async (src) => {
    try {
      loadedAssets.set(src, await loadImage(src));
    } catch {
      // 개별 자산 실패는 나머지 합성을 막지 않습니다.
    }
  }));

  [...markerElements].sort((a, b) => a.z - b.z).forEach((element) => {
    const asset = element.assetId ? assetsById.get(element.assetId) : undefined;
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
    const elementsById = new Map(placedElements.map((element) => [element.id, element]));
    context.save();
    context.lineWidth = Math.max(1, exportWidth / EXPORT_CANONICAL_WIDTH * 1.1);
    context.setLineDash([exportWidth / EXPORT_CANONICAL_WIDTH * 3.5, exportWidth / EXPORT_CANONICAL_WIDTH * 2.5]);
    exportClusters.forEach((cluster) => cluster.rows.forEach((row) => {
      const element = elementsById.get(row.elementId);
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
  drawLabels(labelElements.filter((element) => element.category !== "landmark"));
  drawLabels(labelElements.filter((element) => element.category === "landmark"));

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

  return { blob: await canvasToPng(canvas), outputHeight };
}
