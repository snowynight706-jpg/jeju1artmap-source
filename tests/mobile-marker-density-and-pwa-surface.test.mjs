import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  chooseMobileMarkerRenderIds,
  mobileLabelBudgetForScale,
  mobileMarkerBudgetForScale,
  mobileOverviewIsSimplified,
} from "../app/mobile-marker-density.mjs";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("mobile overview budgets stay compact while the initial detail scale keeps every nearby marker", () => {
  assert.equal(mobileMarkerBudgetForScale(0.5, 0.5, 200, "low"), 18);
  assert.equal(mobileMarkerBudgetForScale(0.5, 0.5, 200, "standard"), 24);
  assert.equal(mobileMarkerBudgetForScale(0.5, 0.5, 200, "high"), 30);
  assert.equal(mobileMarkerBudgetForScale(0.7, 0.5, 200, "low"), 28);
  assert.equal(mobileMarkerBudgetForScale(0.7, 0.5, 200, "standard"), 40);
  assert.equal(mobileMarkerBudgetForScale(0.7, 0.5, 200, "high"), 52);
  assert.equal(mobileMarkerBudgetForScale(1, 0.5, 200, "low"), 64);
  assert.equal(mobileMarkerBudgetForScale(1, 0.5, 200, "standard"), 88);
  assert.equal(mobileMarkerBudgetForScale(1, 0.5, 200, "high"), 112);
  assert.equal(mobileMarkerBudgetForScale(1, 0.5, 200, "low", 1), 200);
  assert.equal(mobileMarkerBudgetForScale(1, 0.5, 200, "standard", 1), 200);
  assert.equal(mobileMarkerBudgetForScale(1, 0.5, 200, "high", 1), 200);
  assert.equal(mobileLabelBudgetForScale(0.5, 0.5, 30, 200, "low"), 14);
  assert.equal(mobileLabelBudgetForScale(0.5, 0.5, 30, 200, "standard"), 18);
  assert.equal(mobileLabelBudgetForScale(0.5, 0.5, 30, 200, "high"), 22);
  assert.equal(mobileLabelBudgetForScale(1.15, 0.5, 200, 200, "standard"), 60);
  assert.equal(mobileOverviewIsSimplified(0.7, 0.5), true);
  assert.equal(mobileOverviewIsSimplified(0.73, 0.5), false);
});

test("landmarks and the selected place stay full while recommendations win optional marker slots", () => {
  const candidates = [
    { id: "landmark", name: "랜드마크", category: "landmark", x: 90, y: 90, z: 1 },
    { id: "selected", name: "선택", category: "cafe", x: 80, y: 80, z: 1 },
    { id: "recommended", name: "추천", category: "culture", x: 95, y: 95, z: 1 },
    { id: "near", name: "가까운 일반", category: "shop", x: 51, y: 51, z: 1 },
  ];
  const ids = chooseMobileMarkerRenderIds(candidates, {
    limit: 3,
    selectedId: "selected",
    recommendedIds: ["recommended"],
    centerX: 50,
    centerY: 50,
  });
  assert.deepEqual(new Set(ids), new Set(["landmark", "selected", "recommended"]));
  assert.deepEqual(new Set(chooseMobileMarkerRenderIds(candidates, {
    limit: 0,
    selectedId: "selected",
    recommendedIds: ["recommended"],
  })), new Set(["landmark", "selected"]));
  assert.deepEqual(chooseMobileMarkerRenderIds(candidates, { limit: candidates.length }), candidates.map((candidate) => candidate.id));
});

test("mobile PWA uses a light root fallback and lightweight category-colored omitted markers", () => {
  assert.match(cssSource, /@media \(display-mode: standalone\) \{\s*html, body \{ background: var\(--paper\); \}/);
  assert.match(cssSource, /\.mobile-marker-placeholder::after \{[^}]*border-radius: 50%;[^}]*background: var\(--mobile-marker-color\)/);
  assert.match(cssSource, /\.mobile-marker-placeholder::after \{[^}]*width: 7px; height: 7px; border: 1px solid #1f2024/);
  assert.doesNotMatch(cssSource, /\.mobile-marker-placeholder::after \{[^}]*box-shadow/);
  assert.match(cssSource, /transform: scale\(var\(--mobile-marker-gesture-scale, 1\)\)/);
  assert.match(pageSource, /cafe: "#80573f"[\s\S]{0,40}food: "#e37d35"/);
  assert.doesNotMatch(pageSource, /const markerScale = clamp\(zoom \/ Math\.max\(fitZoom/);
  assert.match(pageSource, /setProperty\("--mobile-marker-gesture-scale", `\$\{1 \/ scale\}`\)/);
  assert.match(pageSource, /element\.category === "landmark"[\s\S]{0,260}mobileMapRenderBounds\.left/);
  assert.match(pageSource, /cluster\.elementIds\.every\(\(elementId\) => renderedMapElementsById\.has\(elementId\)\)/);
  assert.match(pageSource, /clusteredLabelElementIds=\{renderedClusteredLabelElementIds\}/);
  assert.match(pageSource, /zoomChanged[\s\S]{0,680}scheduleTouchLayerRelease\([\s\S]{0,120}\? 170 : 80\)/);
  assert.match(pageSource, /<MobileMarkerPlaceholderLayer[\s\S]{0,180}elements=\{mobilePlaceholderElements\}/);
  assert.match(pageSource, /mobileMarkerBudgetForScale\([\s\S]{0,180}startupInitialViewTarget\?\.zoom \?\? null/);
  assert.match(pageSource, /mobileOverviewSimplified && element\.category !== "landmark"/);
  assert.match(pageSource, /if \(mobileOverviewSimplified\) \{[\s\S]{0,220}filter\(\(element\) => element\.category === "landmark"\)[\s\S]{0,100}map\(\(element\) => element\.id\)/);
});

test("the administrator event dialog stays out of the public initial bundle", () => {
  assert.match(pageSource, /const AdminPlaceEventDialog = lazy\(\(\) => import\("\.\/admin-place-event-dialog"\)\)/);
  assert.match(pageSource, /publicLayoutAccess === "editor" && placeEventFormOpen && <Suspense/);
});
