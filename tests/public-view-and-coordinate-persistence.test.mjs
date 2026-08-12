import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("a partial coordinate snapshot never clears a lock stored in the layout", () => {
  assert.match(pageSource, /if \(!setting\) return element;/);
  assert.doesNotMatch(pageSource, /if \(!setting\) return \{ \.\.\.element, locked: false \};/);
  assert.match(pageSource, /lockedCoordinateSettingsFor\(elementsRef\.current\)/);
});

test("public viewers start focused and zoomed on the main hub on desktop and mobile", () => {
  assert.match(pageSource, /const publicInitialViewAppliedRef = useRef\(false\)/);
  assert.match(pageSource, /const compact = viewportDimensions\.width <= 760/);
  assert.match(pageSource, /fitZoom \* 2\.05, viewportFillZoom \* 1\.12/);
  assert.match(pageSource, /fitZoom \* 1\.32, viewportFillZoom \* 1\.02/);
  assert.match(pageSource, /elements\.find\(\(element\) => isPrimaryHubLabel\(element\.name\) && element\.mapVisible\)/);
});

test("the public main-hub pointer is a fixed-size smooth red down marker", () => {
  assert.match(pageSource, /main-hub-pointer-icon/);
  assert.match(cssSource, /\.main-hub-badge \{[^}]*width: 24px;[^}]*height: 22px/);
  assert.match(cssSource, /\.main-hub-pointer-icon path \{[^}]*fill: #d84a42;[^}]*stroke-linejoin: round/);
});

test("main hub is folded into culture instead of having a separate list filter", () => {
  assert.doesNotMatch(pageSource, /\{ id: "hub", name: "워크케이션 거점"/);
  assert.match(pageSource, /isPrimaryHubLabel\(place\.name\)\) ids\.add\("culture"\)/);
  assert.match(pageSource, /Number\(b\.isMainHub\) - Number\(a\.isMainHub\)/);
  assert.match(pageSource, /background: item\.isMainHub \? MAIN_HUB_PUBLIC_COLOR : meta\.color/);
});

test("mobile panels open large but map navigation folds them away", () => {
  assert.match(pageSource, /setPublicPanelExpanded\(publicLayoutAccess === "viewer" && viewportDimensions\.width <= 760\)/);
  assert.match(pageSource, /setPublicPanelExpanded\(false\);\s*setPublicPlaceExpanded\(showDetails && viewportDimensions\.width <= 760\);\s*setGlobalStoriesOpen\(false\)/);
  assert.match(cssSource, /\.global-story-panel\.public-explorer-panel\.expanded \{ height: calc\(100dvh - 96px - env\(safe-area-inset-bottom\)\); \}/);
  assert.match(cssSource, /\.public-place-sheet\.expanded \{ height: calc\(100dvh - 96px - env\(safe-area-inset-bottom\)\); \}/);
});
