#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [signatureSourcePath, symbolSourcePath, outputDirectory] = process.argv.slice(2);

if (!signatureSourcePath || !symbolSourcePath || !outputDirectory) {
  console.error("Usage: node scripts/extract-jfac-svg-assets.mjs <signature-page.svg> <symbol-page.svg> <output-directory>");
  process.exit(1);
}

function elementStart(source, id, tagName) {
  const idIndex = source.indexOf(`id="${id}"`);
  if (idIndex < 0) throw new Error(`Missing ${id} in the converted official CI source.`);
  const start = source.lastIndexOf(`<${tagName}`, idIndex);
  if (start < 0) throw new Error(`Missing <${tagName}> start for ${id}.`);
  return start;
}

function segmentThroughGroup(source, startId, startTagName, finalPathId) {
  const start = elementStart(source, startId, startTagName);
  const finalPathIndex = source.indexOf(`id="${finalPathId}"`, start);
  if (finalPathIndex < 0) throw new Error(`Missing ${finalPathId} in the converted official CI source.`);
  const groupEnd = source.indexOf("</g>", finalPathIndex);
  if (groupEnd < 0) throw new Error(`Missing closing group after ${finalPathId}.`);
  return source.slice(start, groupEnd + 4);
}

function compact(segment, fillMap = {}) {
  const compacted = segment
    .replace(/\s+id="(?:g|path)\d+"/g, "")
    .replace(
      /\s+style="fill:(#[0-9a-fA-F]{6});fill-opacity:1;fill-rule:nonzero;stroke:none"/g,
      ' fill="$1"',
    )
    .replace(/\s+/g, " ")
    .replace(/> </g, "><")
    .trim();

  return Object.entries(fillMap).reduce(
    (result, [sourceColor, targetColor]) => result.replaceAll(`fill="${sourceColor}"`, `fill="${targetColor}"`),
    compacted,
  );
}

function createSvg({ width, height, viewBox, sourceName, segment, fillMap, preserveAspectRatio }) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- Official 제주문화예술재단 CI vector extracted from ${sourceName}. -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}"${preserveAspectRatio ? ` preserveAspectRatio="${preserveAspectRatio}"` : ""}>`,
    '<g transform="matrix(1.3333333 0 0 -1.3333333 0 793.70133)">',
    compact(segment, fillMap),
    "</g>",
    "</svg>",
    "",
  ].join("\n");
}

const [signatureSource, symbolSource] = await Promise.all([
  readFile(signatureSourcePath, "utf8"),
  readFile(symbolSourcePath, "utf8"),
]);

const signatureSvg = createSvg({
  width: 1182,
  height: 626,
  viewBox: "372.283 296.767164 377.9537 200.168372",
  sourceName: "CI_BS06_국문 시그니처 B.ai (Color page)",
  segment: segmentThroughGroup(signatureSource, "path130", "path", "path300"),
});

const symbolSvg = createSvg({
  width: 446,
  height: 140,
  viewBox: "372.283 337.114 377.9528 119.474",
  preserveAspectRatio: "none",
  sourceName: "CI_BS01_심볼마크.ai (Color page)",
  segment: segmentThroughGroup(symbolSource, "g18", "g", "path52"),
  // The existing public header uses the earlier approved, brighter JFAC
  // screen palette. Preserve that appearance while using official geometry.
  fillMap: {
    "#e06a58": "#f4574e",
    "#edb62e": "#faae2a",
    "#83ba54": "#6ab845",
    "#5ab8df": "#2db6ef",
    "#a1a4a5": "#929497",
    "#cb5119": "#e0511c",
    "#a9c95a": "#a0c84e",
    "#38998c": "#0e9883",
    "#3c7ab2": "#2b75bd",
  },
});

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(join(outputDirectory, "jfac-signature-b.svg"), signatureSvg),
  writeFile(join(outputDirectory, "jfac-symbol.svg"), symbolSvg),
]);

console.log("Created official JFAC SVG assets:");
console.log(join(outputDirectory, "jfac-signature-b.svg"));
console.log(join(outputDirectory, "jfac-symbol.svg"));
