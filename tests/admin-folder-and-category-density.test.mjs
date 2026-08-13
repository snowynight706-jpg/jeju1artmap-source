import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("admin functions use reusable folders with the requested open and closed arrows", () => {
  assert.match(pageSource, /function AdminFolder/);
  assert.match(pageSource, /open \? "△" : "▽"/);
  assert.match(pageSource, /title="기본 정보"[\s\S]{0,120}defaultOpen/);
  assert.match(pageSource, /title="장소 분류 · DB 연동"[\s\S]{0,160}defaultOpen/);
  assert.match(pageSource, /title="리소스 출력 오프셋"/);
  assert.match(pageSource, /title="실제 위치 앵커"/);
  assert.match(pageSource, /title="라벨"/);
  assert.match(pageSource, /title="빠른 작업"/);
  assert.match(pageSource, /setPrintFolderOpenRequest\(\(current\) => current \+ 1\)/);
  assert.match(pageSource, /openSignal=\{printFolderOpenRequest\}/);
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

test("public category controls keep five compact one-row buttons with larger icons while place rows stay slim and ruled", () => {
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
  assert.match(cssSource, /\.public-place-category-chips button img \{[^}]*width: 27px[^}]*height: 27px/);
  assert.doesNotMatch(cssSource, /\.public-place-category-chips button:not\(:last-child\)::after/);
  assert.match(cssSource, /\.public-place-list \{[^}]*gap: 0/);
  assert.match(cssSource, /\.public-place-list article:not\(:last-child\)::after \{[^}]*height: 1px[^}]*background: #dce5e2/);
  assert.doesNotMatch(cssSource, /\.public-place-list article:not\(:last-child\)::after \{[^}]*repeating-linear-gradient/);
  assert.match(cssSource, /\.public-place-list article \{[^}]*min-height: 44px/);
  assert.match(cssSource, /\.global-story-panel-scroll \{[^}]*scrollbar-gutter: stable/);
  assert.match(cssSource, /\.global-story-panel \{[^}]*min-width: min\(410px, calc\(100vw - 36px\)\)[^}]*max-width: min\(410px, calc\(100vw - 36px\)\)/);
  assert.match(pageSource, /<img src=\{category\.iconSrc\} alt="" aria-hidden="true" \/>/);
  assert.match(pageSource, /if \(primary === "shop"\) return "shop";/);
  assert.match(pageSource, /return "convenience";/);
});

test("public place rows use the five requested columns without a district field", () => {
  const explorerBlock = pageSource.match(/<section className="public-place-explorer">[\s\S]*?<\/section> : globalContentTab/)?.[0] ?? "";
  assert.match(explorerBlock, /className="public-place-list-header"[\s\S]{0,180}>장소명<[\s\S]{0,80}>대분류<[\s\S]{0,80}>추가분류<[\s\S]{0,80}>지도보기<[\s\S]{0,80}>상세</);
  assert.match(explorerBlock, /className="public-place-identity"/);
  assert.doesNotMatch(explorerBlock, /public-place-symbol|<img src=\{meta\.iconSrc\}/);
  assert.match(explorerBlock, /className="public-place-primary-category"[\s\S]{0,100}\{meta\.name\}/);
  assert.match(explorerBlock, /className="public-place-additional-category"/);
  assert.match(explorerBlock, /className="public-place-map-action"[\s\S]{0,160}>지도보기<\/button>/);
  assert.match(explorerBlock, /className="public-place-detail-action"[\s\S]{0,160}>상세<\/button>/);
  assert.doesNotMatch(explorerBlock, /item\.place\.area|권역 미입력|public-place-meta/);
  assert.match(cssSource, /\.public-place-list-header \{[^}]*grid-template-columns: minmax\(118px, 1\.65fr\) 52px minmax\(62px, \.85fr\) 50px 40px/);
  assert.match(cssSource, /\.public-place-list article \{[^}]*grid-template-columns: minmax\(118px, 1\.65fr\) 52px minmax\(62px, \.85fr\) 50px 40px/);
});
