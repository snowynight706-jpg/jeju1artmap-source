"use client";

import {
  startTransition,
  useEffect,
  useLayoutEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import type {
  BaseMapMode,
  UploadedBaseMap,
} from "../../editor/persistence/public-layout-client";
import { MAP_ASPECT } from "../calibration/model";
import { isPrimaryHubLabel } from "../core/model";
import type {
  MapAsset,
  MapElement,
  PublicLayoutAccess,
  StageDimensions,
} from "../core/types";
import {
  baseMapDisplayLayers,
  lowTierBaseMapNeedsHighResolution,
} from "../rendering/base-map-quality.mjs";
import type { MobileRenderBudget } from "../rendering/mobile-render";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type Point = { x: number; y: number };
type MutableRef<T> = { current: T };
type StartupViewTarget = { zoom: number; pan: Point };

type UseMapRuntimeLifecycleOptions = {
  baseMap: BaseMapMode;
  mapSvg: string;
  mapPng: string;
  signatureSource: string;
  uploadedBaseMap: UploadedBaseMap | null;
  decodedHighResolutionBaseMapSource: string;
  mobileRenderBudget: MobileRenderBudget;
  publicLayoutAccess: PublicLayoutAccess;
  publicAssetProfile: "mobile" | "standard";
  viewportDimensions: StageDimensions;
  stageDimensions: StageDimensions;
  zoom: number;
  mapRenderPan: Point;
  hydrated: boolean;
  visibleElements: MapElement[];
  assetsById: ReadonlyMap<string, MapAsset>;
  elements: MapElement[];
  startupAssetsReady: boolean;
  startupInitialViewTarget: StartupViewTarget | null;
  startupInitialViewReady: boolean;
  startupRevealReady: boolean;
  settledLabelZoom: number;
  printPreviewMode: boolean;
  labelDetailRatio: number;
  calibrationLiveApply: boolean;
  fitZoom: number;
  stageLabelElementCount: number;
  baseMapImgRef: RefObject<HTMLImageElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  stageWrapRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  startupLoadCompletedRef: MutableRef<boolean>;
  fitZoomRef: MutableRef<number>;
  fitZoomAppliedRef: MutableRef<boolean>;
  zoomRef: MutableRef<number>;
  panRef: MutableRef<Point>;
  publicInitialViewAppliedRef: MutableRef<boolean>;
  performanceStartupSentRef: MutableRef<boolean>;
  performanceStartedAtRef: MutableRef<number>;
  calibrationLiveApplyRef: MutableRef<boolean>;
  uploadedBaseMapOriginalSource: (metadata: UploadedBaseMap | null) => string;
  setDecodedHighResolutionBaseMapSource: StateSetter<string>;
  setMapLoaded: StateSetter<boolean>;
  setStartupLoadDone: StateSetter<number>;
  setStartupLoadTotal: StateSetter<number>;
  setStartupAssetsReady: StateSetter<boolean>;
  setStageDimensions: StateSetter<StageDimensions>;
  setViewportDimensions: StateSetter<StageDimensions>;
  setZoom: StateSetter<number>;
  setStartupInitialViewTarget: StateSetter<StartupViewTarget | null>;
  setStartupInitialViewReady: StateSetter<boolean>;
  setStartupRevealReady: StateSetter<boolean>;
  setForceIndividualLabels: StateSetter<boolean>;
  setSettledLabelZoom: StateSetter<number>;
  setSettledLabelPan: StateSetter<Point>;
  setMapRenderPan: StateSetter<Point>;
  setMapLayoutZoom: (zoom: number) => void;
  setEditorMapPan: (pan: Point) => void;
  setMapPan: (pan: Point) => void;
  sendPerformanceDiagnostic: (payload: {
    metric: "startup";
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

export function useMapRuntimeLifecycle({
  baseMap,
  mapSvg,
  mapPng,
  signatureSource,
  uploadedBaseMap,
  decodedHighResolutionBaseMapSource,
  mobileRenderBudget,
  publicLayoutAccess,
  publicAssetProfile,
  viewportDimensions,
  stageDimensions,
  zoom,
  mapRenderPan,
  hydrated,
  visibleElements,
  assetsById,
  elements,
  startupAssetsReady,
  startupInitialViewTarget,
  startupInitialViewReady,
  startupRevealReady,
  settledLabelZoom,
  printPreviewMode,
  labelDetailRatio,
  calibrationLiveApply,
  fitZoom,
  stageLabelElementCount,
  baseMapImgRef,
  viewportRef,
  stageWrapRef,
  stageRef,
  startupLoadCompletedRef,
  fitZoomRef,
  fitZoomAppliedRef,
  zoomRef,
  panRef,
  publicInitialViewAppliedRef,
  performanceStartupSentRef,
  performanceStartedAtRef,
  calibrationLiveApplyRef,
  uploadedBaseMapOriginalSource,
  setDecodedHighResolutionBaseMapSource,
  setMapLoaded,
  setStartupLoadDone,
  setStartupLoadTotal,
  setStartupAssetsReady,
  setStageDimensions,
  setViewportDimensions,
  setZoom,
  setStartupInitialViewTarget,
  setStartupInitialViewReady,
  setStartupRevealReady,
  setForceIndividualLabels,
  setSettledLabelZoom,
  setSettledLabelPan,
  setMapRenderPan,
  setMapLayoutZoom,
  setEditorMapPan,
  setMapPan,
  sendPerformanceDiagnostic,
}: UseMapRuntimeLifecycleOptions) {
  const baseMapViewportWidth = viewportDimensions.width > 0
    ? viewportDimensions.width
    : typeof window !== "undefined"
      ? window.innerWidth
      : 0;
  const lowTierMobileBaseMap = publicLayoutAccess === "viewer"
    && mobileRenderBudget.tier === "low"
    && baseMapViewportWidth > 0
    && baseMapViewportWidth <= 760;
  const useMobileLandmarkAssets = publicLayoutAccess === "viewer" && publicAssetProfile === "mobile";
  const highResolutionBaseMapSource = uploadedBaseMap?.screen4096Url ?? "";
  const uploadedBaseMapDisplaySource = (metadata: UploadedBaseMap | null, preferCompact = false) => {
    if (!metadata?.available) return "";
    if (preferCompact) {
      return metadata.screen2048Url ?? metadata.screen4096Url ?? uploadedBaseMapOriginalSource(metadata);
    }
    return metadata.screen4096Url ?? metadata.screen2048Url ?? uploadedBaseMapOriginalSource(metadata);
  };
  const uploadedBaseMapLayers = baseMapDisplayLayers({
    lowTierMobile: lowTierMobileBaseMap,
    compactSource: uploadedBaseMapDisplaySource(uploadedBaseMap, true),
    standardSource: uploadedBaseMapDisplaySource(uploadedBaseMap),
    highResolutionSource: highResolutionBaseMapSource,
    decodedHighResolutionSource: decodedHighResolutionBaseMapSource,
  });
  const activeBaseMapSrc = baseMap === "svg"
    ? mapSvg
    : baseMap === "png"
      ? mapPng
      : uploadedBaseMapLayers.baseSource || mapSvg;
  const baseMapResolutionUpgradeSrc = baseMap === "uploaded"
    ? uploadedBaseMapLayers.upgradeSource
    : "";
  const lowTierBaseMapUpgradeNeeded = baseMap === "uploaded"
    && lowTierMobileBaseMap
    && Boolean(highResolutionBaseMapSource)
    && decodedHighResolutionBaseMapSource !== highResolutionBaseMapSource
    && stageDimensions.width <= 1600
    && lowTierBaseMapNeedsHighResolution({
      tier: mobileRenderBudget.tier,
      viewportWidth: baseMapViewportWidth,
      stageWidth: stageDimensions.width,
      zoom,
      devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
    });

  useEffect(() => {
    if (!lowTierBaseMapUpgradeNeeded || !highResolutionBaseMapSource) return;
    let cancelled = false;
    let finished = false;
    const image = new Image();
    const finish = async () => {
      if (finished) return;
      finished = true;
      try {
        await image.decode();
      } catch {
        // A completed image can still be reused when explicit decode is unavailable.
      }
      if (!cancelled) setDecodedHighResolutionBaseMapSource(highResolutionBaseMapSource);
    };
    image.decoding = "async";
    image.fetchPriority = "low";
    image.onload = () => { void finish(); };
    image.onerror = () => { finished = true; };
    image.src = highResolutionBaseMapSource;
    if (image.complete && image.naturalWidth > 0) void finish();
    return () => { cancelled = true; };
  }, [decodedHighResolutionBaseMapSource, highResolutionBaseMapSource, lowTierBaseMapUpgradeNeeded, setDecodedHighResolutionBaseMapSource]);

  useEffect(() => {
    const image = baseMapImgRef.current;
    if (image?.complete && image.naturalWidth > 0) setMapLoaded(true);
  }, [activeBaseMapSrc, baseMapImgRef, setMapLoaded]);

  useEffect(() => {
    if (publicLayoutAccess === "loading" || !hydrated || startupLoadCompletedRef.current) return;
    let cancelled = false;
    const mapSource = activeBaseMapSrc;
    if (!mapSource) return;
    const primaryHub = visibleElements.find((element) => isPrimaryHubLabel(element.name));
    const primaryHubAsset = primaryHub?.assetId ? assetsById.get(primaryHub.assetId) : undefined;
    const sources = [...new Set([
      signatureSource,
      mapSource,
      useMobileLandmarkAssets
        ? primaryHubAsset?.mobileSrc ?? primaryHubAsset?.screenSrc ?? primaryHubAsset?.src
        : primaryHubAsset?.screenSrc ?? primaryHubAsset?.src,
    ].filter((source): source is string => Boolean(source)))];
    const preload = (source: string) => new Promise<void>((resolve) => {
      const image = new Image();
      let finished = false;
      let timeout = 0;
      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        if (!cancelled) setStartupLoadDone((current) => current + 1);
        resolve();
      };
      timeout = window.setTimeout(finish, 15000);
      image.decoding = "async";
      image.onload = finish;
      image.onerror = finish;
      image.src = source;
      if (image.complete) finish();
    });

    queueMicrotask(() => {
      if (cancelled) return;
      setStartupLoadDone(0);
      setStartupLoadTotal(sources.length);
      void Promise.all(sources.map(preload)).then(() => {
        if (cancelled) return;
        setStartupLoadDone(sources.length);
        setMapLoaded(true);
        window.requestAnimationFrame(() => {
          if (cancelled) return;
          startupLoadCompletedRef.current = true;
          setStartupAssetsReady(true);
        });
      });
    });
    return () => { cancelled = true; };
  }, [activeBaseMapSrc, assetsById, hydrated, publicAssetProfile, publicLayoutAccess, setMapLoaded, setStartupAssetsReady, setStartupLoadDone, setStartupLoadTotal, signatureSource, startupLoadCompletedRef, useMobileLandmarkAssets, viewportDimensions.width, visibleElements]);

  useEffect(() => {
    const stageWrap = stageWrapRef.current;
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    if (!stageWrap || !stage || !viewport) return;
    const measure = () => {
      const width = stageWrap.offsetWidth;
      const height = width / MAP_ASPECT;
      const viewportWidth = viewport.clientWidth;
      const viewportHeight = viewport.clientHeight;
      if (width > 0 && height > 0) {
        setStageDimensions((current) => (
          Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
            ? current
            : { width, height }
        ));
      }
      if (viewportWidth > 0 && viewportHeight > 0) {
        setViewportDimensions((current) => (
          Math.abs(current.width - viewportWidth) < 0.5 && Math.abs(current.height - viewportHeight) < 0.5
            ? current
            : { width: viewportWidth, height: viewportHeight }
        ));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stageWrap);
    observer.observe(viewport);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [publicLayoutAccess, setStageDimensions, setViewportDimensions, stageRef, stageWrapRef, viewportRef]);

  useEffect(() => {
    if (viewportDimensions.width <= 0 || viewportDimensions.height <= 0) return;
    const previousFitZoom = fitZoomRef.current;
    const wasAtFit = Math.abs(zoom - previousFitZoom) <= 0.018;
    fitZoomRef.current = fitZoom;
    if (viewportRef.current?.classList.contains("is-direct-manipulation")) return;
    if (!fitZoomAppliedRef.current || wasAtFit || (publicLayoutAccess === "viewer" && zoom < fitZoom - 0.002)) {
      fitZoomAppliedRef.current = true;
      const frame = window.requestAnimationFrame(() => {
        zoomRef.current = fitZoom;
        setZoom(fitZoom);
        if (publicLayoutAccess === "editor") setEditorMapPan({ x: 0, y: 0 });
        else setMapPan({ x: 0, y: 0 });
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [fitZoom, fitZoomAppliedRef, fitZoomRef, publicLayoutAccess, setEditorMapPan, setMapPan, setZoom, viewportDimensions.height, viewportDimensions.width, viewportRef, zoom, zoomRef]);

  useEffect(() => {
    if (
      publicInitialViewAppliedRef.current
      || !hydrated
      || !startupAssetsReady
      || publicLayoutAccess !== "viewer"
      || viewportDimensions.width <= 0
      || viewportDimensions.height <= 0
    ) return;
    const primaryHub = elements.find((element) => isPrimaryHubLabel(element.name) && element.mapVisible);
    if (stageDimensions.width <= 0 || stageDimensions.height <= 0) return;
    if (!primaryHub) {
      publicInitialViewAppliedRef.current = true;
      setStartupInitialViewTarget({ zoom: zoomRef.current, pan: { ...panRef.current } });
      return;
    }

    const compact = viewportDimensions.width <= 760;
    const viewportFillZoom = Math.max(
      viewportDimensions.width / stageDimensions.width,
      viewportDimensions.height / stageDimensions.height,
    );
    const targetZoom = compact
      ? clamp(Math.max(fitZoom * 2.35, viewportFillZoom * 1.28), fitZoom, Math.max(fitZoom, 1.38))
      : clamp(Math.max(fitZoom * 1.32, viewportFillZoom * 1.02), fitZoom, Math.max(fitZoom, 1.32));
    const desiredScreen = compact
      ? { x: viewportDimensions.width * 0.5, y: viewportDimensions.height * 0.48 }
      : { x: viewportDimensions.width * 0.52, y: viewportDimensions.height * 0.48 };
    const rawPan = {
      x: desiredScreen.x - viewportDimensions.width / 2
        - ((primaryHub.x - 50) / 100) * stageDimensions.width * targetZoom,
      y: desiredScreen.y - viewportDimensions.height / 2
        - ((primaryHub.y - 50) / 100) * stageDimensions.height * targetZoom,
    };
    const horizontalTravel = Math.max(0, (stageDimensions.width * targetZoom - viewportDimensions.width) / 2) + viewportDimensions.width * 0.05;
    const verticalTravel = Math.max(0, (stageDimensions.height * targetZoom - viewportDimensions.height) / 2) + viewportDimensions.height * 0.05;
    const targetPan = {
      x: clamp(rawPan.x, -horizontalTravel, horizontalTravel),
      y: clamp(rawPan.y, -verticalTravel, verticalTravel),
    };

    const frame = window.requestAnimationFrame(() => {
      if (publicInitialViewAppliedRef.current) return;
      publicInitialViewAppliedRef.current = true;
      zoomRef.current = targetZoom;
      panRef.current = targetPan;
      setStartupInitialViewTarget({ zoom: targetZoom, pan: targetPan });
      setZoom(targetZoom);
      setMapPan(targetPan);
      setMapRenderPan(targetPan);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [elements, fitZoom, hydrated, panRef, publicInitialViewAppliedRef, publicLayoutAccess, setMapPan, setMapRenderPan, setStartupInitialViewTarget, setZoom, stageDimensions.height, stageDimensions.width, startupAssetsReady, viewportDimensions.height, viewportDimensions.width, zoomRef]);

  useLayoutEffect(() => {
    if (
      publicLayoutAccess !== "viewer"
      || !startupAssetsReady
      || !startupInitialViewTarget
      || startupInitialViewReady
      || Math.abs(zoom - startupInitialViewTarget.zoom) > 0.002
      || Math.abs(settledLabelZoom - startupInitialViewTarget.zoom) > 0.002
    ) return;
    const target = startupInitialViewTarget;
    panRef.current = target.pan;
    setMapPan(target.pan);
    const stage = stageRef.current;
    const stageWrap = stageWrapRef.current;
    if (!stage || !stageWrap || stageWrap.offsetWidth <= 0) return;
    setMapLayoutZoom(target.zoom);
    let settledFrame = 0;
    const committedFrame = window.requestAnimationFrame(() => {
      setMapPan(target.pan);
      setMapLayoutZoom(target.zoom);
      settledFrame = window.requestAnimationFrame(() => setStartupInitialViewReady(true));
    });
    return () => {
      window.cancelAnimationFrame(committedFrame);
      if (settledFrame) window.cancelAnimationFrame(settledFrame);
    };
  }, [panRef, publicLayoutAccess, setMapLayoutZoom, setMapPan, setStartupInitialViewReady, settledLabelZoom, stageRef, stageWrapRef, startupAssetsReady, startupInitialViewReady, startupInitialViewTarget, zoom]);

  useEffect(() => {
    if (publicLayoutAccess !== "editor" || !startupAssetsReady) return;
    const readyFrame = window.requestAnimationFrame(() => setStartupInitialViewReady(true));
    return () => window.cancelAnimationFrame(readyFrame);
  }, [publicLayoutAccess, setStartupInitialViewReady, startupAssetsReady]);

  useEffect(() => {
    if (publicLayoutAccess === "loading" || !startupAssetsReady || !startupInitialViewReady) return;
    const readyFrame = window.requestAnimationFrame(() => setStartupRevealReady(true));
    return () => window.cancelAnimationFrame(readyFrame);
  }, [publicLayoutAccess, setStartupRevealReady, startupAssetsReady, startupInitialViewReady]);

  useEffect(() => {
    if (publicLayoutAccess !== "viewer" || !startupRevealReady || performanceStartupSentRef.current) return;
    performanceStartupSentRef.current = true;
    const completedAt = performance.now();
    const timer = window.setTimeout(() => sendPerformanceDiagnostic({
      metric: "startup",
      durationMs: completedAt - performanceStartedAtRef.current,
      elementCount: visibleElements.length,
      labelCount: stageLabelElementCount,
      viewportWidth: viewportDimensions.width,
      viewportHeight: viewportDimensions.height,
    }), 0);
    return () => window.clearTimeout(timer);
  }, [performanceStartedAtRef, performanceStartupSentRef, publicLayoutAccess, sendPerformanceDiagnostic, stageLabelElementCount, startupRevealReady, viewportDimensions.height, viewportDimensions.width, visibleElements.length]);

  useEffect(() => {
    if (printPreviewMode) return;
    const timer = window.setTimeout(() => {
      setForceIndividualLabels((current) => current ? labelDetailRatio >= 2.45 : labelDetailRatio >= 2.7);
    }, 90);
    return () => window.clearTimeout(timer);
  }, [labelDetailRatio, printPreviewMode, setForceIndividualLabels]);

  useEffect(() => {
    if (publicLayoutAccess !== "viewer") {
      const timer = window.setTimeout(() => {
        startTransition(() => {
          setSettledLabelZoom(zoom);
          setSettledLabelPan((current) => (
            current.x === mapRenderPan.x && current.y === mapRenderPan.y
              ? current
              : { x: mapRenderPan.x, y: mapRenderPan.y }
          ));
        });
      }, 140);
      return () => window.clearTimeout(timer);
    }

    const labelFrame = window.requestAnimationFrame(() => {
      setSettledLabelZoom(zoom);
      setSettledLabelPan((current) => (
        current.x === mapRenderPan.x && current.y === mapRenderPan.y
          ? current
          : { x: mapRenderPan.x, y: mapRenderPan.y }
      ));
    });
    return () => window.cancelAnimationFrame(labelFrame);
  }, [mapRenderPan.x, mapRenderPan.y, publicLayoutAccess, setSettledLabelPan, setSettledLabelZoom, zoom]);

  useEffect(() => {
    calibrationLiveApplyRef.current = calibrationLiveApply;
  }, [calibrationLiveApply, calibrationLiveApplyRef]);

  return {
    activeBaseMapSrc,
    baseMapResolutionUpgradeSrc,
    useMobileLandmarkAssets,
  };
}
