import { isCoreLandmarkName, normalizePlaceName } from "../core-landmarks";
import { geocodedPlaces } from "../geocoded-places";
import type { MasterDirectoryRow } from "../master-directory";
import { markerAssetIdForPlace, recommendedMarkerStyle, type BundledMarkerCategory, type BundledMarkerStyle } from "../marker-assets";
import { calibratedPlaceCoordinates, initialCalibrationPoints } from "../map/calibration/model";
import { isPrimaryHubLabel, type CategoryId } from "../map/core/model";
import type { DirectoryPlace, MapElement } from "../map/core/types";
import { consolidateMainHubDirectoryPlaces } from "../editor/document/main-hub-persistence.mjs";
import {
  ART_PLATFORM_FACILITY_NAMES,
  LPP_CANONICAL_NAME,
  MAIN_HUB_ROLE,
  directoryMetadataDefaults,
  isPrimaryPublicCategory,
  mergeDirectoryMetadata,
  normalizeDirectoryCategory,
  sanitizeAdditionalCategories,
  sanitizeConvenienceAttributes,
} from "../place-taxonomy";
import type { PlaceDirectoryRecord } from "../content/types";

export type PublicPlaceCategoryId = "culture" | "food" | "cafe" | "shop" | "convenience";
export type DirectoryEditorCategory = "culture" | "cafe" | "food" | "shop" | "other";

type DirectoryCatalogOptions = {
  legacyPlaces: DirectoryPlace[];
  supportPlaces: DirectoryPlace[];
  deletedPlaceNames: ReadonlySet<string>;
};

const areaFallbacks: Record<string, { x: number; y: number }> = {
  "관덕로·목관아": { x: 40, y: 59 },
  "칠성로·탑동": { x: 43, y: 35 },
  "중앙로 남측": { x: 48, y: 72 },
  "동문시장·동문로": { x: 65, y: 55 },
  "산지천·탐라문화광장·서부두": { x: 68, y: 38 },
  "삼도동": { x: 33, y: 82 },
  "이도동": { x: 67, y: 84 },
};

export function directoryCategory(category: CategoryId): CategoryId {
  return normalizeDirectoryCategory(category) as CategoryId;
}

export function withDirectoryMetadata(place: DirectoryPlace): DirectoryPlace {
  const category = directoryCategory(place.category);
  const defaults = directoryMetadataDefaults(place.name, category, place.subtype, place.description);
  const metadata = mergeDirectoryMetadata({
    ...(Object.prototype.hasOwnProperty.call(place, "additionalCategories") ? { additionalCategories: place.additionalCategories } : {}),
    ...(Object.prototype.hasOwnProperty.call(place, "convenienceAttributes") ? { convenienceAttributes: place.convenienceAttributes } : {}),
    locationGroupId: place.locationGroupId,
    mapAnchorId: place.mapAnchorId,
    featuredRole: place.featuredRole,
    ...(Object.prototype.hasOwnProperty.call(place, "aliases") ? { aliases: place.aliases } : {}),
  }, defaults);
  return { ...place, category, ...metadata };
}

export function createDirectoryCatalog({ legacyPlaces, supportPlaces, deletedPlaceNames }: DirectoryCatalogOptions) {
  const ensureSystemDirectoryPlaces = (places: DirectoryPlace[]) => {
    const normalized = consolidateMainHubDirectoryPlaces(places.map(withDirectoryMetadata)) as DirectoryPlace[];
    const names = new Set(normalized.map((place) => normalizePlaceName(place.name)));
    const hasArtPlatform = names.has("제주아트플랫폼");
    const additions = legacyPlaces
      .filter((place) => normalizePlaceName(place.name) === LPP_CANONICAL_NAME
        || (hasArtPlatform && (ART_PLATFORM_FACILITY_NAMES as readonly string[]).includes(normalizePlaceName(place.name))))
      .filter((place) => !names.has(normalizePlaceName(place.name)))
      .map(withDirectoryMetadata);
    return [...normalized, ...additions];
  };

  const buildDirectoryPlaces = (rows: MasterDirectoryRow[]) => {
    const legacyByName = new Map(legacyPlaces.map((place) => [normalizePlaceName(place.name), place]));
    const built = rows
      .filter((row) => row.address && !deletedPlaceNames.has(normalizePlaceName(row.name)))
      .map((row): DirectoryPlace => {
        const name = normalizePlaceName(row.name);
        const legacy = legacyByName.get(name);
        const geocoded = geocodedPlaces[name] ?? geocodedPlaces[row.name];
        const fallback = areaFallbacks[row.area] ?? { x: 50, y: 50 };
        return {
          id: legacy?.id ?? row.id,
          name,
          category: directoryCategory(row.category),
          area: row.area,
          address: row.address,
          x: geocoded?.x ?? legacy?.x ?? fallback.x,
          y: geocoded?.y ?? legacy?.y ?? fallback.y,
          coordinateStatus: isCoreLandmarkName(name) ? "landmark" : geocoded ? "geocoded" : legacy?.coordinateStatus === "landmark" ? "landmark" : "unresolved",
          latitude: geocoded?.latitude,
          longitude: geocoded?.longitude,
          sourceLabel: `마스터DB · ${row.subtype}`,
          sourceUrl: row.sourceUrl,
          subtype: row.subtype,
          priority: row.priority,
          description: row.description,
          operatingInfo: row.operatingInfo,
          notes: row.notes,
          mapUrl: row.mapUrl,
          checkedAt: row.checkedAt,
        };
      });
    const names = new Set(built.map((place) => place.name));
    return ensureSystemDirectoryPlaces([
      ...built,
      ...legacyPlaces.filter((place) => !names.has(normalizePlaceName(place.name))).map((place) => {
        const geocoded = geocodedPlaces[normalizePlaceName(place.name)];
        const category = directoryCategory(place.category);
        return geocoded
          ? { ...place, ...geocoded, category, coordinateStatus: isCoreLandmarkName(place.name) ? "landmark" as const : "geocoded" as const }
          : { ...place, category, coordinateStatus: isCoreLandmarkName(place.name) ? "landmark" as const : place.coordinateStatus };
      }),
      ...supportPlaces.filter((place) => !names.has(normalizePlaceName(place.name))).map((place) => {
        const geocoded = geocodedPlaces[place.name];
        return geocoded ? { ...place, ...geocoded, coordinateStatus: "geocoded" as const } : { ...place, coordinateStatus: "unresolved" as const };
      }),
    ]);
  };

  return { buildDirectoryPlaces, ensureSystemDirectoryPlaces };
}

export function directoryRecordFromPlace(place: DirectoryPlace): PlaceDirectoryRecord {
  const name = normalizePlaceName(place.name);
  const decorated = withDirectoryMetadata({ ...place, name });
  return {
    id: decorated.id,
    name,
    category: directoryCategory(decorated.category),
    area: decorated.area ?? "",
    address: decorated.address ?? "",
    subtype: decorated.subtype ?? "",
    priority: decorated.priority ?? "",
    description: decorated.description ?? "",
    operatingInfo: decorated.operatingInfo ?? "",
    notes: decorated.notes ?? "",
    sourceUrl: decorated.sourceUrl ?? "",
    mapUrl: decorated.mapUrl ?? "",
    checkedAt: decorated.checkedAt ?? "",
    additionalCategories: sanitizeAdditionalCategories(decorated.additionalCategories),
    convenienceAttributes: sanitizeConvenienceAttributes(decorated.convenienceAttributes),
    locationGroupId: decorated.locationGroupId ?? "",
    mapAnchorId: decorated.mapAnchorId ?? "",
    featuredRole: decorated.featuredRole ?? "",
    aliases: decorated.aliases ?? [],
  };
}

export function createDirectoryRecordMerger(
  defaultPlaces: DirectoryPlace[],
  ensureSystemDirectoryPlaces: (places: DirectoryPlace[]) => DirectoryPlace[],
) {
  const defaultById = new Map(defaultPlaces.map((place) => [place.id, place]));
  const defaultByName = new Map(defaultPlaces.map((place) => [normalizePlaceName(place.name), place]));
  return (records: PlaceDirectoryRecord[], current: DirectoryPlace[]): DirectoryPlace[] => {
    const currentById = new Map(current.map((place) => [place.id, place]));
    const currentByName = new Map(current.map((place) => [normalizePlaceName(place.name), place]));
    return ensureSystemDirectoryPlaces(records.map((record) => {
      const name = normalizePlaceName(record.name);
      const category = directoryCategory(record.category);
      const geocoded = geocodedPlaces[name];
      const calibrated = calibratedPlaceCoordinates(name, geocoded?.latitude, geocoded?.longitude, initialCalibrationPoints);
      const base = currentById.get(record.id)
        ?? currentByName.get(name)
        ?? defaultById.get(record.id)
        ?? defaultByName.get(name);
      const addressChanged = Boolean(base && base.address.trim() !== record.address.trim());
      return withDirectoryMetadata({
        ...(base ?? {
          x: calibrated?.x ?? geocoded?.x ?? 50,
          y: calibrated?.y ?? geocoded?.y ?? 50,
          coordinateStatus: geocoded ? "geocoded" as const : "unresolved" as const,
          latitude: geocoded?.latitude,
          longitude: geocoded?.longitude,
          sourceLabel: "내부 DB",
        }),
        ...record,
        name,
        category,
        sourceLabel: `내부 DB${record.subtype ? ` · ${record.subtype}` : ""}`,
        ...(addressChanged && base?.coordinateStatus !== "landmark" ? {
          coordinateStatus: "unresolved" as const,
          latitude: undefined,
          longitude: undefined,
        } : {}),
        ...(isCoreLandmarkName(name) ? { coordinateStatus: "landmark" as const } : {}),
      });
    }));
  };
}

export function databaseEditorCategoryForPlace(place: Pick<DirectoryPlace, "category">): DirectoryEditorCategory {
  const category = directoryCategory(place.category);
  return isPrimaryPublicCategory(category) ? category as Exclude<DirectoryEditorCategory, "other"> : "other";
}

export function mapCategoryForDirectoryPlace(place: Pick<DirectoryPlace, "name" | "category" | "featuredRole">): CategoryId {
  return isCoreLandmarkName(place.name) || place.featuredRole === MAIN_HUB_ROLE || isPrimaryHubLabel(place.name)
    ? "landmark"
    : place.category;
}

export function publicCategoryIdForPlace(place: DirectoryPlace, anchor: MapElement): PublicPlaceCategoryId {
  const primary = place.category === "landmark" ? anchor.category : place.category;
  if (
    primary === "culture"
    || primary === "landmark"
    || isCoreLandmarkName(place.name)
    || place.featuredRole === MAIN_HUB_ROLE
    || isPrimaryHubLabel(place.name)
  ) return "culture";
  if (primary === "food") return "food";
  if (primary === "cafe") return "cafe";
  if (primary === "shop") return "shop";
  return "convenience";
}

export function defaultMarkerAssetId(category: CategoryId, style: BundledMarkerStyle = recommendedMarkerStyle, descriptor = "") {
  return category !== "landmark"
    ? markerAssetIdForPlace(style, category as BundledMarkerCategory, descriptor)
    : null;
}

export function createDirectoryMarkerPolicy(
  canonicalMarkerAssetIds: ReadonlySet<string>,
  landmarkAssetIdByName: ReadonlyMap<string, string>,
) {
  return (element: MapElement, category: CategoryId) => {
    if (category === "landmark") {
      if (element.assetId && !canonicalMarkerAssetIds.has(element.assetId)) return element.assetId;
      return landmarkAssetIdByName.get(normalizePlaceName(element.name)) ?? null;
    }
    if (element.category === category) return element.assetId;
    if (element.category === "landmark" || canonicalMarkerAssetIds.has(element.assetId ?? "")) {
      return defaultMarkerAssetId(category, recommendedMarkerStyle, element.name);
    }
    return element.assetId;
  };
}
