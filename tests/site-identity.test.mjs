import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const identitySource = await readFile(new URL("../app/site-identity.ts", import.meta.url), "utf8");
const clientSource = await readFile(new URL("../app/editor/persistence/public-layout-client.ts", import.meta.url), "utf8");
const bootstrapSource = await readFile(new URL("../app/editor/persistence/use-application-bootstrap.ts", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/api/public-layout/route.ts", import.meta.url), "utf8");
const navigationSource = await readFile(new URL("../app/public/use-public-navigation-actions.ts", import.meta.url), "utf8");
const schemaSource = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../drizzle/0025_naive_king_cobra.sql", import.meta.url), "utf8");

test("site display names have a safe default and bounded normalization", () => {
  assert.match(identitySource, /DEFAULT_SITE_DISPLAY_NAME = "제주 원도심 맵"/);
  assert.match(identitySource, /SITE_DISPLAY_NAME_MAX_LENGTH = 40/);
  assert.match(identitySource, /replace\(\/\\s\+\/g, " "\)/);
  assert.match(identitySource, /normalized\.length < 2[\s\S]*normalized\.length > SITE_DISPLAY_NAME_MAX_LENGTH/);
});

test("site identity is stored in a revisioned singleton table", () => {
  assert.match(schemaSource, /sqliteTable\("site_identity_settings"[\s\S]*displayName: text\("display_name"\)\.notNull\(\)[\s\S]*revision: integer\("revision"\)\.notNull\(\)/);
  assert.match(migrationSource, /CREATE TABLE `site_identity_settings`/);
  assert.match(routeSource, /payload\?\.action === "save-site-identity"/);
  assert.match(routeSource, /WHERE site_identity_settings\.revision = \?/);
  assert.match(routeSource, /siteIdentity: parseSiteIdentity\(latest\)/);
});

test("the public bootstrap carries the site name without an extra page request", () => {
  assert.match(routeSource, /FROM site_identity_settings WHERE id = 1/);
  assert.match(routeSource, /labelDensityResult, siteIdentityResult, draftResult/);
  assert.match(routeSource, /siteIdentityRow: batchRow\(siteIdentityResult\)/);
  assert.match(clientSource, /siteIdentity\?: SiteIdentitySettings/);
  assert.match(bootstrapSource, /setSiteIdentity\(payload\?\.siteIdentity \?\? DEFAULT_SITE_IDENTITY\)/);
});

test("admin edits update browser, headers, and public share titles", () => {
  assert.match(pageSource, /<b id="site-identity-title">사이트 이름<\/b>/);
  assert.match(pageSource, /saveSiteIdentitySettings\(displayName, siteIdentity\.revision\)/);
  assert.match(pageSource, /document\.title = siteIdentity\.displayName/);
  assert.match(pageSource, /<strong>\{siteIdentity\.displayName\} 관리<\/strong>/);
  assert.match(pageSource, /<strong>\{siteIdentity\.displayName\}<\/strong>/);
  assert.match(navigationSource, /`\$\{selectedDisplayName\} · \$\{siteDisplayName\}`/);
});
