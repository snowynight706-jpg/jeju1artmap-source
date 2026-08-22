import { geocodedPlaces, projectGeographicCoordinates } from "./geocoded-places";
import { normalizePlaceName } from "./core-landmarks";

export const MAP_ASPECT = 8944 / 7324;

export type CalibrationPoint = {
  id: string;
  name: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  tier?: "primary" | "secondary" | "tertiary";
};

type CalibrationLandmarkDefault = {
  confirmed?: boolean;
  elementId: string;
  name: string;
  x: number;
  y: number;
};

type CalibrationMapElement = {
  anchorX: number;
  anchorY: number;
  category: string;
  directoryId?: string;
  id: string;
  locked: boolean;
  mapVisible: boolean;
  name: string;
};

type CalibrationDirectoryPlace = {
  id: string;
  latitude?: number;
  longitude?: number;
  name: string;
};

export const CALIBRATION_LANDMARK_NAMES = [
  "관덕정",
  "제주아트플랫폼",
  "탑동해변공연장",
  "탑동광장",
  "김만덕객주",
  "김만덕기념관",
] as const;

export const PRIMARY_CALIBRATION_NAMES = new Set<string>(CALIBRATION_LANDMARK_NAMES);

const persistedPrimaryCalibrationSeed: Record<(typeof CALIBRATION_LANDMARK_NAMES)[number], Omit<CalibrationPoint, "id" | "name" | "tier">> = {
  "관덕정": { sourceX: 32.74695652176581, sourceY: 34.92339449542698, targetX: 35.74958737983302, targetY: 59.189847489691005 },
  "제주아트플랫폼": { sourceX: 39.61521739129978, sourceY: 42.24770642203441, targetX: 41.70357577308721, targetY: 74.41225648694478 },
  "탑동해변공연장": { sourceX: 58.25, sourceY: 11.6, targetX: 51.61534016007473, targetY: 19.675915250183785 },
  "탑동광장": { sourceX: 57.098260869564854, sourceY: 12.513302752310512, targetX: 64.28211860238308, targetY: 15.970238020036858 },
  "김만덕객주": { sourceX: 81.05260869565093, sourceY: 19.982110091755693, targetX: 96.15791294866513, targetY: 27.816749269686078 },
  "김만덕기념관": { sourceX: 73.47217391303064, sourceY: 22.624770642198094, targetX: 89.3165328501865, targetY: 37.72972393275184 },
};

export const initialCalibrationPoints: CalibrationPoint[] = CALIBRATION_LANDMARK_NAMES.map((name, index) => {
  const persisted = persistedPrimaryCalibrationSeed[name];
  return {
    id: `calibration-${index + 1}`,
    name,
    ...persisted,
    tier: "primary" as const,
  };
});

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function buildEffectiveCalibrationPoints(
  primaryPoints: CalibrationPoint[],
  defaults: CalibrationLandmarkDefault[],
  elements: CalibrationMapElement[] = [],
  directoryPlaces: CalibrationDirectoryPlace[] = [],
) {
  const primaryNames = new Set(primaryPoints.map((point) => point.name));
  const secondaryPoints: CalibrationPoint[] = defaults.flatMap((position, index) => {
    if (!position.confirmed || primaryNames.has(position.name)) return [];
    const geocoded = geocodedPlaces[position.name];
    if (!geocoded) return [];
    return [{
      id: `secondary-${position.elementId || index}`,
      name: position.name,
      sourceX: geocoded.x,
      sourceY: geocoded.y,
      targetX: position.x,
      targetY: position.y,
      tier: "secondary" as const,
    }];
  });
  const establishedNames = new Set([...primaryNames, ...secondaryPoints.map((point) => point.name)]);
  const placesById = new Map(directoryPlaces.map((place) => [place.id, place]));
  const placesByName = new Map(directoryPlaces.map((place) => [normalizePlaceName(place.name), place]));
  const tertiaryNames = new Set<string>();
  const tertiaryPoints: CalibrationPoint[] = elements.flatMap((element) => {
    const name = normalizePlaceName(element.name);
    if (!element.locked || !element.mapVisible || establishedNames.has(name) || tertiaryNames.has(name)) return [];
    const place = (element.directoryId ? placesById.get(element.directoryId) : undefined) ?? placesByName.get(name);
    const geocoded = geocodedPlaces[name];
    const source = geocoded
      ? { x: geocoded.x, y: geocoded.y }
      : Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude)
        ? projectGeographicCoordinates(place!.latitude!, place!.longitude!)
        : null;
    if (!source || !Number.isFinite(element.anchorX) || !Number.isFinite(element.anchorY)) return [];
    tertiaryNames.add(name);
    return [{
      id: `tertiary-${element.id}`,
      name,
      sourceX: source.x,
      sourceY: source.y,
      targetX: element.anchorX,
      targetY: element.anchorY,
      tier: "tertiary" as const,
    }];
  });
  return [...primaryPoints.map((point) => ({ ...point, tier: "primary" as const })), ...secondaryPoints, ...tertiaryPoints];
}

export function canonicalAnchorForElement(
  element: CalibrationMapElement,
  primaryPoints: CalibrationPoint[],
  defaults: CalibrationLandmarkDefault[],
) {
  const normalizedName = normalizePlaceName(element.name);
  const primary = primaryPoints.find((point) => point.name === normalizedName);
  if (primary) return { x: primary.targetX, y: primary.targetY };
  if (element.category === "landmark") {
    const saved = defaults.find((position) => position.elementId === element.id || position.name === normalizedName);
    if (saved) return { x: saved.x, y: saved.y };
  }
  return { x: element.anchorX, y: element.anchorY };
}

function singleStageCalibratedCoordinates(sourceX: number, sourceY: number, points: CalibrationPoint[]) {
  if (!points.length) return { x: sourceX, y: sourceY };
  const exact = points.find((point) => Math.hypot(sourceX - point.sourceX, sourceY - point.sourceY) < 0.001);
  if (exact) return { x: exact.targetX, y: exact.targetY };
  let weightSum = 0;
  let dx = 0;
  let dy = 0;
  const localPoints = points.map((point) => {
    const distanceSquared = (sourceX - point.sourceX) ** 2 + ((sourceY - point.sourceY) / MAP_ASPECT) ** 2;
    return { point, distanceSquared };
  }).sort((a, b) => a.distanceSquared - b.distanceSquared).slice(0, Math.min(7, points.length));
  localPoints.forEach(({ point, distanceSquared }) => {
    const weight = 1 / Math.pow(Math.max(distanceSquared, 0.06), 1.22);
    weightSum += weight;
    dx += (point.targetX - point.sourceX) * weight;
    dy += (point.targetY - point.sourceY) * weight;
  });
  return {
    x: clamp(sourceX + dx / Math.max(weightSum, 1), 0, 100),
    y: clamp(sourceY + dy / Math.max(weightSum, 1), 0, 100),
  };
}

function applyLocalCalibrationStage(
  sourceX: number,
  sourceY: number,
  baseResult: { x: number; y: number },
  controls: CalibrationPoint[],
  projectControl: (point: CalibrationPoint) => { x: number; y: number },
  options: { radius: number; fadePower: number; maxControls: number; strength: number; maxCorrection: number },
) {
  if (!controls.length) return baseResult;
  const exact = controls.find((point) => Math.hypot(sourceX - point.sourceX, sourceY - point.sourceY) < 0.001);
  if (exact) return { x: exact.targetX, y: exact.targetY };

  const localControls = controls.map((point) => {
    const projected = projectControl(point);
    const distanceSquared = (baseResult.x - projected.x) ** 2 + ((baseResult.y - projected.y) / MAP_ASPECT) ** 2;
    return { distanceSquared, dx: point.targetX - projected.x, dy: point.targetY - projected.y };
  }).sort((a, b) => a.distanceSquared - b.distanceSquared).slice(0, options.maxControls);
  const nearestDistance = Math.sqrt(localControls[0]?.distanceSquared ?? Number.POSITIVE_INFINITY);
  const localFade = Math.pow(clamp(1 - nearestDistance / options.radius, 0, 1), options.fadePower);
  if (!localFade) return baseResult;
  let weightSum = 0;
  let dx = 0;
  let dy = 0;
  localControls.forEach((control) => {
    const weight = 1 / Math.pow(Math.max(control.distanceSquared, 0.05), 1.18);
    weightSum += weight;
    dx += control.dx * weight;
    dy += control.dy * weight;
  });
  const correctionX = clamp(dx / Math.max(weightSum, 1) * localFade * options.strength, -options.maxCorrection, options.maxCorrection);
  const correctionY = clamp(dy / Math.max(weightSum, 1) * localFade * options.strength, -options.maxCorrection, options.maxCorrection);
  return { x: clamp(baseResult.x + correctionX, 0, 100), y: clamp(baseResult.y + correctionY, 0, 100) };
}

export function calibratedCoordinates(sourceX: number, sourceY: number, points: CalibrationPoint[]) {
  const primaryPoints = points.filter((point) => point.tier !== "secondary" && point.tier !== "tertiary");
  const secondaryPoints = points.filter((point) => point.tier === "secondary");
  const tertiaryPoints = points.filter((point) => point.tier === "tertiary");
  const primaryResult = singleStageCalibratedCoordinates(sourceX, sourceY, primaryPoints);
  const secondaryResult = applyLocalCalibrationStage(sourceX, sourceY, primaryResult, secondaryPoints, (point) => (
    singleStageCalibratedCoordinates(point.sourceX, point.sourceY, primaryPoints)
  ), { radius: 32, fadePower: 1.35, maxControls: 4, strength: 1, maxCorrection: 100 });
  return applyLocalCalibrationStage(sourceX, sourceY, secondaryResult, tertiaryPoints, (point) => {
    const projectedPrimary = singleStageCalibratedCoordinates(point.sourceX, point.sourceY, primaryPoints);
    return applyLocalCalibrationStage(point.sourceX, point.sourceY, projectedPrimary, secondaryPoints, (secondaryPoint) => (
      singleStageCalibratedCoordinates(secondaryPoint.sourceX, secondaryPoint.sourceY, primaryPoints)
    ), { radius: 32, fadePower: 1.35, maxControls: 4, strength: 1, maxCorrection: 100 });
  }, { radius: 18, fadePower: 1.65, maxControls: 3, strength: 0.72, maxCorrection: 4.5 });
}

export function calibratedPlaceCoordinates(
  name: string,
  latitude: number | undefined,
  longitude: number | undefined,
  points: CalibrationPoint[],
) {
  const reference = points.find((point) => point.name === normalizePlaceName(name));
  if (reference) return { x: reference.targetX, y: reference.targetY };
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const source = projectGeographicCoordinates(latitude!, longitude!);
  return calibratedCoordinates(source.x, source.y, points);
}

export function coordinatesToMap(
  latitude: number,
  longitude: number,
  calibrationPoints: CalibrationPoint[] = initialCalibrationPoints,
) {
  const { x, y } = projectGeographicCoordinates(latitude, longitude);
  return calibratedCoordinates(x, y, calibrationPoints);
}
