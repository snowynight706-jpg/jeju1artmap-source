import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const taxonomySource = await readFile(new URL("../app/place-taxonomy.ts", import.meta.url), "utf8");
const directorySource = await readFile(new URL("../app/master-directory.ts", import.meta.url), "utf8");
const geocodeSource = await readFile(new URL("../app/geocoded-places.ts", import.meta.url), "utf8");
const assetSource = await readFile(new URL("../app/landmark-assets/index.ts", import.meta.url), "utf8");

test("LPP is registered with the verified official address and exact map coordinate", () => {
  assert.match(directorySource, /"name": "LPP \(Local Player Platform\)"/);
  assert.match(directorySource, /"address": "제주특별자치도 제주시 관덕로8길 15-3"/);
  assert.doesNotMatch(directorySource, /LPP[\s\S]{0,400}중앙로62번길 2/);
  assert.match(geocodeSource, /"latitude": 33\.51162337/);
  assert.match(geocodeSource, /"longitude": 126\.52376126/);
  assert.match(directorySource, /place\.map\.kakao\.com\/1316005169/);
});

test("LPP gets three activity categories and remains searchable by aliases", () => {
  assert.match(taxonomySource, /LPP_CANONICAL_NAME = "LPP \(Local Player Platform\)"/);
  assert.match(taxonomySource, /canonicalName === LPP_CANONICAL_NAME[\s\S]{0,120}\["multi-cultural", "creative-startup", "event-rental"\]/);
  assert.match(taxonomySource, /\["LPP", "Local Player Platform", "로컬 플레이어 플랫폼"\]/);
  assert.match(pageSource, /function ensureLppMapElement/);
});

test("communication center uses the dedicated A-02 final-review landmark in stored public layouts", () => {
  assert.match(assetSource, /jeju-communication-center-a02/);
  assert.match(assetSource, /"A-02 외곽선보강 최종"/);
  assert.match(assetSource, /"1n1G-0HbAOv9FavuBo54SdxDZWY276b3j"/);
  assert.match(pageSource, /MAIN_HUB_LANDMARK_ASSET_ID = "jeju-communication-center-a02"/);
  assert.match(pageSource, /category: "landmark" as const,[\s\S]{0,420}assetId: MAIN_HUB_LANDMARK_ASSET_ID/);
  assert.match(pageSource, /const ensuredMainHubElements = ensureMainHubMapElement/);
  assert.match(pageSource, /STANDARD_MAIN_HUB_MEMO = "워크케이션 메인 거점 · A-02 외곽선보강 최종검수안 · 표준 랜드마크 이미지·라벨 처리"/);
  assert.match(pageSource, /Google Drive A-02 외곽선보강 최종검수안/);
  assert.match(pageSource, /size: migrateLegacyPresentation \? LANDMARK_RESOURCE_SIZE : element\.size/);
  assert.match(pageSource, /labelPosition: migrateLegacyPresentation \? "bottom" as const : element\.labelPosition/);
  assert.match(pageSource, /labelGap: migrateLegacyPresentation \? LANDMARK_LABEL_GAP : element\.labelGap/);
});
