import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("admin map keeps one label refresh and one memo-pin entry point", () => {
  assert.equal(pageSource.match(/전체 라벨 위치 새로고침/g)?.length ?? 0, 1);
  assert.equal(pageSource.match(/setMemoMode\(\(value\) => !value\)/g)?.length ?? 0, 1);
});

test("print preview is controlled from the output panel and PNG map is advanced-only", () => {
  assert.equal(pageSource.match(/실제 PNG 구성 미리보기/g)?.length ?? 0, 1);
  assert.equal(pageSource.match(/원본 PNG · 비상용/g)?.length ?? 0, 1);
  assert.match(pageSource, /고급 검수 보기·베이스맵/);
});

test("place-specific content panels route moderation to the unified manager", () => {
  assert.equal(pageSource.match(/리뷰·행사 통합 관리 열기/g)?.length ?? 0, 1);
  assert.match(pageSource, /const openUnifiedContentManagement = \(\) =>/);
  assert.match(pageSource, /openGlobalManagement\(globalContentTab === "events" \? "events" : "reviews"\)/);
  assert.doesNotMatch(pageSource, /title="장소 행사"|title="공개 사진·후기"/);
  assert.equal(pageSource.match(/editor-place-event-list/g)?.length ?? 0, 0);
  assert.equal(pageSource.match(/editor-place-story-list/g)?.length ?? 0, 0);
});
