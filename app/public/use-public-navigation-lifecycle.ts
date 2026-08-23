"use client";

import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import type { GlobalContentTab, PlaceStory } from "../content/types";
import type { PublicLayoutAccess } from "../map/core/types";
import {
  publicPanelIsExpanded,
  publicPanelIsExplorer,
  publicPanelIsPlace,
  publicUrlWithPlace,
} from "./navigation.mjs";
import type {
  PublicHistoryState,
  PublicPanelHistory,
  PublicPlaceListItem,
} from "./use-public-place-workspace";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type Point = { x: number; y: number };
type MutableRef<T> = { current: T };

type UsePublicNavigationLifecycleOptions = {
  publicLayoutAccess: PublicLayoutAccess;
  adminLoginOpen: boolean;
  placeRequestFormOpen: boolean;
  placeRequestPickingLocation: boolean;
  shortcutHelpOpen: boolean;
  globalStoriesOpen: boolean;
  fitZoom: number;
  publicPlaceItems: PublicPlaceListItem[];
  selectedId: string | null;
  publicPlaceExpanded: boolean;
  publicPanelExpanded: boolean;
  publicHistoryOpen: boolean;
  storyReportTarget: PlaceStory | null;
  databaseEditorOpen: boolean;
  placeEventFormOpen: boolean;
  publicPlaceQueryInputRef: RefObject<HTMLInputElement | null>;
  publicPreserveMapViewOnNextPopRef: MutableRef<boolean>;
  publicMapViewBeforeFocusRef: MutableRef<{ zoom: number; pan: Point } | null>;
  publicNavigationAfterPopRef: MutableRef<"explorer" | null>;
  publicNavigationApplyingRef: MutableRef<boolean>;
  publicNavigationInitializedRef: MutableRef<boolean>;
  placeRequestLocationBeforePickingRef: MutableRef<Point | null>;
  openPublicPlaceList: () => void;
  currentPublicPlaceId: () => string | null;
  restorePublicMapView: (clear?: boolean) => void;
  rememberPublicMapView: () => void;
  focusMapPosition: (
    x: number,
    y: number,
    elementId: string,
    options?: { publicNavigation?: boolean; showDetails?: boolean },
  ) => void;
  confirmDiscardStoryPhoto: (nextPlaceId?: string | null) => boolean;
  closePlaceStoryReport: () => void;
  closeDatabaseEditor: () => void;
  closePlaceEventForm: () => void;
  closePublicExplorerPanel: () => void;
  closePublicPlacePanel: () => void;
  setPublicPanelExpansion: (target: "place" | "explorer", expanded: boolean) => void;
  setGlobalContentTab: StateSetter<GlobalContentTab>;
  setZoom: StateSetter<number>;
  setMapPan: (pan: Point) => void;
  setMapRenderPan: StateSetter<Point>;
  setShortcutHelpOpen: StateSetter<boolean>;
  setSelectedId: StateSetter<string | null>;
  setSelectedFacilityId: StateSetter<string | null>;
  setSelectedNoteId: StateSetter<string | null>;
  setSelectedDenseLabelId: StateSetter<string | null>;
  setPublicPlaceExpanded: StateSetter<boolean>;
  setGlobalStoriesOpen: StateSetter<boolean>;
  setPublicPanelExpanded: StateSetter<boolean>;
  setPublicHistoryOpen: StateSetter<boolean>;
  setAdminLoginOpen: StateSetter<boolean>;
  setAdminLoginError: StateSetter<string>;
  setPlaceRequestFormOpen: StateSetter<boolean>;
  setPlaceRequestPickingLocation: StateSetter<boolean>;
  setPlaceRequestLocation: StateSetter<Point | null>;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function usePublicNavigationLifecycle({
  publicLayoutAccess,
  adminLoginOpen,
  placeRequestFormOpen,
  placeRequestPickingLocation,
  shortcutHelpOpen,
  globalStoriesOpen,
  fitZoom,
  publicPlaceItems,
  selectedId,
  publicPlaceExpanded,
  publicPanelExpanded,
  publicHistoryOpen,
  storyReportTarget,
  databaseEditorOpen,
  placeEventFormOpen,
  publicPlaceQueryInputRef,
  publicPreserveMapViewOnNextPopRef,
  publicMapViewBeforeFocusRef,
  publicNavigationAfterPopRef,
  publicNavigationApplyingRef,
  publicNavigationInitializedRef,
  placeRequestLocationBeforePickingRef,
  openPublicPlaceList,
  currentPublicPlaceId,
  restorePublicMapView,
  rememberPublicMapView,
  focusMapPosition,
  confirmDiscardStoryPhoto,
  closePlaceStoryReport,
  closeDatabaseEditor,
  closePlaceEventForm,
  closePublicExplorerPanel,
  closePublicPlacePanel,
  setPublicPanelExpansion,
  setGlobalContentTab,
  setZoom,
  setMapPan,
  setMapRenderPan,
  setShortcutHelpOpen,
  setSelectedId,
  setSelectedFacilityId,
  setSelectedNoteId,
  setSelectedDenseLabelId,
  setPublicPlaceExpanded,
  setGlobalStoriesOpen,
  setPublicPanelExpanded,
  setPublicHistoryOpen,
  setAdminLoginOpen,
  setAdminLoginError,
  setPlaceRequestFormOpen,
  setPlaceRequestPickingLocation,
  setPlaceRequestLocation,
}: UsePublicNavigationLifecycleOptions) {
  useEffect(() => {
    if (publicLayoutAccess !== "viewer") return;

    const handleViewerShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      const modifier = event.ctrlKey || event.metaKey || event.altKey;
      const blockingDialogOpen = adminLoginOpen || placeRequestFormOpen || placeRequestPickingLocation;

      if (!editingText && !modifier && event.key === "?" && !blockingDialogOpen) {
        event.preventDefault();
        setShortcutHelpOpen((current) => !current);
        return;
      }
      if (editingText || modifier || blockingDialogOpen || shortcutHelpOpen) return;

      if (event.key === "/") {
        event.preventDefault();
        if (globalStoriesOpen) setGlobalContentTab("places");
        else openPublicPlaceList();
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => publicPlaceQueryInputRef.current?.focus());
        });
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((value) => clamp(value * 1.16, fitZoom, 4));
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        setZoom((value) => clamp(value / 1.16, fitZoom, 4));
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        setZoom(fitZoom);
        setMapPan({ x: 0, y: 0 });
        setMapRenderPan({ x: 0, y: 0 });
      }
    };

    window.addEventListener("keydown", handleViewerShortcut);
    return () => window.removeEventListener("keydown", handleViewerShortcut);
  }, [adminLoginOpen, fitZoom, globalStoriesOpen, openPublicPlaceList, placeRequestFormOpen, placeRequestPickingLocation, publicLayoutAccess, publicPlaceQueryInputRef, setGlobalContentTab, setMapPan, setMapRenderPan, setShortcutHelpOpen, setZoom, shortcutHelpOpen]);

  useEffect(() => {
    if (publicLayoutAccess !== "viewer" || !publicPlaceItems.length) return;

    const applyPanel = (state: PublicHistoryState) => {
      const preserveCurrentMapView = publicPreserveMapViewOnNextPopRef.current;
      publicPreserveMapViewOnNextPopRef.current = false;
      const panel = state.wondosimPanel ?? "map";
      const item = publicPanelIsPlace(panel)
        ? publicPlaceItems.find((candidate) => candidate.id === state.wondosimPlaceId)
        : undefined;
      if (publicPanelIsPlace(panel) && !item) {
        window.history.replaceState({ wondosimPanel: "map" } satisfies PublicHistoryState, "", publicUrlWithPlace(window.location.href, null));
        setSelectedId(null);
        setSelectedFacilityId(null);
        setPublicPlaceExpanded(false);
        setGlobalStoriesOpen(false);
        setPublicPanelExpanded(false);
        restorePublicMapView(true);
        return;
      }
      if (item) {
        const alreadySelected = selectedId === item.anchor.id && currentPublicPlaceId() === item.id;
        setSelectedId(item.anchor.id);
        setSelectedFacilityId(item.place.id === item.anchor.directoryId ? null : item.place.id);
        setSelectedNoteId(null);
        setSelectedDenseLabelId(null);
        setGlobalStoriesOpen(false);
        setPublicPanelExpanded(false);
        setPublicPlaceExpanded(panel === "place-expanded");
        if (!alreadySelected) {
          focusMapPosition(item.anchor.x, item.anchor.y, item.anchor.id, {
            publicNavigation: true,
            showDetails: panel === "place-expanded",
          });
        }
        return;
      }
      setSelectedId(null);
      setSelectedFacilityId(null);
      setPublicPlaceExpanded(false);
      setGlobalContentTab("places");
      setGlobalStoriesOpen(publicPanelIsExplorer(panel));
      setPublicPanelExpanded(panel === "explorer-expanded");
      if (preserveCurrentMapView) publicMapViewBeforeFocusRef.current = null;
      else restorePublicMapView(panel === "map");
    };

    const pushPendingExplorer = () => {
      const expanded = window.innerWidth <= 760;
      const baseUrl = publicUrlWithPlace(window.location.href, null);
      window.history.pushState({ wondosimPanel: expanded ? "explorer-expanded" : "explorer" } satisfies PublicHistoryState, "", baseUrl);
      applyPanel({ wondosimPanel: expanded ? "explorer-expanded" : "explorer" });
    };

    const handlePopState = (event: PopStateEvent) => {
      if (publicNavigationAfterPopRef.current === "explorer") {
        publicNavigationAfterPopRef.current = null;
        publicNavigationApplyingRef.current = true;
        pushPendingExplorer();
        window.requestAnimationFrame(() => { publicNavigationApplyingRef.current = false; });
        return;
      }
      const urlPlaceId = new URL(window.location.href).searchParams.get("place");
      const state = (event.state ?? {}) as PublicHistoryState;
      const target: PublicHistoryState = state.wondosimPanel
        ? state
        : urlPlaceId ? { wondosimPanel: "place", wondosimPlaceId: urlPlaceId, wondosimFrom: "map" } : { wondosimPanel: "map" };
      const nextPlaceId = publicPanelIsPlace(target.wondosimPanel) ? target.wondosimPlaceId ?? null : null;
      if (!confirmDiscardStoryPhoto(nextPlaceId)) {
        window.history.forward();
        return;
      }
      publicNavigationApplyingRef.current = true;
      applyPanel(target);
      window.requestAnimationFrame(() => { publicNavigationApplyingRef.current = false; });
    };

    if (!publicNavigationInitializedRef.current) {
      const requestedPlaceId = new URL(window.location.href).searchParams.get("place");
      const requestedItem = requestedPlaceId ? publicPlaceItems.find((item) => item.id === requestedPlaceId) : undefined;
      const baseUrl = publicUrlWithPlace(window.location.href, null);
      window.history.replaceState({ wondosimPanel: "map" } satisfies PublicHistoryState, "", baseUrl);
      publicNavigationInitializedRef.current = true;
      if (requestedItem) {
        rememberPublicMapView();
        const placeState: PublicHistoryState = { wondosimPanel: "place", wondosimPlaceId: requestedItem.id, wondosimFrom: "map" };
        window.history.pushState(placeState, "", publicUrlWithPlace(window.location.href, requestedItem.id));
        publicNavigationApplyingRef.current = true;
        applyPanel(placeState);
        window.requestAnimationFrame(() => { publicNavigationApplyingRef.current = false; });
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [confirmDiscardStoryPhoto, currentPublicPlaceId, focusMapPosition, publicLayoutAccess, publicMapViewBeforeFocusRef, publicNavigationAfterPopRef, publicNavigationApplyingRef, publicNavigationInitializedRef, publicPlaceItems, publicPreserveMapViewOnNextPopRef, rememberPublicMapView, restorePublicMapView, selectedId, setGlobalContentTab, setGlobalStoriesOpen, setPublicPanelExpanded, setPublicPlaceExpanded, setSelectedDenseLabelId, setSelectedFacilityId, setSelectedId, setSelectedNoteId]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      const dismiss = (action: () => void) => {
        event.preventDefault();
        event.stopPropagation();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        action();
      };

      if (storyReportTarget) {
        dismiss(closePlaceStoryReport);
        return;
      }
      if (publicHistoryOpen) {
        dismiss(() => setPublicHistoryOpen(false));
        return;
      }
      if (shortcutHelpOpen) {
        dismiss(() => setShortcutHelpOpen(false));
        return;
      }
      if (adminLoginOpen) {
        dismiss(() => {
          setAdminLoginOpen(false);
          setAdminLoginError("");
        });
        return;
      }
      if (placeRequestFormOpen) {
        dismiss(() => {
          setPlaceRequestFormOpen(false);
          setPlaceRequestPickingLocation(false);
        });
        return;
      }
      if (placeRequestPickingLocation) {
        dismiss(() => {
          setPlaceRequestLocation(placeRequestLocationBeforePickingRef.current);
          setPlaceRequestPickingLocation(false);
          setPlaceRequestFormOpen(true);
        });
        return;
      }
      if (databaseEditorOpen) {
        dismiss(closeDatabaseEditor);
        return;
      }
      if (placeEventFormOpen) {
        dismiss(closePlaceEventForm);
        return;
      }
      if (publicLayoutAccess !== "viewer") return;

      const state = (window.history.state ?? {}) as PublicHistoryState;
      const panel: PublicPanelHistory = selectedId
        ? publicPlaceExpanded ? "place-expanded" : "place"
        : globalStoriesOpen ? publicPanelExpanded ? "explorer-expanded" : "explorer" : "map";
      if (panel === "map") return;

      dismiss(() => {
        if (publicPanelIsExpanded(panel)) {
          if (state.wondosimPanel === panel && state.wondosimExpandedFromCollapsed) window.history.back();
          else setPublicPanelExpansion(publicPanelIsPlace(panel) ? "place" : "explorer", false);
        } else if (publicPanelIsPlace(panel)) {
          closePublicPlacePanel();
        } else if (publicPanelIsExplorer(panel)) {
          closePublicExplorerPanel();
        }
      });
    };

    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [adminLoginOpen, closeDatabaseEditor, closePlaceEventForm, closePlaceStoryReport, closePublicExplorerPanel, closePublicPlacePanel, databaseEditorOpen, globalStoriesOpen, placeEventFormOpen, placeRequestFormOpen, placeRequestLocationBeforePickingRef, placeRequestPickingLocation, publicHistoryOpen, publicLayoutAccess, publicPanelExpanded, publicPlaceExpanded, selectedId, setAdminLoginError, setAdminLoginOpen, setPlaceRequestFormOpen, setPlaceRequestLocation, setPlaceRequestPickingLocation, setPublicHistoryOpen, setPublicPanelExpansion, setShortcutHelpOpen, shortcutHelpOpen, storyReportTarget]);
}
