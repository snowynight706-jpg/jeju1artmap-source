"use client";

import { startTransition, type Dispatch, type SetStateAction } from "react";
import { normalizePlaceName } from "../core-landmarks";
import type { GlobalContentTab, PlaceEventPlace, PlaceStory } from "../content/types";
import type { DirectoryPlace, MapElement, PublicLayoutAccess, StageDimensions } from "../map/core/types";
import {
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

type UsePublicNavigationActionsOptions = {
  publicLayoutAccess: PublicLayoutAccess;
  globalStoriesOpen: boolean;
  globalContentTab: GlobalContentTab;
  viewportDimensions: StageDimensions;
  publicPlaceItems: PublicPlaceListItem[];
  selectedDirectoryPlace: DirectoryPlace | null;
  selected: MapElement | null;
  selectedDisplayName: string;
  fitZoom: number;
  zoomRef: MutableRef<number>;
  panRef: MutableRef<Point>;
  publicPreserveMapViewOnNextPopRef: MutableRef<boolean>;
  publicMapViewBeforeFocusRef: MutableRef<{ zoom: number; pan: Point } | null>;
  publicNavigationAfterPopRef: MutableRef<"explorer" | null>;
  confirmDiscardStoryPhoto: (nextPlaceId?: string | null) => boolean;
  rememberPublicMapView: () => void;
  restorePublicMapView: (clear?: boolean) => void;
  currentPublicPlaceId: () => string | null;
  writePublicHistory: (
    panel: PublicPanelHistory,
    placeId?: string | null,
    mode?: "push" | "replace",
    from?: PublicHistoryState["wondosimFrom"],
    expandedFromCollapsed?: boolean,
  ) => void;
  focusMapPosition: (
    x: number,
    y: number,
    elementId: string,
    options?: { publicNavigation?: boolean; showDetails?: boolean },
  ) => void;
  setGlobalStoriesOpen: StateSetter<boolean>;
  setGlobalContentTab: StateSetter<GlobalContentTab>;
  setGlobalStoriesPage: StateSetter<number>;
  setGlobalStoriesRefreshKey: StateSetter<number>;
  setGlobalEventsPage: StateSetter<number>;
  setGlobalEventsRefreshKey: StateSetter<number>;
  setPlaceRequestsPage: StateSetter<number>;
  setSelectedId: StateSetter<string | null>;
  setSelectedFacilityId: StateSetter<string | null>;
  setSelectedNoteId: StateSetter<string | null>;
  setSelectedDenseLabelId: StateSetter<string | null>;
  setPublicPanelExpanded: StateSetter<boolean>;
  setPublicPlaceExpanded: StateSetter<boolean>;
  setZoom: StateSetter<number>;
  setMapPan: (value: Point) => void;
  setMapRenderPan: StateSetter<Point>;
  setSettledLabelZoom: StateSetter<number>;
  setSettledLabelPan: StateSetter<Point>;
  setMapRenderRefreshRevision: StateSetter<number>;
  setToast: StateSetter<string>;
};

export function usePublicNavigationActions(options: UsePublicNavigationActionsOptions) {
  const {
    publicLayoutAccess,
    globalStoriesOpen,
    globalContentTab,
    viewportDimensions,
    publicPlaceItems,
    selectedDirectoryPlace,
    selected,
    selectedDisplayName,
    fitZoom,
    zoomRef,
    panRef,
    publicPreserveMapViewOnNextPopRef,
    publicMapViewBeforeFocusRef,
    publicNavigationAfterPopRef,
    confirmDiscardStoryPhoto,
    rememberPublicMapView,
    restorePublicMapView,
    currentPublicPlaceId,
    writePublicHistory,
    focusMapPosition,
    setGlobalStoriesOpen,
    setGlobalContentTab,
    setGlobalStoriesPage,
    setGlobalStoriesRefreshKey,
    setGlobalEventsPage,
    setGlobalEventsRefreshKey,
    setPlaceRequestsPage,
    setSelectedId,
    setSelectedFacilityId,
    setSelectedNoteId,
    setSelectedDenseLabelId,
    setPublicPanelExpanded,
    setPublicPlaceExpanded,
    setZoom,
    setMapPan,
    setMapRenderPan,
    setSettledLabelZoom,
    setSettledLabelPan,
    setMapRenderRefreshRevision,
    setToast,
  } = options;

  const closePublicExplorerPanel = () => {
    if (publicLayoutAccess !== "viewer") {
      setGlobalStoriesOpen(false);
      setPublicPanelExpanded(false);
      return;
    }
    if (!confirmDiscardStoryPhoto()) return;
    const current = (window.history.state ?? {}) as PublicHistoryState;
    if (publicPanelIsExplorer(current.wondosimPanel)) {
      setGlobalStoriesOpen(false);
      setPublicPanelExpanded(false);
      publicPreserveMapViewOnNextPopRef.current = true;
      window.history.go(current.wondosimPanel === "explorer-expanded" && current.wondosimExpandedFromCollapsed ? -2 : -1);
      return;
    }
    setGlobalStoriesOpen(false);
    setPublicPanelExpanded(false);
    publicMapViewBeforeFocusRef.current = null;
  };

  const toggleGlobalStories = () => {
    const next = !globalStoriesOpen;
    if (next) {
      if (publicLayoutAccess === "viewer" && !confirmDiscardStoryPhoto()) return;
      if (publicLayoutAccess === "viewer" && globalContentTab === "place-requests") setGlobalContentTab("places");
      if (publicLayoutAccess === "editor" && globalContentTab === "places") setGlobalContentTab("reviews");
      setGlobalStoriesPage(1);
      setGlobalEventsPage(1);
      setPlaceRequestsPage(1);
      setSelectedId(null);
      setSelectedFacilityId(null);
      setSelectedDenseLabelId(null);
      setPublicPanelExpanded(publicLayoutAccess === "viewer" && viewportDimensions.width <= 760);
      if (publicLayoutAccess === "viewer") {
        rememberPublicMapView();
        writePublicHistory(viewportDimensions.width <= 760 ? "explorer-expanded" : "explorer", null, "push");
      }
    } else if (publicLayoutAccess === "viewer") {
      closePublicExplorerPanel();
      return;
    }
    setGlobalStoriesOpen(next);
  };

  const openGlobalManagement = (tab: "reviews" | "events") => {
    setGlobalContentTab(tab);
    if (tab === "reviews") {
      setGlobalStoriesPage(1);
      setGlobalStoriesRefreshKey((current) => current + 1);
    } else {
      setGlobalEventsPage(1);
      setGlobalEventsRefreshKey((current) => current + 1);
    }
    setGlobalStoriesOpen(true);
    setPublicPanelExpanded(false);
    setSelectedDenseLabelId(null);
  };

  const openUnifiedContentManagement = () => {
    openGlobalManagement(globalContentTab === "events" ? "events" : "reviews");
  };

  const publicPlaceItemForReference = (placeKey: string, placeName: string) => {
    const directoryId = placeKey.startsWith("directory:") ? placeKey.slice("directory:".length) : "";
    const normalized = normalizePlaceName(placeName);
    return publicPlaceItems.find((item) => (
      (directoryId && item.place.id === directoryId)
      || normalizePlaceName(item.place.name) === normalized
      || item.place.aliases?.some((alias) => normalizePlaceName(alias) === normalized)
    ));
  };

  const focusPublicPlaceItem = (item: PublicPlaceListItem, showDetails = false) => {
    if (!confirmDiscardStoryPhoto(item.id)) return;
    rememberPublicMapView();
    const current = (window.history.state ?? {}) as PublicHistoryState;
    const from: NonNullable<PublicHistoryState["wondosimFrom"]> = current.wondosimPanel === "explorer" || current.wondosimPanel === "explorer-expanded"
      ? current.wondosimPanel
      : current.wondosimFrom ?? "map";
    writePublicHistory("place", item.id, publicPanelIsPlace(current.wondosimPanel) ? "replace" : "push", from);
    if (showDetails && viewportDimensions.width <= 760) writePublicHistory("place-expanded", item.id, "push", from, true);
    setSelectedId(item.anchor.id);
    setSelectedFacilityId(item.place.id === item.anchor.directoryId ? null : item.place.id);
    setSelectedNoteId(null);
    setSelectedDenseLabelId(null);
    setPublicPanelExpanded(false);
    setPublicPlaceExpanded(showDetails && viewportDimensions.width <= 760);
    setGlobalStoriesOpen(false);
    focusMapPosition(item.anchor.x, item.anchor.y, item.anchor.id, {
      publicNavigation: true,
      showDetails,
    });
  };

  const closePublicPlacePanel = () => {
    if (!confirmDiscardStoryPhoto()) return;
    const current = (window.history.state ?? {}) as PublicHistoryState;
    if (publicPanelIsPlace(current.wondosimPanel)) {
      const returnToExplorer = publicPanelIsExplorer(current.wondosimFrom);
      setSelectedId(null);
      setSelectedFacilityId(null);
      setPublicPlaceExpanded(false);
      setGlobalStoriesOpen(returnToExplorer);
      setPublicPanelExpanded(current.wondosimFrom === "explorer-expanded");
      if (returnToExplorer) setGlobalContentTab("places");
      publicPreserveMapViewOnNextPopRef.current = true;
      window.history.go(current.wondosimPanel === "place-expanded" && current.wondosimExpandedFromCollapsed ? -2 : -1);
      return;
    }
    setSelectedId(null);
    setSelectedFacilityId(null);
    setPublicPlaceExpanded(false);
    publicMapViewBeforeFocusRef.current = null;
  };

  const openPublicPlaceList = () => {
    if (!confirmDiscardStoryPhoto()) return;
    const current = (window.history.state ?? {}) as PublicHistoryState;
    const expanded = viewportDimensions.width <= 760;
    if (publicPanelIsPlace(current.wondosimPanel) && publicPanelIsExplorer(current.wondosimFrom)) {
      window.history.go(current.wondosimPanel === "place-expanded" && current.wondosimExpandedFromCollapsed ? -2 : -1);
      return;
    }
    if (current.wondosimPanel === "place-expanded") {
      publicNavigationAfterPopRef.current = "explorer";
      window.history.go(-2);
      return;
    }
    writePublicHistory(expanded ? "explorer-expanded" : "explorer", null, "replace");
    setSelectedId(null);
    setSelectedFacilityId(null);
    setPublicPlaceExpanded(false);
    setGlobalContentTab("places");
    setGlobalStoriesOpen(true);
    setPublicPanelExpanded(expanded);
    restorePublicMapView(false);
  };

  const resetPublicMap = () => {
    if (!confirmDiscardStoryPhoto()) return;
    publicNavigationAfterPopRef.current = null;
    publicMapViewBeforeFocusRef.current = null;
    const nextPan = { x: 0, y: 0 };
    zoomRef.current = fitZoom;
    panRef.current = nextPan;
    setZoom(fitZoom);
    setMapPan(nextPan);
    setMapRenderPan(nextPan);
    setSelectedId(null);
    setSelectedFacilityId(null);
    setSelectedDenseLabelId(null);
    setGlobalStoriesOpen(false);
    setPublicPanelExpanded(false);
    setPublicPlaceExpanded(false);
    writePublicHistory("map", null, "replace");
    setToast("전체 지도로 돌아왔습니다.");
  };

  const refreshVisibleMapRenderInfo = () => {
    const currentPan = { ...panRef.current };
    startTransition(() => {
      setSettledLabelZoom(zoomRef.current);
      setSettledLabelPan(currentPan);
      setMapRenderRefreshRevision((current) => current + 1);
    });
    setToast("현재 화면의 라벨·마커 표시를 새로고침했습니다.");
  };

  const copyPublicPlaceAddress = async () => {
    const address = selectedDirectoryPlace?.address || selected?.address || "";
    if (!address) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(address);
      else {
        const textarea = document.createElement("textarea");
        textarea.value = address;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setToast("주소를 복사했습니다.");
    } catch {
      setToast("주소를 복사하지 못했습니다. 길게 눌러 복사해 주세요.");
    }
  };

  const sharePublicPlace = async () => {
    const placeId = currentPublicPlaceId();
    if (!placeId) return;
    const url = new URL(publicUrlWithPlace(window.location.href, placeId), window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: `${selectedDisplayName} · 제주 원도심 아트맵`, text: `${selectedDisplayName} 장소 정보`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast("장소 링크를 복사했습니다.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setToast("장소 링크를 공유하지 못했습니다.");
    }
  };

  const openGlobalStoryPlace = (story: PlaceStory) => {
    const item = publicPlaceItemForReference(story.placeKey, story.placeName);
    if (!item) {
      setToast("현재 공개 지도에서 이 장소의 마커를 찾지 못했습니다.");
      return;
    }
    focusPublicPlaceItem(item);
  };

  const openGlobalEventPlace = (place: PlaceEventPlace) => {
    const item = publicPlaceItemForReference(place.placeKey, place.placeName);
    if (!item) {
      setToast("현재 공개 지도에서 이 장소의 마커를 찾지 못했습니다.");
      return;
    }
    focusPublicPlaceItem(item);
  };

  return {
    closePublicExplorerPanel,
    toggleGlobalStories,
    openUnifiedContentManagement,
    focusPublicPlaceItem,
    closePublicPlacePanel,
    openPublicPlaceList,
    resetPublicMap,
    refreshVisibleMapRenderInfo,
    copyPublicPlaceAddress,
    sharePublicPlace,
    openGlobalStoryPlace,
    openGlobalEventPlace,
  };
}
