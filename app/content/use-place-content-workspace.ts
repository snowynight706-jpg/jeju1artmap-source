"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  recommendedMarkerStyle,
  type BundledMarkerCategory,
  type BundledMarkerStyle,
} from "../marker-assets";
import type { MapElement, PublicLayoutAccess } from "../map/core/types";
import type {
  GlobalContentTab,
  PlaceEvent,
  PlaceEventPlace,
  PlaceReviewCount,
  PlaceStory,
  StoryCameraPermissionState,
  StoryReportReason,
} from "./types";
import {
  useExplorerDiagnostics,
  useExplorerEvents,
  useExplorerStories,
  usePlaceRequests,
} from "./use-explorer-content";
import { usePlaceContentLifecycle } from "./use-place-content-lifecycle";

type MutableRef<T> = { current: T };

type UsePlaceContentWorkspaceOptions = {
  selectedStoryKey: string | null;
  publicLayoutAccess: PublicLayoutAccess;
  elementsRef: MutableRef<MapElement[]>;
  setToast: Dispatch<SetStateAction<string>>;
};

export function usePlaceContentWorkspace({
  selectedStoryKey,
  publicLayoutAccess,
  elementsRef,
  setToast,
}: UsePlaceContentWorkspaceOptions) {
  const placeStoryDraftKeyRef = useRef<string | null>(null);
  const selectedStoryKeyRef = useRef<string | null>(null);
  const placeStoryTextRef = useRef("");
  const placeStoryPhotoRetainTokenRef = useRef(0);
  const storyRequestRunRef = useRef(0);
  const eventRequestRunRef = useRef(0);
  const eventPlaceIndexBootstrappedRef = useRef(false);

  const [placeStories, setPlaceStories] = useState<PlaceStory[]>([]);
  const [placeStoriesLoading, setPlaceStoriesLoading] = useState(false);
  const [placeStoriesLoadedKey, setPlaceStoriesLoadedKey] = useState<string | null>(null);
  const [, setPlaceStoriesCanModerate] = useState(false);
  const [globalStoriesOpen, setGlobalStoriesOpen] = useState(false);
  const [globalContentTab, setGlobalContentTab] = useState<GlobalContentTab>("places");
  const {
    globalStories,
    globalStoriesPage,
    globalStoriesPageCount,
    globalStoriesTotal,
    globalStoriesCanModerate,
    globalStoriesLoading,
    globalStoriesError,
    setGlobalStories,
    setGlobalStoriesPage,
    setGlobalStoriesTotal,
    setGlobalStoriesRefreshKey,
  } = useExplorerStories({ access: publicLayoutAccess, open: globalStoriesOpen, tab: globalContentTab });
  const {
    uploadDiagnostics,
    uploadDiagnosticsLoading,
    uploadDiagnosticsError,
    performanceDiagnostics,
    performanceDiagnosticsLoading,
    performanceDiagnosticsError,
    setUploadDiagnostics,
    setUploadDiagnosticsRefreshKey,
    setPerformanceDiagnostics,
    setPerformanceDiagnosticsRefreshKey,
  } = useExplorerDiagnostics({ access: publicLayoutAccess, open: globalStoriesOpen, tab: globalContentTab });
  const [uploadDiagnosticActionId, setUploadDiagnosticActionId] = useState<string | null>(null);
  const [performanceDiagnosticActionId, setPerformanceDiagnosticActionId] = useState<string | null>(null);
  const [placeStoryActionId, setPlaceStoryActionId] = useState<string | null>(null);
  const [placeStoryFormOpen, setPlaceStoryFormOpen] = useState(false);
  const [placeStoryAuthor, setPlaceStoryAuthor] = useState("");
  const [placeStoryText, setPlaceStoryText] = useState("");
  const [placeStoryPhoto, setPlaceStoryPhoto] = useState<File | null>(null);
  const [placeStoryPhotoPreview, setPlaceStoryPhotoPreview] = useState<string | null>(null);
  const [placeStorySubmitting, setPlaceStorySubmitting] = useState(false);
  const [placeStoryPhotoRetaining, setPlaceStoryPhotoRetaining] = useState(false);
  const [storyCameraPermission, setStoryCameraPermission] = useState<StoryCameraPermissionState>("unknown");
  const [storyReportTarget, setStoryReportTarget] = useState<PlaceStory | null>(null);
  const [storyReportReason, setStoryReportReason] = useState<StoryReportReason>("inappropriate");
  const [storyReportDetail, setStoryReportDetail] = useState("");
  const [storyReportSubmitting, setStoryReportSubmitting] = useState(false);
  const [reportedStoryIds, setReportedStoryIds] = useState<Set<string>>(() => new Set());

  const [placeEvents, setPlaceEvents] = useState<PlaceEvent[]>([]);
  const [, setPlaceEventsLoading] = useState(false);
  const [placeEventsLoadedKey, setPlaceEventsLoadedKey] = useState<string | null>(null);
  const [, setPlaceEventsCanManage] = useState(false);
  const [placeEventsRefreshKey, setPlaceEventsRefreshKey] = useState(0);
  const [eventLinkedPlaces, setEventLinkedPlaces] = useState<PlaceEventPlace[]>([]);
  const [reviewCountsByPlace, setReviewCountsByPlace] = useState<PlaceReviewCount[]>([]);
  const [reviewBadgeNow, setReviewBadgeNow] = useState(() => Date.now());
  const [placeEventFormOpen, setPlaceEventFormOpen] = useState(false);
  const [placeEventEditingId, setPlaceEventEditingId] = useState<string | null>(null);
  const [placeEventNoPlace, setPlaceEventNoPlace] = useState(false);
  const [placeEventMultiPlace, setPlaceEventMultiPlace] = useState(false);
  const [placeEventPlaces, setPlaceEventPlaces] = useState<PlaceEventPlace[]>([]);
  const [placeEventDialogOffset, setPlaceEventDialogOffset] = useState({ x: 0, y: 0 });
  const [placeEventName, setPlaceEventName] = useState("");
  const [placeEventInfo, setPlaceEventInfo] = useState("");
  const [placeEventStartsAt, setPlaceEventStartsAt] = useState("");
  const [placeEventEndsAt, setPlaceEventEndsAt] = useState("");
  const [placeEventVisibleFrom, setPlaceEventVisibleFrom] = useState("");
  const [placeEventVisibleUntil, setPlaceEventVisibleUntil] = useState("");
  const [placeEventPhoto, setPlaceEventPhoto] = useState<File | null>(null);
  const [placeEventPhotoPreview, setPlaceEventPhotoPreview] = useState<string | null>(null);
  const [placeEventExistingPhotoUrl, setPlaceEventExistingPhotoUrl] = useState<string | null>(null);
  const [placeEventSubmitting, setPlaceEventSubmitting] = useState(false);
  const [placeEventActionId, setPlaceEventActionId] = useState<string | null>(null);
  const {
    globalEvents,
    globalEventsPage,
    globalEventsPageCount,
    globalEventsTotal,
    globalEventsCanManage,
    globalEventsLoading,
    globalEventsError,
    globalEventsRefreshKey,
    setGlobalEvents,
    setGlobalEventsPage,
    setGlobalEventsTotal,
    setGlobalEventsRefreshKey,
  } = useExplorerEvents({ access: publicLayoutAccess, open: globalStoriesOpen, tab: globalContentTab });

  const [placeRequestFormOpen, setPlaceRequestFormOpen] = useState(false);
  const [placeRequestName, setPlaceRequestName] = useState("");
  const [placeRequestArea, setPlaceRequestArea] = useState("");
  const [placeRequestAddress, setPlaceRequestAddress] = useState("");
  const [placeRequestDescription, setPlaceRequestDescription] = useState("");
  const [placeRequestCategory, setPlaceRequestCategory] = useState<BundledMarkerCategory>("culture");
  const [placeRequestMarkerStyle, setPlaceRequestMarkerStyle] = useState<BundledMarkerStyle>(recommendedMarkerStyle);
  const [placeRequestLocation, setPlaceRequestLocation] = useState<{ x: number; y: number } | null>(null);
  const [placeRequestPickingLocation, setPlaceRequestPickingLocation] = useState(false);
  const [placeRequestSubmitting, setPlaceRequestSubmitting] = useState(false);
  const {
    placeRequests,
    placeRequestsPage,
    placeRequestsPageCount,
    placeRequestsTotal,
    placeRequestsLoading,
    placeRequestsError,
    setPlaceRequests,
    setPlaceRequestsPage,
    setPlaceRequestsTotal,
    setPlaceRequestsRefreshKey,
  } = usePlaceRequests({ access: publicLayoutAccess, open: globalStoriesOpen, tab: globalContentTab });
  const [placeRequestActionId, setPlaceRequestActionId] = useState<string | null>(null);

  useLayoutEffect(() => {
    selectedStoryKeyRef.current = selectedStoryKey;
  }, [selectedStoryKey]);

  useEffect(() => {
    if (publicLayoutAccess !== "viewer") return;
    const timer = window.setInterval(() => setReviewBadgeNow(Date.now()), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [publicLayoutAccess]);

  const lifecycle = usePlaceContentLifecycle({
    selectedStoryKey,
    publicLayoutAccess,
    placeStoryText,
    placeEventsRefreshKey,
    elementsRef,
    selectedStoryKeyRef,
    placeStoryDraftKeyRef,
    placeStoryTextRef,
    placeStoryPhotoRetainTokenRef,
    storyRequestRunRef,
    eventRequestRunRef,
    setPlaceRequests,
    setPlaceStoryPhotoPreview,
    setPlaceStoryPhoto,
    setPlaceStoryPhotoRetaining,
    setPlaceStoryText,
    setPlaceStories,
    setPlaceStoriesCanModerate,
    setPlaceStoriesLoading,
    setPlaceStoriesLoadedKey,
    setPlaceStoryFormOpen,
    setPlaceEventPhotoPreview,
    setPlaceEventPhoto,
    setPlaceEventPlaces,
    setPlaceEvents,
    setPlaceEventsCanManage,
    setPlaceEventsLoading,
    setPlaceEventsLoadedKey,
    setPlaceEventFormOpen,
    setPlaceEventEditingId,
    setPlaceEventNoPlace,
    setPlaceEventMultiPlace,
    setPlaceEventName,
    setPlaceEventInfo,
    setPlaceEventExistingPhotoUrl,
    setToast,
  });
  const publishedPlaceStories = useMemo(
    () => placeStories.filter((story) => story.status === "published"),
    [placeStories],
  );

  return {
    placeStoryTextRef,
    eventPlaceIndexBootstrappedRef,
    placeStories,
    placeStoriesLoading,
    placeStoriesLoadedKey,
    publishedPlaceStories,
    globalStoriesOpen,
    globalContentTab,
    globalStories,
    globalStoriesPage,
    globalStoriesPageCount,
    globalStoriesTotal,
    globalStoriesCanModerate,
    globalStoriesLoading,
    globalStoriesError,
    uploadDiagnostics,
    uploadDiagnosticsLoading,
    uploadDiagnosticsError,
    performanceDiagnostics,
    performanceDiagnosticsLoading,
    performanceDiagnosticsError,
    uploadDiagnosticActionId,
    performanceDiagnosticActionId,
    placeStoryActionId,
    placeStoryFormOpen,
    placeStoryAuthor,
    placeStoryText,
    placeStoryPhoto,
    placeStoryPhotoPreview,
    placeStorySubmitting,
    placeStoryPhotoRetaining,
    storyCameraPermission,
    storyReportTarget,
    storyReportReason,
    storyReportDetail,
    storyReportSubmitting,
    reportedStoryIds,
    placeEvents,
    placeEventsLoadedKey,
    placeEventsRefreshKey,
    eventLinkedPlaces,
    reviewCountsByPlace,
    reviewBadgeNow,
    placeEventFormOpen,
    placeEventEditingId,
    placeEventNoPlace,
    placeEventMultiPlace,
    placeEventPlaces,
    placeEventDialogOffset,
    placeEventName,
    placeEventInfo,
    placeEventStartsAt,
    placeEventEndsAt,
    placeEventVisibleFrom,
    placeEventVisibleUntil,
    placeEventPhoto,
    placeEventPhotoPreview,
    placeEventExistingPhotoUrl,
    placeEventSubmitting,
    placeEventActionId,
    globalEvents,
    globalEventsPage,
    globalEventsPageCount,
    globalEventsTotal,
    globalEventsCanManage,
    globalEventsLoading,
    globalEventsError,
    globalEventsRefreshKey,
    placeRequestFormOpen,
    placeRequestName,
    placeRequestArea,
    placeRequestAddress,
    placeRequestDescription,
    placeRequestCategory,
    placeRequestMarkerStyle,
    placeRequestLocation,
    placeRequestPickingLocation,
    placeRequestSubmitting,
    placeRequests,
    placeRequestsPage,
    placeRequestsPageCount,
    placeRequestsTotal,
    placeRequestsLoading,
    placeRequestsError,
    placeRequestActionId,
    setPlaceStories,
    setGlobalStoriesOpen,
    setGlobalContentTab,
    setGlobalStories,
    setGlobalStoriesPage,
    setGlobalStoriesTotal,
    setGlobalStoriesRefreshKey,
    setUploadDiagnostics,
    setUploadDiagnosticsRefreshKey,
    setPerformanceDiagnostics,
    setPerformanceDiagnosticsRefreshKey,
    setUploadDiagnosticActionId,
    setPerformanceDiagnosticActionId,
    setPlaceStoryActionId,
    setPlaceStoryFormOpen,
    setPlaceStoryAuthor,
    setPlaceStoryText,
    setPlaceStorySubmitting,
    setStoryCameraPermission,
    setStoryReportTarget,
    setStoryReportReason,
    setStoryReportDetail,
    setStoryReportSubmitting,
    setReportedStoryIds,
    setPlaceEvents,
    setPlaceEventsRefreshKey,
    setEventLinkedPlaces,
    setReviewCountsByPlace,
    setPlaceEventFormOpen,
    setPlaceEventEditingId,
    setPlaceEventNoPlace,
    setPlaceEventMultiPlace,
    setPlaceEventPlaces,
    setPlaceEventDialogOffset,
    setPlaceEventName,
    setPlaceEventInfo,
    setPlaceEventStartsAt,
    setPlaceEventEndsAt,
    setPlaceEventVisibleFrom,
    setPlaceEventVisibleUntil,
    setPlaceEventExistingPhotoUrl,
    setPlaceEventSubmitting,
    setPlaceEventActionId,
    setGlobalEvents,
    setGlobalEventsPage,
    setGlobalEventsTotal,
    setGlobalEventsRefreshKey,
    setPlaceRequestFormOpen,
    setPlaceRequestName,
    setPlaceRequestArea,
    setPlaceRequestAddress,
    setPlaceRequestDescription,
    setPlaceRequestCategory,
    setPlaceRequestMarkerStyle,
    setPlaceRequestLocation,
    setPlaceRequestPickingLocation,
    setPlaceRequestSubmitting,
    setPlaceRequestActionId,
    setPlaceRequests,
    setPlaceRequestsPage,
    setPlaceRequestsTotal,
    setPlaceRequestsRefreshKey,
    ...lifecycle,
  };
}
