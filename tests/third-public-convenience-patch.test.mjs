import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  publicPanelAfterDrag,
  publicPlaceDirectionsUrl,
  publicUrlWithPlace,
} from "../app/public/navigation.mjs";

import { readAppClientSource } from "./source-fixtures.mjs";

const pageSource = await readAppClientSource();
const publicPlaceDetailSource = await readFile(new URL("../app/public/place-detail-content.tsx", import.meta.url), "utf8");
const publicPlaceSheetSource = await readFile(new URL("../app/public/place-sheet.tsx", import.meta.url), "utf8");
const publicExplorerPanelSource = await readFile(new URL("../app/public/explorer-panel.tsx", import.meta.url), "utf8");
const contentClientSource = await readFile(new URL("../app/content/client.ts", import.meta.url), "utf8");
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
  assert.match(publicPlaceSheetSource, /role="separator"[\s\S]{0,100}aria-orientation="horizontal"[\s\S]{0,100}aria-label="위아래로 끌어 장소 정보 패널 높이 조절"/);
  assert.match(publicExplorerPanelSource, /role="separator"[\s\S]{0,100}aria-orientation="horizontal"[\s\S]{0,100}aria-label="위아래로 끌어 장소·리뷰·행사 패널 높이 조절"/);
  assert.match(pageSource, /const nextPanel = publicPanelAfterDrag\(drag\.target, drag\.startExpanded, deltaY\);/);
});

test("public explorer starts with all places and reports the filtered result count", () => {
  assert.match(pageSource, /useState<PublicPlaceCategoryScope>\("all"\)/);
  assert.match(pageSource, /publicPlaceCategory === "all"\s*\? publicPlaceItems/);
  assert.match(pageSource, /rows: publicExplorerPlaceRows/);
  assert.match(publicExplorerPanelSource, /검색 결과 <strong>\{places\.rows\.length\}<\/strong>곳/);
  assert.match(publicExplorerPanelSource, /className="public-place-search-row"[\s\S]{0,420}className=\{`public-place-all-button[\s\S]{0,420}className="public-place-search"/);
  assert.match(cssSource, /\.public-place-search-row \{[^}]*grid-template-columns: auto minmax\(0, 1fr\)/);
  assert.match(cssSource, /\.public-place-filter-summary \{[^}]*min-height: 21px[^}]*margin-top: 1px/);
  assert.doesNotMatch(pageSource, /장소 \{publicPlaceItems\.length\} · 마커 \{visibleElements\.length\}/);
  assert.match(pageSource, /const mapScaleRatio = Math\.max\(1, labelDetailRatio\)/);
  assert.match(pageSource, /const mapVisiblePercent = Math\.max\(1, Math\.min\(100, Math\.round\(100 \/ mapScaleRatio\)\)\)/);
  assert.match(pageSource, /const outputLabelCount = stageLabelElements\.length/);
  assert.equal((pageSource.match(/맞춤 ×\{mapScaleRatioLabel\} · 지도 \{mapVisiblePercent\}% · 라벨 \{outputLabelCount\}개/g) ?? []).length, 2);
  assert.match(pageSource, /publicLayoutAccess === "editor"[\s\S]{0,1800}className="map-scale-status"/);
  assert.match(cssSource, /\.statusbar \.map-scale-status \{[^}]*font-variant-numeric: tabular-nums[^}]*white-space: nowrap/);
  assert.match(pageSource, /className="map-render-refresh"[\s\S]{0,180}aria-label="현재 화면 라벨과 마커 정보 새로고침"/);
  assert.match(pageSource, /const refreshVisibleMapRenderInfo = \(\) => \{[\s\S]{0,360}setMapRenderRefreshRevision/);
  assert.match(cssSource, /\.map-render-refresh \{[^}]*width: 20px[^}]*height: 20px/);
});

test("place detail exposes directions, address copy, share, and a stable history state", () => {
  assert.match(publicPlaceDetailSource, />길찾기 ↗<\/a>/);
  assert.match(publicPlaceDetailSource, />주소 복사<\/button>/);
  assert.match(publicPlaceDetailSource, />공유<\/button>/);
  assert.match(pageSource, /navigator\.share/);
  assert.match(pageSource, /window\.addEventListener\("popstate", handlePopState\)/);
  assert.match(pageSource, /window\.addEventListener\("keydown", handleEscape, true\)/);
});

test("public place details omit the area and show DB information as one continuous block", () => {
  assert.doesNotMatch(publicPlaceDetailSource, /area: string|props\.area|public-place-area/);
  assert.match(publicPlaceDetailSource, /notes: string/);
  assert.match(publicPlaceDetailSource, /className="public-place-information"[\s\S]{0,360}props\.description[\s\S]{0,220}props\.operatingInfo[\s\S]{0,220}props\.notes/);
  assert.doesNotMatch(publicPlaceDetailSource, /public-place-hours|public-place-description/);
  assert.match(pageSource, /notes: selectedDirectoryPlace\?\.notes \?\? ""/);
  assert.doesNotMatch(pageSource, /area=\{selectedDirectoryPlace\?\.area/);
  assert.match(cssSource, /\.public-place-information \{[^}]*margin-top: 14px[^}]*line-height: 1\.65/);
  assert.doesNotMatch(cssSource, /\.public-place-hours|\.public-place-area/);
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
  assert.match(pageSource, /loading: publicPlaceDetailLoading/);
  assert.match(publicPlaceSheetSource, /aria-busy=\{detail\.loading\}/);
  assert.match(publicPlaceSheetSource, /<PublicPlaceDetailContent \{\.\.\.detail\}/);
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
  assert.match(viewerShortcutHandler, /clamp\(value \/ 1\.16, fitZoom, 4\)/);
  assert.match(viewerShortcutHandler, /event\.key === "0"[\s\S]+setZoom\(fitZoom\)[\s\S]+setMapPan\(\{ x: 0, y: 0 \}\)/);
  assert.match(pageSource, /className="public-shortcut-trigger shortcut-trigger"[\s\S]{0,180}>단축키<\/button>/);
  assert.match(pageSource, /\{shortcutHelpOpen && <div className="admin-shortcut-backdrop"/);
  assert.match(pageSource, /공개본 단축키/);
  assert.match(pageSource, /원도심 탐색을 열고 장소 검색/);
  assert.match(cssSource, /@media \(max-width: 760px\) \{[\s\S]+\.public-topbar \.public-shortcut-trigger[\s\S]+display: none/);
});

test("review text drafts and mobile photo discard protection are session scoped", () => {
  assert.match(contentClientSource, /PLACE_STORY_DRAFTS_KEY/);
  assert.match(contentClientSource, /sessionStorage\.setItem\(PLACE_STORY_DRAFTS_KEY/);
  assert.match(pageSource, /선택한 사진은 장소를 벗어나면 사라집니다/);
  assert.match(pageSource, /writePlaceStoryDraft\(selectedStoryKey, ""\)/);
});

test("mobile sheets expose a drag handle and 44px primary targets", () => {
  assert.match(publicPlaceSheetSource, /className="public-panel-drag-handle"/);
  assert.match(publicExplorerPanelSource, /className="public-panel-drag-handle"/);
  assert.match(cssSource, /\.public-panel-drag-handle \{[^}]+touch-action: none/);
  assert.match(cssSource, /\.public-place-sheet-head \.public-place-sheet-actions button,[\s\S]+min-height: 44px/);
  assert.match(cssSource, /\.public-map-reset \{[^}]+전체 지도|public-map-reset/);
});
