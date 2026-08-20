import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const adminAuthSource = await readFile(new URL("../app/admin-auth.ts", import.meta.url), "utf8");
const serviceWorkerSource = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");

test("administrator accounts can enter the public deployment view and return", () => {
  assert.match(pageSource, /const PUBLIC_VIEW_COOKIE = "jfac_map_public_view"/);
  assert.match(pageSource, />배포본 보기<\/button>/);
  assert.match(pageSource, />관리자 화면으로<\/button>/);
  assert.match(pageSource, /switchPublicView\(true\)/);
  assert.match(pageSource, /switchPublicView\(false\)/);
});

test("public deployment view downgrades every server-side admin permission check", () => {
  assert.match(adminAuthSource, /const PUBLIC_VIEW_COOKIE = "jfac_map_public_view"/);
  assert.match(adminAuthSource, /cookieValue\(request, PUBLIC_VIEW_COOKIE\) === "1"/);
  assert.match(adminAuthSource, /return \{ allowed: false, actor: null, method: null \}/);
});

test("the revised Chilseong-ro asset invalidates the previous PWA image cache", () => {
  assert.match(serviceWorkerSource, /const CACHE_VERSION = "2026-08-20-v5"/);
});
