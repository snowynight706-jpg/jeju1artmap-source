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

test("public category controls use four slim stacked notebook rows with approved resources", () => {
  const categoryBlock = pageSource.match(/const publicListCategories:[\s\S]*?\] as const;/)?.[0] ?? "";
  for (const [id, name] of [
    ["culture", "문화공간"],
    ["food", "음식점"],
    ["cafe", "카페"],
    ["convenience", "편의시설"],
  ]) {
    assert.match(categoryBlock, new RegExp(`id: "${id}", name: "${name}"`));
  }
  assert.doesNotMatch(categoryBlock, /id: "all"|id: "shop"|id: "exhibition-performance"/);
  for (const resource of ["cultural-facility.svg", "restaurant.svg", "cafe.svg", "goods-shop.svg"]) {
    assert.match(categoryBlock, new RegExp(`/category-icons/${resource.replace(".", "\\.")}`));
  }
  assert.match(cssSource, /\.public-place-category-chips \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(cssSource, /\.public-place-category-chips button \{[^}]*height: 22px/);
  assert.match(cssSource, /\.public-place-category-chips button:not\(:last-child\)::after \{[^}]*repeating-linear-gradient/);
  assert.match(pageSource, /<img src=\{category\.iconSrc\} alt="" aria-hidden="true" \/>/);
  assert.match(pageSource, /return "convenience";/);
});

test("public place rows align district and category metadata to the right of the name", () => {
  assert.match(pageSource, /className="public-place-title-row"/);
  assert.match(pageSource, /className="public-place-meta"/);
  assert.match(pageSource, /\{item\.place\.area \|\| "권역 미입력"\}[\s\S]{0,80}\{meta\.name\}/);
  assert.match(cssSource, /\.public-place-title-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(cssSource, /\.public-place-meta \{[^}]*justify-items: end/);
});
