"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { normalizePlaceName } from "../core-landmarks";
import type { PlaceEventPlace } from "../content/types";
import {
  categoryOf,
  isPrimaryHubLabel,
  markerCategoryColors,
  placeContentKey,
} from "../map/core/model";
import type { DirectoryPlace, MapElement } from "../map/core/types";
import {
  ART_PLATFORM_GROUP_ID,
  MAIN_HUB_ROLE,
  additionalCategoryDefinitions,
  convenienceAttributeDefinitions,
  publicDisplayName,
  sanitizeAdditionalCategories,
  sanitizeConvenienceAttributes,
} from "../place-taxonomy";
import {
  publicCategoryIdForPlace,
  withDirectoryMetadata,
  type PublicPlaceCategoryId,
} from "../place-directory/model";
import type { PublicExplorerPlaceRow } from "./explorer-panel";
import {
  publicPanelAfterDrag,
  publicPanelIsExpanded,
  publicPanelIsPlace,
  publicUrlWithPlace,
} from "./navigation.mjs";
import { placesForPublicCategory } from "./place-category.mjs";

const PUBLIC_PANEL_MOTION_MS = 240;

type Point = { x: number; y: number };
type MutableRef<T> = { current: T };
type PublicPanelTarget = "place" | "explorer";

export type PublicPlaceCategoryFilter = PublicPlaceCategoryId;
export type PublicPlaceCategoryScope = "all" | PublicPlaceCategoryFilter;
export type PublicPanelHistory = "map" | "explorer" | "explorer-expanded" | "place" | "place-expanded";
export type PublicHistoryState = {
  wondosimPanel?: PublicPanelHistory;
  wondosimPlaceId?: string;
  wondosimFrom?: "map" | "explorer" | "explorer-expanded";
  wondosimExpandedFromCollapsed?: boolean;
};

export type PublicPlaceListItem = {
  id: string;
  place: DirectoryPlace;
  anchor: MapElement;
  displayName: string;
  categoryId: PublicPlaceCategoryFilter;
  isMainHub: boolean;
};

export const publicListCategories: ReadonlyArray<{
  id: PublicPlaceCategoryFilter;
  name: string;
  color: string;
  iconSrc: string;
}> = [
  { id: "culture", name: "문화공간", color: markerCategoryColors.culture, iconSrc: "/category-icons/category_ui_culture_book_brush_note_v03_ui-96px.webp" },
  { id: "food", name: "음식점", color: markerCategoryColors.food, iconSrc: "/category-icons/category_ui_restaurant_v02_ui-96px.webp" },
  { id: "cafe", name: "카페", color: markerCategoryColors.cafe, iconSrc: "/category-icons/category_ui_cafe_v03_ui-96px.webp" },
  { id: "shop", name: "소품샵", color: markerCategoryColors.shop, iconSrc: "/category-icons/category_ui_goods_shop_v03_ui-96px.webp" },
  { id: "convenience", name: "편의시설", color: markerCategoryColors.utility, iconSrc: "/category-icons/category_ui_amenities_v01_ui-96px.webp" },
] as const;

export function publicCategoryMetaForPlace(place: DirectoryPlace, anchor: MapElement) {
  const id = publicCategoryIdForPlace(place, anchor);
  return publicListCategories.find((category) => category.id === id) ?? publicListCategories[0];
}

type UsePublicPlaceWorkspaceOptions = {
  visibleElements: MapElement[];
  directoryPlacesById: ReadonlyMap<string, DirectoryPlace>;
  directoryPlacesByNormalizedName: ReadonlyMap<string, DirectoryPlace>;
  directoryPlacesByGroup: ReadonlyMap<string, DirectoryPlace[]>;
  eventLinkedPlaces: PlaceEventPlace[];
  selectedId: string | null;
  selectedFacilityId: string | null;
  selectedDirectoryPlaceId: string | null;
  placeStoryPhoto: File | null;
  zoomRef: MutableRef<number>;
  panRef: MutableRef<Point>;
  fitZoomRef: MutableRef<number>;
  publicNavigationInitializedRef: MutableRef<boolean>;
  publicNavigationApplyingRef: MutableRef<boolean>;
  cancelMapTransforms: () => void;
  setZoom: (value: number) => void;
  setMapPan: (value: Point) => void;
  setMapRenderPan: (value: Point) => void;
  setSelectedId: (value: string | null) => void;
  setSelectedFacilityId: (value: string | null) => void;
  setGlobalStoriesOpen: (value: boolean) => void;
  setSelectedNoteId: (value: string | null) => void;
  setSelectedDenseLabelId: (value: string | null) => void;
  onDiscardStoryPhoto: (file: File | null) => void;
};

export function usePublicPlaceWorkspace(options: UsePublicPlaceWorkspaceOptions) {
  const {
    visibleElements,
    directoryPlacesById,
    directoryPlacesByNormalizedName,
    directoryPlacesByGroup,
    eventLinkedPlaces,
    selectedId,
    selectedFacilityId,
    selectedDirectoryPlaceId,
    placeStoryPhoto,
    zoomRef,
    panRef,
    fitZoomRef,
    publicNavigationInitializedRef,
    publicNavigationApplyingRef,
    cancelMapTransforms,
    setZoom,
    setMapPan,
    setMapRenderPan,
    setSelectedId,
    setSelectedFacilityId,
    setGlobalStoriesOpen,
    setSelectedNoteId,
    setSelectedDenseLabelId,
    onDiscardStoryPhoto,
  } = options;

  const [publicPanelExpanded, setPublicPanelExpanded] = useState(false);
  const [publicPlaceExpanded, setPublicPlaceExpanded] = useState(false);
  const [publicPanelDrag, setPublicPanelDrag] = useState<{ target: PublicPanelTarget; offsetY: number } | null>(null);
  const [publicPlaceQuery, setPublicPlaceQuery] = useState("");
  const [publicPlaceCategory, setPublicPlaceCategory] = useState<PublicPlaceCategoryScope>("all");
  const [expandedAdditionalCategoryItemId, setExpandedAdditionalCategoryItemId] = useState<string | null>(null);

  const publicPlaceQueryInputRef = useRef<HTMLInputElement>(null);
  const publicPreserveMapViewOnNextPopRef = useRef(false);
  const publicMapViewBeforeFocusRef = useRef<{ zoom: number; pan: Point } | null>(null);
  const publicPanelDragRef = useRef<{
    pointerId: number;
    startY: number;
    target: PublicPanelTarget;
    startExpanded: boolean;
  } | null>(null);
  const publicPlacePanelRef = useRef<HTMLElement>(null);
  const publicExplorerPanelRef = useRef<HTMLElement>(null);
  const publicPanelMotionFrameRef = useRef<Record<PublicPanelTarget, number | null>>({ place: null, explorer: null });
  const publicPanelMotionAnimationRef = useRef<Record<PublicPanelTarget, Animation | null>>({ place: null, explorer: null });

  const publicPlaceItems = useMemo<PublicPlaceListItem[]>(() => {
    const items = new Map<string, PublicPlaceListItem>();
    visibleElements.forEach((anchor) => {
      const ownPlace = (anchor.directoryId ? directoryPlacesById.get(anchor.directoryId) : undefined)
        ?? directoryPlacesByNormalizedName.get(normalizePlaceName(anchor.name));
      const candidates = ownPlace?.locationGroupId
        ? directoryPlacesByGroup.get(ownPlace.locationGroupId) ?? [ownPlace]
        : ownPlace
          ? [ownPlace]
          : [{
            id: `element-${anchor.id}`,
            name: anchor.name,
            category: anchor.category,
            area: anchor.category === "landmark" ? "랜드마크" : "지도 배치",
            address: anchor.address,
            x: anchor.x,
            y: anchor.y,
            coordinateStatus: anchor.category === "landmark" ? "landmark" as const : "review" as const,
            sourceLabel: "공개 지도",
            additionalCategories: [],
          } satisfies DirectoryPlace];
      candidates.forEach((candidate) => {
        const place = withDirectoryMetadata(candidate);
        const itemId = place.id || `element-${anchor.id}`;
        if (items.has(itemId)) return;
        const isMainHub = place.featuredRole === MAIN_HUB_ROLE || isPrimaryHubLabel(place.name);
        const usesMapDisplayName = Boolean(ownPlace && place.id === ownPlace.id);
        items.set(itemId, {
          id: itemId,
          place,
          anchor,
          displayName: usesMapDisplayName ? anchor.name : publicDisplayName(place.name, place.featuredRole),
          categoryId: publicCategoryIdForPlace(place, anchor),
          isMainHub,
        });
      });
    });
    return [...items.values()].sort((a, b) => (
      Number(b.isMainHub) - Number(a.isMainHub)
      || Number(a.place.locationGroupId !== ART_PLATFORM_GROUP_ID) - Number(b.place.locationGroupId !== ART_PLATFORM_GROUP_ID)
      || a.displayName.localeCompare(b.displayName, "ko")
    ));
  }, [directoryPlacesByGroup, directoryPlacesById, directoryPlacesByNormalizedName, visibleElements]);

  const eventLinkedPublicPlaceIds = useMemo(() => {
    if (!eventLinkedPlaces.length) return new Set<string>();
    const linkedKeys = new Set(eventLinkedPlaces.map((place) => place.placeKey));
    const linkedNames = new Set(eventLinkedPlaces.map((place) => normalizePlaceName(place.placeName)));
    return new Set(publicPlaceItems.flatMap((item) => {
      const directKey = `directory:${item.place.id}`;
      const anchorKey = placeContentKey(item.anchor);
      const referenceKeys = item.place.id === item.anchor.directoryId || !item.anchor.directoryId
        ? [directKey, anchorKey]
        : [directKey];
      const referenceNames = [item.place.name, item.displayName, ...(item.place.aliases ?? [])]
        .map((name) => normalizePlaceName(name));
      return referenceKeys.some((key) => linkedKeys.has(key)) || referenceNames.some((name) => linkedNames.has(name))
        ? [item.id]
        : [];
    }));
  }, [eventLinkedPlaces, publicPlaceItems]);

  const publicPlaceCategoryCounts = useMemo(() => publicListCategories.reduce<Record<PublicPlaceCategoryFilter, number>>((counts, category) => {
    counts[category.id] = placesForPublicCategory(publicPlaceItems, category.id, eventLinkedPublicPlaceIds).length;
    return counts;
  }, Object.fromEntries(publicListCategories.map((category) => [category.id, 0])) as Record<PublicPlaceCategoryFilter, number>), [eventLinkedPublicPlaceIds, publicPlaceItems]);

  const publicPlacePresentationById = useMemo(() => new Map(publicPlaceItems.map((item) => {
    const additionalIds = new Set(sanitizeAdditionalCategories(item.place.additionalCategories));
    const convenienceIds = new Set(sanitizeConvenienceAttributes(item.place.convenienceAttributes));
    const tagNames = additionalCategoryDefinitions.flatMap((definition) => additionalIds.has(definition.id) ? [definition.name] : []);
    const convenienceNames = convenienceAttributeDefinitions.flatMap((definition) => convenienceIds.has(definition.id) ? [definition.name] : []);
    const searchText = `${item.displayName} ${item.place.name} ${(item.place.aliases ?? []).join(" ")} ${item.place.address} ${item.place.area} ${tagNames.join(" ")} ${convenienceNames.join(" ")}`.toLocaleLowerCase("ko-KR");
    return [item.id, { tagNames, searchText }] as const;
  })), [publicPlaceItems]);

  const filteredPublicPlaceItems = useMemo(() => {
    const query = publicPlaceQuery.trim().toLocaleLowerCase("ko-KR");
    const scopedItems: PublicPlaceListItem[] = publicPlaceCategory === "all"
      ? publicPlaceItems
      : placesForPublicCategory(publicPlaceItems, publicPlaceCategory, eventLinkedPublicPlaceIds) as PublicPlaceListItem[];
    return query
      ? scopedItems.filter((item) => publicPlacePresentationById.get(item.id)?.searchText.includes(query))
      : scopedItems;
  }, [eventLinkedPublicPlaceIds, publicPlaceCategory, publicPlaceItems, publicPlacePresentationById, publicPlaceQuery]);

  const publicExplorerPlaceRows: PublicExplorerPlaceRow[] = filteredPublicPlaceItems.map((item) => {
    const meta = publicCategoryMetaForPlace(item.place, item.anchor);
    return {
      id: item.id,
      displayName: item.displayName,
      isMainHub: item.isMainHub,
      selected: selectedId === item.anchor.id && selectedDirectoryPlaceId === item.place.id,
      eventListedInCulture: publicPlaceCategory === "culture" && item.categoryId !== "culture" && eventLinkedPublicPlaceIds.has(item.id),
      markerColor: categoryOf(item.anchor.category).color,
      primaryCategoryName: meta.name,
      primaryCategoryColor: meta.color,
      tagNames: publicPlacePresentationById.get(item.id)?.tagNames ?? [],
    };
  });

  const currentPublicPlaceId = useCallback(() => {
    const item = publicPlaceItems.find((candidate) => (
      candidate.anchor.id === selectedId
      && (!selectedFacilityId || candidate.place.id === selectedFacilityId)
      && (selectedFacilityId || candidate.place.id === candidate.anchor.directoryId || !candidate.anchor.directoryId)
    ));
    return item?.id ?? selectedFacilityId ?? selectedDirectoryPlaceId ?? null;
  }, [publicPlaceItems, selectedDirectoryPlaceId, selectedFacilityId, selectedId]);

  const confirmDiscardStoryPhoto = useCallback((nextPlaceId: string | null = null) => {
    if (!placeStoryPhoto || (nextPlaceId && nextPlaceId === currentPublicPlaceId())) return true;
    if (!window.confirm("선택한 사진은 장소를 벗어나면 사라집니다. 사진을 버리고 이동할까요?\n작성한 후기 문장은 이 세션에 임시 저장됩니다.")) return false;
    onDiscardStoryPhoto(null);
    return true;
  }, [currentPublicPlaceId, onDiscardStoryPhoto, placeStoryPhoto]);

  const rememberPublicMapView = useCallback(() => {
    if (!publicMapViewBeforeFocusRef.current) {
      publicMapViewBeforeFocusRef.current = {
        zoom: zoomRef.current,
        pan: { ...panRef.current },
      };
    }
  }, [panRef, zoomRef]);

  const restorePublicMapView = useCallback((clear = false) => {
    cancelMapTransforms();
    const previous = publicMapViewBeforeFocusRef.current;
    const nextZoom = clamp(previous?.zoom ?? fitZoomRef.current, fitZoomRef.current, 4);
    const nextPan = previous?.pan ?? { x: 0, y: 0 };
    zoomRef.current = nextZoom;
    panRef.current = nextPan;
    setZoom(nextZoom);
    setMapPan(nextPan);
    setMapRenderPan(nextPan);
    if (clear) publicMapViewBeforeFocusRef.current = null;
  }, [cancelMapTransforms, fitZoomRef, panRef, setMapPan, setMapRenderPan, setZoom, zoomRef]);

  const writePublicHistory = useCallback((
    panel: PublicPanelHistory,
    placeId: string | null = null,
    mode: "push" | "replace" = "push",
    from?: PublicHistoryState["wondosimFrom"],
    expandedFromCollapsed = false,
  ) => {
    if (!publicNavigationInitializedRef.current || publicNavigationApplyingRef.current) return;
    const current = (window.history.state ?? {}) as PublicHistoryState;
    const currentExplorer = current.wondosimPanel === "explorer" || current.wondosimPanel === "explorer-expanded"
      ? current.wondosimPanel
      : undefined;
    const origin: NonNullable<PublicHistoryState["wondosimFrom"]> = from
      ?? currentExplorer
      ?? current.wondosimFrom
      ?? "map";
    const state: PublicHistoryState = {
      wondosimPanel: panel,
      ...(publicPanelIsPlace(panel) && placeId ? { wondosimPlaceId: placeId, wondosimFrom: origin } : {}),
      ...(publicPanelIsExpanded(panel) && expandedFromCollapsed ? { wondosimExpandedFromCollapsed: true } : {}),
    };
    const url = publicUrlWithPlace(window.location.href, publicPanelIsPlace(panel) ? placeId : null);
    window.history[mode === "push" ? "pushState" : "replaceState"](state, "", url);
  }, [publicNavigationApplyingRef, publicNavigationInitializedRef]);

  const queuePublicPanelSnap = useCallback((target: PublicPanelTarget, expanded: boolean) => {
    const element = target === "place" ? publicPlacePanelRef.current : publicExplorerPanelRef.current;
    if (
      !element
      || typeof element.animate !== "function"
      || !window.matchMedia("(max-width: 760px)").matches
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) return;
    const currentTransform = window.getComputedStyle(element).transform;
    const fromTransform = currentTransform && currentTransform !== "none"
      ? currentTransform
      : `translate3d(0, ${expanded ? 10 : -7}px, 0)`;
    const pendingFrame = publicPanelMotionFrameRef.current[target];
    if (pendingFrame !== null) window.cancelAnimationFrame(pendingFrame);
    publicPanelMotionAnimationRef.current[target]?.cancel();
    publicPanelMotionFrameRef.current[target] = window.requestAnimationFrame(() => {
      publicPanelMotionFrameRef.current[target] = null;
      const panel = target === "place" ? publicPlacePanelRef.current : publicExplorerPanelRef.current;
      if (!panel) return;
      panel.getAnimations().forEach((animation) => animation.cancel());
      const animation = panel.animate([
        { transform: fromTransform, opacity: 0.96 },
        { transform: "translate3d(0, 0, 0)", opacity: 1 },
      ], {
        duration: PUBLIC_PANEL_MOTION_MS,
        easing: "cubic-bezier(.22, .78, .28, 1)",
      });
      publicPanelMotionAnimationRef.current[target] = animation;
      animation.addEventListener("finish", () => {
        if (publicPanelMotionAnimationRef.current[target] === animation) publicPanelMotionAnimationRef.current[target] = null;
      }, { once: true });
    });
  }, []);

  const setPublicPanelExpansion = useCallback((target: PublicPanelTarget, expanded: boolean) => {
    queuePublicPanelSnap(target, expanded);
    if (target === "place") setPublicPlaceExpanded(expanded);
    else setPublicPanelExpanded(expanded);
    if (!publicNavigationInitializedRef.current || publicNavigationApplyingRef.current) return;
    const current = (window.history.state ?? {}) as PublicHistoryState;
    const collapsedPanel = target;
    const expandedPanel = `${target}-expanded` as PublicPanelHistory;
    if (!expanded && current.wondosimPanel === expandedPanel && current.wondosimExpandedFromCollapsed) {
      window.history.back();
      return;
    }
    writePublicHistory(
      expanded ? expandedPanel : collapsedPanel,
      target === "place" ? current.wondosimPlaceId ?? currentPublicPlaceId() : null,
      current.wondosimPanel === collapsedPanel && expanded ? "push" : "replace",
      current.wondosimFrom,
      expanded && current.wondosimPanel === collapsedPanel,
    );
  }, [currentPublicPlaceId, publicNavigationApplyingRef, publicNavigationInitializedRef, queuePublicPanelSnap, writePublicHistory]);

  useEffect(() => () => {
    (Object.keys(publicPanelMotionFrameRef.current) as PublicPanelTarget[]).forEach((target) => {
      const pendingFrame = publicPanelMotionFrameRef.current[target];
      if (pendingFrame !== null) window.cancelAnimationFrame(pendingFrame);
      publicPanelMotionAnimationRef.current[target]?.cancel();
    });
  }, []);

  const startPublicPanelDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>, target: PublicPanelTarget, startExpanded: boolean) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const pendingFrame = publicPanelMotionFrameRef.current[target];
    if (pendingFrame !== null) window.cancelAnimationFrame(pendingFrame);
    publicPanelMotionFrameRef.current[target] = null;
    publicPanelMotionAnimationRef.current[target]?.cancel();
    publicPanelMotionAnimationRef.current[target] = null;
    (target === "place" ? publicPlacePanelRef.current : publicExplorerPanelRef.current)?.getAnimations().forEach((animation) => animation.cancel());
    event.currentTarget.setPointerCapture(event.pointerId);
    publicPanelDragRef.current = { pointerId: event.pointerId, startY: event.clientY, target, startExpanded };
    setPublicPanelDrag({ target, offsetY: 0 });
  }, []);

  const movePublicPanelDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = publicPanelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPublicPanelDrag({ target: drag.target, offsetY: clamp(event.clientY - drag.startY, -96, 96) });
  }, []);

  const finishPublicPanelDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = publicPanelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaY = event.clientY - drag.startY;
    const nextPanel = publicPanelAfterDrag(drag.target, drag.startExpanded, deltaY);
    publicPanelDragRef.current = null;
    setPublicPanelDrag(null);
    setPublicPanelExpansion(drag.target, publicPanelIsExpanded(nextPanel));
  }, [setPublicPanelExpansion]);

  const selectPublicMarker = useCallback((elementId: string) => {
    const item = publicPlaceItems.find((candidate) => (
      candidate.anchor.id === elementId
      && (candidate.place.id === candidate.anchor.directoryId || !candidate.anchor.directoryId)
    )) ?? publicPlaceItems.find((candidate) => candidate.anchor.id === elementId);
    if (!item || !confirmDiscardStoryPhoto(item.id)) return;
    rememberPublicMapView();
    const current = (window.history.state ?? {}) as PublicHistoryState;
    const from: NonNullable<PublicHistoryState["wondosimFrom"]> = current.wondosimPanel === "explorer" || current.wondosimPanel === "explorer-expanded"
      ? current.wondosimPanel
      : "map";
    setSelectedId(elementId);
    setSelectedFacilityId(null);
    setPublicPlaceExpanded(false);
    setGlobalStoriesOpen(false);
    setPublicPanelExpanded(false);
    setSelectedNoteId(null);
    setSelectedDenseLabelId(null);
    writePublicHistory("place", item.id, publicPanelIsPlace(current.wondosimPanel) ? "replace" : "push", from);
  }, [confirmDiscardStoryPhoto, publicPlaceItems, rememberPublicMapView, setGlobalStoriesOpen, setSelectedDenseLabelId, setSelectedFacilityId, setSelectedId, setSelectedNoteId, writePublicHistory]);

  return {
    publicPlaceItems,
    publicPlaceCategoryCounts,
    publicExplorerPlaceRows,
    publicPanelExpanded,
    setPublicPanelExpanded,
    publicPlaceExpanded,
    setPublicPlaceExpanded,
    publicPanelDrag,
    publicPlaceQuery,
    setPublicPlaceQuery,
    publicPlaceCategory,
    setPublicPlaceCategory,
    expandedAdditionalCategoryItemId,
    setExpandedAdditionalCategoryItemId,
    publicPlaceQueryInputRef,
    publicPreserveMapViewOnNextPopRef,
    publicMapViewBeforeFocusRef,
    publicPlacePanelRef,
    publicExplorerPanelRef,
    currentPublicPlaceId,
    confirmDiscardStoryPhoto,
    rememberPublicMapView,
    restorePublicMapView,
    writePublicHistory,
    setPublicPanelExpansion,
    startPublicPanelDrag,
    movePublicPanelDrag,
    finishPublicPanelDrag,
    selectPublicMarker,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
