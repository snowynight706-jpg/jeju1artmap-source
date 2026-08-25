"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
  type WheelEvent as ReactWheelEvent,
} from "react";

import type { PublicLayoutAccess } from "../core/types";
import { mapStageGestureTransform } from "./stage-transform.mjs";
import { touchLayersCanRelease } from "./gesture-lifecycle.mjs";

export type MapPan = { x: number; y: number };

export type PublicPanInteraction = {
  startX: number;
  startY: number;
  panX: number;
  panY: number;
  pendingPublicPlaceId?: string;
  pendingPlaceRequestLocation?: boolean;
};

type PinchGesture = {
  pointerIds: [number, number];
  startDistance: number;
  startCenterX: number;
  startCenterY: number;
  startZoom: number;
  startPanX: number;
  startPanY: number;
};

type TransformTarget = { zoom: number; pan: MapPan };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

type UseMapTransformControllerOptions = {
  elements: {
    viewportRef: RefObject<HTMLDivElement | null>;
    stageWrapRef: RefObject<HTMLDivElement | null>;
    stageRef: RefObject<HTMLDivElement | null>;
    mobileMarkerPlaceholderLayerRef: RefObject<HTMLDivElement | null>;
  };
  transform: {
    fitZoom: number;
    zoomRef: RefObject<number>;
    panRef: RefObject<MapPan>;
    zoom: number;
    publicLayoutAccess: PublicLayoutAccess;
    setZoom: Dispatch<SetStateAction<number>>;
    setMapLayoutZoom: (zoom: number) => void;
    setMapPan: (pan: MapPan) => void;
    setMapRenderPan: Dispatch<SetStateAction<MapPan>>;
    setEditorMapPan: (pan: MapPan) => void;
  };
  clearInteraction: () => void;
};

export function useMapTransformController({
  elements: {
    viewportRef,
    stageWrapRef,
    stageRef,
    mobileMarkerPlaceholderLayerRef,
  },
  transform: {
    fitZoom,
    zoomRef,
    panRef,
    zoom,
    publicLayoutAccess,
    setZoom,
    setMapLayoutZoom,
    setMapPan,
    setMapRenderPan,
    setEditorMapPan,
  },
  clearInteraction,
}: UseMapTransformControllerOptions) {
  const activeTouchPointersRef = useRef(new Map<number, { clientX: number; clientY: number }>());
  const pinchGestureRef = useRef<PinchGesture | null>(null);
  const panInteractionRef = useRef<PublicPanInteraction | null>(null);
  const touchTransformBaseZoomRef = useRef(0.72);
  const committedReactZoomRef = useRef(zoom);
  const touchTransformFrameRef = useRef<number | null>(null);
  const touchLayerReleaseFrameRef = useRef<number | null>(null);
  const touchLayerReleaseTimerRef = useRef<number | null>(null);
  const pendingTouchTransformRef = useRef<TransformTarget | null>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const wheelCommitTimerRef = useRef<number | null>(null);
  const editorLabelRevealTimerRef = useRef<number | null>(null);
  const editorLabelZoomRef = useRef(0.72);
  const wheelGestureAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const focusTransitionFrameRef = useRef<number | null>(null);
  const focusTransitionTimerRef = useRef<number | null>(null);
  const focusTransitionTargetRef = useRef<TransformTarget | null>(null);
  const pendingWheelRef = useRef<{ deltaY: number; cursorX: number; cursorY: number } | null>(null);
  const touchLayerReleaseGenerationRef = useRef(0);

  const applyTouchMapTransform = useCallback((nextZoom: number, nextPan: MapPan) => {
    const stageWrap = stageWrapRef.current;
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    if (!stageWrap || !stage || !viewport) return;
    const scale = nextZoom / Math.max(touchTransformBaseZoomRef.current, 0.01);
    stageWrap.style.transform = `translate3d(calc(-50% + ${nextPan.x}px), calc(-50% + ${nextPan.y}px), 0)`;
    stage.style.transform = mapStageGestureTransform(scale, viewport.clientWidth);
    mobileMarkerPlaceholderLayerRef.current?.style.setProperty("--mobile-marker-gesture-scale", `${1 / scale}`);
    viewport.classList.add("is-direct-manipulation");
  }, [mobileMarkerPlaceholderLayerRef, stageRef, stageWrapRef, viewportRef]);

  const flushTouchMapTransform = useCallback(() => {
    if (touchTransformFrameRef.current !== null) {
      window.cancelAnimationFrame(touchTransformFrameRef.current);
      touchTransformFrameRef.current = null;
    }
    const pending = pendingTouchTransformRef.current;
    pendingTouchTransformRef.current = null;
    if (pending) applyTouchMapTransform(pending.zoom, pending.pan);
  }, [applyTouchMapTransform]);

  const queueTouchMapTransform = useCallback((nextZoom: number, nextPan: MapPan) => {
    zoomRef.current = nextZoom;
    panRef.current = nextPan;
    pendingTouchTransformRef.current = { zoom: nextZoom, pan: nextPan };
    viewportRef.current?.classList.add("is-map-labels-suspended");
    if (touchTransformFrameRef.current !== null) return;
    touchTransformFrameRef.current = window.requestAnimationFrame(() => {
      touchTransformFrameRef.current = null;
      const pending = pendingTouchTransformRef.current;
      pendingTouchTransformRef.current = null;
      if (pending) applyTouchMapTransform(pending.zoom, pending.pan);
    });
  }, [applyTouchMapTransform, panRef, viewportRef, zoomRef]);

  const cancelTouchLayerRelease = useCallback(() => {
    touchLayerReleaseGenerationRef.current += 1;
    if (touchLayerReleaseFrameRef.current !== null) {
      window.cancelAnimationFrame(touchLayerReleaseFrameRef.current);
      touchLayerReleaseFrameRef.current = null;
    }
    if (touchLayerReleaseTimerRef.current !== null) {
      window.clearTimeout(touchLayerReleaseTimerRef.current);
      touchLayerReleaseTimerRef.current = null;
    }
  }, []);

  const scheduleTouchLayerRelease = useCallback((delayMs = 80, expectedZoom = zoomRef.current) => {
    cancelTouchLayerRelease();
    const generation = touchLayerReleaseGenerationRef.current;
    const startedAt = performance.now();
    const releaseWhenSettled = () => {
      if (generation !== touchLayerReleaseGenerationRef.current) return;
      if (activeTouchPointersRef.current.size > 0 || pinchGestureRef.current) {
        touchLayerReleaseTimerRef.current = window.setTimeout(releaseWhenSettled, 32);
        return;
      }
      const zoomSettled = touchLayersCanRelease({
        activeTouchCount: activeTouchPointersRef.current.size,
        pinchActive: Boolean(pinchGestureRef.current),
        committedZoom: committedReactZoomRef.current,
        expectedZoom,
      });
      if (!zoomSettled && performance.now() - startedAt < 1200) {
        touchLayerReleaseFrameRef.current = window.requestAnimationFrame(releaseWhenSettled);
        return;
      }
      viewportRef.current?.classList.remove("is-direct-manipulation", "is-map-labels-suspended");
    };
    touchLayerReleaseFrameRef.current = window.requestAnimationFrame(() => {
      touchLayerReleaseFrameRef.current = null;
      touchLayerReleaseTimerRef.current = window.setTimeout(() => {
        touchLayerReleaseTimerRef.current = null;
        releaseWhenSettled();
      }, delayMs);
    });
  }, [cancelTouchLayerRelease, viewportRef, zoomRef]);

  const clearProgrammaticMapFocus = useCallback(() => {
    if (focusTransitionFrameRef.current !== null) {
      window.cancelAnimationFrame(focusTransitionFrameRef.current);
      focusTransitionFrameRef.current = null;
    }
    if (focusTransitionTimerRef.current !== null) {
      window.clearTimeout(focusTransitionTimerRef.current);
      focusTransitionTimerRef.current = null;
    }
    const stageWrap = stageWrapRef.current;
    const stage = stageRef.current;
    if (stageWrap) stageWrap.style.removeProperty("transition");
    if (stage) {
      stage.style.removeProperty("transition");
      stage.style.removeProperty("transform");
    }
    mobileMarkerPlaceholderLayerRef.current?.style.removeProperty("--mobile-marker-gesture-scale");
  }, [mobileMarkerPlaceholderLayerRef, stageRef, stageWrapRef]);

  const cancelProgrammaticMapFocus = useCallback(() => {
    focusTransitionTargetRef.current = null;
    clearProgrammaticMapFocus();
  }, [clearProgrammaticMapFocus]);

  const finishProgrammaticMapFocus = useCallback(() => {
    const target = focusTransitionTargetRef.current;
    if (!target) return;
    focusTransitionTargetRef.current = null;
    clearProgrammaticMapFocus();
    setMapLayoutZoom(target.zoom);
    setMapPan(target.pan);
    setMapRenderPan(target.pan);
    touchTransformBaseZoomRef.current = target.zoom;
    zoomRef.current = target.zoom;
    startTransition(() => {
      setZoom(target.zoom);
    });
    scheduleTouchLayerRelease(viewportRef.current?.clientWidth && viewportRef.current.clientWidth <= 760 ? 170 : 80, target.zoom);
  }, [clearProgrammaticMapFocus, scheduleTouchLayerRelease, setMapLayoutZoom, setMapPan, setMapRenderPan, setZoom, viewportRef, zoomRef]);

  const beginTouchMapTransform = useCallback(() => {
    finishProgrammaticMapFocus();
    cancelTouchLayerRelease();
    flushTouchMapTransform();
    touchTransformBaseZoomRef.current = zoomRef.current;
    applyTouchMapTransform(zoomRef.current, panRef.current);
  }, [applyTouchMapTransform, cancelTouchLayerRelease, finishProgrammaticMapFocus, flushTouchMapTransform, panRef, zoomRef]);

  const commitTouchMapTransform = useCallback(() => {
    flushTouchMapTransform();
    const committedZoom = zoomRef.current;
    const committedPan = { ...panRef.current };
    const zoomChanged = Math.abs(committedZoom - touchTransformBaseZoomRef.current) > 0.002;
    // The layout width and the public scale status must commit in the same
    // render. Deferring only zoom left the map at the new CSS width while the
    // status still described the previous scale for a visible PWA frame.
    setZoom(committedZoom);
    setMapLayoutZoom(committedZoom);
    stageRef.current?.style.removeProperty("transform");
    mobileMarkerPlaceholderLayerRef.current?.style.removeProperty("--mobile-marker-gesture-scale");
    touchTransformBaseZoomRef.current = committedZoom;
    setMapPan(committedPan);
    setMapRenderPan((current) => (
      current.x === committedPan.x && current.y === committedPan.y ? current : committedPan
    ));
    scheduleTouchLayerRelease(zoomChanged && viewportRef.current?.clientWidth && viewportRef.current.clientWidth <= 760 ? 170 : 80, committedZoom);
  }, [flushTouchMapTransform, mobileMarkerPlaceholderLayerRef, panRef, scheduleTouchLayerRelease, setMapLayoutZoom, setMapPan, setMapRenderPan, setZoom, stageRef, viewportRef, zoomRef]);

  const beginPinchGesture = useCallback(() => {
    const viewport = viewportRef.current?.getBoundingClientRect();
    const pointers = [...activeTouchPointersRef.current.entries()];
    if (!viewport || pointers.length < 2) return false;
    const [[firstId, first], [secondId, second]] = pointers;
    const centerClientX = (first.clientX + second.clientX) / 2;
    const centerClientY = (first.clientY + second.clientY) / 2;
    pinchGestureRef.current = {
      pointerIds: [firstId, secondId],
      startDistance: Math.max(12, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)),
      startCenterX: centerClientX - viewport.left - viewport.width / 2,
      startCenterY: centerClientY - viewport.top - viewport.height / 2,
      startZoom: zoomRef.current,
      startPanX: panRef.current.x,
      startPanY: panRef.current.y,
    };
    beginTouchMapTransform();
    panInteractionRef.current = null;
    viewportRef.current?.classList.remove("is-panning");
    clearInteraction();
    return true;
  }, [beginTouchMapTransform, clearInteraction, panRef, viewportRef, zoomRef]);

  const applyPendingWheelTransform = useCallback(() => {
    const next = pendingWheelRef.current;
    pendingWheelRef.current = null;
    if (!next) return false;
    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;
    const nextZoom = clamp(currentZoom * Math.exp(-next.deltaY * 0.0012), fitZoom, 4);
    const ratio = nextZoom / Math.max(currentZoom, 0.01);
    queueTouchMapTransform(nextZoom, {
      x: next.cursorX - (next.cursorX - currentPan.x) * ratio,
      y: next.cursorY - (next.cursorY - currentPan.y) * ratio,
    });
    return true;
  }, [fitZoom, panRef, queueTouchMapTransform, zoomRef]);

  const flushPendingWheelFrame = useCallback(() => {
    if (wheelFrameRef.current !== null) {
      window.cancelAnimationFrame(wheelFrameRef.current);
      wheelFrameRef.current = null;
    }
    return applyPendingWheelTransform();
  }, [applyPendingWheelTransform]);

  const handleWheel = useCallback((
    event: ReactWheelEvent<HTMLDivElement>,
    onSettle: (metric: "pinch-settle") => void,
  ) => {
    event.preventDefault();
    const viewport = viewportRef.current?.getBoundingClientRect();
    if (!viewport) return;
    const cursorX = event.clientX - viewport.left - viewport.width / 2;
    const cursorY = event.clientY - viewport.top - viewport.height / 2;
    if (publicLayoutAccess === "editor") {
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      const nextZoom = clamp(currentZoom * Math.exp(-event.deltaY * 0.0012), 0.22, 4);
      const ratio = nextZoom / Math.max(currentZoom, 0.01);
      zoomRef.current = nextZoom;
      setEditorMapPan({
        x: cursorX - (cursorX - currentPan.x) * ratio,
        y: cursorY - (cursorY - currentPan.y) * ratio,
      });
      setZoom(nextZoom);
      return;
    }
    if (wheelCommitTimerRef.current === null) {
      beginTouchMapTransform();
      wheelGestureAnchorRef.current = { x: cursorX, y: cursorY };
    }
    const wheelAnchor = wheelGestureAnchorRef.current ?? { x: cursorX, y: cursorY };
    const pending = pendingWheelRef.current;
    pendingWheelRef.current = {
      deltaY: (pending?.deltaY ?? 0) + event.deltaY,
      cursorX: wheelAnchor.x,
      cursorY: wheelAnchor.y,
    };
    if (wheelFrameRef.current !== null) return;
    wheelFrameRef.current = window.requestAnimationFrame(() => {
      wheelFrameRef.current = null;
      applyPendingWheelTransform();
    });
    if (wheelCommitTimerRef.current !== null) window.clearTimeout(wheelCommitTimerRef.current);
    wheelCommitTimerRef.current = window.setTimeout(() => {
      wheelCommitTimerRef.current = null;
      wheelGestureAnchorRef.current = null;
      flushPendingWheelFrame();
      commitTouchMapTransform();
      onSettle("pinch-settle");
    }, 110);
  }, [applyPendingWheelTransform, beginTouchMapTransform, commitTouchMapTransform, flushPendingWheelFrame, panRef, publicLayoutAccess, setEditorMapPan, setZoom, viewportRef, zoomRef]);

  const commitPendingWheelTransform = useCallback(() => {
    const hadPendingWheel = wheelCommitTimerRef.current !== null
      || wheelFrameRef.current !== null
      || pendingWheelRef.current !== null;
    if (!hadPendingWheel) return false;
    if (wheelCommitTimerRef.current !== null) window.clearTimeout(wheelCommitTimerRef.current);
    wheelCommitTimerRef.current = null;
    flushPendingWheelFrame();
    wheelGestureAnchorRef.current = null;
    commitTouchMapTransform();
    return true;
  }, [commitTouchMapTransform, flushPendingWheelFrame]);

  const discardPendingWheelTransform = useCallback(() => {
    if (wheelFrameRef.current !== null) window.cancelAnimationFrame(wheelFrameRef.current);
    if (wheelCommitTimerRef.current !== null) window.clearTimeout(wheelCommitTimerRef.current);
    wheelFrameRef.current = null;
    wheelCommitTimerRef.current = null;
    pendingWheelRef.current = null;
    wheelGestureAnchorRef.current = null;
  }, []);

  const startProgrammaticMapFocus = useCallback((
    target: TransformTarget,
    viewportWidth: number,
    reduceMotion: boolean,
  ) => {
    discardPendingWheelTransform();
    finishProgrammaticMapFocus();
    const stageWrap = stageWrapRef.current;
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    const currentLayoutZoom = Math.max(zoomRef.current, 0.01);
    focusTransitionTargetRef.current = target;
    if (reduceMotion || !stageWrap || !stage || !viewport) {
      finishProgrammaticMapFocus();
      return;
    }
    cancelTouchLayerRelease();
    viewport.classList.add("is-direct-manipulation");
    viewport.classList.add("is-map-labels-suspended");
    stageWrap.style.transition = "transform .3s cubic-bezier(.22, .78, .28, 1)";
    stage.style.transition = "transform .3s cubic-bezier(.22, .78, .28, 1)";
    stage.style.transform = mapStageGestureTransform(1, viewportWidth);
    void stage.offsetWidth;
    focusTransitionFrameRef.current = window.requestAnimationFrame(() => {
      focusTransitionFrameRef.current = null;
      if (!focusTransitionTargetRef.current) return;
      stageWrap.style.transform = `translate3d(calc(-50% + ${target.pan.x}px), calc(-50% + ${target.pan.y}px), 0)`;
      stage.style.transform = mapStageGestureTransform(target.zoom / currentLayoutZoom, viewportWidth);
    });
    focusTransitionTimerRef.current = window.setTimeout(finishProgrammaticMapFocus, 320);
  }, [cancelTouchLayerRelease, discardPendingWheelTransform, finishProgrammaticMapFocus, stageRef, stageWrapRef, viewportRef, zoomRef]);

  const cancelTransientMapTransforms = useCallback(() => {
    discardPendingWheelTransform();
    cancelProgrammaticMapFocus();
    cancelTouchLayerRelease();
    if (touchTransformFrameRef.current !== null) window.cancelAnimationFrame(touchTransformFrameRef.current);
    touchTransformFrameRef.current = null;
    pendingTouchTransformRef.current = null;
    activeTouchPointersRef.current.clear();
    pinchGestureRef.current = null;
    panInteractionRef.current = null;
    stageRef.current?.style.removeProperty("transform");
    stageWrapRef.current?.style.removeProperty("transition");
    mobileMarkerPlaceholderLayerRef.current?.style.removeProperty("--mobile-marker-gesture-scale");
    viewportRef.current?.classList.remove("is-panning", "is-direct-manipulation", "is-map-labels-suspended");
    touchTransformBaseZoomRef.current = zoomRef.current;
  }, [cancelProgrammaticMapFocus, cancelTouchLayerRelease, discardPendingWheelTransform, mobileMarkerPlaceholderLayerRef, stageRef, stageWrapRef, viewportRef, zoomRef]);

  useLayoutEffect(() => {
    if (publicLayoutAccess === "viewer") setMapPan(panRef.current);
  }, [panRef, publicLayoutAccess, setMapPan]);

  useLayoutEffect(() => {
    committedReactZoomRef.current = zoom;
    zoomRef.current = zoom;
    if (publicLayoutAccess === "viewer") setMapLayoutZoom(zoom);
  }, [publicLayoutAccess, setMapLayoutZoom, zoom, zoomRef]);

  useEffect(() => {
    const previousZoom = editorLabelZoomRef.current;
    editorLabelZoomRef.current = zoom;
    if (publicLayoutAccess !== "editor" || Math.abs(previousZoom - zoom) <= 0.0001) return;
    viewportRef.current?.classList.add("is-map-labels-suspended");
    if (editorLabelRevealTimerRef.current !== null) window.clearTimeout(editorLabelRevealTimerRef.current);
    editorLabelRevealTimerRef.current = window.setTimeout(() => {
      editorLabelRevealTimerRef.current = null;
      viewportRef.current?.classList.remove("is-map-labels-suspended");
    }, 150);
  }, [publicLayoutAccess, viewportRef, zoom]);

  useEffect(() => () => {
    cancelTransientMapTransforms();
    if (editorLabelRevealTimerRef.current !== null) window.clearTimeout(editorLabelRevealTimerRef.current);
  }, [cancelTransientMapTransforms]);

  return {
    activeTouchPointersRef,
    pinchGestureRef,
    panInteractionRef,
    zoomRef,
    panRef,
    queueTouchMapTransform,
    scheduleTouchLayerRelease,
    beginTouchMapTransform,
    commitTouchMapTransform,
    beginPinchGesture,
    handleWheel,
    commitPendingWheelTransform,
    discardPendingWheelTransform,
    finishProgrammaticMapFocus,
    cancelProgrammaticMapFocus,
    cancelTransientMapTransforms,
    startProgrammaticMapFocus,
  };
}
