import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const landmarkSource = await readFile(new URL("../app/landmark-assets/index.ts", import.meta.url), "utf8");
const requestRouteSource = await readFile(new URL("../app/api/place-registration-requests/route.ts", import.meta.url), "utf8");
const publicLayoutRouteSource = await readFile(new URL("../app/api/public-layout/route.ts", import.meta.url), "utf8");
const areaMigrationSource = await readFile(new URL("../drizzle/0018_slim_the_spike.sql", import.meta.url), "utf8");

test("the latest redesigned landmark assets are bundled, approved and made the defaults", async () => {
  const latest = [
    ["sanjicheon-v06", "산지천갤러리"],
    ["dongmun-v08", "동문시장"],
    ["artspace-ia-v04", "예술공간 이아"],
    ["mokgwana-v10", "제주목 관아"],
    ["gwandeokjeong-v09", "관덕정"],
    ["kim-memorial-front03", "김만덕기념관"],
    ["arario-01", "아라리오뮤지엄 탑동시네마"],
    ["buksugu-02", "북수구광장"],
    ["tapdong-seaside-stage-02", "탑동해변공연장"],
    ["jeju-art-platform-c01-v05", "제주아트플랫폼"],
    ["chilsungro-20260820-transparent", "칠성로"],
  ];

  for (const [id, placeName] of latest) {
    assert.match(landmarkSource, new RegExp(`asset\\("${id}",[^\\n]+"${placeName}"[^\\n]+"approved"(?:,[^\\n]+)?\\)`));
    const hq = await stat(new URL(`../public/landmarks-hq/${id}.webp`, import.meta.url));
    const screen = await stat(new URL(`../public/landmarks-screen/${id}.webp`, import.meta.url));
    assert.ok(hq.size > 10_000);
    assert.ok(screen.size > 5_000);
  }

  assert.match(pageSource, /const LATEST_SANJICHEON_ASSET_ID = "sanjicheon-v06"/);
  assert.match(pageSource, /const LATEST_DONGMUN_ASSET_ID = "dongmun-v08"/);
  assert.match(pageSource, /const LATEST_ARTSPACE_IA_ASSET_ID = "artspace-ia-v04"/);
  assert.match(pageSource, /const LATEST_MOKGWANA_ASSET_ID = "mokgwana-v10"/);
  assert.match(pageSource, /const LATEST_GWANDEOKJEONG_ASSET_ID = "gwandeokjeong-v09"/);
  assert.match(pageSource, /const LATEST_KIM_MEMORIAL_ASSET_ID = "kim-memorial-front03"/);
  assert.match(pageSource, /const LATEST_ARARIO_ASSET_ID = "arario-01"/);
  assert.match(pageSource, /const LATEST_BUKSUGU_ASSET_ID = "buksugu-02"/);
  assert.match(pageSource, /const LATEST_TAPDONG_SEASIDE_STAGE_ASSET_ID = "tapdong-seaside-stage-02"/);
  assert.match(pageSource, /const LATEST_JEJU_ART_PLATFORM_ASSET_ID = "jeju-art-platform-c01-v05"/);
  assert.match(pageSource, /const LATEST_CHILSUNGRO_ASSET_ID = "chilsungro-20260820-transparent"/);
  assert.match(pageSource, /\["제주목 관아", LATEST_MOKGWANA_ASSET_ID\]/);
  assert.match(pageSource, /\["관덕정", LATEST_GWANDEOKJEONG_ASSET_ID\]/);
  assert.match(pageSource, /\["김만덕기념관", LATEST_KIM_MEMORIAL_ASSET_ID\]/);
  assert.match(pageSource, /\["아라리오뮤지엄 탑동시네마", LATEST_ARARIO_ASSET_ID\]/);
  assert.match(pageSource, /\["북수구광장", LATEST_BUKSUGU_ASSET_ID\]/);
  assert.match(pageSource, /\["탑동해변공연장", LATEST_TAPDONG_SEASIDE_STAGE_ASSET_ID\]/);
  assert.match(pageSource, /\["제주아트플랫폼", LATEST_JEJU_ART_PLATFORM_ASSET_ID\]/);
  assert.match(pageSource, /\["칠성로", LATEST_CHILSUNGRO_ASSET_ID\]/);
  assert.match(pageSource, /supersededRedesignedLandmarkAssets/);
  assert.match(pageSource, /"mokgwana-v06"/);
  assert.match(pageSource, /"gwandeokjeong-v07"/);
  assert.match(pageSource, /new Set\(\["jeju-art-platform-c01"\]\)/);
  assert.match(pageSource, /new Set\(\["chilsungro", "chilsungro-20260819"\]\)/);
  assert.match(pageSource, /supersededAssetIds\?\.has\(normalized\.assetId\)/);
});

test("the current Chilseong-ro screen and export assets retain a real alpha channel", async () => {
  const id = "chilsungro-20260820-transparent";
  for (const variant of ["landmarks-hq", "landmarks-screen"]) {
    const bytes = await readFile(new URL(`../public/${variant}/${id}.webp`, import.meta.url));
    const isLosslessAlphaWebP = bytes.includes(Buffer.from("VP8L"));
    const isLossyAlphaWebP = bytes.includes(Buffer.from("ALPH"));
    assert.ok(isLosslessAlphaWebP || isLossyAlphaWebP, `${variant} must retain WebP alpha data`);
  }
});

test("public place requests choose and persist an existing area value", () => {
  assert.match(pageSource, /const placeRequestAreaOptions = useMemo/);
  assert.match(pageSource, /aria-label="장소 등록 요청 권역·세부지역 선택"/);
  assert.match(pageSource, /placeRequestAreaOptions\.map/);
  assert.match(pageSource, /area: placeRequestArea/);
  assert.match(pageSource, /area: request\.area/);
  assert.match(pageSource, /!placeRequestArea \|\| placeRequestName/);

  assert.match(requestRouteSource, /submitted_area AS submittedArea/);
  assert.match(requestRouteSource, /const area = cleanText\(payload\.area, 160\)/);
  assert.match(requestRouteSource, /fields\.name, fields\.area, fields\.address/);
  assert.match(requestRouteSource, /area: fields\.area, address: fields\.address/);
  assert.match(areaMigrationSource, /ADD `submitted_area` text DEFAULT '' NOT NULL/);
  assert.match(areaMigrationSource, /ADD `area` text DEFAULT '' NOT NULL/);
});

test("the published common marker size becomes the default for newly created markers", () => {
  assert.match(pageSource, /defaultMarkerSize: markerGroupSize/);
  assert.match(pageSource, /setMarkerGroupSize\(clamp\(view\.defaultMarkerSize, 0\.8, 15\)\)/);
  assert.match(pageSource, /size: mapCategory === "landmark" \? LANDMARK_RESOURCE_SIZE : markerGroupSize/);
  assert.match(pageSource, /const size = asset\.category === "landmark" \? 6\.4 : markerGroupSize/);
  assert.ok((pageSource.match(/size: markerGroupSize/g) ?? []).length >= 3);
  assert.match(pageSource, /일반 마커 값은 공개본 업데이트 시 저장되며/);
  assert.match(publicLayoutRouteSource, /defaultMarkerSize: finiteNumber\(raw\.defaultMarkerSize, 0\.8, 15\)/);
});
