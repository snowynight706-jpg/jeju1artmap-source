import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chooseScaleAwareLabelIds, labelBudgetForScale } from "../app/label-density.mjs";
import { denseLabelConnections } from "../app/dense-label-density.mjs";
import { chooseDenseLabelPlacement, denseLabelPlacementOptions, segmentIntersectsRect } from "../app/dense-label-placement.mjs";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("label budgets grow from the fitted map to the full detailed view", () => {
  assert.equal(labelBudgetForScale(0.28, 0.28, 149), 30);
  assert.equal(labelBudgetForScale(0.4, 0.28, 149), 50);
  assert.equal(labelBudgetForScale(0.58, 0.28, 149), 80);
  assert.equal(labelBudgetForScale(0.7, 0.28, 149), 149);
  assert.equal(labelBudgetForScale(0.28, 0.28, 18), 18);
  assert.equal(labelBudgetForScale(0.28, 0.28, 149, false), 149);
});

test("selected, main-hub and landmark labels survive every automatic cap", () => {
  const candidates = [
    { id: "selected", name: "선택 장소", category: "cafe", z: 1 },
    { id: "hub", name: "주요 거점", category: "culture", z: 1 },
    { id: "landmark", name: "랜드마크", category: "landmark", z: 1 },
    { id: "recommended", name: "추천 장소", category: "food", z: 1 },
    { id: "locked", name: "고정 라벨", category: "shop", labelLocked: true, z: 1 },
    { id: "ordinary", name: "일반 장소", category: "park", z: 99 },
  ];
  const result = chooseScaleAwareLabelIds(candidates, {
    limit: 5,
    selectedId: "selected",
    mainHubIds: ["hub"],
    recommendedIds: ["recommended"],
  });
  assert.deepEqual(new Set(result.ids), new Set(["selected", "hub", "landmark", "recommended", "locked"]));
  assert.equal(result.limited, true);
});

test("screen limits happen before dense-label clustering and settle heavy zoom work", () => {
  assert.match(pageSource, /const editorLabelCandidates = useMemo/);
  assert.match(pageSource, /const scaleAwareLabelSelection = useMemo/);
  assert.match(pageSource, /const stageLabelElements = printPreviewMode \? printLabelElements : editorLabelElements/);
  assert.match(pageSource, /fitZoom \/ Math\.max\(settledLabelZoom, 0\.22\)/);
  assert.match(pageSource, /setTimeout\(\(\) => setSettledLabelZoom\(zoom\), 140\)/);
  assert.match(pageSource, /축척별 라벨 자동 제한/);
});

test("four labels around one dense point stay grouped at detailed zoom", () => {
  const candidates = [
    { name: "중심점포", x: 10, y: 10 },
    { name: "인접점포A", x: 10.8, y: 10 },
    { name: "인접점포B", x: 9.4, y: 10.55 },
    { name: "인접점포C", x: 10.35, y: 9.3 },
  ];
  const connections = denseLabelConnections(candidates, { densityScale: 0.24 });
  assert.equal(connections.persistentGroups.length, 1);
  assert.deepEqual(new Set(connections.persistentGroups[0]), new Set([0, 1, 2, 3]));
});

test("three nearby labels or a loose street chain do not become permanent clusters", () => {
  const threeNearby = denseLabelConnections([
    { name: "점포A", x: 10, y: 10 },
    { name: "점포B", x: 10.7, y: 10 },
    { name: "점포C", x: 10.3, y: 10.6 },
  ], { densityScale: 0.24 });
  assert.equal(threeNearby.persistentGroups.length, 0);

  const streetChain = denseLabelConnections(Array.from({ length: 5 }, (_, index) => ({
    name: `점포${index}`,
    x: 10 + index * 1.45,
    y: 10,
  })), { densityScale: 0.24 });
  assert.equal(streetChain.persistentGroups.length, 0);
});

test("detailed mode keeps only persistent dense groups", () => {
  assert.match(pageSource, /if \(!persistentOnly\) connections\.adaptiveEdges/);
  assert.match(pageSource, /!printPreviewMode && forceIndividualLabels/);
  assert.match(pageSource, /확대해도 주변 4곳 이상 밀집 시 통합 유지/);
});

test("automatic cluster positions stay close to the marker group", () => {
  const options = denseLabelPlacementOptions({ minX: 40, maxX: 44, minY: 40, maxY: 44, width: 8, height: 4 });
  assert.ok(options.length >= 40);
  assert.equal(Math.max(...options.map((option) => option.gap)), 2.1);
  assert.ok(options.every((option) => (
    option.x + 4 <= 40 || option.x - 4 >= 44 || option.y + 2 <= 40 || option.y - 2 >= 44
  )));
});

test("a clear nearby position wins and connector paths avoid landmark obstacles", () => {
  const marker = { x: 10, y: 10 };
  const connectorSegmentsFor = (option) => [{
    fromX: marker.x,
    fromY: marker.y,
    toX: option.x,
    toY: option.y,
    id: "cluster:place",
    elementId: "place",
  }];
  const landmark = { id: "landmark", category: "landmark", rect: { left: 9, right: 11, top: 7, bottom: 8.5 } };
  assert.equal(segmentIntersectsRect(connectorSegmentsFor({ x: 10, y: 5 })[0], landmark.rect), true);
  const best = chooseDenseLabelPlacement({
    options: [{ x: 10, y: 5, gap: 0.55 }, { x: 10, y: 15, gap: 0.55 }, { x: 10, y: 21, gap: 8 }],
    width: 4,
    height: 2,
    centerX: 10,
    centerY: 10,
    groupIds: ["place"],
    connectorSegmentsFor,
    iconObstacles: [landmark],
  });
  assert.equal(best.y, 15);
  assert.equal(best.hasCollision, false);
});

test("cluster placement scores labels, landmarks and existing connector lines together", () => {
  assert.match(pageSource, /denseLabelPlacementOptions\(\{ minX, maxX, minY, maxY, width, height \}\)/);
  assert.match(pageSource, /placedSegments\.push\(\.\.\.best\.segments\)/);
  assert.match(pageSource, /iconObstacles: iconRects/);
  assert.match(pageSource, /\{ id: "landmark", name: "핵심 랜드마크", color: "#4d9a91"/);
  assert.match(pageSource, /\{ id: "culture", name: "일반 문화시설", color: "#4d9a91"/);
});
