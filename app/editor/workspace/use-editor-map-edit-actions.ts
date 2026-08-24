"use client";

import { useCallback, useMemo, type Dispatch, type RefObject, type SetStateAction } from "react";
import { isCoreLandmarkName, normalizePlaceName } from "../../core-landmarks";
import { geocodedPlaces } from "../../geocoded-places";
import {
  MAP_ASPECT,
  PRIMARY_CALIBRATION_NAMES,
  buildEffectiveCalibrationPoints,
  calibratedPlaceCoordinates,
  canonicalAnchorForElement,
  initialCalibrationPoints,
  type CalibrationPoint,
} from "../../map/calibration/model";
import {
  EXPORT_CANONICAL_WIDTH,
  isPrimaryHubLabel,
  mapElementDisplaySize,
  type CategoryId,
} from "../../map/core/model";
import type {
  DenseLabelPosition,
  DirectoryPlace,
  LabelPosition,
  LandmarkDefaultPosition,
  MapAsset,
  MapElement,
  PlacementOverride,
  PlacementState,
  ReviewNote,
  VisualBounds,
} from "../../map/core/types";
import { rectsOverlap, type NormalizedRect } from "../../map/labels/geometry";
import { isMainHubPersistenceTarget } from "../document/main-hub-persistence.mjs";
import { placementKey } from "../document/rules";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type MutableRef<T> = { current: T };

type UseEditorMapEditActionsOptions = {
  zoom: number;
  labelsRefreshing: boolean;
  assetVisualBounds: Record<string, VisualBounds>;
  elements: MapElement[];
  directoryPlaces: DirectoryPlace[];
  calibrationPoints: CalibrationPoint[];
  landmarkDefaultPositions: LandmarkDefaultPosition[];
  selected: MapElement | null;
  elementsRef: MutableRef<MapElement[]>;
  assetsRef: MutableRef<MapAsset[]>;
  placesRef: MutableRef<DirectoryPlace[]>;
  calibrationPointsRef: MutableRef<CalibrationPoint[]>;
  landmarkDefaultsRef: MutableRef<LandmarkDefaultPosition[]>;
  calibrationLiveApplyRef: MutableRef<boolean>;
  measuredAssetIdsRef: MutableRef<Set<string>>;
  stageRef: RefObject<HTMLDivElement | null>;
  canonicalMarkerAssetIds: ReadonlySet<string>;
  landmarkLocationByName: ReadonlyMap<string, { assetId?: string }>;
  pushHistory: () => void;
  replacePlacementOverrides: (updater: (current: PlacementOverride[]) => PlacementOverride[]) => void;
  replaceDenseLabelPositions: (updater: (current: DenseLabelPosition[]) => DenseLabelPosition[]) => void;
  replaceDenseLabelExcludedIds: (updater: (current: string[]) => string[]) => void;
  replaceLandmarkDefaults: (updater: (current: LandmarkDefaultPosition[]) => LandmarkDefaultPosition[]) => void;
  replaceDirectoryPlaces: (updater: (current: DirectoryPlace[]) => DirectoryPlace[]) => void;
  replaceElements: (updater: (current: MapElement[]) => MapElement[]) => void;
  replaceNotes: (updater: (current: ReviewNote[]) => ReviewNote[]) => void;
  setSelectedDenseLabelId: StateSetter<string | null>;
  setToast: StateSetter<string>;
  setCalibrationPoints: StateSetter<CalibrationPoint[]>;
  setCalibrationDirty: StateSetter<boolean>;
  setAssetVisualBounds: StateSetter<Record<string, VisualBounds>>;
  setLabelsRefreshing: StateSetter<boolean>;
};

export function useEditorMapEditActions(options: UseEditorMapEditActionsOptions) {
  const {
    zoom,
    labelsRefreshing,
    assetVisualBounds,
    elements,
    directoryPlaces,
    calibrationPoints,
    landmarkDefaultPositions,
    selected,
    elementsRef,
    assetsRef,
    placesRef,
    calibrationPointsRef,
    landmarkDefaultsRef,
    calibrationLiveApplyRef,
    measuredAssetIdsRef,
    stageRef,
    canonicalMarkerAssetIds,
    landmarkLocationByName,
    pushHistory,
    replacePlacementOverrides,
    replaceDenseLabelPositions,
    replaceDenseLabelExcludedIds,
    replaceLandmarkDefaults,
    replaceDirectoryPlaces,
    replaceElements,
    replaceNotes,
    setSelectedDenseLabelId,
    setToast,
    setCalibrationPoints,
    setCalibrationDirty,
    setAssetVisualBounds,
    setLabelsRefreshing,
  } = options;

  const effectiveCalibrationPoints = useMemo(
    () => buildEffectiveCalibrationPoints(calibrationPoints, landmarkDefaultPositions, elements, directoryPlaces),
    [calibrationPoints, directoryPlaces, elements, landmarkDefaultPositions],
  );
  const secondaryCalibrationPoints = useMemo(
    () => effectiveCalibrationPoints.filter((point) => point.tier === "secondary"),
    [effectiveCalibrationPoints],
  );
  const tertiaryCalibrationPoints = useMemo(
    () => effectiveCalibrationPoints.filter((point) => point.tier === "tertiary"),
    [effectiveCalibrationPoints],
  );
  const calibrationReferenceNames = useMemo(
    () => new Set(effectiveCalibrationPoints.map((point) => point.name)),
    [effectiveCalibrationPoints],
  );
  const selectedPrimaryCalibrationPoint = selected
    ? calibrationPoints.find((point) => point.name === normalizePlaceName(selected.name)) ?? null
    : null;
  const selectedSecondaryCalibrationPoint = selected
    ? secondaryCalibrationPoints.find((point) => point.name === normalizePlaceName(selected.name)) ?? null
    : null;
  const selectedTertiaryCalibrationPoint = selected
    ? tertiaryCalibrationPoints.find((point) => point.name === normalizePlaceName(selected.name)) ?? null
    : null;
  const selectedCalibrationPoint = selectedPrimaryCalibrationPoint
    ?? selectedSecondaryCalibrationPoint
    ?? selectedTertiaryCalibrationPoint;
  const selectedLandmarkDefault = selected?.category === "landmark"
    ? landmarkDefaultPositions.find((position) => (
      position.elementId === selected.id || position.name === normalizePlaceName(selected.name)
    )) ?? {
      elementId: selected.id,
      name: normalizePlaceName(selected.name),
      x: selected.anchorX,
      y: selected.anchorY,
      confirmed: false,
    }
    : null;
  const selectedDisplayOffset = selected ? { x: selected.x - selected.anchorX, y: selected.y - selected.anchorY } : null;
  const selectedIsPrimaryCalibration = selected ? PRIMARY_CALIBRATION_NAMES.has(normalizePlaceName(selected.name)) : false;
  const selectedHasGeocodedSource = selected ? Boolean(geocodedPlaces[normalizePlaceName(selected.name)]) : false;

  const resolveRenderedLabelOverlaps = (total: number, notify: boolean) => {
    window.requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) {
        setLabelsRefreshing(false);
        return;
      }
      const nodes = [...stage.querySelectorAll<HTMLElement>("[data-label-id]")]
        .map((node) => {
          const id = node.dataset.labelId;
          const element = elementsRef.current.find((item) => item.id === id);
          return id && element ? { id, element, rect: node.getBoundingClientRect() } : null;
        })
        .filter((item): item is { id: string; element: MapElement; rect: DOMRect } => Boolean(item?.rect.width && item.rect.height));
      const overlaps = (a: DOMRect | NormalizedRect, b: DOMRect | NormalizedRect, margin = 4) => (
        a.left < b.right + margin && a.right > b.left - margin && a.top < b.bottom + margin && a.bottom > b.top - margin
      );
      const iconObstacles: Array<{ id: string; rect: NormalizedRect }> = [...stage.querySelectorAll<HTMLElement>(".map-element[data-element-id]")].map((node) => {
        const rect = node.querySelector<HTMLElement>(".icon-visual")?.getBoundingClientRect() ?? node.getBoundingClientRect();
        return { id: node.dataset.elementId ?? "", rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } };
      });
      let labelOverlaps = 0;
      for (let index = 0; index < nodes.length; index += 1) for (let other = index + 1; other < nodes.length; other += 1) {
        if (overlaps(nodes[index].rect, nodes[other].rect, 0)) labelOverlaps += 1;
      }
      let iconOverlaps = 0;
      nodes.forEach((item) => {
        iconObstacles.forEach((obstacle) => {
          if (overlaps(item.rect, obstacle.rect, 0)) iconOverlaps += 1;
        });
      });
      const remaining = labelOverlaps + iconOverlaps;
      if (notify) setToast(remaining
        ? `기준 방향을 유지해 라벨 ${total}개를 정리했습니다. 남은 충돌 ${remaining}건은 통합 라벨 또는 직접 조정이 필요합니다.`
        : `라벨 ${total}개를 마커 주변에서 정리했습니다. 랜드마크 기준 위치와 각 마커의 대응 관계를 유지했습니다.`);
      setLabelsRefreshing(false);
    });
  };

  const autoArrangeLabels = (record = true, notify = true) => {
    const candidates = elementsRef.current
      .filter((element) => element.mapVisible && element.labelVisible)
      .sort((a, b) => Number(b.category === "landmark" || b.labelLocked) - Number(a.category === "landmark" || a.labelLocked) || b.z - a.z);
    if (!candidates.length) {
      setToast("자동 정리할 표시 라벨이 없습니다.");
      setLabelsRefreshing(false);
      return;
    }
    if (record) pushHistory();
    const assetById = new Map(assetsRef.current.map((asset) => [asset.id, asset]));
    const stageRect = stageRef.current?.getBoundingClientRect();
    const measuredLabelSizes = new Map<string, { width: number; height: number }>();
    if (stageRect?.width && stageRect.height) {
      stageRef.current?.querySelectorAll<HTMLElement>("[data-label-id]").forEach((label) => {
        const id = label.dataset.labelId;
        const rect = label.getBoundingClientRect();
        if (id && rect.width && rect.height) measuredLabelSizes.set(id, {
          width: rect.width / stageRect.width * 100,
          height: rect.height / stageRect.height * 100,
        });
      });
    }
    const iconRects = elementsRef.current.filter((element) => element.mapVisible).map((element) => {
      const asset = element.assetId ? assetById.get(element.assetId) : undefined;
      const bounds = asset ? assetVisualBounds[asset.id] : undefined;
      const leftFactor = bounds?.left ?? 0.05;
      const rightFactor = bounds?.right ?? 0.95;
      const topFactor = bounds?.top ?? 0.05;
      const bottomFactor = bounds?.bottom ?? 0.95;
      const displaySize = mapElementDisplaySize(element);
      const elementHeight = displaySize * MAP_ASPECT / 1.12;
      return { id: element.id, category: element.category, rect: {
        left: element.x + (leftFactor - 0.5) * displaySize,
        right: element.x + (rightFactor - 0.5) * displaySize,
        top: element.y + (topFactor - 0.5) * elementHeight,
        bottom: element.y + (bottomFactor - 0.5) * elementHeight,
      } };
    });
    const updates = new Map<string, Pick<MapElement, "labelPosition" | "labelOffsetX" | "labelOffsetY">>();
    const placedLabels: Array<{ id: string; category: CategoryId; rect: NormalizedRect }> = [];
    candidates.forEach((element) => {
      const asset = element.assetId ? assetById.get(element.assetId) : undefined;
      const bounds = asset ? assetVisualBounds[asset.id] : undefined;
      const leftFactor = bounds?.left ?? 0.05;
      const rightFactor = bounds?.right ?? 0.95;
      const topFactor = bounds?.top ?? 0.05;
      const bottomFactor = bounds?.bottom ?? 0.95;
      const characterCount = Array.from(element.name).length;
      const measuredLabel = measuredLabelSizes.get(element.id);
      const labelWidth = measuredLabel?.width ?? clamp((characterCount * 0.66 + 0.55) / Math.max(zoom, 0.22), 2, 26);
      const labelHeight = measuredLabel?.height ?? 1.3 / Math.max(zoom, 0.22);
      const displaySize = mapElementDisplaySize(element);
      const elementHeight = displaySize * MAP_ASPECT / 1.12;
      const visualRect = {
        left: element.x + (leftFactor - 0.5) * displaySize,
        right: element.x + (rightFactor - 0.5) * displaySize,
        top: element.y + (topFactor - 0.5) * elementHeight,
        bottom: element.y + (bottomFactor - 0.5) * elementHeight,
      };
      const visualCenterX = (visualRect.left + visualRect.right) / 2;
      const visualCenterY = (visualRect.top + visualRect.bottom) / 2;
      const gapX = 0.42 + element.labelGap / EXPORT_CANONICAL_WIDTH * 100;
      const gapY = 0.42 + element.labelGap / (EXPORT_CANONICAL_WIDTH / MAP_ASPECT) * 100;
      if (element.labelLocked) {
        const normalizedOffsetX = element.labelOffsetX / EXPORT_CANONICAL_WIDTH * 100;
        const normalizedOffsetY = element.labelOffsetY / (EXPORT_CANONICAL_WIDTH / MAP_ASPECT) * 100;
        let centerX = visualCenterX + normalizedOffsetX;
        let centerY = visualCenterY + normalizedOffsetY;
        if (element.labelPosition === "top") centerY = visualRect.top - gapY - labelHeight / 2 + normalizedOffsetY;
        if (element.labelPosition === "bottom") centerY = visualRect.bottom + gapY + labelHeight / 2 + normalizedOffsetY;
        if (element.labelPosition === "left") centerX = visualRect.left - gapX - labelWidth / 2 + normalizedOffsetX;
        if (element.labelPosition === "right") centerX = visualRect.right + gapX + labelWidth / 2 + normalizedOffsetX;
        placedLabels.push({ id: element.id, category: element.category, rect: { left: centerX - labelWidth / 2, right: centerX + labelWidth / 2, top: centerY - labelHeight / 2, bottom: centerY + labelHeight / 2 } });
        return;
      }
      const isLandmark = element.category === "landmark";
      const oppositeVertical: LabelPosition = element.labelPosition === "top" ? "bottom" : "top";
      const positionOrder: LabelPosition[] = isLandmark
        ? (element.labelPosition === "top" || element.labelPosition === "bottom"
            ? [element.labelPosition, oppositeVertical, "right", "left"]
            : [element.labelPosition, "top", "bottom", element.labelPosition === "left" ? "right" : "left"])
        : [element.labelPosition, ...(["bottom", "top", "right", "left"] as LabelPosition[]).filter((position) => position !== element.labelPosition)];
      const lateralShifts = isLandmark
        ? [0, -10, 10, -20, 20, -32, 32, -46, 46, -62, 62]
        : [0, -12, 12, -24, 24, -38, 38, -54, 54, -72, 72, -92, 92];
      const outwardShifts = isLandmark
        ? [0, 10, 20, 32, 46, 62, 80]
        : [0, 10, 20, 32, 46, 62, 82, 104];
      const baseOffsetX = element.labelOffsetX;
      const baseOffsetY = element.labelOffsetY;
      let best: { rect: NormalizedRect; position: LabelPosition; offsetX: number; offsetY: number; score: number; collisions: number } | null = null;
      positionOrder.forEach((position, positionIndex) => lateralShifts.forEach((lateralShift) => outwardShifts.forEach((outwardShift) => {
        const sameSide = position === element.labelPosition;
        const positionBaseX = sameSide ? baseOffsetX : (position === "top" || position === "bottom" ? baseOffsetX : 0);
        const positionBaseY = sameSide ? baseOffsetY : (position === "left" || position === "right" ? baseOffsetY : 0);
        const offsetX = positionBaseX + (position === "top" || position === "bottom"
          ? lateralShift
          : position === "left" ? -outwardShift : outwardShift);
        const offsetY = positionBaseY + (position === "left" || position === "right"
          ? lateralShift
          : position === "top" ? -outwardShift : outwardShift);
        const normalizedOffsetX = offsetX / EXPORT_CANONICAL_WIDTH * 100;
        const normalizedOffsetY = offsetY / (EXPORT_CANONICAL_WIDTH / MAP_ASPECT) * 100;
        let centerX = visualCenterX + normalizedOffsetX;
        let centerY = visualCenterY + normalizedOffsetY;
        if (position === "top") centerY = visualRect.top - gapY - labelHeight / 2 + normalizedOffsetY;
        if (position === "bottom") centerY = visualRect.bottom + gapY + labelHeight / 2 + normalizedOffsetY;
        if (position === "left") centerX = visualRect.left - gapX - labelWidth / 2 + normalizedOffsetX;
        if (position === "right") centerX = visualRect.right + gapX + labelWidth / 2 + normalizedOffsetX;
        const rect = { left: centerX - labelWidth / 2, right: centerX + labelWidth / 2, top: centerY - labelHeight / 2, bottom: centerY + labelHeight / 2 };
        const labelOverlapCount = placedLabels.reduce((count, item) => count + (rectsOverlap(rect, item.rect, 0.22) ? 1 : 0), 0);
        const iconOverlapScore = iconRects.reduce((score, item) => {
          if (!rectsOverlap(rect, item.rect, 0.14)) return score;
          return score + (item.category === "landmark" ? 4 : item.id === element.id ? 3 : 1);
        }, 0);
        const overflow = Math.max(0, -rect.left) + Math.max(0, rect.right - 100) + Math.max(0, -rect.top) + Math.max(0, rect.bottom - 100);
        const collisions = labelOverlapCount + iconOverlapScore;
        const manualDistance = Math.abs(offsetX - baseOffsetX) + Math.abs(offsetY - baseOffsetY);
        const relationDistance = Math.hypot(offsetX, offsetY);
        const sameSidePenalty = sameSide ? 0 : (isLandmark ? 1900 + positionIndex * 900 : 160 + positionIndex * 90);
        const horizontalLandmarkPenalty = isLandmark && (position === "left" || position === "right") ? 4200 : 0;
        const distancePenalty = manualDistance * (isLandmark ? 1.6 : 0.7) + Math.max(0, relationDistance - (isLandmark ? 72 : 92)) * 40;
        const score = labelOverlapCount * 16000 + iconOverlapScore * 10000 + overflow * 5000
          + sameSidePenalty + horizontalLandmarkPenalty + distancePenalty;
        if (!best || score < best.score) best = { rect, position, offsetX, offsetY, score, collisions };
      })));
      const selectedBest = best as { rect: NormalizedRect; position: LabelPosition; offsetX: number; offsetY: number; score: number; collisions: number } | null;
      if (!selectedBest) return;
      placedLabels.push({ id: element.id, category: element.category, rect: selectedBest.rect });
      updates.set(element.id, { labelPosition: selectedBest.position, labelOffsetX: selectedBest.offsetX, labelOffsetY: selectedBest.offsetY });
    });
    replaceElements((current) => current.map((element) => updates.has(element.id) ? { ...element, ...updates.get(element.id)! } : element));
    window.setTimeout(() => resolveRenderedLabelOverlaps(updates.size, notify), 0);
  };

  const refreshLabelPositions = () => {
    if (labelsRefreshing) return;
    setLabelsRefreshing(true);
    pushHistory();
    replaceDenseLabelPositions(() => []);
    setSelectedDenseLabelId(null);
    window.requestAnimationFrame(() => {
      autoArrangeLabels(false, true);
    });
  };

  const setPlacementOverride = useCallback((target: MapElement | DirectoryPlace, state: PlacementState | null) => {
    const key = placementKey(target);
    const directoryId = "anchorX" in target ? target.directoryId : target.id;
    replacePlacementOverrides((current) => {
      const remaining = current.filter((item) => item.key !== key);
      if (state && isMainHubPersistenceTarget(target)) return remaining;
      return state ? [...remaining, {
        key,
        ...(directoryId ? { directoryId } : {}),
        name: normalizePlaceName(target.name),
        state,
      }] : remaining;
    });
  }, [replacePlacementOverrides]);

  const updateDenseLabelPosition = useCallback((key: string, elementIds: string[], x: number, y: number) => {
    replaceDenseLabelPositions((current) => {
      const targetIds = new Set(elementIds);
      const position: DenseLabelPosition = {
        key,
        elementIds: [...elementIds].sort(),
        x: clamp(x, 0, 100),
        y: clamp(y, 0, 100),
      };
      const unrelated = current.filter((item) => item.key !== key && !item.elementIds.some((id) => targetIds.has(id)));
      return [...unrelated, position];
    });
  }, [replaceDenseLabelPositions]);

  const resetDenseLabelPosition = useCallback((keyOrKeys: string | string[]) => {
    const keys = new Set(Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]);
    replaceDenseLabelPositions((current) => current.filter((position) => !keys.has(position.key)));
  }, [replaceDenseLabelPositions]);

  const setDenseLabelEligibility = useCallback((elementId: string, eligible: boolean, clusterKeys?: string | string[]) => {
    pushHistory();
    replaceDenseLabelExcludedIds((current) => eligible
      ? current.filter((id) => id !== elementId)
      : [...current, elementId]);
    if (!eligible && clusterKeys) resetDenseLabelPosition(clusterKeys);
    setSelectedDenseLabelId(null);
    const element = elementsRef.current.find((item) => item.id === elementId);
    setToast(eligible ? `${element?.name ?? "장소"}을(를) 자동 통합 대상으로 되돌렸습니다.` : `${element?.name ?? "장소"}을(를) 개별 라벨로 분리했습니다.`);
  }, [elementsRef, pushHistory, replaceDenseLabelExcludedIds, resetDenseLabelPosition, setSelectedDenseLabelId, setToast]);

  const applyCalibrationPoints = useCallback((nextPoints: CalibrationPoint[], _moveAllVisual = false, record = true) => {
    void _moveAllVisual;
    if (record) pushHistory();
    const lockedNames = new Set(elementsRef.current.filter((element) => element.locked).map((element) => normalizePlaceName(element.name)));
    const appliedPoints = nextPoints.map((point) => lockedNames.has(point.name)
      ? calibrationPointsRef.current.find((current) => current.id === point.id) ?? point
      : point);
    calibrationPointsRef.current = appliedPoints;
    setCalibrationPoints(appliedPoints);
    replaceLandmarkDefaults((current) => current.map((position) => {
      const primary = appliedPoints.find((point) => point.name === position.name);
      return primary ? { ...position, x: primary.targetX, y: primary.targetY } : position;
    }));
    setCalibrationDirty(false);
    const effectivePoints = buildEffectiveCalibrationPoints(appliedPoints, landmarkDefaultsRef.current, elementsRef.current, placesRef.current);

    const mappedPlaces = placesRef.current.map((place) => {
      const mapped = calibratedPlaceCoordinates(place.name, place.latitude, place.longitude, effectivePoints);
      return mapped ? { ...place, ...mapped } : place;
    });
    const placesById = new Map(mappedPlaces.map((place) => [place.id, place]));
    const placesByName = new Map(mappedPlaces.map((place) => [normalizePlaceName(place.name), place]));
    replaceDirectoryPlaces(() => mappedPlaces);
    replaceElements((current) => current.map((element) => {
      if (element.locked) return element;
      const reference = effectivePoints.find((point) => point.name === normalizePlaceName(element.name));
      const place = (element.directoryId ? placesById.get(element.directoryId) : undefined) ?? placesByName.get(normalizePlaceName(element.name));
      let mapped = reference ? { x: reference.targetX, y: reference.targetY } : place ? { x: place.x, y: place.y } : null;
      if (!mapped && element.category === "landmark") {
        const geocoded = geocodedPlaces[normalizePlaceName(element.name)];
        mapped = calibratedPlaceCoordinates(element.name, geocoded?.latitude, geocoded?.longitude, effectivePoints);
      }
      if (!mapped) return element;
      const offsetX = element.x - element.anchorX;
      const offsetY = element.y - element.anchorY;
      return {
        ...element,
        anchorX: mapped.x,
        anchorY: mapped.y,
        x: clamp(mapped.x + offsetX, 0, 100),
        y: clamp(mapped.y + offsetY, 0, 100),
      };
    }));
  }, [calibrationPointsRef, elementsRef, landmarkDefaultsRef, placesRef, pushHistory, replaceDirectoryPlaces, replaceElements, replaceLandmarkDefaults, setCalibrationDirty, setCalibrationPoints]);

  const updateCalibrationPoint = useCallback((id: string, patch: Partial<Pick<CalibrationPoint, "targetX" | "targetY">>, record = true) => {
    const currentPoint = calibrationPointsRef.current.find((point) => point.id === id);
    const lockedReference = currentPoint && elementsRef.current.find((element) => normalizePlaceName(element.name) === currentPoint.name && element.locked);
    if (lockedReference) {
      setToast(`${lockedReference.name}은(는) 좌표가 고정되어 있습니다.`);
      return;
    }
    const nextPoints = calibrationPointsRef.current.map((point) => point.id === id ? {
      ...point,
      ...(patch.targetX === undefined ? {} : { targetX: clamp(patch.targetX, 0, 100) }),
      ...(patch.targetY === undefined ? {} : { targetY: clamp(patch.targetY, 0, 100) }),
    } : point);
    if (calibrationLiveApplyRef.current) {
      applyCalibrationPoints(nextPoints, false, record);
      return;
    }
    if (record) pushHistory();
    calibrationPointsRef.current = nextPoints;
    setCalibrationPoints(nextPoints);
    setCalibrationDirty(true);
    const changed = nextPoints.find((point) => point.id === id);
    if (!changed) return;
    replaceLandmarkDefaults((current) => current.map((position) => position.name === changed.name ? {
      ...position,
      x: changed.targetX,
      y: changed.targetY,
    } : position));
    replaceElements((current) => current.map((element) => normalizePlaceName(element.name) === changed.name && !element.locked ? {
      ...element,
      x: clamp(changed.targetX + element.x - element.anchorX, 0, 100),
      y: clamp(changed.targetY + element.y - element.anchorY, 0, 100),
      anchorX: changed.targetX,
      anchorY: changed.targetY,
    } : element));
  }, [applyCalibrationPoints, calibrationLiveApplyRef, calibrationPointsRef, elementsRef, pushHistory, replaceElements, replaceLandmarkDefaults, setCalibrationDirty, setCalibrationPoints, setToast]);

  const resetCalibrationPoints = () => {
    applyCalibrationPoints(initialCalibrationPoints.map((point) => ({ ...point })), true);
    setToast("1차 기준점 6곳을 v15 기준으로 복원하고 저장된 2차 기준점을 다시 적용했습니다.");
  };

  const applyCalibrationToAll = () => {
    applyCalibrationPoints(calibrationPointsRef.current.map((point) => ({ ...point })), true);
    window.setTimeout(() => autoArrangeLabels(false, true), 0);
  };

  const moveAllResourcesToAnchors = () => {
    const targets = elementsRef.current.filter((element) => !element.locked && Number.isFinite(element.anchorX) && Number.isFinite(element.anchorY));
    if (!targets.length) {
      setToast("기준좌표가 설정된 마커가 없습니다.");
      return;
    }
    pushHistory();
    const targetIds = new Set(targets.map((element) => element.id));
    replaceElements((current) => current.map((element) => {
      if (!targetIds.has(element.id)) return element;
      const canonical = canonicalAnchorForElement(element, calibrationPointsRef.current, landmarkDefaultsRef.current);
      return { ...element, anchorX: canonical.x, anchorY: canonical.y, x: canonical.x, y: canonical.y };
    }));
    window.setTimeout(() => autoArrangeLabels(false, true), 0);
    setToast(`리소스 ${targets.length}개를 저장된 기본 앵커로 이동했습니다.`);
  };

  const updateElement = useCallback((id: string, patch: Partial<MapElement>, record = true) => {
    if (record) pushHistory();
    replaceElements((current) => current.map((element) => {
      if (element.id !== id) return element;
      const patched = { ...element, ...patch };
      const next = { ...patched, status: reviewStatusForCoordinateLock(patched.locked) };
      const name = normalizePlaceName(next.name);
      if (!isCoreLandmarkName(name) && !isPrimaryHubLabel(name)) return next;
      const preferredAssetId = landmarkLocationByName.get(name)?.assetId;
      return {
        ...next,
        name,
        category: "landmark",
        assetId: !next.assetId || canonicalMarkerAssetIds.has(next.assetId) ? preferredAssetId ?? next.assetId : next.assetId,
      };
    }));
  }, [canonicalMarkerAssetIds, landmarkLocationByName, pushHistory, replaceElements]);

  const updateElementAnchor = useCallback((element: MapElement, nextAnchorX: number, nextAnchorY: number, record = true) => {
    if (element.locked) {
      setToast(`${element.name}은(는) 좌표가 고정되어 있습니다.`);
      return;
    }
    const anchorX = clamp(nextAnchorX, 0, 100);
    const anchorY = clamp(nextAnchorY, 0, 100);
    updateElement(element.id, {
      anchorX,
      anchorY,
      x: clamp(anchorX + element.x - element.anchorX, 0, 100),
      y: clamp(anchorY + element.y - element.anchorY, 0, 100),
    }, record);
  }, [setToast, updateElement]);

  const moveAnchorToResource = useCallback((element: MapElement) => {
    if (element.locked) {
      setToast(`${element.name}은(는) 좌표가 고정되어 있습니다.`);
      return;
    }
    const anchorX = clamp(element.x, 0, 100);
    const anchorY = clamp(element.y, 0, 100);
    if (Math.abs(anchorX - element.anchorX) < 0.001 && Math.abs(anchorY - element.anchorY) < 0.001) {
      setToast(`${element.name}의 앵커가 이미 리소스 위치와 같습니다.`);
      return;
    }

    pushHistory();
    const normalizedName = normalizePlaceName(element.name);
    const primaryPoint = calibrationPointsRef.current.find((point) => point.name === normalizedName);
    const confirmedDefault = landmarkDefaultsRef.current.find((position) =>
      (position.elementId === element.id || position.name === normalizedName) && position.confirmed,
    );

    if (primaryPoint) {
      const nextPoints = calibrationPointsRef.current.map((point) => point.id === primaryPoint.id
        ? { ...point, targetX: anchorX, targetY: anchorY }
        : point);
      if (calibrationLiveApplyRef.current) {
        applyCalibrationPoints(nextPoints, false, false);
      } else {
        calibrationPointsRef.current = nextPoints;
        setCalibrationPoints(nextPoints);
        setCalibrationDirty(true);
        replaceLandmarkDefaults((current) => {
          const existing = current.find((position) => position.elementId === element.id || position.name === normalizedName);
          if (!existing) return [...current, { elementId: element.id, name: normalizedName, x: anchorX, y: anchorY, confirmed: false }];
          return current.map((position) => position === existing ? { ...position, x: anchorX, y: anchorY } : position);
        });
      }
    } else if (confirmedDefault) {
      replaceLandmarkDefaults((current) => current.map((position) => position === confirmedDefault
        ? { ...position, x: anchorX, y: anchorY }
        : position));
      setCalibrationDirty(true);
    }

    replaceElements((current) => current.map((item) => item.id === element.id
      ? { ...item, anchorX, anchorY, x: anchorX, y: anchorY }
      : item));
    setToast(`${element.name}의 앵커를 현재 리소스 위치로 이동했습니다.`);
  }, [applyCalibrationPoints, calibrationLiveApplyRef, calibrationPointsRef, landmarkDefaultsRef, pushHistory, replaceElements, replaceLandmarkDefaults, setCalibrationDirty, setCalibrationPoints, setToast]);

  const updateNote = useCallback((id: string, patch: Partial<ReviewNote>) => {
    pushHistory();
    replaceNotes((current) => current.map((note) => note.id === id ? { ...note, ...patch } : note));
  }, [pushHistory, replaceNotes]);

  const measureAssetBounds = useCallback((assetId: string, image: HTMLImageElement) => {
    if (measuredAssetIdsRef.current.has(assetId) || !image.naturalWidth || !image.naturalHeight) return;
    measuredAssetIdsRef.current.add(assetId);
    try {
      const size = 192;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.clearRect(0, 0, size, size);
      context.drawImage(image, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size).data;
      let minX = size; let minY = size; let maxX = -1; let maxY = -1;
      for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
        if (pixels[(y * size + x) * 4 + 3] < 32) continue;
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      if (maxX < minX || maxY < minY) return;
      setAssetVisualBounds((current) => ({ ...current, [assetId]: { left: minX / size, top: minY / size, right: (maxX + 1) / size, bottom: (maxY + 1) / size } }));
    } catch {
      measuredAssetIdsRef.current.delete(assetId);
    }
  }, [measuredAssetIdsRef, setAssetVisualBounds]);

  return {
    secondaryCalibrationPoints,
    tertiaryCalibrationPoints,
    calibrationReferenceNames,
    selectedPrimaryCalibrationPoint,
    selectedSecondaryCalibrationPoint,
    selectedTertiaryCalibrationPoint,
    selectedCalibrationPoint,
    selectedLandmarkDefault,
    selectedDisplayOffset,
    selectedIsPrimaryCalibration,
    selectedHasGeocodedSource,
    setPlacementOverride,
    updateDenseLabelPosition,
    setDenseLabelEligibility,
    updateCalibrationPoint,
    resetCalibrationPoints,
    applyCalibrationToAll,
    moveAllResourcesToAnchors,
    updateElement,
    updateElementAnchor,
    moveAnchorToResource,
    updateNote,
    measureAssetBounds,
    autoArrangeLabels,
    refreshLabelPositions,
  };
}

function reviewStatusForCoordinateLock(locked: boolean) {
  return locked ? "approved" as const : "unchecked" as const;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
