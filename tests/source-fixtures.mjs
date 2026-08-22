import { readFile } from "node:fs/promises";

export const APP_CLIENT_SOURCE_PATHS = Object.freeze([
  "../app/page.tsx",
  "../app/map-calibration.ts",
  "../app/map-model.ts",
]);

export async function readAppClientSource() {
  const sources = await Promise.all(APP_CLIENT_SOURCE_PATHS.map((path) => (
    readFile(new URL(path, import.meta.url), "utf8")
  )));
  return sources.join("\n");
}
