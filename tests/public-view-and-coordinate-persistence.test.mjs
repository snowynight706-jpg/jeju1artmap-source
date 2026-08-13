import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const signatureB = await readFile(new URL("../public/jfac-signature-b.png", import.meta.url));

test("the first screen uses only Korean signature B until assets, initial focus, and settling are complete", () => {
  const loaderBlock = pageSource.match(/const startupLoadingCard =[\s\S]*?<\/section>;/)?.[0] ?? "";
  assert.match(pageSource, /const startupLoadCompletedRef = useRef\(false\)/);
  assert.match(pageSource, /visibleElements\.flatMap\(\(element\) =>/);
  assert.match(pageSource, /Promise\.all\(sources\.map\(preload\)\)/);
  assert.match(pageSource, /const \[startupInitialViewReady, setStartupInitialViewReady\] = useState\(false\)/);
  assert.match(pageSource, /setStartupRevealReady\(true\), 1600/);
  assert.match(pageSource, /!startupRevealReady && <div className="public-loading public-loading-overlay">/);
  assert.match(pageSource, /const sources = \[\.\.\.new Set\(\[\s*"\/jfac-signature-b\.png"/);
  assert.match(loaderBlock, /src="\/jfac-signature-b\.png" alt="제주문화예술재단 국문 시그니처 B"/);
  assert.doesNotMatch(loaderBlock, /jfac-symbol\.png|jfac-signature-c\.png|제주 원도심 아트맵/);
  assert.match(loaderBlock, />로딩 중</);
  assert.match(cssSource, /\.public-loading-track span \{[^}]*linear-gradient/);
  assert.equal(signatureB.readUInt32BE(16), 1182);
  assert.equal(signatureB.readUInt32BE(20), 626);
});

test("a partial coordinate snapshot never clears a lock stored in the layout", () => {
  assert.match(pageSource, /if \(!setting\) return element;/);
  assert.doesNotMatch(pageSource, /if \(!setting\) return \{ \.\.\.element, locked: false \};/);
  assert.match(pageSource, /lockedCoordinateSettingsFor\(elementsRef\.current\)/);
});

test("public viewers start focused and zoomed on the main hub on desktop and mobile", () => {
  assert.match(pageSource, /const publicInitialViewAppliedRef = useRef\(false\)/);
  assert.match(pageSource, /const compact = viewportDimensions\.width <= 760/);
  assert.match(pageSource, /fitZoom \* 2\.35, viewportFillZoom \* 1\.28/);
  assert.match(pageSource, /fitZoom \* 1\.32, viewportFillZoom \* 1\.02/);
  assert.match(pageSource, /elements\.find\(\(element\) => isPrimaryHubLabel\(element\.name\) && element\.mapVisible\)/);
});

test("mobile public chrome floats only the main-hub return button", () => {
  assert.match(pageSource, /<img src="\/jfac-symbol\.png" alt="" aria-hidden="true" \/>/);
  assert.doesNotMatch(pageSource, /<div className="brand-mark">W<\/div>/);
  assert.match(cssSource, /\.public-topbar \{[^}]*position: absolute;[^}]*right: 9px;[^}]*background: transparent/);
  assert.match(cssSource, /\.public-topbar \.brand-block, \.public-topbar \.zoom-tools, \.public-topbar \.readonly-badge, \.public-topbar \.owner-signin \{ display: none; \}/);
  assert.match(pageSource, /className="main-hub-quick"/);
});

test("the public main-hub pointer is a fixed-size smooth red down marker", () => {
  assert.match(pageSource, /main-hub-pointer-icon/);
  assert.match(cssSource, /\.main-hub-badge \{[^}]*width: 24px;[^}]*height: 22px/);
  assert.match(cssSource, /\.main-hub-pointer-icon path \{[^}]*fill: #d84a42;[^}]*stroke-linejoin: round/);
});

test("main hub is folded into culture instead of having a separate list filter", () => {
  assert.doesNotMatch(pageSource, /\{ id: "hub", name: "워크케이션 거점"/);
  assert.match(pageSource, /place\.featuredRole === MAIN_HUB_ROLE\s*\|\| isPrimaryHubLabel\(place\.name\)\s*\) return "culture";/);
  assert.match(pageSource, /Number\(b\.isMainHub\) - Number\(a\.isMainHub\)/);
  assert.match(pageSource, /item\.isMainHub \? "main-hub" : ""/);
  assert.match(cssSource, /\.public-place-list article\.main-hub \{[^}]*background: linear-gradient/);
});

test("mobile panels open large but map navigation folds them away", () => {
  assert.match(pageSource, /setPublicPanelExpanded\(publicLayoutAccess === "viewer" && viewportDimensions\.width <= 760\)/);
  assert.match(pageSource, /setPublicPanelExpanded\(false\);\s*setPublicPlaceExpanded\(showDetails && viewportDimensions\.width <= 760\);\s*setGlobalStoriesOpen\(false\)/);
  assert.match(cssSource, /\.global-story-panel\.public-explorer-panel\.expanded \{ height: calc\(100dvh - 96px - env\(safe-area-inset-bottom\)\); \}/);
  assert.match(cssSource, /\.public-place-sheet\.expanded \{ height: calc\(100dvh - 96px - env\(safe-area-inset-bottom\)\); \}/);
});
