import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const focusSource = await readFile(new URL("../app/public-place-focus.mjs", import.meta.url), "utf8");
const signatureB = await readFile(new URL("../public/jfac-signature-b.png", import.meta.url));

test("the first screen waits only for the critical map and main-hub assets before settling", () => {
  const loaderBlock = pageSource.match(/const startupLoadingCard =[\s\S]*?<\/section>;/)?.[0] ?? "";
  assert.match(pageSource, /const startupLoadCompletedRef = useRef\(false\)/);
  assert.doesNotMatch(pageSource, /visibleElements\.flatMap\(\(element\) =>/);
  assert.match(pageSource, /primaryHubAsset\?\.screenSrc \?\? primaryHubAsset\?\.src/);
  assert.match(pageSource, /Promise\.all\(sources\.map\(preload\)\)/);
  assert.match(pageSource, /const \[startupInitialViewReady, setStartupInitialViewReady\] = useState\(false\)/);
  assert.match(pageSource, /const \[startupInitialViewTarget, setStartupInitialViewTarget\] = useState/);
  assert.match(pageSource, /Math\.abs\(settledLabelZoom - startupInitialViewTarget\.zoom\) > 0\.002/);
  assert.match(pageSource, /setMapLayoutZoom\(target\.zoom\)/);
  assert.doesNotMatch(pageSource, /expectedWidth = stageWrap\.offsetWidth \* target\.zoom/);
  assert.match(pageSource, /committedFrame = window\.requestAnimationFrame[\s\S]{0,260}settledFrame = window\.requestAnimationFrame\(\(\) =>/);
  assert.match(pageSource, /requestAnimationFrame\(\(\) => setStartupRevealReady\(true\)\)/);
  assert.match(pageSource, /!startupRevealReady && <div className="public-loading public-loading-overlay">/);
  assert.match(pageSource, /const sources = \[\.\.\.new Set\(\[\s*"\/jfac-signature-b\.png",\s*mapSource/);
  assert.match(loaderBlock, /src="\/jfac-signature-b\.png" alt="제주문화예술재단 국문 시그니처 B"/);
  assert.doesNotMatch(loaderBlock, /jfac-symbol\.png|jfac-signature-c\.png|제주 원도심 아트맵/);
  assert.match(loaderBlock, />로딩 중</);
  assert.match(cssSource, /\.public-loading-track span \{[^}]*linear-gradient/);
  assert.match(cssSource, /\.public-loading \{[^}]*min-height: 100dvh[^}]*background: #fff/);
  assert.match(cssSource, /\.public-loading-card \{[^}]*width: min\(450px, 100%\)[^}]*border: 0[^}]*border-radius: 0[^}]*background: transparent[^}]*box-shadow: none/);
  assert.match(cssSource, /\.public-loading-symbol \{ width: min\(230px, 72vw\)/);
  assert.match(cssSource, /\.public-loading-track \{ width: min\(270px, 82%\)/);
  assert.equal(signatureB.readUInt32BE(16), 1182);
  assert.equal(signatureB.readUInt32BE(20), 626);
});

test("cached PWA startup assets cannot reset completed progress back to zero", () => {
  const startupBlock = pageSource.match(/if \(publicLayoutAccess === "loading"[\s\S]*?\}, \[assetsById, baseMap, hydrated/)?.[0] ?? "";
  assert.match(startupBlock, /queueMicrotask\(\(\) => \{[\s\S]*?setStartupLoadDone\(0\);[\s\S]*?Promise\.all\(sources\.map\(preload\)\)/);
  assert.match(startupBlock, /Promise\.all\(sources\.map\(preload\)\)[\s\S]*?setStartupLoadDone\(sources\.length\)/);
  assert.doesNotMatch(startupBlock, /queueMicrotask\([\s\S]*?setStartupLoadDone\(0\)[\s\S]*?\}\);\s*const preload/);
});

test("map wrappers start centered and admin uses the restored direct transform", () => {
  assert.match(cssSource, /\.map-stage-wrap \{[^}]*left: 50%;[^}]*top: 50%;[^}]*transform: translate3d\(-50%, -50%, 0\)/);
  assert.match(pageSource, /className=\{`map-stage-wrap \$\{publicLayoutAccess === "editor" \? "editor-direct-render"/);
  assert.match(pageSource, /publicLayoutAccess === "editor" \? \{ transform: `translate\(calc\(-50% \+ \$\{mapRenderPan\.x\}px\), calc\(-50% \+ \$\{mapRenderPan\.y\}px\)\) scale\(\$\{zoom\}\)` \} : undefined/);
  assert.match(cssSource, /\.map-stage-wrap\.editor-direct-render \.map-stage \{ width: 100%; \}/);
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
  assert.match(pageSource, /setStartupInitialViewTarget\(\{ zoom: targetZoom, pan: targetPan \}\)/);
});

test("mobile public chrome floats only the main-hub return button", () => {
  assert.match(pageSource, /<img src="\/jfac-symbol\.png" alt="" aria-hidden="true" \/>/);
  assert.doesNotMatch(pageSource, /<div className="brand-mark">W<\/div>/);
  assert.match(cssSource, /\.public-topbar \{[^}]*position: absolute;[^}]*right: 9px;[^}]*background: transparent/);
  assert.match(cssSource, /\.public-topbar \.brand-block, \.public-topbar \.zoom-tools, \.public-topbar \.readonly-badge, \.public-topbar \.public-shortcut-trigger, \.public-topbar \.owner-signin \{ display: none; \}/);
  assert.match(pageSource, /className="main-hub-quick"/);
});

test("the public main-hub pointer is a fixed-size smooth red down marker", () => {
  assert.match(pageSource, /main-hub-pointer-icon/);
  assert.match(cssSource, /\.main-hub-badge \{[^}]*width: 24px;[^}]*height: 22px/);
  assert.match(cssSource, /\.main-hub-pointer-icon path \{[^}]*fill: #d84a42;[^}]*stroke-linejoin: round/);
});

test("public directory navigation uses a device-aware close zoom and expected detail-sheet offset", () => {
  assert.match(pageSource, /publicPlaceFocusZoom\(\{/);
  assert.match(pageSource, /publicNavigation: true,[\s\S]{0,80}showDetails/);
  assert.match(pageSource, /focusOptions\.publicNavigation[\s\S]{0,220}-Math\.min\(195, viewportWidth \* 0\.2\)/);
  assert.match(pageSource, /focusOptions\.showDetails \? 0\.26 : 0\.18/);
});

test("public place lookup zoom is boosted thirty percent beyond its previous fitted target", () => {
  assert.match(focusSource, /PUBLIC_PLACE_FOCUS_BOOST = 1\.3/);
  assert.match(focusSource, /const desiredZoom = baselineZoom \* PUBLIC_PLACE_FOCUS_BOOST/);
  assert.match(focusSource, /\(compact \? 1\.62 : 1\.72\) \* PUBLIC_PLACE_FOCUS_BOOST/);
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
