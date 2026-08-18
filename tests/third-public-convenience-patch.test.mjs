import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  publicPanelAfterDrag,
  publicPlaceDirectionsUrl,
  publicUrlWithPlace,
} from "../app/public-convenience.mjs";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("stable place links preserve unrelated query parameters and hashes", () => {
  assert.equal(
    publicUrlWithPlace("https://example.com/map?theme=harbor#guide", "place-sotong-center"),
    "/map?theme=harbor&place=place-sotong-center#guide",
  );
  assert.equal(
    publicUrlWithPlace("https://example.com/map?theme=harbor&place=old#guide", null),
    "/map?theme=harbor#guide",
  );
});

test("directions use a stored map URL and otherwise fall back to a Kakao place search", () => {
  assert.equal(
    publicPlaceDirectionsUrl("제주소통협력센터", "제주시 관덕로", "https://place.map.kakao.com/123"),
    "https://place.map.kakao.com/123",
  );
  assert.match(
    publicPlaceDirectionsUrl("제주소통협력센터", "제주시 관덕로", ""),
    /^https:\/\/map\.kakao\.com\/\?q=.+/,
  );
});

test("mobile sheet drag has two deterministic snap states", () => {
  assert.equal(publicPanelAfterDrag("place", false, -70), "place-expanded");
  assert.equal(publicPanelAfterDrag("place", true, 70), "place");
  assert.equal(publicPanelAfterDrag("explorer", false, 12), "explorer");
});

test("public explorer starts with all places and reports the filtered result count", () => {
  assert.match(pageSource, /useState<PublicPlaceCategoryScope>\("all"\)/);
  assert.match(pageSource, /publicPlaceCategory === "all"\s*\? publicPlaceItems/);
  assert.match(pageSource, /검색 결과 <strong>\{filteredPublicPlaceItems\.length\}<\/strong>곳/);
  assert.match(pageSource, /장소 \{publicPlaceItems\.length\} · 마커 \{visibleElements\.length\}/);
});

test("place detail exposes directions, address copy, share, and a stable history state", () => {
  assert.match(pageSource, />길찾기 ↗<\/a>/);
  assert.match(pageSource, />주소 복사<\/button>/);
  assert.match(pageSource, />공유<\/button>/);
  assert.match(pageSource, /navigator\.share/);
  assert.match(pageSource, /window\.addEventListener\("popstate", handlePopState\)/);
  assert.match(pageSource, /window\.addEventListener\("keydown", handleEscape, true\)/);
});

test("Escape closes the topmost PC panel even while an input has focus", () => {
  const escapeHandler = pageSource.match(/const handleEscape = \(event: KeyboardEvent\) => \{[\s\S]+?window\.addEventListener\("keydown", handleEscape, true\);/)?.[0] ?? "";
  assert.ok(escapeHandler);
  assert.doesNotMatch(escapeHandler, /\["INPUT", "SELECT", "TEXTAREA"\]/);
  assert.match(escapeHandler, /document\.activeElement instanceof HTMLElement/);
  assert.match(escapeHandler, /if \(adminLoginOpen\)/);
  assert.match(escapeHandler, /if \(placeRequestFormOpen\)/);
  assert.match(escapeHandler, /if \(databaseEditorOpen\)/);
  assert.match(escapeHandler, /if \(placeEventFormOpen\)/);
  assert.match(escapeHandler, /selectedId[\s\S]+publicPlaceExpanded[\s\S]+globalStoriesOpen[\s\S]+publicPanelExpanded/);
  assert.match(pageSource, /if \(publicPanelIsPlace\(current\.wondosimPanel\)\) \{[\s\S]+setSelectedId\(null\);[\s\S]+window\.history\.go/);
  assert.match(pageSource, /if \(publicPanelIsExplorer\(current\.wondosimPanel\)\) \{[\s\S]+setGlobalStoriesOpen\(false\);[\s\S]+window\.history\.go/);
});

test("review text drafts and mobile photo discard protection are session scoped", () => {
  assert.match(pageSource, /PLACE_STORY_DRAFTS_KEY/);
  assert.match(pageSource, /sessionStorage\.setItem\(PLACE_STORY_DRAFTS_KEY/);
  assert.match(pageSource, /선택한 사진은 장소를 벗어나면 사라집니다/);
  assert.match(pageSource, /writePlaceStoryDraft\(selectedStoryKey, ""\)/);
});

test("mobile sheets expose a drag handle and 44px primary targets", () => {
  assert.match(pageSource, /className="public-panel-drag-handle"/);
  assert.match(cssSource, /\.public-panel-drag-handle \{[^}]+touch-action: none/);
  assert.match(cssSource, /\.public-place-sheet-head \.public-place-sheet-actions button,[\s\S]+min-height: 44px/);
  assert.match(cssSource, /\.public-map-reset \{[^}]+전체 지도|public-map-reset/);
});
