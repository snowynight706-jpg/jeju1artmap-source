"use client";

import {
  useCallback,
  useEffect,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
  type WheelEvent as ReactWheelEvent,
} from "react";

import { normalizePlaceName } from "../../core-landmarks";
import { cloneDocument, uniqueRuntimeId } from "../../editor/document/rules";
import { isMainHubPersistenceTarget } from "../../editor/document/main-hub-persistence.mjs";
import type { CalibrationPoint } from "../calibration/model";
import { denseLabelRenderScale } from "../labels/clusters";
import { LOW_MOBILE_RENDER_BUDGET } from "../rendering/mobile-render-budget.mjs";
import { shouldSendMapSettleDiagnostic } from "../rendering/performance-diagnostics.mjs";
import { publicPanelIsPlace } from "../../public/navigation.mjs";
import { publicPlaceFocusZoom } from "../../public/place-focus.mjs";
import type { PublicHistoryState } from "../../public/use-public-place-workspace";
import type { MobileRenderBudget } from "../rendering/mobile-render";
import type {
  DenseLabelCluster,
  DocumentState,
  MapElement,
  PublicLayoutAccess,
  ReviewNote,
  StageDimensions,
} from "../core/types";
import type { useMapTransformController } from "./use-map-transform-controller";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type Point = { x: number; y: number };
type MutableRef<T> = { current: T };

export type MapInteractionState =
  | { type: "pan"; startX: number; startY: number; panX: number; panY: number }
  | { type: "resize"; id: string; startX: number; startSize: number }
  | { type: "drag"; id: string; startX: number; startY: number; elementX: number; elementY: number; anchorX: number; anchorY: number; mode: "anchor" | "output"; calibrationPointId?: string }
  | { type: "label"; id: string; startX: number; startY: number; offsetX: number; offsetY: number }
  | { type: "dense-label"; key: string; elementIds: string[]; startX: number; startY: number; x: number; y: number; halfWidth: number; halfHeight: number }
  | null;

type TransformController = ReturnType<typeof useMapTransformController>;

type UseMapInteractionActionsOptions = {
  publicLayoutAccess: PublicLayoutAccess;
  fitZoom: number;
  zoom: number;
  viewportDimensions: StageDimensions;
  stageDimensions: StageDimensions;
  visibleElementCount: number;
  stageLabelElementCount: number;
  interaction: MapInteractionState;
  memoMode: boolean;
  selectedId: string | null;
  selected: MapElement | null;
  resourceOutputDragMode: boolean;
  databaseEditorOpen: boolean;
  publicHistoryOpen: boolean;
  shortcutHelpOpen: boolean;
  placeEventFormOpen: boolean;
  placeEventNoPlace: boolean;
  placeEventMultiPlace: boolean;
  placeRequestPickingLocation: boolean;
  globalStoriesOpen: boolean;
  publicPanelExpanded: boolean;
  publicPlaceExpanded: boolean;
  undoStack: DocumentState[];
  redoStack: DocumentState[];
  viewportRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  zoomRef: MutableRef<number>;
  panRef: MutableRef<Point>;
  elementsRef: MutableRef<MapElement[]>;
  calibrationPointsRef: MutableRef<CalibrationPoint[]>;
  notesRef: MutableRef<ReviewNote[]>;
  performanceSettleSamplesRef: MutableRef<{ pan: number; pinch: number }>;
  mobileSlowSettleSamplesRef: MutableRef<number>;
  transformController: Pick<
    TransformController,
    | "activeTouchPointersRef"
    | "pinchGestureRef"
    | "panInteractionRef"
    | "queueTouchMapTransform"
    | "scheduleTouchLayerRelease"
    | "beginTouchMapTransform"
    | "commitTouchMapTransform"
    | "beginPinchGesture"
    | "handleWheel"
    | "commitPendingWheelTransform"
    | "finishProgrammaticMapFocus"
    | "startProgrammaticMapFocus"
  >;
  clientToMap: (clientX: number, clientY: number) => Point;
  syncReviewedPlaceRequestLocation: (placeRequestId: string, x: number, y: number) => Promise<void>;
  togglePlaceEventMapSelection: (elementId: string) => void;
  selectPublicMarker: (elementId: string) => void;
  confirmDiscardStoryPhoto: (nextPlaceId?: string | null) => boolean;
  updateElement: (id: string, patch: Partial<MapElement>, record?: boolean) => void;
  updateCalibrationPoint: (id: string, patch: Partial<CalibrationPoint>, record?: boolean) => void;
  updateDenseLabelPosition: (key: string, elementIds: string[], x: number, y: number) => void;
  updateElementAnchor: (element: MapElement, nextAnchorX: number, nextAnchorY: number, record?: boolean) => void;
  setPlacementOverride: (target: MapElement, state: "deleted") => void;
  currentDocument: () => DocumentState;
  setDocument: (document: DocumentState) => void;
  pushHistory: () => void;
  replaceElements: (updater: (current: MapElement[]) => MapElement[]) => void;
  replaceNotes: (updater: (current: ReviewNote[]) => ReviewNote[]) => void;
  setInteraction: StateSetter<MapInteractionState>;
  setEditorMapPan: (pan: Point) => void;
  setMobileRenderBudget: StateSetter<MobileRenderBudget>;
  setUndoStack: StateSetter<DocumentState[]>;
  setRedoStack: StateSetter<DocumentState[]>;
  setZoom: StateSetter<number>;
  setSelectedId: StateSetter<string | null>;
  setSelectedFacilityId: StateSetter<string | null>;
  setSelectedNoteId: StateSetter<string | null>;
  setSelectedDenseLabelId: StateSetter<string | null>;
  setPublicPlaceExpanded: StateSetter<boolean>;
  setPlaceRequestLocation: StateSetter<Point | null>;
  setCalibrationDirty: StateSetter<boolean>;
  setMemoMode: StateSetter<boolean>;
  setRightOpen: StateSetter<boolean>;
  setFocusPulseId: StateSetter<string | null>;
  setToast: StateSetter<string>;
  sendPerformanceDiagnostic: (payload: {
    metric: "pan-settle" | "pinch-settle";
    durationMs: number;
    elementCount: number;
    labelCount: number;
    viewportWidth: number;
    viewportHeight: number;
  }) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function useMapInteractionActions({
  publicLayoutAccess,
  fitZoom,
  zoom,
  viewportDimensions,
  stageDimensions,
  visibleElementCount,
  stageLabelElementCount,
  interaction,
  memoMode,
  selectedId,
  selected,
  resourceOutputDragMode,
  databaseEditorOpen,
  publicHistoryOpen,
  shortcutHelpOpen,
  placeEventFormOpen,
  placeEventNoPlace,
  placeEventMultiPlace,
  placeRequestPickingLocation,
  globalStoriesOpen,
  publicPanelExpanded,
  publicPlaceExpanded,
  undoStack,
  redoStack,
  viewportRef,
  stageRef,
  zoomRef,
  panRef,
  elementsRef,
  calibrationPointsRef,
  notesRef,
  performanceSettleSamplesRef,
  mobileSlowSettleSamplesRef,
  transformController: {
    activeTouchPointersRef,
    pinchGestureRef,
    panInteractionRef,
    queueTouchMapTransform,
    scheduleTouchLayerRelease,
    beginTouchMapTransform,
    commitTouchMapTransform,
    beginPinchGesture,
    handleWheel,
    commitPendingWheelTransform,
    finishProgrammaticMapFocus,
    startProgrammaticMapFocus,
  },
  clientToMap,
  syncReviewedPlaceRequestLocation,
  togglePlaceEventMapSelection,
  selectPublicMarker,
  confirmDiscardStoryPhoto,
  updateElement,
  updateCalibrationPoint,
  updateDenseLabelPosition,
  updateElementAnchor,
  setPlacementOverride,
  currentDocument,
  setDocument,
  pushHistory,
  replaceElements,
  replaceNotes,
  setInteraction,
  setEditorMapPan,
  setMobileRenderBudget,
  setUndoStack,
  setRedoStack,
  setZoom,
  setSelectedId,
  setSelectedFacilityId,
  setSelectedNoteId,
  setSelectedDenseLabelId,
  setPublicPlaceExpanded,
  setPlaceRequestLocation,
  setCalibrationDirty,
  setMemoMode,
  setRightOpen,
  setFocusPulseId,
  setToast,
  sendPerformanceDiagnostic,
}: UseMapInteractionActionsOptions) {
  const recordMapSettle = useCallback((metric: "pan-settle" | "pinch-settle") => {
    if (publicLayoutAccess !== "viewer") return;
    const startedAt = performance.now();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const durationMs = performance.now() - startedAt;
      if (viewportDimensions.width > 0 && viewportDimensions.width <= 760) {
        if (durationMs >= 80) mobileSlowSettleSamplesRef.current = Math.min(2, mobileSlowSettleSamplesRef.current + 1);
        else if (durationMs <= 50) mobileSlowSettleSamplesRef.current = Math.max(0, mobileSlowSettleSamplesRef.current - 1);
        if (mobileSlowSettleSamplesRef.current >= 2) {
          setMobileRenderBudget((current) => current.tier === "low" ? current : LOW_MOBILE_RENDER_BUDGET);
        }
      }
      const sampleKey = metric === "pinch-settle" ? "pinch" : "pan";
      const sampleNumber = performanceSettleSamplesRef.current[sampleKey] + 1;
      performanceSettleSamplesRef.current[sampleKey] = sampleNumber;
      if (!shouldSendMapSettleDiagnostic(sampleNumber, durationMs)) return;
      sendPerformanceDiagnostic({
        metric,
        durationMs,
        elementCount: visibleElementCount,
        labelCount: stageLabelElementCount,
        viewportWidth: viewportDimensions.width,
        viewportHeight: viewportDimensions.height,
      });
    }));
  }, [mobileSlowSettleSamplesRef, performanceSettleSamplesRef, publicLayoutAccess, sendPerformanceDiagnostic, setMobileRenderBudget, stageLabelElementCount, viewportDimensions.height, viewportDimensions.width, visibleElementCount]);

  useEffect(() => {
    const viewportElement = viewportRef.current;
    let moveFrame: number | null = null;
    let pendingMove: { clientX: number; clientY: number } | null = null;
    const applyMove = ({ clientX, clientY }: { clientX: number; clientY: number }) => {
      const panInteraction = panInteractionRef.current;
      if (panInteraction) {
        queueTouchMapTransform(zoomRef.current, {
          x: panInteraction.panX + clientX - panInteraction.startX,
          y: panInteraction.panY + clientY - panInteraction.startY,
        });
        return;
      }
      if (!interaction) return;
      if (interaction.type === "pan") {
        setEditorMapPan({
          x: interaction.panX + clientX - interaction.startX,
          y: interaction.panY + clientY - interaction.startY,
        });
        return;
      }
      if (interaction.type === "label") {
        updateElement(interaction.id, {
          labelOffsetX: clamp(interaction.offsetX + (clientX - interaction.startX) / Math.max(fitZoom, 0.22), -240, 240),
          labelOffsetY: clamp(interaction.offsetY + (clientY - interaction.startY) / Math.max(fitZoom, 0.22), -240, 240),
        }, false);
        return;
      }
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const deltaX = ((clientX - interaction.startX) / rect.width) * 100;
      if (interaction.type === "resize") {
        updateElement(interaction.id, { size: clamp(interaction.startSize + deltaX * 2, 0.8, 15) }, false);
        return;
      }
      const deltaY = ((clientY - interaction.startY) / rect.height) * 100;
      if (interaction.type === "dense-label") {
        updateDenseLabelPosition(
          interaction.key,
          interaction.elementIds,
          clamp(interaction.x + deltaX, interaction.halfWidth, 100 - interaction.halfWidth),
          clamp(interaction.y + deltaY, interaction.halfHeight, 100 - interaction.halfHeight),
        );
        return;
      }
      if (interaction.mode === "anchor" && interaction.calibrationPointId) {
        updateCalibrationPoint(interaction.calibrationPointId, {
          targetX: clamp(interaction.anchorX + deltaX, 0, 100),
          targetY: clamp(interaction.anchorY + deltaY, 0, 100),
        }, false);
      } else if (interaction.mode === "anchor") {
        const boundedDeltaX = clamp(deltaX, -Math.min(interaction.anchorX, interaction.elementX), 100 - Math.max(interaction.anchorX, interaction.elementX));
        const boundedDeltaY = clamp(deltaY, -Math.min(interaction.anchorY, interaction.elementY), 100 - Math.max(interaction.anchorY, interaction.elementY));
        updateElement(interaction.id, {
          anchorX: interaction.anchorX + boundedDeltaX,
          anchorY: interaction.anchorY + boundedDeltaY,
          x: interaction.elementX + boundedDeltaX,
          y: interaction.elementY + boundedDeltaY,
        }, false);
      } else {
        updateElement(interaction.id, {
          x: clamp(interaction.elementX + deltaX, 0, 100),
          y: clamp(interaction.elementY + deltaY, 0, 100),
        }, false);
      }
    };
    const flushMove = () => {
      if (moveFrame !== null) {
        window.cancelAnimationFrame(moveFrame);
        moveFrame = null;
      }
      const next = pendingMove;
      pendingMove = null;
      if (next) applyMove(next);
    };
    const handleMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" && activeTouchPointersRef.current.has(event.pointerId)) {
        activeTouchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
        const pinch = pinchGestureRef.current;
        if (pinch) {
          const first = activeTouchPointersRef.current.get(pinch.pointerIds[0]);
          const second = activeTouchPointersRef.current.get(pinch.pointerIds[1]);
          const viewport = viewportRef.current?.getBoundingClientRect();
          if (first && second && viewport) {
            event.preventDefault();
            const distance = Math.max(12, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY));
            const centerX = (first.clientX + second.clientX) / 2 - viewport.left - viewport.width / 2;
            const centerY = (first.clientY + second.clientY) / 2 - viewport.top - viewport.height / 2;
            const rawZoom = clamp(pinch.startZoom * distance / pinch.startDistance, fitZoom, 4);
            const ratio = rawZoom / Math.max(pinch.startZoom, 0.01);
            const rawPan = {
              x: centerX - (pinch.startCenterX - pinch.startPanX) * ratio,
              y: centerY - (pinch.startCenterY - pinch.startPanY) * ratio,
            };
            const nextZoom = zoomRef.current + (rawZoom - zoomRef.current) * 0.82;
            const nextPan = {
              x: panRef.current.x + (rawPan.x - panRef.current.x) * 0.82,
              y: panRef.current.y + (rawPan.y - panRef.current.y) * 0.82,
            };
            queueTouchMapTransform(nextZoom, nextPan);
          }
          return;
        }
      }
      if (!interaction && !panInteractionRef.current) return;
      pendingMove = { clientX: event.clientX, clientY: event.clientY };
      if (moveFrame !== null) return;
      moveFrame = window.requestAnimationFrame(() => {
        moveFrame = null;
        const next = pendingMove;
        pendingMove = null;
        if (next) applyMove(next);
      });
    };
    const handleUp = (event: PointerEvent) => {
      const trackedTouch = event.pointerType === "touch" && activeTouchPointersRef.current.has(event.pointerId);
      const pinch = pinchGestureRef.current;
      if (trackedTouch) activeTouchPointersRef.current.delete(event.pointerId);
      if (pinch && pinch.pointerIds.includes(event.pointerId)) {
        pinchGestureRef.current = null;
        commitTouchMapTransform();
        recordMapSettle("pinch-settle");
        const remaining = activeTouchPointersRef.current.values().next().value as { clientX: number; clientY: number } | undefined;
        if (remaining) {
          panInteractionRef.current = {
            startX: remaining.clientX,
            startY: remaining.clientY,
            panX: panRef.current.x,
            panY: panRef.current.y,
          };
          viewportRef.current?.classList.add("is-panning");
        } else {
          panInteractionRef.current = null;
          viewportRef.current?.classList.remove("is-panning");
          setInteraction(null);
        }
        return;
      }
      if (trackedTouch && pinch) return;
      flushMove();
      const panInteraction = panInteractionRef.current;
      if (panInteraction) {
        commitTouchMapTransform();
        recordMapSettle("pan-settle");
      }
      if (panInteraction?.pendingPublicPlaceId) {
        const moved = Math.hypot(event.clientX - panInteraction.startX, event.clientY - panInteraction.startY);
        if (moved <= 6) {
          if (placeEventFormOpen && !placeEventNoPlace && placeEventMultiPlace) {
            togglePlaceEventMapSelection(panInteraction.pendingPublicPlaceId);
          } else {
            selectPublicMarker(panInteraction.pendingPublicPlaceId);
          }
        }
      }
      if (panInteraction?.pendingPlaceRequestLocation) {
        const moved = Math.hypot(event.clientX - panInteraction.startX, event.clientY - panInteraction.startY);
        if (moved <= 6) {
          const point = clientToMap(event.clientX, event.clientY);
          setPlaceRequestLocation({ x: Math.round(point.x * 1000) / 1000, y: Math.round(point.y * 1000) / 1000 });
          setToast("요청할 마커 위치를 지정했습니다. 필요하면 지도를 이동·확대한 뒤 다시 눌러 조정하세요.");
        }
      }
      if (panInteraction) {
        panInteractionRef.current = null;
        viewportRef.current?.classList.remove("is-panning");
        scheduleTouchLayerRelease();
        return;
      }
      if (interaction?.type === "drag") {
        const draggedId = interaction.id;
        window.requestAnimationFrame(() => {
          const element = elementsRef.current.find((item) => item.id === draggedId && item.placeRequestId && !item.directoryId);
          if (element?.placeRequestId) void syncReviewedPlaceRequestLocation(element.placeRequestId, element.x, element.y);
        });
      }
      setInteraction(null);
    };
    const handleCancel = (event: PointerEvent) => {
      if (event.pointerType === "touch") activeTouchPointersRef.current.delete(event.pointerId);
      if (pinchGestureRef.current?.pointerIds.includes(event.pointerId)) pinchGestureRef.current = null;
      pendingMove = null;
      if (moveFrame !== null) window.cancelAnimationFrame(moveFrame);
      moveFrame = null;
      if (panInteractionRef.current || event.pointerType === "touch") commitTouchMapTransform();
      panInteractionRef.current = null;
      viewportRef.current?.classList.remove("is-panning");
      scheduleTouchLayerRelease();
      setInteraction(null);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      if (moveFrame !== null) window.cancelAnimationFrame(moveFrame);
      panInteractionRef.current = null;
      viewportElement?.classList.remove("is-panning");
    };
  }, [activeTouchPointersRef, clientToMap, commitTouchMapTransform, elementsRef, fitZoom, interaction, panInteractionRef, panRef, pinchGestureRef, placeEventFormOpen, placeEventMultiPlace, placeEventNoPlace, queueTouchMapTransform, recordMapSettle, scheduleTouchLayerRelease, selectPublicMarker, setEditorMapPan, setInteraction, setPlaceRequestLocation, setToast, stageRef, syncReviewedPlaceRequestLocation, togglePlaceEventMapSelection, updateCalibrationPoint, updateDenseLabelPosition, updateElement, viewportRef, zoomRef]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const interactiveControl = Boolean(target?.closest("input, textarea, select, button, a, [contenteditable='true']"));
      if (publicLayoutAccess !== "editor" || databaseEditorOpen || publicHistoryOpen || shortcutHelpOpen || placeEventFormOpen || !selectedId || interactiveControl) return;
      const element = elementsRef.current.find((item) => item.id === selectedId);
      if (!element) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (event.repeat) return;
        if (element.locked) {
          updateElement(element.id, { locked: false });
          setCalibrationDirty(true);
          setToast(`${element.name} 좌표 고정을 해제했습니다. 지도에서 삭제하려면 한 번 더 누르세요.`);
          return;
        }
        if (isMainHubPersistenceTarget(element)) {
          setToast("제주소통협력센터는 주요 거점이므로 지도에서 삭제할 수 없습니다.");
          return;
        }
        pushHistory();
        setPlacementOverride(element, "deleted");
        replaceElements((current) => current.filter((item) => item.id !== element.id));
        setSelectedId(null);
        setToast(`${element.name} 마커를 지도 배치에서 삭제했습니다. 통합 장소 DB는 보존됩니다.`);
        return;
      }

      const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const step = event.shiftKey ? 0.5 : 0.08;
      const calibrationPoint = !resourceOutputDragMode
        ? calibrationPointsRef.current.find((point) => point.name === normalizePlaceName(element.name))
        : undefined;
      if (calibrationPoint) {
        updateCalibrationPoint(calibrationPoint.id, {
          targetX: calibrationPoint.targetX + direction[0] * step,
          targetY: calibrationPoint.targetY + direction[1] * step,
        });
        return;
      }
      if (element.locked) return;
      if (resourceOutputDragMode) {
        updateElement(selectedId, { x: clamp(element.x + direction[0] * step, 0, 100), y: clamp(element.y + direction[1] * step, 0, 100) });
      } else {
        updateElementAnchor(element, element.anchorX + direction[0] * step, element.anchorY + direction[1] * step);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [calibrationPointsRef, databaseEditorOpen, elementsRef, placeEventFormOpen, publicHistoryOpen, publicLayoutAccess, pushHistory, replaceElements, resourceOutputDragMode, selectedId, setCalibrationDirty, setPlacementOverride, setSelectedId, setToast, shortcutHelpOpen, updateCalibrationPoint, updateElement, updateElementAnchor]);

  const undo = useCallback(() => {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((current) => [...current.slice(-59), cloneDocument(currentDocument())]);
    setUndoStack((current) => current.slice(0, -1));
    setDocument(previous);
  }, [currentDocument, setDocument, setRedoStack, setUndoStack, undoStack]);

  const redo = useCallback(() => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((current) => [...current.slice(-59), cloneDocument(currentDocument())]);
    setRedoStack((current) => current.slice(0, -1));
    setDocument(next);
  }, [currentDocument, redoStack, setDocument, setRedoStack, setUndoStack]);

  const onWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    handleWheel(event, recordMapSettle);
  }, [handleWheel, recordMapSettle]);

  const startPan = useCallback((event: ReactPointerEvent<HTMLElement>, pendingPublicPlaceId?: string, pendingPlaceRequestLocation = false) => {
    if (event.button !== 0 || memoMode) return;
    event.preventDefault();
    event.stopPropagation();
    commitPendingWheelTransform();
    if (publicLayoutAccess === "editor") {
      setSelectedId(null); setSelectedFacilityId(null); setSelectedNoteId(null); setSelectedDenseLabelId(null);
      setInteraction({
        type: "pan",
        startX: event.clientX,
        startY: event.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
      });
      return;
    }
    if (event.pointerType === "touch") {
      event.currentTarget.setPointerCapture(event.pointerId);
      activeTouchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
      if (activeTouchPointersRef.current.size >= 2 && beginPinchGesture()) return;
    }
    if (!pendingPublicPlaceId) {
      if (publicLayoutAccess === "viewer" && selected) {
        if (!confirmDiscardStoryPhoto()) return;
        const current = (window.history.state ?? {}) as PublicHistoryState;
        if (publicPanelIsPlace(current.wondosimPanel)) window.history.back();
        else {
          setSelectedId(null); setSelectedFacilityId(null); setPublicPlaceExpanded(false);
        }
        return;
      }
      setSelectedId(null); setSelectedFacilityId(null); setSelectedNoteId(null); setSelectedDenseLabelId(null);
    }
    beginTouchMapTransform();
    panInteractionRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
      pendingPublicPlaceId,
      pendingPlaceRequestLocation,
    };
    viewportRef.current?.classList.add("is-panning");
  }, [activeTouchPointersRef, beginPinchGesture, beginTouchMapTransform, commitPendingWheelTransform, confirmDiscardStoryPhoto, memoMode, panInteractionRef, panRef, publicLayoutAccess, selected, setInteraction, setPublicPlaceExpanded, setSelectedDenseLabelId, setSelectedFacilityId, setSelectedId, setSelectedNoteId, viewportRef]);

  const handleStagePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (memoMode && event.button === 0) {
      event.stopPropagation();
      const point = clientToMap(event.clientX, event.clientY);
      pushHistory();
      const note: ReviewNote = { id: uniqueRuntimeId("review", notesRef.current.map((item) => item.id)), x: point.x, y: point.y, status: "weaken", text: "" };
      replaceNotes((current) => [...current, note]);
      setSelectedId(null); setSelectedNoteId(note.id); setMemoMode(false); setRightOpen(true);
      return;
    }
    startPan(event, undefined, placeRequestPickingLocation && publicLayoutAccess === "viewer");
  }, [clientToMap, memoMode, notesRef, placeRequestPickingLocation, publicLayoutAccess, pushHistory, replaceNotes, setMemoMode, setRightOpen, setSelectedId, setSelectedNoteId, startPan]);

  const startDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>, element: MapElement) => {
    event.stopPropagation();
    setSelectedId(element.id); setSelectedNoteId(null); setSelectedDenseLabelId(null);
    setRightOpen(true);
    if (event.button !== 0 || memoMode || element.locked) return;
    const primaryPoint = !resourceOutputDragMode
      ? calibrationPointsRef.current.find((point) => point.name === normalizePlaceName(element.name))
      : undefined;
    pushHistory();
    setInteraction({
      type: "drag",
      id: element.id,
      startX: event.clientX,
      startY: event.clientY,
      elementX: element.x,
      elementY: element.y,
      anchorX: primaryPoint?.targetX ?? element.anchorX,
      anchorY: primaryPoint?.targetY ?? element.anchorY,
      mode: resourceOutputDragMode ? "output" : "anchor",
      calibrationPointId: primaryPoint?.id,
    });
  }, [calibrationPointsRef, memoMode, pushHistory, resourceOutputDragMode, setInteraction, setRightOpen, setSelectedDenseLabelId, setSelectedId, setSelectedNoteId]);

  const startLabelDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>, element: MapElement) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedId(element.id);
    setSelectedNoteId(null);
    setSelectedDenseLabelId(null);
    setRightOpen(true);
    pushHistory();
    setInteraction({
      type: "label",
      id: element.id,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: element.labelOffsetX,
      offsetY: element.labelOffsetY,
    });
  }, [pushHistory, setInteraction, setRightOpen, setSelectedDenseLabelId, setSelectedId, setSelectedNoteId]);

  const startDenseLabelDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>, cluster: DenseLabelCluster) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedId(null);
    setSelectedNoteId(null);
    setSelectedDenseLabelId(cluster.id);
    pushHistory();
    const renderScale = denseLabelRenderScale(zoom, stageDimensions, true);
    setInteraction({
      type: "dense-label",
      key: cluster.id,
      elementIds: cluster.elementIds,
      startX: event.clientX,
      startY: event.clientY,
      x: cluster.x,
      y: cluster.y,
      halfWidth: cluster.width / 2 * renderScale.x,
      halfHeight: cluster.height / 2 * renderScale.y,
    });
  }, [pushHistory, setInteraction, setSelectedDenseLabelId, setSelectedId, setSelectedNoteId, stageDimensions, zoom]);

  const startResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>, element: MapElement) => {
    event.stopPropagation();
    pushHistory();
    setInteraction({ type: "resize", id: element.id, startX: event.clientX, startSize: element.size });
  }, [pushHistory, setInteraction]);

  const focusMapPosition = useCallback((
    x: number,
    y: number,
    elementId: string,
    focusOptions: { publicNavigation?: boolean; showDetails?: boolean } = {},
  ) => {
    const stageRect = stageRef.current?.getBoundingClientRect();
    const viewport = viewportRef.current?.getBoundingClientRect();
    const viewportWidth = viewport?.width ?? viewportDimensions.width;
    const viewportHeight = viewport?.height ?? viewportDimensions.height;
    const compact = viewportWidth <= 760;
    const currentZoom = zoomRef.current;
    const unscaledWidth = stageRect
      ? stageRect.width / Math.max(currentZoom, 0.01)
      : stageDimensions.width;
    const unscaledHeight = stageRect
      ? stageRect.height / Math.max(currentZoom, 0.01)
      : stageDimensions.height;
    if (publicLayoutAccess === "editor") {
      const targetZoom = 1.55;
      const targetPan = unscaledWidth > 0 && unscaledHeight > 0
        ? {
            x: -((x - 50) / 100) * unscaledWidth * targetZoom,
            y: -((y - 50) / 100) * unscaledHeight * targetZoom,
          }
        : panRef.current;
      finishProgrammaticMapFocus();
      zoomRef.current = targetZoom;
      setEditorMapPan(targetPan);
      setZoom(targetZoom);
      setFocusPulseId(elementId);
      window.setTimeout(() => setFocusPulseId((current) => current === elementId ? null : current), 1300);
      return;
    }
    const targetZoom = focusOptions.publicNavigation
      ? publicPlaceFocusZoom({
        fitZoom,
        viewportWidth,
        viewportHeight,
        stageWidth: unscaledWidth,
        stageHeight: unscaledHeight,
      })
      : compact
        ? clamp(Math.max(currentZoom, fitZoom * 1.8), fitZoom, Math.max(fitZoom, 1.16))
        : clamp(Math.max(currentZoom, fitZoom * 1.38), fitZoom, Math.max(fitZoom, 1.42));
    let targetPan = panRef.current;
    if (unscaledWidth > 0 && unscaledHeight > 0) {
      const horizontalSafeOffset = compact
        ? 0
        : focusOptions.publicNavigation
          ? -Math.min(195, viewportWidth * 0.2)
          : globalStoriesOpen
            ? Math.min(215, viewportWidth * 0.22)
            : selected
              ? -Math.min(195, viewportWidth * 0.2)
              : 0;
      const verticalSafeOffset = compact && focusOptions.publicNavigation
        ? -viewportHeight * (focusOptions.showDetails ? 0.26 : 0.18)
        : compact && (globalStoriesOpen || selected)
          ? -viewportHeight * (publicPanelExpanded || publicPlaceExpanded ? 0.26 : 0.18)
          : 0;
      const rawPan = {
        x: horizontalSafeOffset - ((x - 50) / 100) * unscaledWidth * targetZoom,
        y: verticalSafeOffset - ((y - 50) / 100) * unscaledHeight * targetZoom,
      };
      const horizontalTravel = Math.max(0, (unscaledWidth * targetZoom - viewportWidth) / 2) + viewportWidth * 0.3;
      const verticalTravel = Math.max(0, (unscaledHeight * targetZoom - viewportHeight) / 2) + viewportHeight * 0.3;
      targetPan = {
        x: clamp(rawPan.x, -horizontalTravel, horizontalTravel),
        y: clamp(rawPan.y, -verticalTravel, verticalTravel),
      };
    }
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    startProgrammaticMapFocus({ zoom: targetZoom, pan: targetPan }, viewportWidth, Boolean(reduceMotion));
    setFocusPulseId(elementId);
    window.setTimeout(() => setFocusPulseId((current) => current === elementId ? null : current), reduceMotion ? 80 : 900);
  }, [finishProgrammaticMapFocus, fitZoom, globalStoriesOpen, panRef, publicLayoutAccess, publicPanelExpanded, publicPlaceExpanded, selected, setEditorMapPan, setFocusPulseId, setZoom, stageDimensions.height, stageDimensions.width, stageRef, startProgrammaticMapFocus, viewportDimensions.height, viewportDimensions.width, viewportRef, zoomRef]);

  return {
    undo,
    redo,
    onWheel,
    startPan,
    handleStagePointerDown,
    startDrag,
    startLabelDrag,
    startDenseLabelDrag,
    startResize,
    focusMapPosition,
  };
}
