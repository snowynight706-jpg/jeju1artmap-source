import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const denseLabelSource = await readFile(new URL("../app/dense-label-density.mjs", import.meta.url), "utf8");
const requestRouteSource = await readFile(new URL("../app/api/place-registration-requests/route.ts", import.meta.url), "utf8");
const publicLayoutRouteSource = await readFile(new URL("../app/api/public-layout/route.ts", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../drizzle/0015_amusing_matthew_murdock.sql", import.meta.url), "utf8");

test("public place requests require and persist a normalized map position", () => {
  assert.match(pageSource, /지도에서 마커 위치 지정/);
  assert.match(pageSource, /markerX: placeRequestLocation\.x/);
  assert.match(pageSource, /markerY: placeRequestLocation\.y/);
  assert.match(requestRouteSource, /valid place request and marker location required/);
  assert.match(migrationSource, /ADD `submitted_x` real/);
  assert.match(migrationSource, /ADD `marker_y` real/);
});

test("admin review starts from the requested location and reuses that marker on approval", () => {
  assert.match(pageSource, /const startPlaceRequestReview = async/);
  assert.match(pageSource, /id: `requested-place-\$\{reviewing\.id\}`/);
  assert.match(pageSource, /placeRequestId: reviewing\.id/);
  assert.match(pageSource, /검수 완료·DB 반영/);
  assert.match(requestRouteSource, /action === "start-review"/);
  assert.match(requestRouteSource, /action === "move-marker"/);
  assert.match(requestRouteSource, /existing\.status !== "reviewing"/);
});

test("a provisional request marker cannot leak into a public layout", () => {
  assert.match(pageSource, /element\.placeRequestId && !element\.directoryId/);
  assert.match(publicLayoutRouteSource, /hasUnapprovedPlaceRequestMarker/);
  assert.match(publicLayoutRouteSource, /place request marker still under review/);
  assert.match(publicLayoutRouteSource, /delete safe\.placeRequestId/);
});

test("initial admin state and request list use batched storage reads", () => {
  assert.match(publicLayoutRouteSource, /await db\.batch\(statements\)/);
  assert.match(requestRouteSource, /const \[countResult, requestedResult\] = await runtime\.DB\.batch/);
});

test("map-heavy work avoids full pair scans and defers device recovery writes", () => {
  assert.match(denseLabelSource, /const spatialBuckets = new Map\(\)/);
  assert.match(pageSource, /const ordered = \[\.\.\.stageMarkerElements\]\.sort/);
  assert.match(pageSource, /if \(dx >= maximumRelevantDx\) break/);
  assert.match(pageSource, /requestIdleCallback\(save, \{ timeout: 1200 \}\)/);
});
