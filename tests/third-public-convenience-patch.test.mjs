import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  publicPanelAfterDrag,
  publicPlaceDirectionsUrl,
  publicUrlWithPlace,
} from "../app/public-convenience.mjs";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const publicPlaceDetailSource = await readFile(new URL("../app/public-place-detail-content.tsx", import.meta.url), "utf8");
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

test("directions preserve exact Kakao place links and otherwise search the address alone", () => {
  const address = "제주특별자치도 제주시 관덕로 8";
  assert.equal(
    publicPlaceDirectionsUrl("제주소통협력센터", address, "https://place.map.kakao.com/123"),
    "https://place.map.kakao.com/123",
  );
  assert.equal(
    new URL(publicPlaceDirectionsUrl("제주소통협력센터", address, "")).searchParams.get("q"),
    address,
  );
  assert.equal(
    new URL(publicPlaceDirectionsUrl("제주소통협력센터", address, "https://map.kakao.com/?q=old-place-name")).searchParams.get("q"),
    address,
  );
  assert.equal(
    new URL(publicPlaceDirectionsUrl("제주소통협력센터", address, "https://www.example.com/place")).searchParams.get("q"),
    address,
  );
  assert.equal(
    new URL(publicPlaceDirectionsUrl("제주소통협력센터", "", "")).searchParams.get("q"),
    "제주소통협력센터",
  );
});

test("mobile sheet drag has two deterministic snap states", () => {
  assert.equal(publicPanelAfterDrag("place", false, -70), "place-expanded");
  assert.equal(publicPanelAfterDrag("place", true, 70), "place");
  assert.equal(publicPanelAfterDrag("explorer", false, 12), "explorer");
  assert.equal(publicPanelAfterDrag("explorer", true, 0), "explorer-expanded");
});

test("public sheets use only the drag handle for height changes", () => {
  assert.doesNotMatch(pageSource, /className="public-place-expand"/);
  assert.doesNotMatch(pageSource, /className="public-panel-expand"/);
  assert.doesNotMatch(pageSource, />\{publicPlaceExpanded \? "접기" : "펼치기"\}<\/button>/);
  assert.doesNotMatch(pageSource, />\{publicPanelExpanded \? "접기" : "펼치기"\}<\/button>/);
  assert.match(pageSource, /role="separator" aria-orientation="horizontal" aria-label="위아래로 끌어 장소 정보 패널 높이 조절"/);
  assert.match(pageSource, /role="separator" aria-orientation="horizontal" aria-label="위아래로 끌어 장소·리뷰·행사 패널 높이 조절"/);
  assert.match(pageSource, /const nextPanel = publicPanelAfterDrag\(drag\.target, drag\.startExpanded, deltaY\);/);
});

test("public explorer starts with all places and reports the filtered result count", () => {
  assert.match(pageSource, /useState<PublicPlaceCategoryScope>\("all"\)/);
  assert.match(pageSource, /publicPlaceCategory === "all"\s*\? publicPlaceItems/);
  assert.match(pageSource, /검색 결과 <strong>\{filteredPublicPlaceItems\.length\}<\/strong>곳/);
  assert.match(pageSource, /장소 \{publicPlaceItems\.length\} · 마커 \{visibleElements\.length\}/);
});

test("place detail exposes directions, address copy, share, and a stable history state", () => {
  assert.match(publicPlaceDetailSource, />길찾기 ↗<\/a>/);
  assert.match(publicPlaceDetailSource, />주소 복사<\/button>/);
  assert.match(publicPlaceDetailSource, />공유<\/button>/);
  assert.match(pageSource, /navigator\.share/);
  assert.match(pageSource, /window\.addEventListener\("popstate", handlePopState\)/);
  assert.match(pageSource, /window\.addEventListener\("keydown", handleEscape, true\)/);
});

test("closing public sheets preserves the current map scale while explicit navigation may restore it", () => {
  const closePlace = pageSource.match(/const closePublicPlacePanel = \(\) => \{[\s\S]+?\n  \};/)?.[0] ?? "";
  const closeExplorer = pageSource.match(/const closePublicExplorerPanel = \(\) => \{[\s\S]+?\n  \};/)?.[0] ?? "";
  assert.match(closePlace, /publicPreserveMapViewOnNextPopRef\.current = true/);
  assert.doesNotMatch(closePlace, /restorePublicMapView/);
  assert.match(closeExplorer, /publicPreserveMapViewOnNextPopRef\.current = true/);
  assert.doesNotMatch(closeExplorer, /restorePublicMapView/);
  assert.match(pageSource, /if \(preserveCurrentMapView\) publicMapViewBeforeFocusRef\.current = null;\s*else restorePublicMapView\(panel === "map"\)/);
  assert.match(pageSource, /const resetPublicMap = \(\) => \{[\s\S]{0,500}setZoom\(fitZoom\)/);
});

test("Escape closes the topmost PC panel even while an input has focus", () => {
  const escapeHandler = pageSource.match(/const handleEscape = \(event: KeyboardEvent\) => \{[\s\S]+?window\.addEventListener\("keydown", handleEscape, true\);/)?.[0] ?? "";
  assert.ok(escapeHandler);
  assert.doesNotMatch(escapeHandler, /\["INPUT", "SELECT", "TEXTAREA"\]/);
  assert.match(escapeHandler, /document\.activeElement instanceof HTMLElement/);
  assert.match(escapeHandler, /if \(shortcutHelpOpen\)/);
  assert.match(escapeHandler, /if \(adminLoginOpen\)/);
  assert.match(escapeHandler, /if \(placeRequestFormOpen\)/);
  assert.match(escapeHandler, /if \(databaseEditorOpen\)/);
  assert.match(escapeHandler, /if \(placeEventFormOpen\)/);
  assert.match(escapeHandler, /selectedId[\s\S]+publicPlaceExpanded[\s\S]+globalStoriesOpen[\s\S]+publicPanelExpanded/);
  assert.match(pageSource, /if \(publicPanelIsPlace\(current\.wondosimPanel\)\) \{[\s\S]+setSelectedId\(null\);[\s\S]+window\.history\.go/);
  assert.match(pageSource, /if \(publicPanelIsExplorer\(current\.wondosimPanel\)\) \{[\s\S]+setGlobalStoriesOpen\(false\);[\s\S]+window\.history\.go/);
});

test("admin shortcuts stay limited to safe editing actions", () => {
  const shortcutHandler = pageSource.match(/const handleAdminShortcut = \(event: KeyboardEvent\) => \{[\s\S]+?window\.addEventListener\("keydown", handleAdminShortcut\);/)?.[0] ?? "";
  assert.ok(shortcutHandler);
  assert.match(shortcutHandler, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(shortcutHandler, /key === "s"[\s\S]+adminShortcutActionsRef\.current\.saveDraft\(\)/);
  assert.match(shortcutHandler, /key === "z"[\s\S]+event\.shiftKey[\s\S]+adminShortcutActionsRef\.current\.redo\(\)[\s\S]+adminShortcutActionsRef\.current\.undo\(\)/);
  assert.match(shortcutHandler, /event\.key === "\/"[\s\S]+placeQueryInputRef\.current\?\.focus/);
  assert.match(shortcutHandler, /event\.key === "\?"[\s\S]+setShortcutHelpOpen/);
  assert.doesNotMatch(shortcutHandler, /publishCurrentLayout|delete|remove/);
  assert.match(pageSource, /saveDraft: \(\) => \{ void saveEditorDraft\(\); \}/);
  assert.match(pageSource, /공개본 업데이트와 DB 영구 삭제에는 단축키를 두지 않았습니다/);
  assert.match(pageSource, /Ctrl \/ ⌘ \+ S/);
});

test("public place details wait for events and records before revealing all content", () => {
  assert.match(pageSource, /const \[placeStoriesLoadedKey, setPlaceStoriesLoadedKey\] = useState<string \| null>\(null\)/);
  assert.match(pageSource, /const \[placeEventsLoadedKey, setPlaceEventsLoadedKey\] = useState<string \| null>\(null\)/);
  assert.match(pageSource, /publicPlaceDetailLoading = publicLayoutAccess === "viewer"[\s\S]{0,220}placeStoriesLoadedKey !== selectedStoryKey \|\| placeEventsLoadedKey !== selectedStoryKey/);
  assert.match(pageSource, /setPlaceStoriesLoadedKey\(requestKey\)/);
  assert.match(pageSource, /setPlaceEventsLoadedKey\(requestKey\)/);
  assert.match(pageSource, /aria-busy=\{publicPlaceDetailLoading\}/);
  assert.match(pageSource, /<PublicPlaceDetailContent[\s\S]{0,120}loading=\{publicPlaceDetailLoading\}/);
  assert.match(publicPlaceDetailSource, /if \(props\.loading\) return <LoadingState \/>/);
  assert.match(publicPlaceDetailSource, /className="public-place-detail-loading"[\s\S]{0,320}행사와 장소 기록을 함께 준비한 뒤 한 번에 보여드립니다/);
  assert.match(cssSource, /\.public-place-detail-loading \{[^}]*min-height: 100%[^}]*place-content: center/);
});

test("PC shortcut help and viewer shortcuts are available in both modes", () => {
  const viewerShortcutHandler = pageSource.match(/const handleViewerShortcut = \(event: KeyboardEvent\) => \{[\s\S]+?window\.addEventListener\("keydown", handleViewerShortcut\);/)?.[0] ?? "";
  assert.ok(viewerShortcutHandler);
  assert.match(viewerShortcutHandler, /event\.key === "\?"[\s\S]+setShortcutHelpOpen/);
  assert.match(viewerShortcutHandler, /event\.key === "\/"[\s\S]+openPublicPlaceList\(\)[\s\S]+publicPlaceQueryInputRef\.current\?\.focus/);
  assert.match(viewerShortcutHandler, /event\.key === "\+" \|\| event\.key === "="[\s\S]+value \* 1\.16/);
  assert.match(viewerShortcutHandler, /event\.key === "-"[\s\S]+value \/ 1\.16/);
  assert.match(viewerShortcutHandler, /event\.key === "0"[\s\S]+setZoom\(fitZoom\)[\s\S]+setMapPan\(\{ x: 0, y: 0 \}\)/);
  assert.match(pageSource, /className="public-shortcut-trigger shortcut-trigger"[\s\S]{0,180}>단축키<\/button>/);
  assert.match(pageSource, /\{shortcutHelpOpen && <div className="admin-shortcut-backdrop"/);
  assert.match(pageSource, /공개본 단축키/);
  assert.match(pageSource, /원도심 탐색을 열고 장소 검색/);
  assert.match(cssSource, /@media \(max-width: 760px\) \{[\s\S]+\.public-topbar \.public-shortcut-trigger[\s\S]+display: none/);
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
