import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  collectInitialRouteAssetUrls,
  evaluatePerformanceBudget,
} from "../scripts/verify-performance-budget.mjs";

test("초기 화면 자산은 공개 페이지 진입 청크와 레이아웃 CSS를 중복 없이 모은다", () => {
  const assets = collectInitialRouteAssetUrls({
    clientReferenceDeps: {
      page: {
        js: [
          "/assets/page-example.js",
          "/assets/framework-example.js",
          "/assets/framework-example.js",
        ],
        css: ["/assets/page-example.css"],
      },
      pwa: {
        js: [
          "/assets/pwa-lifecycle-example.js",
          "/assets/framework-example.js",
        ],
        css: [],
      },
    },
    serverResources: {
      "app/layout.tsx": {
        css: ["/assets/page-example.css", "/assets/layout-example.css"],
      },
    },
  });

  assert.deepEqual(assets, {
    javascript: [
      "/assets/page-example.js",
      "/assets/framework-example.js",
      "/assets/pwa-lifecycle-example.js",
    ],
    css: ["/assets/page-example.css", "/assets/layout-example.css"],
    pageChunk: "/assets/page-example.js",
  });
});

test("성능 예산은 경계값을 허용하고 초과 항목만 실패로 표시한다", () => {
  const checks = evaluatePerformanceBudget(
    {
      totalGzipBytes: 120,
      pageChunkGzipBytes: 81,
      cssGzipBytes: 20,
    },
    {
      totalGzipBytes: 120,
      pageChunkGzipBytes: 80,
      cssGzipBytes: 21,
    },
  );

  assert.deepEqual(
    checks.map(({ label, passed }) => ({ label, passed })),
    [
      { label: "공개 초기 JS+CSS", passed: true },
      { label: "공개 페이지 청크", passed: false },
      { label: "공개 초기 CSS", passed: true },
    ],
  );
});

test("프로젝트 검증은 프로덕션 빌드 직후 성능 예산을 확인한다", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const budgetConfig = JSON.parse(
    await readFile("performance-budget.json", "utf8"),
  );

  assert.match(
    packageJson.scripts.validate,
    /npm run build && npm run budget:performance$/,
  );
  assert.equal(
    packageJson.scripts["budget:performance"],
    "node scripts/verify-performance-budget.mjs",
  );
  assert.equal(budgetConfig.schemaVersion, 1);

  for (const limit of Object.values(budgetConfig.initialRoute)) {
    assert.equal(Number.isSafeInteger(limit), true);
    assert.equal(limit > 0, true);
  }
});
