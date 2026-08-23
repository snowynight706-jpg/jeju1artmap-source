"use client";

import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import { normalizePlaceName } from "../../core-landmarks";
import {
  buildEffectiveCalibrationPoints,
  calibratedPlaceCoordinates,
  initialCalibrationPoints,
  type CalibrationPoint,
} from "../../map/calibration/model";
import type {
  DenseLabelPosition,
  DirectoryPlace,
  DocumentState,
  LandmarkDefaultPosition,
  MapAsset,
  MapElement,
  PlacementOverride,
  ReviewNote,
} from "../../map/core/types";
import {
  applyPlacementOverrides,
  cloneDocument,
  ensureIndependentElementIdentity,
  sanitizePlacementOverrides,
} from "./rules";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type MutableRef<T> = { current: T };

type UseEditorDocumentStateOptions = {
  elements: MapElement[];
  assets: MapAsset[];
  reviewNotes: ReviewNote[];
  directoryPlaces: DirectoryPlace[];
  calibrationPoints: CalibrationPoint[];
  landmarkDefaultPositions: LandmarkDefaultPosition[];
  denseLabelPositions: DenseLabelPosition[];
  denseLabelExcludedIds: string[];
  placementOverrides: PlacementOverride[];
  elementsRef: MutableRef<MapElement[]>;
  assetsRef: MutableRef<MapAsset[]>;
  notesRef: MutableRef<ReviewNote[]>;
  placesRef: MutableRef<DirectoryPlace[]>;
  calibrationPointsRef: MutableRef<CalibrationPoint[]>;
  landmarkDefaultsRef: MutableRef<LandmarkDefaultPosition[]>;
  denseLabelPositionsRef: MutableRef<DenseLabelPosition[]>;
  denseLabelExcludedIdsRef: MutableRef<string[]>;
  placementOverridesRef: MutableRef<PlacementOverride[]>;
  factoryLandmarkDefaultPositions: LandmarkDefaultPosition[];
  defaultDirectoryPlaces: DirectoryPlace[];
  supportDirectoryPlaces: DirectoryPlace[];
  sanitizeDocument: (document: DocumentState) => DocumentState;
  ensureSystemDirectoryPlaces: (places: DirectoryPlace[]) => DirectoryPlace[];
  ensureMainHubMapElement: (elements: MapElement[], places: DirectoryPlace[]) => MapElement[];
  setElements: StateSetter<MapElement[]>;
  setAssets: StateSetter<MapAsset[]>;
  setReviewNotes: StateSetter<ReviewNote[]>;
  setDirectoryPlaces: StateSetter<DirectoryPlace[]>;
  setCalibrationPoints: StateSetter<CalibrationPoint[]>;
  setLandmarkDefaultPositions: StateSetter<LandmarkDefaultPosition[]>;
  setDenseLabelPositions: StateSetter<DenseLabelPosition[]>;
  setDenseLabelExcludedIds: StateSetter<string[]>;
  setPlacementOverrides: StateSetter<PlacementOverride[]>;
  setUndoStack: StateSetter<DocumentState[]>;
  setRedoStack: StateSetter<DocumentState[]>;
  setCalibrationDirty: StateSetter<boolean>;
  setSelectedId: StateSetter<string | null>;
  setSelectedFacilityId: StateSetter<string | null>;
  setSelectedNoteId: StateSetter<string | null>;
  setSelectedDenseLabelId: StateSetter<string | null>;
};

export function useEditorDocumentState(options: UseEditorDocumentStateOptions) {
  const {
    elements,
    assets,
    reviewNotes,
    directoryPlaces,
    calibrationPoints,
    landmarkDefaultPositions,
    denseLabelPositions,
    denseLabelExcludedIds,
    placementOverrides,
    elementsRef,
    assetsRef,
    notesRef,
    placesRef,
    calibrationPointsRef,
    landmarkDefaultsRef,
    denseLabelPositionsRef,
    denseLabelExcludedIdsRef,
    placementOverridesRef,
    factoryLandmarkDefaultPositions,
    defaultDirectoryPlaces,
    supportDirectoryPlaces,
    sanitizeDocument,
    ensureSystemDirectoryPlaces,
    ensureMainHubMapElement,
    setElements,
    setAssets,
    setReviewNotes,
    setDirectoryPlaces,
    setCalibrationPoints,
    setLandmarkDefaultPositions,
    setDenseLabelPositions,
    setDenseLabelExcludedIds,
    setPlacementOverrides,
    setUndoStack,
    setRedoStack,
    setCalibrationDirty,
    setSelectedId,
    setSelectedFacilityId,
    setSelectedNoteId,
    setSelectedDenseLabelId,
  } = options;

  const currentDocument = useCallback((): DocumentState => ({
    elements: elementsRef.current,
    assets: assetsRef.current,
    reviewNotes: notesRef.current,
    directoryPlaces: placesRef.current,
    calibrationPoints: calibrationPointsRef.current,
    landmarkDefaultPositions: landmarkDefaultsRef.current,
    denseLabelPositions: denseLabelPositionsRef.current,
    denseLabelExcludedIds: denseLabelExcludedIdsRef.current,
    placementOverrides: placementOverridesRef.current,
  }), [assetsRef, calibrationPointsRef, denseLabelExcludedIdsRef, denseLabelPositionsRef, elementsRef, landmarkDefaultsRef, notesRef, placementOverridesRef, placesRef]);

  const setDocument = useCallback((document: DocumentState) => {
    const clean = sanitizeDocument(cloneDocument(document));
    const hadCalibration = clean.calibrationPoints?.length === initialCalibrationPoints.length;
    const restoredCalibrationPoints = hadCalibration ? clean.calibrationPoints! : initialCalibrationPoints;
    const storedLandmarkDefaults = Array.isArray(clean.landmarkDefaultPositions) && clean.landmarkDefaultPositions.length
      ? clean.landmarkDefaultPositions.map((position) => {
          const matchingLandmark = clean.elements.find((element) => (
            element.category === "landmark" && normalizePlaceName(element.name) === normalizePlaceName(position.name)
          ));
          return {
            ...position,
            elementId: matchingLandmark?.id ?? position.elementId,
            x: clamp(position.x, 0, 100),
            y: clamp(position.y, 0, 100),
            confirmed: Boolean(position.confirmed),
          };
        })
      : [];
    const storedLandmarkDefaultNames = new Set(storedLandmarkDefaults.map((position) => normalizePlaceName(position.name)));
    const restoredLandmarkDefaults = [
      ...storedLandmarkDefaults,
      ...factoryLandmarkDefaultPositions
        .filter((position) => !storedLandmarkDefaultNames.has(normalizePlaceName(position.name)))
        .map((position) => ({ ...position })),
    ];
    const restoredPlaces = clean.directoryPlaces?.length ? clean.directoryPlaces : defaultDirectoryPlaces;
    const restoredNames = new Set(restoredPlaces.map((place) => normalizePlaceName(place.name)));
    const restoredPlaceSet = ensureSystemDirectoryPlaces([
      ...restoredPlaces,
      ...supportDirectoryPlaces.filter((place) => !restoredNames.has(normalizePlaceName(place.name))),
    ]);
    const restoredEffectivePoints = buildEffectiveCalibrationPoints(restoredCalibrationPoints, restoredLandmarkDefaults, clean.elements, restoredPlaceSet);
    const mergedPlaces = restoredPlaceSet.map((place) => {
      if (hadCalibration) return place;
      const mapped = calibratedPlaceCoordinates(place.name, place.latitude, place.longitude, restoredEffectivePoints);
      return mapped ? { ...place, ...mapped } : place;
    });
    const migratedPlacesByName = new Map(mergedPlaces.map((place) => [normalizePlaceName(place.name), place]));
    const migratedElementsBeforePlacement = hadCalibration ? clean.elements : clean.elements.map((element) => {
      const reference = restoredEffectivePoints.find((point) => point.name === normalizePlaceName(element.name));
      const place = migratedPlacesByName.get(normalizePlaceName(element.name));
      const mapped = reference ? { x: reference.targetX, y: reference.targetY } : place ? { x: place.x, y: place.y } : null;
      if (!mapped) return element;
      const followsAnchor = Math.hypot(element.x - element.anchorX, element.y - element.anchorY) < 0.18;
      const isDefaultPlacement = /^(default-landmark|starter-marker)-/.test(element.id) || /초기 구성용|초기 배치/.test(element.memo ?? "");
      return { ...element, anchorX: mapped.x, anchorY: mapped.y, ...((reference || followsAnchor || isDefaultPlacement) ? { x: mapped.x, y: mapped.y } : {}) };
    });
    const restoredPlacementOverrides = sanitizePlacementOverrides(clean.placementOverrides);
    const migratedElements = ensureMainHubMapElement(
      applyPlacementOverrides(migratedElementsBeforePlacement, restoredPlacementOverrides),
      mergedPlaces,
    );
    elementsRef.current = migratedElements;
    assetsRef.current = clean.assets;
    notesRef.current = clean.reviewNotes;
    placesRef.current = mergedPlaces;
    calibrationPointsRef.current = restoredCalibrationPoints;
    landmarkDefaultsRef.current = restoredLandmarkDefaults;
    const restoredDenseLabelPositions = clean.denseLabelPositions ?? [];
    const restoredDenseLabelExcludedIds = clean.denseLabelExcludedIds ?? [];
    denseLabelPositionsRef.current = restoredDenseLabelPositions;
    denseLabelExcludedIdsRef.current = restoredDenseLabelExcludedIds;
    placementOverridesRef.current = restoredPlacementOverrides;
    setElements(migratedElements);
    setAssets(clean.assets);
    setReviewNotes(clean.reviewNotes);
    setDirectoryPlaces(placesRef.current);
    setCalibrationPoints(restoredCalibrationPoints);
    setLandmarkDefaultPositions(restoredLandmarkDefaults);
    setDenseLabelPositions(restoredDenseLabelPositions);
    setDenseLabelExcludedIds(restoredDenseLabelExcludedIds);
    setPlacementOverrides(restoredPlacementOverrides);
    setCalibrationDirty(false);
    setSelectedId(null);
    setSelectedFacilityId(null);
    setSelectedNoteId(null);
    setSelectedDenseLabelId(null);
  }, [assetsRef, calibrationPointsRef, defaultDirectoryPlaces, denseLabelExcludedIdsRef, denseLabelPositionsRef, elementsRef, ensureMainHubMapElement, ensureSystemDirectoryPlaces, factoryLandmarkDefaultPositions, landmarkDefaultsRef, notesRef, placementOverridesRef, placesRef, sanitizeDocument, setAssets, setCalibrationDirty, setCalibrationPoints, setDenseLabelExcludedIds, setDenseLabelPositions, setDirectoryPlaces, setElements, setLandmarkDefaultPositions, setPlacementOverrides, setReviewNotes, setSelectedDenseLabelId, setSelectedFacilityId, setSelectedId, setSelectedNoteId, supportDirectoryPlaces]);

  const pushHistory = useCallback(() => {
    const snapshot = cloneDocument(currentDocument());
    setUndoStack((current) => [...current.slice(-59), snapshot]);
    setRedoStack([]);
  }, [currentDocument, setRedoStack, setUndoStack]);

  const replaceElements = useCallback((updater: (current: MapElement[]) => MapElement[]) => {
    setElements((current) => {
      const next = ensureIndependentElementIdentity(updater(current));
      elementsRef.current = next;
      return next;
    });
  }, [elementsRef, setElements]);

  const replaceAssets = useCallback((updater: (current: MapAsset[]) => MapAsset[]) => {
    setAssets((current) => {
      const next = updater(current);
      assetsRef.current = next;
      return next;
    });
  }, [assetsRef, setAssets]);

  const replaceNotes = useCallback((updater: (current: ReviewNote[]) => ReviewNote[]) => {
    setReviewNotes((current) => {
      const next = updater(current);
      notesRef.current = next;
      return next;
    });
  }, [notesRef, setReviewNotes]);

  const replaceDirectoryPlaces = useCallback((updater: (current: DirectoryPlace[]) => DirectoryPlace[]) => {
    setDirectoryPlaces((current) => {
      const next = updater(current);
      placesRef.current = next;
      return next;
    });
  }, [placesRef, setDirectoryPlaces]);

  const replaceLandmarkDefaults = useCallback((updater: (current: LandmarkDefaultPosition[]) => LandmarkDefaultPosition[]) => {
    setLandmarkDefaultPositions((current) => {
      const next = updater(current);
      landmarkDefaultsRef.current = next;
      return next;
    });
  }, [landmarkDefaultsRef, setLandmarkDefaultPositions]);

  const replaceDenseLabelPositions = useCallback((updater: (current: DenseLabelPosition[]) => DenseLabelPosition[]) => {
    setDenseLabelPositions((current) => {
      const next = updater(current);
      denseLabelPositionsRef.current = next;
      return next;
    });
  }, [denseLabelPositionsRef, setDenseLabelPositions]);

  const replaceDenseLabelExcludedIds = useCallback((updater: (current: string[]) => string[]) => {
    setDenseLabelExcludedIds((current) => {
      const next = [...new Set(updater(current))];
      denseLabelExcludedIdsRef.current = next;
      return next;
    });
  }, [denseLabelExcludedIdsRef, setDenseLabelExcludedIds]);

  const restoreDenseLabelSettings = useCallback((positions: DenseLabelPosition[], excludedElementIds: string[]) => {
    denseLabelPositionsRef.current = positions;
    denseLabelExcludedIdsRef.current = excludedElementIds;
    setDenseLabelPositions(positions);
    setDenseLabelExcludedIds(excludedElementIds);
  }, [denseLabelExcludedIdsRef, denseLabelPositionsRef, setDenseLabelExcludedIds, setDenseLabelPositions]);

  const replacePlacementOverrides = useCallback((updater: (current: PlacementOverride[]) => PlacementOverride[]) => {
    setPlacementOverrides((current) => {
      const next = sanitizePlacementOverrides(updater(current));
      placementOverridesRef.current = next;
      return next;
    });
  }, [placementOverridesRef, setPlacementOverrides]);

  const editorAutosaveDocument = useMemo<DocumentState>(() => ({
    elements,
    assets,
    reviewNotes,
    directoryPlaces,
    calibrationPoints,
    landmarkDefaultPositions,
    denseLabelPositions,
    denseLabelExcludedIds,
    placementOverrides,
  }), [assets, calibrationPoints, denseLabelExcludedIds, denseLabelPositions, directoryPlaces, elements, landmarkDefaultPositions, placementOverrides, reviewNotes]);

  return {
    currentDocument,
    setDocument,
    pushHistory,
    replaceElements,
    replaceAssets,
    replaceNotes,
    replaceDirectoryPlaces,
    replaceLandmarkDefaults,
    replaceDenseLabelPositions,
    replaceDenseLabelExcludedIds,
    restoreDenseLabelSettings,
    replacePlacementOverrides,
    editorAutosaveDocument,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
