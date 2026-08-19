import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const directoryRouteSource = await readFile(new URL("../app/api/place-directory/route.ts", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

const rightPanelStart = pageSource.indexOf('<aside className="panel properties-panel"');
const rightPanelEnd = pageSource.indexOf("</aside>}", rightPanelStart);
const rightPanelSource = pageSource.slice(rightPanelStart, rightPanelEnd);
const projectAssetsStart = pageSource.indexOf('title="프로젝트 자산"');
const projectAssetsEnd = pageSource.indexOf('title="마커 스타일·크기"', projectAssetsStart);
const projectAssetsSource = pageSource.slice(projectAssetsStart, projectAssetsEnd);

test("coordinate lock is the single marker review state and lives in the property header", () => {
  assert.match(rightPanelSource, /className={`coordinate-review-button/);
  assert.match(rightPanelSource, /검수 완료/);
  assert.match(rightPanelSource, /검수 필요/);
  assert.match(pageSource, /function reviewStatusForCoordinateLock\(locked: boolean\)/);
  assert.match(pageSource, /const next = \{ \.\.\.patched, status: reviewStatusForCoordinateLock\(patched\.locked\) \}/);
  assert.match(pageSource, /const toggleSelectedCoordinateReview = \(\) =>/);
  assert.doesNotMatch(rightPanelSource, /검수 상태<select|status-pill/);
  assert.match(pageSource, /editingEnabled && !element\.locked[\s\S]{0,160}검수 필요/);
});

test("basic information separates map display name from DB-backed address and taxonomy", () => {
  assert.match(rightPanelSource, /지도·관리자·배포 표시 전용/);
  assert.match(rightPanelSource, /DB 장소명은 변경하지 않습니다/);
  assert.match(rightPanelSource, /saveSelectedDirectoryAddress\(selectedDirectoryPlace, event\.currentTarget\.value\)/);
  assert.match(rightPanelSource, /분류 <em>연결 DB 즉시 반영<\/em>/);
  assert.match(directoryRouteSource, /updatesAddress = typeof body\.address === "string"/);
  assert.match(directoryRouteSource, /SET category = \?, additional_categories_json = \?, address = \?/);
  assert.match(pageSource, /displayName: usesMapDisplayName \? anchor\.name : publicDisplayName/);
  assert.doesNotMatch(rightPanelSource, /요소 메모|selected\.memo/);
});

test("related property controls are consolidated without duplicate folders", () => {
  assert.match(rightPanelSource, /title="위치 앵커 · 리소스 출력"/);
  assert.match(rightPanelSource, /title="라벨 · 연결선"/);
  assert.match(rightPanelSource, /title="리뷰·행사 관리"/);
  assert.match(rightPanelSource, /고화질 출력 세부/);
  assert.doesNotMatch(rightPanelSource, /title="리소스 출력 오프셋"|title="실제 위치 앵커"|title="연결선"|title="라벨"|title="고화질 출력"/);
  assert.match(cssSource, /\.compact-property-details/);
  assert.match(cssSource, /\.property-subsection/);
});

test("Drive originals are available from project assets instead of the right panel", () => {
  assert.match(projectAssetsSource, /Drive 원본/);
  assert.match(projectAssetsSource, /project-asset-source-link/);
  assert.doesNotMatch(rightPanelSource, /Drive 원본/);
});

test("editor selection no longer waits on per-place event and review requests", () => {
  assert.ok(pageSource.match(/if \(!selectedStoryKey \|\| publicLayoutAccess !== "viewer"\)/g)?.length >= 2);
  assert.match(rightPanelSource, /리뷰·행사 통합 관리 열기/);
  assert.doesNotMatch(rightPanelSource, /placeEventsLoading|placeStoriesLoading/);
});
