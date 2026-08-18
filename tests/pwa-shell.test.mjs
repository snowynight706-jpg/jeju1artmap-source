import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
const serviceWorkerSource = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
const lifecycleSource = await readFile(new URL("../app/pwa-lifecycle.tsx", import.meta.url), "utf8");
const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const icon192 = await readFile(new URL("../public/icons/icon-192.png", import.meta.url));
const icon512 = await readFile(new URL("../public/icons/icon-512.png", import.meta.url));
const maskable512 = await readFile(new URL("../public/icons/icon-maskable-512.png", import.meta.url));

function pngDimensions(buffer) {
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

test("manifest keeps the existing site root and exposes standalone install metadata", () => {
  assert.equal(manifest.name, "제주 원도심 아트맵");
  assert.equal(manifest.short_name, "원도심 아트맵");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, undefined);
  assert.deepEqual(pngDimensions(icon192), [192, 192]);
  assert.deepEqual(pngDimensions(icon512), [512, 512]);
  assert.deepEqual(pngDimensions(maskable512), [512, 512]);
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
});

test("the service worker never caches mutable APIs and keeps HTML network-first", () => {
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/api\/"\)\) return/);
  assert.match(serviceWorkerSource, /request\.mode === "navigate"[\s\S]{0,140}fetch\(request, \{ cache: "no-store" \}\)\.catch\(offlineResponse\)/);
  assert.match(serviceWorkerSource, /request\.destination === "script" \|\| request\.destination === "style"/);
  assert.match(serviceWorkerSource, /request\.destination === "image"[\s\S]{0,120}staleWhileRevalidateImage/);
  assert.doesNotMatch(serviceWorkerSource, /caches\.match\(request\)[\s\S]{0,80}url\.pathname\.startsWith\("\/api\/"\)/);
});

test("production registration checks for updates without blocking development", () => {
  assert.match(lifecycleSource, /process\.env\.NODE_ENV !== "production"/);
  assert.match(lifecycleSource, /registration\.unregister\(\)/);
  assert.match(lifecycleSource, /updateViaCache: "none"/);
  assert.match(lifecycleSource, /await registration\.update\(\)/);
  assert.match(lifecycleSource, /SKIP_WAITING/);
  assert.match(lifecycleSource, /controllerchange/);
  assert.match(lifecycleSource, /querySelectorAll<HTMLMetaElement>\('meta\[name="viewport"\]'\)/);
  assert.match(lifecycleSource, /viewportTags\.slice\(0, -1\)\.forEach\(\(tag\) => tag\.remove\(\)\)/);
  assert.match(layoutSource, /manifest: "\/manifest\.webmanifest"/);
  assert.match(layoutSource, /viewport-fit=cover/);
  assert.match(layoutSource, /apple-mobile-web-app-capable" content="yes"/);
  assert.match(layoutSource, /<PwaLifecycle \/>/);
});

test("PWA control files bypass stale HTTP caches and mobile chrome respects safe areas", () => {
  assert.match(workerSource, /url\.pathname === "\/service-worker\.js" \|\| url\.pathname === "\/manifest\.webmanifest"/);
  assert.match(workerSource, /no-cache, no-store, must-revalidate/);
  assert.match(workerSource, /service-worker-allowed/);
  assert.match(cssSource, /\.app-shell:not\(\.public-readonly-shell\) > \.topbar[\s\S]{0,220}env\(safe-area-inset-top\)/);
  assert.match(cssSource, /\.pwa-offline-notice/);
});
