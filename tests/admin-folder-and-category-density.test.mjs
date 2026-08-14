import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("admin functions use reusable folders with clean CSS chevrons and distinct states", () => {
  assert.match(pageSource, /function AdminFolder/);
  assert.match(pageSource, /<span className="admin-folder-arrow" aria-hidden="true" \/>/);
  assert.doesNotMatch(pageSource, /△|▽/);
  assert.doesNotMatch(cssSource, /△|▽/);
  assert.match(pageSource, /title="기본 정보"[\s\S]{0,120}defaultOpen/);
  assert.match(pageSource, /title="장소 분류 · DB 연동"[\s\S]{0,160}defaultOpen/);
  assert.match(pageSource, /title="리소스 출력 오프셋"/);
  assert.match(pageSource, /title="실제 위치 앵커"/);
  assert.match(pageSource, /title="라벨"/);
  assert.match(pageSource, /title="빠른 작업"/);
  assert.match(pageSource, /setPrintFolderOpenRequest\(\(current\) => current \+ 1\)/);
  assert.match(pageSource, /openSignal=\{printFolderOpenRequest\}/);
  assert.match(pageSource, /function slowlyRevealAdminFolder\(folder: HTMLElement\)/);
  assert.match(pageSource, /findScrollableAdminAncestor\(folder\)/);
  assert.match(pageSource, /prefers-reduced-motion: reduce/);
  assert.match(pageSource, /Math\.min\(760, Math\.max\(480, Math\.abs\(distance\) \* 1\.35\)\)/);
  assert.match(pageSource, /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => slowlyRevealAdminFolder\(folder\)\)\)/);
  assert.doesNotMatch(pageSource, /folder\.scrollIntoView\(\{ block: "end", inline: "nearest" \}\)/);
  assert.match(cssSource, /\.admin-folder \{[^}]*flex-direction: column-reverse/);
  assert.match(cssSource, /\.admin-folder\.open > \.admin-folder-head \{[^}]*border-top/);
  assert.match(cssSource, /\.admin-folder-arrow::before \{[^}]*content: ""[^}]*border-right: 1\.5px solid currentColor[^}]*border-bottom: 1\.5px solid currentColor[^}]*rotate\(45deg\)/);
  assert.match(cssSource, /\.admin-folder\.open \.admin-folder-arrow::before \{[^}]*rotate\(225deg\)/);
  assert.match(cssSource, /\.app-shell\[data-ui-theme\] \.admin-folder\.closed > \.admin-folder-head \{[^}]*background: color-mix\([^}]*color: var\(--muted\)[^}]*box-shadow: inset 2px 0 0/);
  assert.match(cssSource, /\.app-shell\[data-ui-theme\] \.admin-folder\.open > \.admin-folder-head \{[^}]*background: linear-gradient\([^}]*color: var\(--ink\)[^}]*box-shadow: inset 4px 0 0 var\(--ui-accent-strong\)/);
  assert.match(cssSource, /\.app-shell\[data-ui-theme\] \.admin-folder\.open > \.admin-folder-body \{[^}]*background: var\(--ui-surface-raised\)[^}]*box-shadow: inset 4px 0 0/);
  assert.match(cssSource, /\.app-shell\[data-ui-theme\] \.admin-folder\.open > \.admin-folder-head \.admin-folder-arrow \{[^}]*background: var\(--ui-accent-strong\)[^}]*color: var\(--ui-on-accent\)/);
  assert.match(cssSource, /\.marker-folder-icon::before \{[^}]*content: ""[^}]*border-right: 1\.5px solid currentColor[^}]*border-bottom: 1\.5px solid currentColor[^}]*rotate\(45deg\)/);
  assert.match(cssSource, /:is\(\.marker-visibility-group, \.calibration-folder\)\.expanded \.marker-folder-icon::before \{[^}]*rotate\(225deg\)/);
  assert.match(cssSource, /\.advanced-view-tools summary::before \{[^}]*content: ""[^}]*border-right: 1\.5px solid currentColor[^}]*border-bottom: 1\.5px solid currentColor[^}]*rotate\(45deg\)/);
  assert.match(cssSource, /\.app-shell\[data-ui-theme\] :is\(\.marker-visibility-group, \.calibration-folder\)\.expanded \{[^}]*background: var\(--ui-surface-raised\)/);
  assert.match(cssSource, /\.app-shell\[data-ui-theme\] \.advanced-view-tools\[open\] > summary \{[^}]*background: linear-gradient\([^}]*box-shadow: inset 4px 0 0 var\(--ui-accent-strong\)[^}]*font-weight: 850/);
});

test("left admin panels are grouped into collapsible functional folders", () => {
  for (const title of [
    "지도 전체 조절",
    "배치된 마커 목록",
    "담당자 제출용 고화질 출력",
    "자산 필터·업로드",
    "프로젝트 자산",
    "마커 스타일·크기",
    "지도 구성 도우미",
    "통합 장소 DB",
    "장소 배치 목록",
  ]) {
    assert.match(pageSource, new RegExp(`title="${title}"`));
  }
});

test("the desktop left admin explorer is wide and uses one edge-to-edge scroll surface", () => {
  assert.match(cssSource, /\.workspace \{[^}]*--workspace-left: clamp\(340px, 24vw, 380px\)[^}]*grid-template-columns: var\(--workspace-left\) minmax\(0, 1fr\) var\(--workspace-right\)/);
  assert.match(cssSource, /\.app-shell\[data-ui-theme\] \.asset-panel \.side-admin-folder \{[^}]*width: 100%[^}]*margin: 0[^}]*border-radius: 0/);
  assert.match(cssSource, /\.app-shell\[data-ui-theme\] \.asset-panel \.marker-visibility-list \{[^}]*max-height: none[^}]*overflow: visible/);
  assert.match(cssSource, /\.place-directory \.marker-visibility-panel\.unified-place-panel \{[^}]*margin: 0[^}]*border: 0[^}]*background: transparent/);
  assert.match(cssSource, /\.place-directory \.place-filter \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});

test("public category controls keep five compact one-row buttons with larger icons while place rows stay extra slim and ruled", () => {
  const categoryBlock = pageSource.match(/const publicListCategories:[\s\S]*?\] as const;/)?.[0] ?? "";
  for (const [id, name] of [
    ["culture", "문화공간"],
    ["food", "음식점"],
    ["cafe", "카페"],
    ["shop", "소품샵"],
    ["convenience", "편의시설"],
  ]) {
    assert.match(categoryBlock, new RegExp(`id: "${id}", name: "${name}"`));
  }
  assert.doesNotMatch(categoryBlock, /id: "all"|id: "exhibition-performance"/);
  for (const resource of [
    "category_ui_culture_book_brush_note_v03_ui-96px.png",
    "category_ui_restaurant_v02_ui-96px.png",
    "category_ui_cafe_v03_ui-96px.png",
    "category_ui_goods_shop_v03_ui-96px.png",
    "category_ui_amenities_v01_ui-96px.png",
  ]) {
    assert.match(categoryBlock, new RegExp(`/category-icons/${resource.replace(".", "\\.")}`));
  }
  assert.match(cssSource, /\.public-place-category-chips \{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(cssSource, /\.public-place-category-chips button \{[^}]*height: 50px[^}]*border-radius: 9px/);
  assert.match(cssSource, /\.public-place-category-chips button img \{[^}]*width: 32px[^}]*height: 32px/);
  assert.doesNotMatch(cssSource, /\.public-place-category-chips button:not\(:last-child\)::after/);
  assert.match(cssSource, /\.public-place-list \{[^}]*gap: 0/);
  assert.match(cssSource, /\.public-place-list article:not\(:last-child\)::after \{[^}]*height: 1px[^}]*background: #e3e3e3/);
  assert.doesNotMatch(cssSource, /\.public-place-list article:not\(:last-child\)::after \{[^}]*repeating-linear-gradient/);
  assert.match(cssSource, /\.public-place-list article \{[^}]*min-height: 26px/);
  assert.match(cssSource, /\.global-story-panel-scroll \{[^}]*scrollbar-gutter: stable/);
  assert.match(cssSource, /\.global-story-panel \{[^}]*min-width: min\(410px, calc\(100vw - 36px\)\)[^}]*max-width: min\(410px, calc\(100vw - 36px\)\)/);
  assert.match(pageSource, /<img src=\{category\.iconSrc\} alt="" aria-hidden="true" \/>/);
  assert.match(pageSource, /if \(primary === "shop"\) return "shop";/);
  assert.match(pageSource, /return "convenience";/);
});

test("the interface uses a bright grayscale base while preserving image resources", () => {
  assert.match(cssSource, /:root \{[^}]*--paper: #f6f6f6[^}]*--panel: #fcfcfc[^}]*--ink: #2d2d2d[^}]*--emerald: #646464[^}]*--emerald-soft: #ededed/);
  assert.doesNotMatch(cssSource, /--emerald: #3f9287|--emerald-soft: #e3f0ed/);
  assert.match(cssSource, /\.public-place-category-chips button\.active \{[^}]*border-color: #999[^}]*background: #eeeeee[^}]*box-shadow: inset 0 -3px 0 #666/);
  assert.match(pageSource, /<img src=\{category\.iconSrc\} alt="" aria-hidden="true" \/>/);
});

test("themed category selections and list headings keep legible text on light fills", () => {
  assert.match(cssSource, /\.app-shell\[data-ui-theme\] \.public-place-category-chips button\.active > span \{[^}]*color: var\(--ui-deep\)/);
  assert.match(cssSource, /\.app-shell\[data-ui-theme\] \.public-place-list-header span \{[^}]*color: var\(--ui-deep\)/);
  assert.match(cssSource, /\.public-place-list-header span \{[^}]*font-size: 8\.5px[^}]*font-weight: 850/);
});

test("five persisted palettes include a hidden picker, full tonal hierarchy, and a themed desktop topbar", () => {
  for (const [id, colors] of [
    ["stormy", ["#FAFAFA", "#E1E2E5", "#B9BBC1", "#70737C", "#2B2D33"]],
    ["nordic-sand", ["#F6F3EF", "#DED9D2", "#B4AEA6", "#7A746D", "#3A3835"]],
    ["lilac", ["#F4F2F7", "#D6D2DF", "#A59DB6", "#5D556F", "#26222F"]],
    ["urban-blush", ["#F6F2F4", "#DED5DA", "#B7A4AC", "#6E5B63", "#C07B8F"]],
    ["harbor-morning", ["#F0F3F7", "#C8D2E0", "#8EA2BB", "#4E647A", "#26313B"]],
  ]) {
    assert.match(pageSource, new RegExp(`id: "${id}"[^\\n]*${colors.join("[^\\n]*")}`));
  }
  for (const place of ["제주아트플랫폼", "예술공간 이아", "산지천갤러리", "김만덕객주"]) assert.match(pageSource, new RegExp(`"${place}"`));
  assert.match(pageSource, /className="place-theme-easter-egg"/);
  assert.match(pageSource, /className="admin-theme-menu"/);
  assert.match(pageSource, /localStorage\.getItem\(UI_THEME_STORAGE_KEY\)/);
  assert.match(pageSource, /localStorage\.setItem\(UI_THEME_STORAGE_KEY, theme\)/);
  assert.match(cssSource, /data-ui-theme="harbor-morning"[^}]*--paper: #26313b[^}]*--ink: #f0f3f7/);
  assert.match(cssSource, /data-ui-theme="harbor-morning"[^}]*--ui-complement: #8ea2bb[^}]*--ui-complement-soft: #3b4d5d/);
  assert.match(cssSource, /data-ui-theme="harbor-morning"[^}]*\.public-place-list article\.main-hub:not\(\.selected\)[^}]*background: linear-gradient\(110deg, var\(--ui-mid\), var\(--ui-surface-raised\) 72%\)/);
  assert.match(cssSource, /data-ui-theme="harbor-morning"[^}]*article\.main-hub:not\(\.selected\)[^}]*public-place-primary-category[^}]*color: var\(--palette-1\)/);
  assert.match(cssSource, /data-ui-theme="harbor-morning"[^}]*\.public-place-list article\.selected[^}]*var\(--ui-surface-raised\) 88%, #d9ad45/);
  assert.match(cssSource, /--radius-window: 8px[^}]*--radius-panel: 5px[^}]*--radius-control: 3px/);
  assert.match(cssSource, /--ui-spectrum: linear-gradient\(90deg, var\(--palette-1\)[^;]*var\(--palette-5\)/);
  assert.match(cssSource, /@media \(min-width: 761px\)[\s\S]*\.app-shell\[data-ui-theme\] \.topbar \{[^}]*background: linear-gradient/);
  assert.match(cssSource, /\.topbar \.main-hub-quick \{[^}]*background: var\(--ui-complement\)/);
});

test("direct DB editing uses a dense details list and compact category selections", () => {
  assert.match(pageSource, /className="database-editor-list-columns"[^>]*><span \/><span>장소명<\/span><span>분류<\/span><span>권역·세부지역<\/span>/);
  assert.match(cssSource, /\.database-editor-list-pane \{[^}]*grid-template-rows: auto auto 24px minmax\(0, 1fr\)/);
  assert.match(cssSource, /\.database-editor-list > button \{[^}]*min-height: 27px[^}]*border-radius: 0/);
  assert.match(cssSource, /:is\(\.database-additional-categories, \.database-convenience-attributes\) > div \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(cssSource, /:is\(\.database-additional-categories, \.database-convenience-attributes\) label \{[^}]*min-height: 28px/);
  assert.doesNotMatch(pageSource, /공개 상세 태그/);
});

test("direct DB editing can collect places by primary category with visible counts", () => {
  for (const [id, name] of [["all", "전체"], ["culture", "문화공간"], ["food", "음식점"], ["cafe", "카페"], ["shop", "소품샵"], ["other", "기타"]]) {
    assert.match(pageSource, new RegExp(`id: "${id}", name: "${name}"`));
  }
  assert.match(pageSource, /className="database-editor-category-filters" role="group" aria-label="DB 대분류 모아보기"/);
  assert.match(pageSource, /aria-pressed=\{databaseEditorCategory === filter\.id\}/);
  assert.match(pageSource, /databaseEditorCategoryCounts\[filter\.id\]/);
  assert.match(pageSource, /databaseEditorCategory === "all" \|\| databaseEditorCategoryForPlace\(place\) === databaseEditorCategory/);
  assert.match(cssSource, /\.database-editor-category-filters \{[^}]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(cssSource, /\.database-editor-category-filters button\.active \{[^}]*box-shadow: inset 0 -2px 0 #555/);
});

test("public place rows use four compact columns with whole-row map navigation and one details action", () => {
  const explorerBlock = pageSource.match(/<section className="public-place-explorer">[\s\S]*?<\/section> : globalContentTab/)?.[0] ?? "";
  assert.match(explorerBlock, /className="public-place-list-header"[\s\S]{0,180}>장소명<[\s\S]{0,80}>대분류<[\s\S]{0,80}>추가분류<[\s\S]{0,80}>상세보기</);
  assert.match(explorerBlock, /className="public-place-identity"/);
  assert.doesNotMatch(explorerBlock, /public-place-symbol|<img src=\{meta\.iconSrc\}/);
  assert.match(explorerBlock, /className="public-place-primary-category"[\s\S]{0,100}\{meta\.name\}/);
  assert.match(explorerBlock, /className="public-place-additional-category"/);
  assert.match(explorerBlock, /className="public-place-row-action"[\s\S]{0,100}focusPublicPlaceItem\(item\)[\s\S]{0,140}지도에서 찾기/);
  assert.match(explorerBlock, /className="public-place-open-action"[\s\S]{0,180}focusPublicPlaceItem\(item, true\)[\s\S]{0,140}>상세보기<\/button>/);
  assert.doesNotMatch(explorerBlock, /className="public-place-map-action"|className="public-place-detail-action"/);
  assert.doesNotMatch(explorerBlock, /item\.place\.area|권역 미입력|public-place-meta/);
  assert.match(cssSource, /\.public-place-list-header \{[^}]*grid-template-columns: minmax\(124px, 1\.45fr\) 60px minmax\(112px, 1\.15fr\) 64px/);
  assert.match(cssSource, /\.public-place-list article \{[^}]*grid-template-columns: minmax\(124px, 1\.45fr\) 60px minmax\(112px, 1\.15fr\) 64px/);
  assert.match(cssSource, /\.public-place-primary-category \{[^}]*font-size: 9\.5px/);
  assert.match(cssSource, /\.public-place-additional-category \{[^}]*font-size: 9px/);
  assert.match(cssSource, /\.public-place-row-action \{[^}]*position: absolute[^}]*inset: 0[^}]*cursor: pointer/);
});

test("admin and public functional UI share one bounded responsive type scale", () => {
  assert.match(cssSource, /\/\*\s*\n \* Shared functional type scale/);
  assert.match(cssSource, /\.app-shell \{[^}]*--font-ui-meta: 9px[^}]*--font-ui-control: 10px[^}]*--font-ui-body: 11px[^}]*--font-ui-section: 12px[^}]*--font-ui-heading: 13px[^}]*--font-ui-title: 15px/);
  assert.match(cssSource, /\.app-shell :is\([\s\S]*?\.topbar,[\s\S]*?\.panel,[\s\S]*?\.database-editor,[\s\S]*?\.place-request-dialog,[\s\S]*?\.public-loading-card[\s\S]*?\) :is\(button, select, summary, label, p, span, strong, b, a, output\) \{\s*font-size: var\(--font-ui-control\)/);
  assert.match(cssSource, /\.app-shell :is\([\s\S]*?\.public-place-sheet,[\s\S]*?\.global-story-panel[\s\S]*?\) :is\(button, select, summary, label\) \{\s*font-size: var\(--font-ui-control\)/);
  assert.match(cssSource, /\.public-place-category-chips button,[\s\S]*?\.public-place-list-header span,[\s\S]*?\.database-editor-category-filters button span,[\s\S]*?\.database-editor-list b[\s\S]*?font-size: var\(--font-ui-control\)/);
  assert.match(cssSource, /@media \(max-width: 760px\) \{\s*\.app-shell \{[^}]*--font-ui-meta: 10px[^}]*--font-ui-control: 11px[^}]*--font-ui-body: 12px[^}]*--font-ui-section: 13px[^}]*--font-ui-heading: 14px[^}]*--font-ui-title: 15px/);
  assert.match(cssSource, /Symbol-only controls retain an optical icon size outside the text scale/);
});
