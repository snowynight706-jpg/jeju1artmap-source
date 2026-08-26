import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const PAGE_CHUNK_PATTERN = /^\/assets\/page-[^/]+\.js$/;

function unique(values) {
  return [...new Set(values)];
}

export function collectInitialRouteAssetUrls(manifest) {
  const clientReferenceDeps = Object.values(manifest.clientReferenceDeps ?? {});
  const layoutCss = manifest.serverResources?.["app/layout.tsx"]?.css ?? [];
  const javascript = unique(
    clientReferenceDeps.flatMap((entry) => entry.js ?? []),
  );
  const css = unique([
    ...clientReferenceDeps.flatMap((entry) => entry.css ?? []),
    ...layoutCss,
  ]);
  const pageChunk = javascript.find((assetUrl) => PAGE_CHUNK_PATTERN.test(assetUrl));

  if (!pageChunk) {
    throw new Error("공개 페이지 청크를 빌드 자산 manifest에서 찾지 못했습니다.");
  }

  return { javascript, css, pageChunk };
}

function resolveClientAssetPath(clientRoot, assetUrl) {
  const relativeAssetPath = assetUrl.split(/[?#]/, 1)[0].replace(/^\/+/, "");
  const resolvedPath = path.resolve(clientRoot, relativeAssetPath);
  const relativePath = path.relative(clientRoot, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`빌드 자산 경로가 dist/client 바깥을 가리킵니다: ${assetUrl}`);
  }

  return resolvedPath;
}

async function measureAsset(clientRoot, assetUrl) {
  const contents = await readFile(resolveClientAssetPath(clientRoot, assetUrl));
  return {
    assetUrl,
    rawBytes: contents.byteLength,
    gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
  };
}

export async function measureInitialRoute(projectRoot = PROJECT_ROOT) {
  const manifestPath = path.join(
    projectRoot,
    "dist",
    "server",
    "__vite_rsc_assets_manifest.js",
  );
  const manifestUrl = `${pathToFileURL(manifestPath).href}?budget=${Date.now()}`;
  const manifest = (await import(manifestUrl)).default;
  const assetUrls = collectInitialRouteAssetUrls(manifest);
  const clientRoot = path.join(projectRoot, "dist", "client");
  const javascript = await Promise.all(
    assetUrls.javascript.map((assetUrl) => measureAsset(clientRoot, assetUrl)),
  );
  const css = await Promise.all(
    assetUrls.css.map((assetUrl) => measureAsset(clientRoot, assetUrl)),
  );
  const pageChunk = javascript.find(
    (asset) => asset.assetUrl === assetUrls.pageChunk,
  );

  if (!pageChunk) {
    throw new Error("측정한 자산에서 공개 페이지 진입 청크를 찾지 못했습니다.");
  }

  const sum = (assets, field) =>
    assets.reduce((total, asset) => total + asset[field], 0);

  return {
    totalRawBytes: sum([...javascript, ...css], "rawBytes"),
    totalGzipBytes: sum([...javascript, ...css], "gzipBytes"),
    pageChunkRawBytes: pageChunk.rawBytes,
    pageChunkGzipBytes: pageChunk.gzipBytes,
    cssRawBytes: sum(css, "rawBytes"),
    cssGzipBytes: sum(css, "gzipBytes"),
    javascript,
    css,
  };
}

export function evaluatePerformanceBudget(measurement, budget) {
  const checks = [
    {
      label: "공개 초기 JS+CSS",
      actualBytes: measurement.totalGzipBytes,
      limitBytes: budget.totalGzipBytes,
    },
    {
      label: "공개 페이지 청크",
      actualBytes: measurement.pageChunkGzipBytes,
      limitBytes: budget.pageChunkGzipBytes,
    },
    {
      label: "공개 초기 CSS",
      actualBytes: measurement.cssGzipBytes,
      limitBytes: budget.cssGzipBytes,
    },
  ];

  return checks.map((check) => ({
    ...check,
    passed: check.actualBytes <= check.limitBytes,
  }));
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

export async function verifyPerformanceBudget(projectRoot = PROJECT_ROOT) {
  const budgetPath = path.join(projectRoot, "performance-budget.json");
  const budgetConfig = JSON.parse(await readFile(budgetPath, "utf8"));

  if (budgetConfig.schemaVersion !== 1 || !budgetConfig.initialRoute) {
    throw new Error("performance-budget.json 형식을 확인해 주세요.");
  }

  const measurement = await measureInitialRoute(projectRoot);
  const checks = evaluatePerformanceBudget(
    measurement,
    budgetConfig.initialRoute,
  );

  console.log("공개 초기 화면 성능 예산 (gzip)");
  for (const check of checks) {
    const mark = check.passed ? "PASS" : "FAIL";
    console.log(
      `- ${mark} ${check.label}: ${formatKiB(check.actualBytes)} / ${formatKiB(check.limitBytes)}`,
    );
  }

  const failures = checks.filter((check) => !check.passed);
  if (failures.length > 0) {
    const labels = failures.map((failure) => failure.label).join(", ");
    throw new Error(`성능 예산을 초과했습니다: ${labels}`);
  }

  return { measurement, checks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  verifyPerformanceBudget().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
