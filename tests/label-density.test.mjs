import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  chooseScaleAwareLabelIds,
  normalizeOptionalLabelScaleSteps,
  optionalLabelBudgetForScale,
} from "../app/label-density.mjs";
import { denseLabelConnections } from "../app/dense-label-density.mjs";
import { chooseDenseLabelPlacement, denseLabelPlacementOptions, segmentIntersectsRect } from "../app/dense-label-placement.mjs";

import { readAppClientSource } from "./source-fixtures.mjs";

const pageSource = await readAppClientSource();
const publicLayoutRouteSource = await readFile(new URL("../app/api/public-layout/route.ts", import.meta.url), "utf8");
const publicLayoutClientSource = await readFile(new URL("../app/editor/persistence/public-layout-client.ts", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("optional label budgets stay sparse while at least forty percent of the map is visible", () => {
  assert.equal(optionalLabelBudgetForScale(0.28, 0.28, 149), 0);
  assert.equal(optionalLabelBudgetForScale(0.45, 0.28, 149), 2);
  assert.equal(optionalLabelBudgetForScale(0.58, 0.28, 149), 4);
  assert.equal(optionalLabelBudgetForScale(0.7, 0.28, 149), 6);
  assert.equal(optionalLabelBudgetForScale(0.84, 0.28, 149), 18);
  assert.equal(optionalLabelBudgetForScale(1.0, 0.28, 149), 34);
  assert.equal(optionalLabelBudgetForScale(1.24, 0.28, 149), 68);
  assert.equal(optionalLabelBudgetForScale(1.4, 0.28, 149), 149);
  assert.equal(optionalLabelBudgetForScale(0.28, 0.28, 149, false), 149);
});

test("admin-adjusted optional label budgets keep fixed ratio boundaries and sanitize counts", () => {
  const customized = normalizeOptionalLabelScaleSteps([
    { maximumRatio: 99, limit: 1.9 },
    { maximumRatio: 99, limit: -4 },
    { maximumRatio: 99, limit: 2000 },
    { maximumRatio: 99, limit: Number.NaN },
  ]);
  assert.deepEqual(customized.map((step) => step.maximumRatio), [1.25, 1.7, 2.1, 2.5, 3, 3.6, 4.5]);
  assert.deepEqual(customized.map((step) => step.limit), [1, 0, 1200, 6, 18, 34, 68]);
  assert.equal(optionalLabelBudgetForScale(0.45, 0.28, 149, true, customized), 0);
  assert.equal(optionalLabelBudgetForScale(0.7, 0.28, 149, true, customized), 6);
});

test("selected, main-hub and landmark labels survive caps while recommendations do not change screen priority", () => {
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
  });
  assert.deepEqual(new Set(result.ids), new Set(["selected", "hub", "landmark", "locked", "ordinary"]));
  assert.equal(result.limited, true);
});

test("scale limits include mandatory landmark and main-hub labels in the total", () => {
  const candidates = [
    ...Array.from({ length: 8 }, (_, index) => ({ id: `landmark-${index}`, name: `랜드마크 ${index}`, category: "landmark", z: index })),
    { id: "hub", name: "주요 거점", category: "culture", z: 20 },
    { id: "selected", name: "선택 장소", category: "cafe", z: 19 },
    ...Array.from({ length: 50 }, (_, index) => ({ id: `ordinary-${index}`, name: `일반 ${index}`, category: "food", z: index })),
  ];
  const result = chooseScaleAwareLabelIds(candidates, {
    limit: 40,
    selectedId: "selected",
    mainHubIds: ["hub"],
  });
  assert.equal(result.ids.length, 40);
  assert.equal(result.ids.filter((id) => id.startsWith("landmark-")).length, 8);
  assert.ok(result.ids.includes("hub"));
  assert.ok(result.ids.includes("selected"));
});

test("public limits always apply and the admin can opt into the same scale steps", () => {
  assert.match(pageSource, /const editorLabelCandidates = useMemo/);
  assert.match(pageSource, /const scaleAwareLabelSelection = useMemo/);
  assert.match(pageSource, /const stageLabelElements = printPreviewMode \? printLabelElements : editorLabelElements/);
  assert.match(pageSource, /const labelRenderZoom = publicLayoutAccess === "viewer" \? settledLabelZoom : zoom/);
  assert.match(pageSource, /const \[editorScaleLabelLimitsEnabled, setEditorScaleLabelLimitsEnabled\] = useState\(false\)/);
  assert.match(pageSource, /const scaleLabelLimitActive = publicLayoutAccess === "viewer"[\s\S]{0,120}publicLayoutAccess === "editor" && editorScaleLabelLimitsEnabled/);
  assert.match(pageSource, /const publicLandmarkLabel = publicLayoutAccess === "viewer" && element\.category === "landmark"/);
  assert.match(pageSource, /element\.labelVisible \|\| selectedLabel \|\| publicLandmarkLabel/);
  assert.match(pageSource, /optionalLabelBudgetForScale\([\s\S]{0,180}optionalLabelScaleSteps,[\s\S]{0,20}\)/);
  assert.match(pageSource, /fitZoom \/ Math\.max\(labelRenderZoom, 0\.22\)/);
  assert.match(pageSource, /if \(publicLayoutAccess !== "viewer"\) \{[\s\S]{0,180}setTimeout\(\(\) => \{[\s\S]{0,180}setSettledLabelZoom\(zoom\)/);
  assert.match(pageSource, /const labelFrame = window\.requestAnimationFrame\(\(\) => \{[\s\S]{0,180}setSettledLabelZoom\(zoom\)/);
  assert.doesNotMatch(pageSource, /setLabelRenderPhase|requestIdleCallback\(mountLabelDetails/);
  assert.match(pageSource, /관리자 지도에 축척별 라벨 수 적용/);
  assert.match(pageSource, /checked=\{editorScaleLabelLimitsEnabled\}/);
  assert.match(pageSource, /setEditorScaleLabelLimitsEnabled\(event\.target\.checked\)/);
});

test("screen label budgets exclude offscreen places and refresh after settled map movement", () => {
  assert.match(pageSource, /const \[settledLabelPan, setSettledLabelPan\] = useState\(\{ x: 0, y: 0 \}\)/);
  assert.match(pageSource, /const labelViewportBounds = useMemo[\s\S]{0,700}publicDenseLabelViewport/);
  assert.match(pageSource, /const editorLabelCandidates = useMemo[\s\S]{0,260}element\.x < labelViewportBounds\.left[\s\S]{0,260}mobileOverviewSimplified/);
  assert.match(pageSource, /setSettledLabelZoom\(zoom\);[\s\S]{0,180}setSettledLabelPan/);
  assert.match(pageSource, /is-label-viewport-settling/);
  assert.match(cssSource, /\.map-viewport\.is-label-viewport-settling :is\(\.label, \.dense-label-layer, \.dense-label-connector\)/);
});

test("admin label budgets are editable and publish immediately as independent runtime settings", () => {
  assert.match(pageSource, /배포본 축척별 전체 라벨/);
  assert.match(pageSource, /setOptionalLabelScaleSteps\(normalizeOptionalLabelScaleSteps\(view\.optionalLabelScaleSteps\)\)/);
  assert.match(pageSource, /optionalLabelScaleSteps: normalizeOptionalLabelScaleSteps\(optionalLabelScaleSteps\)/);
  assert.match(pageSource, /className="public-label-density-actions"[\s\S]{0,320}>기본값<[\s\S]{0,320}>\{optionalLabelScaleSaving \? "저장 중…" : "저장"\}</);
  assert.match(pageSource, /const saveOptionalLabelScaleLimits = async[\s\S]{0,800}saveLabelDensitySettings\([\s\S]{0,260}labelDensitySettingsRevisionRef\.current/);
  assert.match(publicLayoutClientSource, /method: "PATCH"[\s\S]{0,300}action: "save-label-density-settings"[\s\S]{0,120}baseRevision/);
  assert.match(pageSource, /공개본 업데이트 없이 공개 지도에 반영됩니다\./);
  assert.match(publicLayoutRouteSource, /optionalLabelScaleSteps: normalizeOptionalLabelScaleSteps\(raw\.optionalLabelScaleSteps\)/);
  assert.match(publicLayoutRouteSource, /payload\?\.action === "save-label-density-settings"/);
  assert.match(publicLayoutRouteSource, /INSERT INTO map_label_density_settings/);
  assert.match(publicLayoutRouteSource, /applyLabelDensitySettings\(JSON\.parse\(row\.viewSettingsJson\), labelDensitySettings\)/);
});

test("page passes the saved step limit to the total candidate count without adding mandatory labels", () => {
  assert.match(pageSource, /const scaleLabelBudget = useMemo\(\(\) => \{[\s\S]{0,280}optionalLabelBudgetForScale\([\s\S]{0,120}editorLabelCandidates\.length/);
  assert.doesNotMatch(pageSource, /const baseBudget = scaleMandatoryLabelCount\s*\+/);
  assert.match(pageSource, /랜드마크·주요 거점·현재 선택을 포함한 화면 전체 라벨 목표 수/);
});

test("dense label connector endpoints follow fixed-screen labels in public and admin maps", () => {
  assert.match(pageSource, /const inverseZoom = labelKeepsScreenSize \? 1 \/ Math\.max\(zoom, 0\.22\) : 1/);
  assert.match(pageSource, /publicLayoutAccess !== "loading",[\s\S]{0,20}\);/);
  assert.match(pageSource, /denseLabelRenderScale\(zoom, stageDimensions, true\)/);
});

test("admin labels keep a compact screen size and fade back after pan or wheel zoom", () => {
  assert.match(pageSource, /const inverseScale = keepScreenSize \? ` scale\(\$\{\(1 \/ safeZoom\)\.toFixed\(4\)\}\)` : ""/);
  assert.match(pageSource, /!printPreviewMode, publicLayoutAccess === "editor"\)/);
  assert.match(pageSource, /publicLayoutAccess === "editor" \? ` scale\(\$\{\(1 \/ Math\.max\(zoom, 0\.22\)\)\.toFixed\(4\)\}\)` : ""/);
  assert.match(pageSource, /publicLayoutAccess === "editor" \? "editor-label-motion" : ""/);
  assert.match(pageSource, /const previousZoom = editorLabelZoomRef\.current;[\s\S]{0,180}publicLayoutAccess !== "editor"[\s\S]{0,180}classList\.add\("is-map-labels-suspended"\)/);
  assert.match(pageSource, /setTimeout\(\(\) => \{[\s\S]{0,120}classList\.remove\("is-map-labels-suspended"\);[\s\S]{0,20}\}, 150\)/);
  assert.match(cssSource, /\.map-viewport\.editor-label-motion\.is-panning :is\(\.label, \.dense-label-layer, \.dense-label-connector\)/);
  assert.match(cssSource, /\.map-viewport\.editor-label-motion \.label \{ font-size: 9\.5px; \}/);
});

test("label refresh clears manual dense positions before automatic collision-aware placement", () => {
  assert.match(pageSource, /const refreshLabelPositions = \(\) => \{[\s\S]{0,180}pushHistory\(\);[\s\S]{0,80}replaceDenseLabelPositions\(\(\) => \[\]\);[\s\S]{0,100}autoArrangeLabels\(false, true\)/);
  assert.match(pageSource, /chooseDenseLabelPlacement\(\{[\s\S]{0,300}iconObstacles: iconRects,[\s\S]{0,80}labelObstacles: labelRects/);
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
  assert.match(pageSource, /denseLabelPlacementOptions\(\{ minX, maxX, minY, maxY, width: placementWidth, height: placementHeight \}\)/);
  assert.match(pageSource, /placedSegments\.push\(\.\.\.best\.segments\)/);
  assert.match(pageSource, /iconObstacles: iconRects/);
  assert.match(pageSource, /culture: "#58AEB0"/);
  assert.match(pageSource, /\{ id: "landmark", name: "핵심 랜드마크", color: markerCategoryColors\.culture/);
  assert.match(pageSource, /\{ id: "culture", name: "일반 문화시설", color: markerCategoryColors\.culture/);
});
