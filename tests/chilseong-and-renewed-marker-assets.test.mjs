import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const masterDirectorySource = await readFile(new URL("../app/master-directory.ts", import.meta.url), "utf8");
const coreLandmarkSource = await readFile(new URL("../app/core-landmarks.ts", import.meta.url), "utf8");
const taxonomySource = await readFile(new URL("../app/place-taxonomy.ts", import.meta.url), "utf8");
const directoryRouteSource = await readFile(new URL("../app/api/place-directory/route.ts", import.meta.url), "utf8");
const markerAssetSource = await readFile(new URL("../app/marker-assets.ts", import.meta.url), "utf8");
const registrationRouteSource = await readFile(new URL("../app/api/place-registration-requests/route.ts", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const adminPlaceRequestSource = await readFile(new URL("../app/admin-place-request-list.tsx", import.meta.url), "utf8");

test("Chilseong shopping street and the placed Chilseong landmark converge on one DB identity", () => {
  assert.equal((masterDirectorySource.match(/"id": "master-v13-chilseong-ro"/g) ?? []).length, 1);
  assert.equal((masterDirectorySource.match(/"name": "제주칠성로상점가"/g) ?? []).length, 0);
  assert.match(masterDirectorySource, /"master-v10-59b6497db224"/);
  assert.match(masterDirectorySource, /"version": "v14-칠성로상점가-통합"/);
  assert.match(masterDirectorySource, /"placeCount": 190/);
  assert.match(masterDirectorySource, /"subtype": "상점가·보행 쇼핑거리·산책"/);
  assert.match(coreLandmarkSource, /제주 칠성로 상점가/);
  assert.match(coreLandmarkSource, /return CHILSEONG_CANONICAL_NAME/);
  assert.match(taxonomySource, /제주칠성로상점가/);
  assert.match(pageSource, /directoryByName = new Map\(defaultDirectoryPlaces\.map\(\(place\) => \[normalizePlaceName\(place\.name\), place\]\)\)/);
  assert.match(pageSource, /directoryPlace = directoryByName\.get\(normalizePlaceName\(location\.name\)\)/);
});

test("retired duplicate IDs cannot replace the canonical bundled ID during D1 synchronization", () => {
  assert.match(directoryRouteSource, /const retiredIds = new Set<string>\(retiredMasterDirectoryIds\);[\s\S]*const sourceRows/);
  assert.match(directoryRouteSource, /id: isMainHub \|\| retiredIds\.has\(existing\.id\) \? row\.id : existing\.id/);
  assert.match(directoryRouteSource, /aliases: \[\.\.\.new Set\(\[\.\.\.row\.aliases, \.\.\.existing\.aliases\]\)\]\.slice\(0, 12\)/);
});

test("the approved v2 marker set registers all nine borderless final SVG assets and remains selectable", async () => {
  const variants = ["culture", "food", "cafe", "shop", "park", "parking", "utility", "restroom", "information"];
  for (const variant of variants) {
    assert.match(markerAssetSource, new RegExp(`v2-${variant}`));
    const svg = await readFile(new URL(`../public/markers/범용마커_v2_${variant}_approved-final.svg`, import.meta.url), "utf8");
    assert.match(svg, /width="160" height="160" viewBox="0 0 160 160"/);
    assert.match(svg, /<circle cx="80" cy="80" r="59" fill="#[0-9A-F]{6}" stroke="#343A39" stroke-width="7"/);
    assert.doesNotMatch(svg, /r="66"|stroke-width="12"/);
  }
  assert.match(markerAssetSource, /recommendedMarkerStyle: BundledMarkerStyle = "v2"/);
  assert.match(markerAssetSource, /status: approved \? "approved" : "review"/);
  assert.match(markerAssetSource, /generic-marker-v2-restroom/);
  assert.match(markerAssetSource, /generic-marker-v2-information/);
  assert.match(registrationRouteSource, /MARKER_STYLES = new Set\(\["01", "02", "03", "v2"\]\)/);
  assert.match(pageSource, /\["v2", "리뉴얼 최종 원형"\]/);
  assert.match(pageSource, /\["v2", "01", "02", "03"\]/);
  assert.match(adminPlaceRequestSource, /markerAssetSrc\(request\.markerStyle, request\.category\)/);
  assert.equal((pageSource.match(/markerAssetSrc\(placeRequestMarkerStyle, placeRequestCategory\)/g) ?? []).length, 2);
});
