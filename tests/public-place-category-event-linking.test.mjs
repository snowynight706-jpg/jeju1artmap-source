import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { placesForPublicCategory } from "../app/public-place-category.mjs";

import { readAppClientSource } from "./source-fixtures.mjs";

const pageSource = await readAppClientSource();
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const apiSource = await readFile(new URL("../app/api/place-events/route.ts", import.meta.url), "utf8");

test("event-linked non-culture places are appended below native culture places", () => {
  const items = [
    { id: "culture-b", categoryId: "culture" },
    { id: "cafe-event", categoryId: "cafe" },
    { id: "culture-a", categoryId: "culture" },
    { id: "food-normal", categoryId: "food" },
    { id: "shop-event", categoryId: "shop" },
  ];
  const result = placesForPublicCategory(items, "culture", new Set(["cafe-event", "shop-event"]));
  assert.deepEqual(result.map((item) => item.id), ["culture-b", "culture-a", "cafe-event", "shop-event"]);
  assert.deepEqual(placesForPublicCategory(items, "cafe", new Set(["shop-event"])).map((item) => item.id), ["cafe-event"]);
});

test("the shop tab also includes cafes and restaurants tagged as a goods shop", () => {
  const items = [
    { id: "primary-shop", categoryId: "shop", place: { additionalCategories: [] } },
    { id: "cafe-with-goods", categoryId: "cafe", place: { additionalCategories: ["goods-shop", "rest"] } },
    { id: "food-with-goods", categoryId: "food", place: { additionalCategories: ["goods-shop"] } },
    { id: "plain-cafe", categoryId: "cafe", place: { additionalCategories: ["rest"] } },
  ];

  assert.deepEqual(
    placesForPublicCategory(items, "shop").map((item) => item.id),
    ["primary-shop", "cafe-with-goods", "food-with-goods"],
  );
  assert.deepEqual(placesForPublicCategory(items, "cafe").map((item) => item.id), ["cafe-with-goods", "plain-cafe"]);
});

test("the culture tab appends cafes and restaurants tagged as multi-cultural without event duplicates", () => {
  const items = [
    { id: "culture-native", categoryId: "culture", place: { additionalCategories: [] } },
    { id: "cafe-cultural", categoryId: "cafe", place: { additionalCategories: ["multi-cultural"] } },
    { id: "food-cultural-event", categoryId: "food", place: { additionalCategories: ["multi-cultural"] } },
    { id: "cafe-event-only", categoryId: "cafe", place: { additionalCategories: [] } },
  ];

  assert.deepEqual(
    placesForPublicCategory(items, "culture", new Set(["food-cultural-event", "cafe-event-only"])).map((item) => item.id),
    ["culture-native", "cafe-cultural", "food-cultural-event", "cafe-event-only"],
  );
});

test("reading, exhibition, and performance additions also appear in the culture tab", () => {
  const items = [
    { id: "food-reading", categoryId: "food", place: { additionalCategories: ["reading"] } },
    { id: "cafe-exhibition", categoryId: "cafe", place: { additionalCategories: ["exhibition"] } },
    { id: "shop-performance", categoryId: "shop", place: { additionalCategories: ["performance"] } },
    { id: "food-unrelated", categoryId: "food", place: { additionalCategories: ["rest"] } },
  ];

  assert.deepEqual(
    placesForPublicCategory(items, "culture").map((item) => item.id),
    ["food-reading", "cafe-exhibition", "shop-performance"],
  );
});

test("category rows use the assigned map marker color and explain event-derived entries", () => {
  assert.match(pageSource, /className="public-place-marker-key"[\s\S]{0,140}categoryOf\(item\.anchor\.category\)\.color/);
  assert.match(pageSource, /className="public-place-event-badge">행사/);
  assert.match(cssSource, /\.public-place-marker-key \{[^}]*border-radius: 50%/);
});

test("a compact event-place index respects public visibility and admin access", () => {
  assert.match(apiSource, /scope === "place-index"/);
  assert.match(apiSource, /SELECT DISTINCT ep\.place_key AS placeKey, ep\.place_name AS placeName/);
  assert.match(apiSource, /canManage \? "1 = 1" : "e\.status = 'active' AND e\.visible_from <= \? AND e\.visible_until > \?"/);
  assert.match(pageSource, /PLACE_EVENTS_API}\?scope=place-index/);
});
