import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
const serviceWorkerSource = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
const lifecycleSource = await readFile(new URL("../app/pwa-lifecycle.tsx", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
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
  assert.match(lifecycleSource, /standaloneStatusBarColors/);
  assert.match(lifecycleSource, /new MutationObserver\(syncStatusBarTheme\)/);
  assert.match(lifecycleSource, /themeMeta\?\.setAttribute\("content", isStandaloneDisplay\(\) \? statusBarColor : defaultBrowserThemeColor\)/);
  assert.match(lifecycleSource, /getMobilePlatform/);
  assert.match(lifecycleSource, /process\.env\.NODE_ENV === "production" && !standalone/);
  assert.match(lifecycleSource, /const showMobileInstall = Boolean\(mobilePlatform\) && !appInstalled/);
  assert.match(lifecycleSource, /Safari에서 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하세요/);
  assert.match(lifecycleSource, /브라우저 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요/);
  assert.match(lifecycleSource, /querySelectorAll<HTMLMetaElement>\('meta\[name="viewport"\]'\)/);
  assert.match(lifecycleSource, /viewportTags\.slice\(0, -1\)\.forEach\(\(tag\) => tag\.remove\(\)\)/);
  assert.match(layoutSource, /manifest: "\/manifest\.webmanifest"/);
  assert.match(layoutSource, /viewport-fit=cover/);
  assert.match(layoutSource, /apple-mobile-web-app-capable" content="yes"/);
  assert.match(layoutSource, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(layoutSource, /jeju-wondosim-map-review:ui-theme:v1/);
  assert.match(layoutSource, /<PwaLifecycle \/>/);
});

test("PWA control files bypass stale HTTP caches and mobile chrome respects safe areas", () => {
  assert.match(workerSource, /url\.pathname === "\/service-worker\.js" \|\| url\.pathname === "\/manifest\.webmanifest"/);
  assert.match(workerSource, /no-cache, no-store, must-revalidate/);
  assert.match(workerSource, /service-worker-allowed/);
  assert.match(cssSource, /\.app-shell:not\(\.public-readonly-shell\) > \.topbar[\s\S]{0,220}env\(safe-area-inset-top\)/);
  assert.match(cssSource, /\.pwa-offline-notice/);
  assert.match(cssSource, /\.pwa-install-guide/);
  assert.match(cssSource, /@media \(display-mode: standalone\) \{[\s\S]{0,320}body::before[\s\S]{0,240}background: var\(--app-status-bar-color\)/);
});

test("mobile map details clear competing bottom controls", () => {
  assert.match(pageSource, /publicLayoutAccess === "viewer" && selected \? "public-place-selected" : ""/);
  assert.match(pageSource, /publicLayoutAccess === "viewer" && !selected && <button type="button" className=\{`global-story-toggle/);
  assert.match(cssSource, /\.app-shell\.public-place-selected ~ \.pwa-install-button,\s*\.app-shell\.public-place-selected ~ \.pwa-install-guide \{ display: none; \}/);
  assert.match(cssSource, /\.pwa-install-button \{[\s\S]{0,220}bottom: calc\(42px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(cssSource, /\.pwa-install-guide \{ bottom: calc\(88px \+ env\(safe-area-inset-bottom\)\); \}/);
});
