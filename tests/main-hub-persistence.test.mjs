import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MAIN_HUB_ASSET_ID,
  consolidateMainHubDirectoryPlaces,
  stableMainHubResourceSize,
  stabilizeMainHubDocument,
  withoutMainHubPlacementOverrides,
} from "../app/main-hub-persistence.mjs";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/api/public-layout/route.ts", import.meta.url), "utf8");

test("main hub keeps its edited resource size while restoring required visibility and asset", () => {
  const document = stabilizeMainHubDocument({
    elements: [{
      id: "hub",
      directoryId: "place-sotong-center",
      name: "제주소통협력센터",
      category: "culture",
      x: 45,
      y: 59,
      anchorX: 45,
      anchorY: 59,
      size: 9.4,
      z: 3,
      labelVisible: false,
      labelPosition: "bottom",
      labelGap: 11,
      assetId: "old-asset",
      status: "review",
      mapVisible: false,
    }],
    assets: [],
    reviewNotes: [],
    placementOverrides: [{
      key: "directory:place-sotong-center",
      directoryId: "place-sotong-center",
      name: "제주소통협력센터",
      state: "unplaced",
    }],
  });

  assert.equal(document.elements.length, 1);
  assert.equal(document.elements[0].size, 9.4);
  assert.equal(document.elements[0].mapVisible, true);
  assert.equal(document.elements[0].labelVisible, true);
  assert.equal(document.elements[0].assetId, MAIN_HUB_ASSET_ID);
  assert.deepEqual(document.placementOverrides, []);
});

test("main hub size falls back only when stored data is invalid", () => {
  assert.equal(stableMainHubResourceSize(8.7), 8.7);
  assert.equal(stableMainHubResourceSize(Number.NaN), 6.2);
  assert.equal(stableMainHubResourceSize(0), 6.2);
});

test("stale main-hub placement overrides are removed without touching other places", () => {
  const settings = withoutMainHubPlacementOverrides([
    { key: "directory:place-sotong-center", directoryId: "place-sotong-center", name: "제주소통협력센터", state: "deleted" },
    { key: "directory:other", directoryId: "other", name: "다른 장소", state: "unplaced" },
  ]);
  assert.deepEqual(settings, [{ key: "directory:other", directoryId: "other", name: "다른 장소", state: "unplaced" }]);
});

test("duplicate communication-center directory rows and markers collapse to one canonical item", () => {
  const directoryPlaces = consolidateMainHubDirectoryPlaces([
    { id: "master-v10-old", name: "제주특별자치도 소통협력센터", category: "culture", aliases: [] },
    { id: "place-sotong-center", name: "제주소통협력센터", category: "culture", aliases: ["소통센터"] },
    { id: "other", name: "다른 장소", category: "culture" },
  ]);
  assert.equal(directoryPlaces.filter((place) => place.id === "place-sotong-center").length, 1);
  assert.equal(directoryPlaces.length, 2);

  const document = stabilizeMainHubDocument({
    directoryPlaces,
    elements: [
      { id: "hub-1", directoryId: "master-v10-old", name: "제주소통협력센터", category: "landmark", size: 8.1 },
      { id: "hub-2", directoryId: "place-sotong-center", name: "제주소통협력센터 메인 오피스", category: "landmark", size: 6.2 },
      { id: "other", name: "다른 장소", category: "culture", size: 1.7 },
    ],
  });
  assert.equal(document.elements.filter((element) => element.directoryId === "place-sotong-center").length, 1);
  assert.equal(document.elements.length, 2);
  assert.equal(document.elements[0].size, 8.1);
  assert.equal(document.directoryPlaces.length, 2);
});

test("refresh, public-layout load, and server saves all use the main-hub persistence guard", () => {
  assert.match(pageSource, /size: stableMainHubResourceSize\(element\.size\)/);
  assert.match(pageSource, /isPrimaryHubLabel\(element\.name\) \|\| isMainHubPersistenceTarget\(element\)/);
  assert.match(pageSource, /status: "approved" as const,\s*mapVisible: true/);
  assert.match(pageSource, /ensureMainHubMapElement\(\s*applyPlacementOverrides\(current, remoteSettings, true\)/);
  assert.match(pageSource, /disabled=\{isMainHubPersistenceTarget\(selected\)\}/);
  assert.match(pageSource, /return elements\.flatMap\(\(element\) => \{/);
  assert.match(routeSource, /stabilizeMainHubDocument\(JSON\.parse\(row\.documentJson\)/);
  assert.match(routeSource, /const stableDocument = isRecord\(payload\) \? stabilizeMainHubDocument\(payload\.document\) : null/);
});
