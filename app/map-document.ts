import { normalizePlaceName } from "./core-landmarks";
import { ensureIndependentMapElementIdentity, sameMapPlaceIdentity } from "./map-element-identity.mjs";
import { withoutMainHubPlacementOverrides } from "./main-hub-persistence.mjs";
import { PRIMARY_CALIBRATION_NAMES } from "./map-calibration";
import type {
  DirectoryPlace,
  DocumentState,
  LockedCoordinateSetting,
  MapElement,
  PlacementOverride,
} from "./map-types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function cloneDocument(document: DocumentState): DocumentState {
  return JSON.parse(JSON.stringify(document)) as DocumentState;
}

export function uniqueRuntimeId(
  prefix: "element" | "asset" | "review" | "db-place" | "requested-place",
  existingIds: Iterable<string>,
) {
  const used = new Set(existingIds);
  let candidate = "";
  do {
    const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    candidate = `${prefix}-${token}`;
  } while (used.has(candidate));
  return candidate;
}

function recoveredElementId(element: MapElement, index: number, used: Set<string>) {
  const identity = (element.directoryId || `${element.category}-${normalizePlaceName(element.name)}`)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9가-힣_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52) || "marker";
  let candidate = `recovered-${identity}-${index + 1}`;
  let suffix = 2;
  while (used.has(candidate)) candidate = `recovered-${identity}-${index + 1}-${suffix++}`;
  return candidate;
}

export function ensureIndependentElementIdentity(elements: MapElement[]) {
  return ensureIndependentMapElementIdentity(elements, { recoverId: recoveredElementId }) as MapElement[];
}

export function isSameMapPlace(
  left: Pick<MapElement, "directoryId" | "name">,
  right: Pick<MapElement, "directoryId" | "name">,
) {
  return sameMapPlaceIdentity(left, right, normalizePlaceName);
}

export function placementKey(target: MapElement | DirectoryPlace) {
  const directoryId = "coordinateStatus" in target ? target.id?.trim() : target.directoryId?.trim();
  return directoryId
    ? `directory:${directoryId}`
    : `name:${target.category}:${normalizePlaceName(target.name)}`;
}

export function sanitizePlacementOverrides(value: unknown): PlacementOverride[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.flatMap((item): PlacementOverride[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<PlacementOverride>;
    const key = typeof candidate.key === "string" ? candidate.key.trim().slice(0, 220) : "";
    const name = typeof candidate.name === "string" ? normalizePlaceName(candidate.name).slice(0, 160) : "";
    if (!key || !name || (candidate.state !== "unplaced" && candidate.state !== "deleted")) return [];
    const directoryId = typeof candidate.directoryId === "string" && candidate.directoryId.trim()
      ? candidate.directoryId.trim().slice(0, 180)
      : undefined;
    return [{ key, ...(directoryId ? { directoryId } : {}), name, state: candidate.state }];
  });
  return withoutMainHubPlacementOverrides(
    [...new Map(normalized.map((item) => [item.key, item])).values()],
  ).sort((a, b) => a.key.localeCompare(b.key));
}

export function applyPlacementOverrides(
  elements: MapElement[],
  overrides: PlacementOverride[],
  authoritative = false,
) {
  const byKey = new Map(overrides.map((setting) => [setting.key, setting.state]));
  return elements.flatMap((element): MapElement[] => {
    const state = byKey.get(placementKey(element));
    if (state === "deleted") return [];
    return [{ ...element, ...(state === "unplaced" ? { mapVisible: false } : authoritative ? { mapVisible: true } : {}) }];
  });
}

export function lockedCoordinateKey(element: Pick<MapElement, "directoryId" | "category" | "name">) {
  const directoryId = element.directoryId?.trim();
  return directoryId
    ? `directory:${directoryId}`
    : `name:${element.category}:${normalizePlaceName(element.name)}`;
}

export function lockedCoordinateSettingsFor(elements: MapElement[]): LockedCoordinateSetting[] {
  return elements
    .filter((element) => element.locked && !PRIMARY_CALIBRATION_NAMES.has(normalizePlaceName(element.name)))
    .map((element) => ({
      key: lockedCoordinateKey(element),
      ...(element.directoryId ? { directoryId: element.directoryId } : {}),
      name: normalizePlaceName(element.name),
      category: element.category,
      anchorX: clamp(element.anchorX, 0, 100),
      anchorY: clamp(element.anchorY, 0, 100),
      x: clamp(element.x, 0, 100),
      y: clamp(element.y, 0, 100),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
