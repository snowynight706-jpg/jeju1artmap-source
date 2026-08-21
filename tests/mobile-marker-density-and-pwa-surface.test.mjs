import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  chooseMobileMarkerRenderIds,
  mobileLabelBudgetForTier,
  mobileMarkerBudgetForScale,
} from "../app/mobile-marker-density.mjs";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("mobile marker and label budgets expand with zoom and device capacity", () => {
  assert.equal(mobileMarkerBudgetForScale(0.5, 0.5, 200, "low"), 24);
  assert.equal(mobileMarkerBudgetForScale(0.5, 0.5, 200, "standard"), 34);
  assert.equal(mobileMarkerBudgetForScale(0.5, 0.5, 200, "high"), 44);
  assert.equal(mobileMarkerBudgetForScale(1.6, 0.5, 200, "low"), 78);
  assert.equal(mobileMarkerBudgetForScale(1.6, 0.5, 200, "standard"), 104);
  assert.equal(mobileMarkerBudgetForScale(1.6, 0.5, 200, "high"), 200);
  assert.equal(mobileLabelBudgetForTier(30, 200, "low"), 21);
  assert.equal(mobileLabelBudgetForTier(30, 200, "standard"), 26);
  assert.equal(mobileLabelBudgetForTier(30, 200, "high"), 30);
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
});

test("mobile PWA uses a light root fallback and lightweight category-colored omitted markers", () => {
  assert.match(cssSource, /@media \(display-mode: standalone\) \{\s*html, body \{ background: var\(--paper\); \}/);
  assert.match(cssSource, /\.mobile-marker-placeholder::after \{[^}]*border-radius: 50%;[^}]*background: var\(--mobile-marker-color\)/);
  assert.match(pageSource, /element\.category === "landmark"[\s\S]{0,260}mobileMapRenderBounds\.left/);
  assert.match(pageSource, /cluster\.elementIds\.every\(\(elementId\) => renderedMapElementsById\.has\(elementId\)\)/);
  assert.match(pageSource, /clusteredLabelElementIds=\{renderedClusteredLabelElementIds\}/);
  assert.match(pageSource, /zoomChanged[\s\S]{0,520}scheduleTouchLayerRelease\([\s\S]{0,120}\? 170 : 80\)/);
  assert.match(pageSource, /<MobileMarkerPlaceholderLayer[\s\S]{0,180}elements=\{mobilePlaceholderElements\}/);
});

test("the administrator event dialog stays out of the public initial bundle", () => {
  assert.match(pageSource, /const AdminPlaceEventDialog = lazy\(\(\) => import\("\.\/admin-place-event-dialog"\)\)/);
  assert.match(pageSource, /publicLayoutAccess === "editor" && placeEventFormOpen && <Suspense/);
});
