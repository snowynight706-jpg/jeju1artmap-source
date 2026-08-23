import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mobileLabelBudgetForScale,
  mobileOverviewIsSimplified,
} from "../app/map/rendering/mobile-marker-density.mjs";

import { readAppClientSource } from "./source-fixtures.mjs";

const pageSource = await readAppClientSource();
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const foodMarkerSource = await readFile(new URL("../public/markers/범용마커_v2_food_approved-final.svg", import.meta.url), "utf8");

test("mobile markers switch together at fit scale x2 while label budgets stay compact", () => {
  assert.equal(mobileLabelBudgetForScale(0.5, 0.5, 30, 200, "low"), 14);
  assert.equal(mobileLabelBudgetForScale(0.5, 0.5, 30, 200, "standard"), 18);
  assert.equal(mobileLabelBudgetForScale(0.5, 0.5, 30, 200, "high"), 22);
  assert.equal(mobileLabelBudgetForScale(1.05, 0.5, 200, 200, "standard"), 60);
  assert.equal(mobileLabelBudgetForScale(1.15, 0.5, 200, 200, "low"), 200);
  assert.equal(mobileLabelBudgetForScale(1.15, 0.5, 200, 200, "standard"), 200);
  assert.equal(mobileOverviewIsSimplified(0.99, 0.5), true);
  assert.equal(mobileOverviewIsSimplified(1, 0.5), false);
  assert.equal(mobileOverviewIsSimplified(1.01, 0.5), false);
});

test("mobile PWA uses a light root fallback and lightweight category-colored omitted markers", () => {
  assert.match(cssSource, /@media \(display-mode: standalone\) \{\s*html, body \{ background: var\(--paper\); \}/);
  assert.match(cssSource, /\.mobile-marker-placeholder::after \{[^}]*border-radius: 50%;[^}]*background: var\(--mobile-marker-color\)/);
  assert.match(cssSource, /\.mobile-marker-placeholder::after \{[^}]*width: 7\.2px; height: 7\.2px; border: \.75px solid #666b6a/);
  assert.doesNotMatch(cssSource, /\.mobile-marker-placeholder::after \{[^}]*box-shadow/);
  assert.match(cssSource, /transform: scale\(var\(--mobile-marker-gesture-scale, 1\)\)/);
  assert.match(foodMarkerSource, /<circle cx="80" cy="80" r="59" fill="#E36B58"/);
  assert.match(pageSource, /const markerCategoryColors = \{[\s\S]{0,160}food: "#E36B58"/);
  assert.match(pageSource, /function mobileMarkerPlaceholderColor\(id: CategoryId\) \{\s*return categoryOf\(id\)\.color;\s*\}/);
  assert.doesNotMatch(pageSource, /mobileMarkerPlaceholderColors/);
  assert.doesNotMatch(pageSource, /const markerScale = clamp\(zoom \/ Math\.max\(fitZoom/);
  assert.match(pageSource, /setProperty\("--mobile-marker-gesture-scale", `\$\{1 \/ scale\}`\)/);
  assert.match(pageSource, /element\.category === "landmark"[\s\S]{0,260}element\.x >= bounds\.left/);
  assert.match(pageSource, /cluster\.elementIds\.every\(\(elementId\) => renderedElementsById\.has\(elementId\)\)/);
  assert.match(pageSource, /clusteredLabelElementIds=\{renderedClusteredLabelElementIds\}/);
  assert.match(pageSource, /zoomChanged[\s\S]{0,680}scheduleTouchLayerRelease\([\s\S]{0,120}\? 170 : 80\)/);
  assert.match(pageSource, /<MobileMarkerPlaceholderLayer[\s\S]{0,180}elements=\{mobilePlaceholderElements\}/);
  assert.doesNotMatch(pageSource, /mobileMarkerBudgetForScale|chooseMobileMarkerRenderIds/);
  assert.match(pageSource, /if \(!overviewSimplified\) return \{ rendered: elements, placeholders: \[\] as MapElement\[\] \}/);
  assert.match(pageSource, /if \(element\.category === "landmark"\) rendered\.push\(element\);\s*else placeholders\.push\(element\)/);
  assert.doesNotMatch(pageSource, /mobileFullMarkerIds/);
});

test("the administrator event dialog stays out of the public initial bundle", () => {
  assert.match(pageSource, /const AdminPlaceEventDialog = lazy\(\(\) => import\("\.\/admin-place-event-dialog"\)\)/);
  assert.match(pageSource, /publicLayoutAccess === "editor" && placeEventFormOpen && <Suspense/);
});
