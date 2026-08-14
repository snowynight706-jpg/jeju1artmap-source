import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { placesForPublicCategory } from "../app/public-place-category.mjs";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
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
