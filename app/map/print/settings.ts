import { normalizePlaceName } from "../../core-landmarks";
import type { MapElement } from "../core/types";

export type PrintMode = "auto" | "include" | "exclude";

export type PrintPlaceSetting = {
  key: string;
  directoryId?: string;
  name: string;
  recommended: boolean;
  markerMode: PrintMode;
  labelMode: PrintMode;
};

export function printSettingKey(target: Pick<MapElement, "directoryId" | "category" | "name">) {
  return target.directoryId?.trim()
    ? `directory:${target.directoryId.trim()}`
    : `name:${target.category}:${normalizePlaceName(target.name)}`;
}
