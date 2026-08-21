import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const landmarkSource = await readFile(new URL("../app/landmark-assets/index.ts", import.meta.url), "utf8");
const manifestSource = await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");

test("mobile landmarks use one fixed 384px derivative without zoom-time source promotion", async () => {
  assert.match(landmarkSource, /mobileSrc: `\/landmarks-mobile-384\/\$\{id\}\.webp\?v=\$\{MOBILE_REVISION\}`/);
  assert.doesNotMatch(landmarkSource, /landmarks-mobile-256/);
  assert.match(pageSource, /const \[publicAssetProfile\] = useState<PublicAssetProfile>\(\(\) => \([\s\S]{0,140}window\.matchMedia\("\(max-width: 760px\)"\)\.matches \? "mobile" : "standard"/);
  assert.doesNotMatch(pageSource, /matchMedia\("\(max-width: 760px\)"\)\.addEventListener/);

  const markerSourceLine = pageSource.split("\n").find((line) => line.includes("useMobileLandmarkAssets ? asset.mobileSrc")) ?? "";
  assert.match(markerSourceLine, /asset\.mobileSrc \?\? asset\.screenSrc \?\? asset\.src/);
  assert.doesNotMatch(markerSourceLine, /zoom|decode|upgrade|256|512/);

  const screenFiles = (await readdir(new URL("../public/landmarks-screen/", import.meta.url))).filter((name) => name.endsWith(".webp")).sort();
  const mobileFiles = (await readdir(new URL("../public/landmarks-mobile-384/", import.meta.url))).filter((name) => name.endsWith(".webp")).sort();
  assert.deepEqual(mobileFiles, screenFiles);

  const activeIds = [
    "jeju-communication-center-a02",
    "jeju-art-platform-c01-v05",
    "kim-memorial-front03",
    "artspace-ia-v04",
    "arario-01",
    "guesthouse-01",
    "sanjicheon-v06",
    "mokgwana-v10",
    "gwandeokjeong-v09",
    "chilsungro-20260820-transparent",
    "dongmun-v08",
    "buksugu-02",
    "tapdong-square-03",
    "tapdong-seaside-stage-02",
  ];
  let screenBytes = 0;
  let mobileBytes = 0;
  for (const id of activeIds) {
    screenBytes += (await stat(new URL(`../public/landmarks-screen/${id}.webp`, import.meta.url))).size;
    mobileBytes += (await stat(new URL(`../public/landmarks-mobile-384/${id}.webp`, import.meta.url))).size;
  }
  assert.ok(mobileBytes < screenBytes * 0.3);
});

test("screen UI swaps only pixel-equivalent raster files while install icons remain PNG", async () => {
  const iconStems = [
    "category_ui_culture_book_brush_note_v03_ui-96px",
    "category_ui_restaurant_v02_ui-96px",
    "category_ui_cafe_v03_ui-96px",
    "category_ui_goods_shop_v03_ui-96px",
    "category_ui_amenities_v01_ui-96px",
  ];
  for (const stem of iconStems) {
    assert.match(pageSource, new RegExp(`/category-icons/${stem}\\.webp`));
    const png = await stat(new URL(`../public/category-icons/${stem}.png`, import.meta.url));
    const webp = await stat(new URL(`../public/category-icons/${stem}.webp`, import.meta.url));
    assert.ok(webp.size < png.size);
  }
  assert.match(pageSource, /\/jfac-signature-b\.webp/);
  assert.match(pageSource, /\/jfac-symbol\.webp/);
  assert.match(manifestSource, /\/icons\/icon-192\.png/);
  assert.match(manifestSource, /\/icons\/icon-512\.png/);
  assert.match(manifestSource, /\/icons\/icon-maskable-512\.png/);
});
