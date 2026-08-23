import { readFile } from "node:fs/promises";

export const APP_CLIENT_SOURCE_GROUPS = Object.freeze({
  route: Object.freeze([
    "../app/page.tsx",
  ]),
  publicUi: Object.freeze([
    "../app/public/explorer-activity-content.tsx",
    "../app/public/explorer-panel.tsx",
    "../app/public/navigation.mjs",
    "../app/public/place-category.mjs",
    "../app/public/place-detail-content.tsx",
    "../app/public/place-focus.mjs",
    "../app/public/place-sheet.tsx",
    "../app/public/use-public-navigation-actions.ts",
    "../app/public/use-public-navigation-lifecycle.ts",
    "../app/public/use-public-place-workspace.ts",
  ]),
  contentClient: Object.freeze([
    "../app/content/client.ts",
    "../app/content/types.ts",
    "../app/content/use-explorer-content.ts",
    "../app/content/use-place-content-lifecycle.ts",
    "../app/content/use-place-event-request-actions.ts",
    "../app/content/use-place-story-actions.ts",
  ]),
  media: Object.freeze([
    "../app/media/photo-processing.ts",
  ]),
  placeDirectory: Object.freeze([
    "../app/place-directory/model.ts",
  ]),
  mapCore: Object.freeze([
    "../app/map/calibration/model.ts",
    "../app/map/core/element-defaults.ts",
    "../app/map/core/model.ts",
    "../app/map/core/types.ts",
  ]),
  editorDocument: Object.freeze([
    "../app/editor/document/bootstrap.ts",
    "../app/editor/document/main-hub-persistence.mjs",
    "../app/editor/document/map-element-identity.mjs",
    "../app/editor/document/rules.ts",
    "../app/editor/document/use-editor-document-state.ts",
  ]),
  editorPlaces: Object.freeze([
    "../app/editor/places/actions.ts",
  ]),
  editorPersistence: Object.freeze([
    "../app/editor/persistence/editor-draft-restore.mjs",
    "../app/editor/persistence/local-autosave.mjs",
    "../app/editor/persistence/public-layout-client.ts",
    "../app/editor/persistence/use-application-bootstrap.ts",
    "../app/editor/persistence/use-local-autosave.ts",
    "../app/editor/persistence/use-map-settings-persistence.ts",
  ]),
  editorWorkspace: Object.freeze([
    "../app/editor/workspace/use-admin-map-asset-actions.ts",
    "../app/editor/workspace/use-admin-output-workspace.ts",
    "../app/editor/workspace/use-editor-map-edit-actions.ts",
  ]),
  mapLabels: Object.freeze([
    "../app/map/labels/clusters.ts",
    "../app/map/labels/density.mjs",
    "../app/map/labels/dense-density.mjs",
    "../app/map/labels/dense-placement.mjs",
    "../app/map/labels/dense-viewport.mjs",
    "../app/map/labels/geometry.ts",
    "../app/map/labels/use-settings-persistence.ts",
  ]),
  mapInteraction: Object.freeze([
    "../app/map/interaction/stage-transform.mjs",
    "../app/map/interaction/use-map-interaction-actions.ts",
    "../app/map/interaction/use-map-transform-controller.ts",
  ]),
  mapPrint: Object.freeze([
    "../app/map/print/audit.ts",
    "../app/map/print/export.ts",
    "../app/map/print/settings.ts",
    "../app/map/print/use-settings-persistence.ts",
  ]),
  mapRendering: Object.freeze([
    "../app/map/rendering/base-map-quality.mjs",
    "../app/map/rendering/layers.tsx",
    "../app/map/rendering/mobile-marker-density.mjs",
    "../app/map/rendering/mobile-render-budget.mjs",
    "../app/map/rendering/mobile-render.ts",
    "../app/map/rendering/performance-diagnostics.mjs",
  ]),
  mapWorkspace: Object.freeze([
    "../app/map/workspace/use-map-runtime-lifecycle.ts",
    "../app/map/workspace/use-map-workspace-model.ts",
  ]),
});

export const APP_CLIENT_SOURCE_PATHS = Object.freeze(Object.values(APP_CLIENT_SOURCE_GROUPS).flat());

export async function readAppClientSource() {
  const sources = await Promise.all(APP_CLIENT_SOURCE_PATHS.map((path) => (
    readFile(new URL(path, import.meta.url), "utf8")
  )));
  return sources.join("\n");
}
