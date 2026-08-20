import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const publicLayoutSource = await readFile(new URL("../app/api/public-layout/route.ts", import.meta.url), "utf8");

test("public layout bootstraps published review counts per place", () => {
  assert.match(publicLayoutSource, /GROUP BY place_key, place_name/);
  assert.match(publicLayoutSource, /MAX\(created_at\) AS latestCreatedAt/);
  assert.match(publicLayoutSource, /reviewCountsByPlace/);
  assert.match(pageSource, /setReviewCountsByPlace\(payload\.reviewCountsByPlace\)/);
});

test("map labels show quiet event and review indicators only in public interactive view", () => {
  assert.match(pageSource, /publicLayoutAccess === "viewer" && !printPreviewMode && labelStatus\.hasEvent/);
  assert.match(pageSource, /className="map-label-status event"/);
  assert.match(pageSource, /map-label-status reviews/);
  assert.match(pageSource, /className="dense-map-event"/);
  assert.match(pageSource, /dense-map-reviews/);
  assert.match(pageSource, />EVENT<\/span>/);
  assert.match(cssSource, /\.map-label-status\.event \{ left: -5px; top: -6px;/);
  assert.match(cssSource, /\.map-label-status\.reviews \{ right: -6px; top: -5px;/);
  assert.match(cssSource, /\.map-viewport:is\(\.is-panning, \.is-zooming, \.is-direct-manipulation\) \.map-label-status \{ opacity: \.42;/);
});

test("a newly published review updates its place badge immediately", () => {
  assert.match(pageSource, /setReviewCountsByPlace\(\(current\) => \{/);
  assert.match(pageSource, /placeName: selectedStoryPlaceName, count: 1, latestCreatedAt: payload\.story!\.createdAt/);
  assert.match(pageSource, /count: place\.count \+ 1/);
});

test("reviews from the latest 72 hours replace the count with NEW", () => {
  assert.match(pageSource, /RECENT_REVIEW_WINDOW_MS = 3 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(pageSource, /latestReviewTimestamp >= reviewBadgeNow - RECENT_REVIEW_WINDOW_MS/);
  assert.match(pageSource, /setInterval\(\(\) => setReviewBadgeNow\(Date\.now\(\)\), 5 \* 60 \* 1000\)/);
  assert.match(pageSource, /labelStatus\.hasNewReview \? "NEW"/);
  assert.match(pageSource, /rowStatus\.hasNewReview \? "NEW"/);
  assert.match(cssSource, /\.map-label-status\.reviews\.new/);
});
