import { readFile } from "node:fs/promises";

export const APP_CLIENT_SOURCE_GROUPS = Object.freeze({
  route: Object.freeze([
    "../app/page.tsx",
  ]),
  mapCore: Object.freeze([
    "../app/map/calibration/model.ts",
    "../app/map/core/element-defaults.ts",
    "../app/map/core/model.ts",
    "../app/map/core/types.ts",
  ]),
  editorDocument: Object.freeze([
    "../app/editor/document/main-hub-persistence.mjs",
    "../app/editor/document/map-element-identity.mjs",
    "../app/editor/document/rules.ts",
  ]),
  editorPersistence: Object.freeze([
    "../app/editor/persistence/editor-draft-restore.mjs",
    "../app/editor/persistence/local-autosave.mjs",
    "../app/editor/persistence/public-layout-client.ts",
    "../app/editor/persistence/use-local-autosave.ts",
    "../app/editor/persistence/use-map-settings-persistence.ts",
  ]),
  mapPresentation: Object.freeze([
    "../app/map-print-settings.ts",
    "../app/use-print-settings-persistence.ts",
    "../app/use-dense-label-settings-persistence.ts",
    "../app/map-render-layers.tsx",
  ]),
});

export const APP_CLIENT_SOURCE_PATHS = Object.freeze(Object.values(APP_CLIENT_SOURCE_GROUPS).flat());

export async function readAppClientSource() {
  const sources = await Promise.all(APP_CLIENT_SOURCE_PATHS.map((path) => (
    readFile(new URL(path, import.meta.url), "utf8")
  )));
  return sources.join("\n");
}
