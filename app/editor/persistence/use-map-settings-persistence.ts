"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizePlaceName } from "../../core-landmarks";
import {
  CALIBRATION_LANDMARK_NAMES,
  PRIMARY_CALIBRATION_NAMES,
  type CalibrationPoint,
} from "../../map/calibration/model";
import type {
  DirectoryPlace,
  LandmarkDefaultPosition,
  LockedCoordinateSetting,
  MapElement,
  PlacementOverride,
  PublicLayoutAccess,
} from "../../map/core/types";
import {
  applyLockedCoordinateSettings,
  applyPlacementOverrides,
  lockedCoordinateSettingsFor,
  sanitizePlacementOverrides,
} from "../document/rules";

export const CALIBRATION_SETTINGS_API = "/api/calibration-settings";
export const LOCKED_COORDINATE_SETTINGS_API = "/api/locked-coordinate-settings";
export const PLACEMENT_SETTINGS_API = "/api/placement-settings";
export const CALIBRATION_SETTINGS_KEY = "jeju-wondosim-map-review:calibration-settings:v1";
export const LOCKED_COORDINATE_SETTINGS_KEY = "jeju-wondosim-map-review:locked-coordinate-settings:v1";
export const PLACEMENT_SETTINGS_KEY = "jeju-wondosim-map-review:placement-settings:v1";

type MutableRef<T> = { current: T };
type StorageState = "loading" | "persistent" | "local";

type UseMapSettingsPersistenceOptions = {
  hydrated: boolean;
  publicLayoutAccess: PublicLayoutAccess;
  calibrationPoints: CalibrationPoint[];
  landmarkDefaultPositions: LandmarkDefaultPosition[];
  elements: MapElement[];
  placementOverrides: PlacementOverride[];
  calibrationPointsRef: MutableRef<CalibrationPoint[]>;
  elementsRef: MutableRef<MapElement[]>;
  placesRef: MutableRef<DirectoryPlace[]>;
  placementOverridesRef: MutableRef<PlacementOverride[]>;
  localCalibrationUpdatedAtRef: MutableRef<number>;
  localLockedCoordinatesUpdatedAtRef: MutableRef<number>;
  localPlacementUpdatedAtRef: MutableRef<number>;
  setCalibrationPoints: (points: CalibrationPoint[]) => void;
  replaceLandmarkDefaults: (updater: (current: LandmarkDefaultPosition[]) => LandmarkDefaultPosition[]) => void;
  replaceElements: (updater: (current: MapElement[]) => MapElement[]) => void;
  replacePlacementOverrides: (updater: (current: PlacementOverride[]) => PlacementOverride[]) => void;
  ensureMainHubMapElement: (elements: MapElement[], places: DirectoryPlace[]) => MapElement[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function useMapSettingsPersistence({
  hydrated,
  publicLayoutAccess,
  calibrationPoints,
  landmarkDefaultPositions,
  elements,
  placementOverrides,
  calibrationPointsRef,
  elementsRef,
  placesRef,
  placementOverridesRef,
  localCalibrationUpdatedAtRef,
  localLockedCoordinatesUpdatedAtRef,
  localPlacementUpdatedAtRef,
  setCalibrationPoints,
  replaceLandmarkDefaults,
  replaceElements,
  replacePlacementOverrides,
  ensureMainHubMapElement,
}: UseMapSettingsPersistenceOptions) {
  const [primaryCalibrationStorage, setPrimaryCalibrationStorage] = useState<StorageState>("loading");
  const [primaryCalibrationRemoteReady, setPrimaryCalibrationRemoteReady] = useState(false);
  const [lockedCoordinateStorage, setLockedCoordinateStorage] = useState<StorageState>("loading");
  const [lockedCoordinatesRemoteReady, setLockedCoordinatesRemoteReady] = useState(false);
  const [placementSettingsRemoteReady, setPlacementSettingsRemoteReady] = useState(false);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor" || !primaryCalibrationRemoteReady) return;
    try {
      const updatedAt = new Date().toISOString();
      localCalibrationUpdatedAtRef.current = Date.parse(updatedAt);
      localStorage.setItem(CALIBRATION_SETTINGS_KEY, JSON.stringify({
        calibrationPoints,
        landmarkDefaultPositions,
        updatedAt,
      }));
    } catch {}
  }, [
    calibrationPoints,
    hydrated,
    landmarkDefaultPositions,
    localCalibrationUpdatedAtRef,
    primaryCalibrationRemoteReady,
    publicLayoutAccess,
  ]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor") return;
    let cancelled = false;
    fetch(CALIBRATION_SETTINGS_API, { cache: "no-store" })
      .then(async (response) => response.ok
        ? await response.json() as { points?: CalibrationPoint[]; updatedAt?: string | null }
        : null)
      .then((payload) => {
        if (cancelled) return;
        const remotePoints = Array.isArray(payload?.points)
          ? payload.points.filter((point) => PRIMARY_CALIBRATION_NAMES.has(point.name))
          : [];
        const remoteUpdatedAt = Date.parse(payload?.updatedAt ?? "") || 0;
        const shouldRestoreRemote = remotePoints.length === CALIBRATION_LANDMARK_NAMES.length
          && (localCalibrationUpdatedAtRef.current === 0 || remoteUpdatedAt >= localCalibrationUpdatedAtRef.current);
        if (shouldRestoreRemote) {
          const byName = new Map(remotePoints.map((point) => [point.name, point]));
          const restored = calibrationPointsRef.current.map((point) => {
            const remote = byName.get(point.name);
            return remote ? {
              ...point,
              sourceX: clamp(remote.sourceX, 0, 100),
              sourceY: clamp(remote.sourceY, 0, 100),
              targetX: clamp(remote.targetX, 0, 100),
              targetY: clamp(remote.targetY, 0, 100),
            } : point;
          });
          calibrationPointsRef.current = restored;
          setCalibrationPoints(restored);
          replaceLandmarkDefaults((current) => current.map((position) => {
            const remote = byName.get(position.name);
            return remote ? { ...position, x: clamp(remote.targetX, 0, 100), y: clamp(remote.targetY, 0, 100) } : position;
          }));
          replaceElements((current) => current.map((element) => {
            const remote = byName.get(normalizePlaceName(element.name));
            if (!remote) return element;
            const offsetX = element.x - element.anchorX;
            const offsetY = element.y - element.anchorY;
            return {
              ...element,
              anchorX: clamp(remote.targetX, 0, 100),
              anchorY: clamp(remote.targetY, 0, 100),
              x: clamp(remote.targetX + offsetX, 0, 100),
              y: clamp(remote.targetY + offsetY, 0, 100),
            };
          }));
          localCalibrationUpdatedAtRef.current = remoteUpdatedAt;
        }
        setPrimaryCalibrationStorage(payload ? "persistent" : "local");
        setPrimaryCalibrationRemoteReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPrimaryCalibrationStorage("local");
        setPrimaryCalibrationRemoteReady(true);
      });
    return () => { cancelled = true; };
  }, [
    calibrationPointsRef,
    hydrated,
    localCalibrationUpdatedAtRef,
    publicLayoutAccess,
    replaceElements,
    replaceLandmarkDefaults,
    setCalibrationPoints,
  ]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor" || !primaryCalibrationRemoteReady) return;
    const timer = window.setTimeout(() => {
      void fetch(CALIBRATION_SETTINGS_API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          points: calibrationPointsRef.current.map(({ name, sourceX, sourceY, targetX, targetY }) => (
            { name, sourceX, sourceY, targetX, targetY }
          )),
        }),
      }).then((response) => {
        setPrimaryCalibrationStorage(response.ok ? "persistent" : "local");
      }).catch(() => setPrimaryCalibrationStorage("local"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [calibrationPoints, calibrationPointsRef, hydrated, primaryCalibrationRemoteReady, publicLayoutAccess]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor") return;
    let cancelled = false;
    fetch(LOCKED_COORDINATE_SETTINGS_API, { cache: "no-store" })
      .then(async (response) => response.ok
        ? await response.json() as { settings?: LockedCoordinateSetting[]; updatedAt?: string | null }
        : null)
      .then((payload) => {
        if (cancelled) return;
        const remoteSettings = Array.isArray(payload?.settings) ? payload.settings : [];
        const remoteUpdatedAt = Date.parse(payload?.updatedAt ?? "") || 0;
        const shouldRestoreRemote = remoteUpdatedAt > 0
          && (localLockedCoordinatesUpdatedAtRef.current === 0
            || remoteUpdatedAt >= localLockedCoordinatesUpdatedAtRef.current);
        if (shouldRestoreRemote) {
          replaceElements((current) => applyLockedCoordinateSettings(
            current,
            remoteSettings,
            placesRef.current,
            placementOverridesRef.current,
          ));
          localLockedCoordinatesUpdatedAtRef.current = remoteUpdatedAt;
          try {
            localStorage.setItem(LOCKED_COORDINATE_SETTINGS_KEY, JSON.stringify({
              settings: remoteSettings,
              updatedAt: payload?.updatedAt,
            }));
          } catch {}
        }
        setLockedCoordinateStorage(payload ? "persistent" : "local");
        setLockedCoordinatesRemoteReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLockedCoordinateStorage("local");
        setLockedCoordinatesRemoteReady(true);
      });
    return () => { cancelled = true; };
  }, [
    hydrated,
    localLockedCoordinatesUpdatedAtRef,
    placementOverridesRef,
    placesRef,
    publicLayoutAccess,
    replaceElements,
  ]);

  const lockedCoordinateSignature = useMemo(
    () => JSON.stringify(lockedCoordinateSettingsFor(elements)),
    [elements],
  );

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor" || !lockedCoordinatesRemoteReady) return;
    const timer = window.setTimeout(() => {
      const settings = lockedCoordinateSettingsFor(elementsRef.current);
      const updatedAt = new Date().toISOString();
      localLockedCoordinatesUpdatedAtRef.current = Date.parse(updatedAt);
      try {
        localStorage.setItem(LOCKED_COORDINATE_SETTINGS_KEY, JSON.stringify({ settings, updatedAt }));
      } catch {}
      void fetch(LOCKED_COORDINATE_SETTINGS_API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings }),
      }).then((response) => {
        setLockedCoordinateStorage(response.ok ? "persistent" : "local");
      }).catch(() => setLockedCoordinateStorage("local"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    elementsRef,
    hydrated,
    localLockedCoordinatesUpdatedAtRef,
    lockedCoordinateSignature,
    lockedCoordinatesRemoteReady,
    publicLayoutAccess,
  ]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor") return;
    let cancelled = false;
    fetch(PLACEMENT_SETTINGS_API, { cache: "no-store" })
      .then(async (response) => response.ok
        ? await response.json() as { settings?: PlacementOverride[]; updatedAt?: string | null }
        : null)
      .then((payload) => {
        if (cancelled) return;
        const remoteSettings = sanitizePlacementOverrides(payload?.settings);
        const remoteUpdatedAt = Date.parse(payload?.updatedAt ?? "") || 0;
        const shouldRestoreRemote = remoteUpdatedAt > 0
          && (localPlacementUpdatedAtRef.current === 0 || remoteUpdatedAt >= localPlacementUpdatedAtRef.current);
        if (shouldRestoreRemote) {
          placementOverridesRef.current = remoteSettings;
          replacePlacementOverrides(() => remoteSettings);
          replaceElements((current) => ensureMainHubMapElement(
            applyPlacementOverrides(current, remoteSettings, true),
            placesRef.current,
          ));
          localPlacementUpdatedAtRef.current = remoteUpdatedAt;
          try {
            localStorage.setItem(PLACEMENT_SETTINGS_KEY, JSON.stringify({
              settings: remoteSettings,
              updatedAt: payload?.updatedAt,
            }));
          } catch {}
        }
        setPlacementSettingsRemoteReady(true);
      })
      .catch(() => {
        if (!cancelled) setPlacementSettingsRemoteReady(true);
      });
    return () => { cancelled = true; };
  }, [
    ensureMainHubMapElement,
    hydrated,
    localPlacementUpdatedAtRef,
    placementOverridesRef,
    placesRef,
    publicLayoutAccess,
    replaceElements,
    replacePlacementOverrides,
  ]);

  const placementSignature = useMemo(() => JSON.stringify(placementOverrides), [placementOverrides]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor" || !placementSettingsRemoteReady) return;
    const timer = window.setTimeout(() => {
      const settings = placementOverridesRef.current;
      const updatedAt = new Date().toISOString();
      localPlacementUpdatedAtRef.current = Date.parse(updatedAt);
      try {
        localStorage.setItem(PLACEMENT_SETTINGS_KEY, JSON.stringify({ settings, updatedAt }));
      } catch {}
      void fetch(PLACEMENT_SETTINGS_API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings }),
      }).catch(() => undefined);
    }, 550);
    return () => window.clearTimeout(timer);
  }, [
    hydrated,
    localPlacementUpdatedAtRef,
    placementSettingsRemoteReady,
    placementOverridesRef,
    placementSignature,
    publicLayoutAccess,
  ]);

  return {
    lockedCoordinateStorage,
    placementSettingsRemoteReady,
    primaryCalibrationStorage,
  };
}
