"use client";

import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";

import { placeContentKey } from "../map/core/model";
import type { MapElement, PublicLayoutAccess } from "../map/core/types";
import { STORY_PHOTO_MAX_SOURCE_BYTES } from "../media/photo-processing";
import {
  PLACE_EVENTS_API,
  PLACE_REGISTRATION_REQUESTS_API,
  PLACE_STORIES_API,
  readPlaceStoryDraft,
  sendPlaceStoryUploadDiagnostic,
  writePlaceStoryDraft,
} from "./client";
import type {
  PlaceEvent,
  PlaceEventPlace,
  PlaceEventsPayload,
  PlaceRegistrationRequest,
  PlaceRegistrationRequestsPayload,
  PlaceStoriesPayload,
  PlaceStory,
} from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type MutableRef<T> = { current: T };

type UsePlaceContentLifecycleOptions = {
  selectedStoryKey: string | null;
  publicLayoutAccess: PublicLayoutAccess;
  placeStoryText: string;
  placeEventsRefreshKey: number;
  elementsRef: MutableRef<MapElement[]>;
  selectedStoryKeyRef: MutableRef<string | null>;
  placeStoryDraftKeyRef: MutableRef<string | null>;
  placeStoryTextRef: MutableRef<string>;
  placeStoryPhotoRetainTokenRef: MutableRef<number>;
  storyRequestRunRef: MutableRef<number>;
  eventRequestRunRef: MutableRef<number>;
  setPlaceRequests: StateSetter<PlaceRegistrationRequest[]>;
  setPlaceStoryPhotoPreview: StateSetter<string | null>;
  setPlaceStoryPhoto: StateSetter<File | null>;
  setPlaceStoryPhotoRetaining: StateSetter<boolean>;
  setPlaceStoryText: StateSetter<string>;
  setPlaceStories: StateSetter<PlaceStory[]>;
  setPlaceStoriesCanModerate: StateSetter<boolean>;
  setPlaceStoriesLoading: StateSetter<boolean>;
  setPlaceStoriesLoadedKey: StateSetter<string | null>;
  setPlaceStoryFormOpen: StateSetter<boolean>;
  setPlaceEventPhotoPreview: StateSetter<string | null>;
  setPlaceEventPhoto: StateSetter<File | null>;
  setPlaceEventPlaces: StateSetter<PlaceEventPlace[]>;
  setPlaceEvents: StateSetter<PlaceEvent[]>;
  setPlaceEventsCanManage: StateSetter<boolean>;
  setPlaceEventsLoading: StateSetter<boolean>;
  setPlaceEventsLoadedKey: StateSetter<string | null>;
  setPlaceEventFormOpen: StateSetter<boolean>;
  setPlaceEventEditingId: StateSetter<string | null>;
  setPlaceEventNoPlace: StateSetter<boolean>;
  setPlaceEventMultiPlace: StateSetter<boolean>;
  setPlaceEventName: StateSetter<string>;
  setPlaceEventInfo: StateSetter<string>;
  setPlaceEventExistingPhotoUrl: StateSetter<string | null>;
  setToast: StateSetter<string>;
};

export function usePlaceContentLifecycle({
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
}: UsePlaceContentLifecycleOptions) {
  const syncReviewedPlaceRequestLocation = useCallback(async (placeRequestId: string, x: number, y: number) => {
    try {
      const response = await fetch(PLACE_REGISTRATION_REQUESTS_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: placeRequestId, action: "move-marker", markerX: x, markerY: y }),
      });
      const payload = await response.json().catch(() => null) as PlaceRegistrationRequestsPayload | null;
      if (!response.ok || !payload?.request) return;
      setPlaceRequests((current) => current.map((request) => request.id === placeRequestId ? payload.request! : request));
    } catch {
      // The editor document and device recovery copy still retain the position.
    }
  }, [setPlaceRequests]);

  const updatePlaceStoryPhoto = useCallback((file: File | null) => {
    setPlaceStoryPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
    setPlaceStoryPhoto(file);
  }, [setPlaceStoryPhoto, setPlaceStoryPhotoPreview]);

  const retainPlaceStoryPhoto = useCallback(async (sourceFile: File | null) => {
    if (!sourceFile) return;
    const token = placeStoryPhotoRetainTokenRef.current + 1;
    placeStoryPhotoRetainTokenRef.current = token;
    setPlaceStoryPhotoRetaining(true);
    try {
      if (sourceFile.size > STORY_PHOTO_MAX_SOURCE_BYTES) throw new Error("photo-source-too-large");
      const bytes = await sourceFile.arrayBuffer();
      if (!bytes.byteLength) throw new Error("photo-read-failed");
      if (placeStoryPhotoRetainTokenRef.current !== token) return;
      const retainedFile = new File([bytes], sourceFile.name || `wondosim-photo-${Date.now()}`, {
        type: sourceFile.type,
        lastModified: sourceFile.lastModified || Date.now(),
      });
      updatePlaceStoryPhoto(retainedFile);
      setToast("선택한 사진을 후기 등록 전까지 앱의 임시 메모리에 보관합니다.");
    } catch (error) {
      if (placeStoryPhotoRetainTokenRef.current !== token) return;
      updatePlaceStoryPhoto(null);
      const errorCode = error instanceof Error && error.message === "photo-source-too-large" ? "photo-source-too-large" : "photo-read-failed";
      const storyKey = selectedStoryKeyRef.current;
      const diagnosticReference = storyKey ? await sendPlaceStoryUploadDiagnostic({
        placeKey: storyKey,
        stage: "prepare",
        errorCode,
        responseStatus: 0,
        sourceFile,
        preparedFile: null,
      }) : null;
      const diagnosticSuffix = diagnosticReference ? ` · 오류 ID ${diagnosticReference}` : "";
      setToast((errorCode === "photo-source-too-large"
        ? "원본 사진이 30MB를 넘습니다. 더 작은 사진을 선택해 주세요."
        : "선택한 사진을 앱의 임시 메모리로 가져오지 못했습니다. 사진 접근을 다시 허용해 선택해 주세요.") + diagnosticSuffix);
    } finally {
      if (placeStoryPhotoRetainTokenRef.current === token) setPlaceStoryPhotoRetaining(false);
    }
  }, [placeStoryPhotoRetainTokenRef, selectedStoryKeyRef, setPlaceStoryPhotoRetaining, setToast, updatePlaceStoryPhoto]);

  const updatePlaceEventPhoto = useCallback((file: File | null) => {
    setPlaceEventPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
    setPlaceEventPhoto(file);
  }, [setPlaceEventPhoto, setPlaceEventPhotoPreview]);

  const togglePlaceEventMapSelection = useCallback((elementId: string) => {
    const element = elementsRef.current.find((item) => item.id === elementId && item.mapVisible);
    if (!element) return;
    const place = { placeKey: placeContentKey(element), placeName: element.name };
    setPlaceEventPlaces((current) => {
      if (current.some((item) => item.placeKey === place.placeKey)) return current.length > 1 ? current.filter((item) => item.placeKey !== place.placeKey) : current;
      if (current.length >= 20) {
        setToast("한 행사에는 장소를 최대 20곳까지 지정할 수 있습니다.");
        return current;
      }
      return [...current, place];
    });
  }, [elementsRef, setPlaceEventPlaces, setToast]);

  useEffect(() => {
    const previousKey = placeStoryDraftKeyRef.current;
    if (previousKey && previousKey !== selectedStoryKey) writePlaceStoryDraft(previousKey, placeStoryTextRef.current);
    placeStoryDraftKeyRef.current = selectedStoryKey;
    const nextDraft = readPlaceStoryDraft(selectedStoryKey);
    placeStoryTextRef.current = nextDraft;
    const timer = window.setTimeout(() => setPlaceStoryText(nextDraft), 0);
    return () => window.clearTimeout(timer);
  }, [placeStoryDraftKeyRef, placeStoryTextRef, selectedStoryKey, setPlaceStoryText]);

  useEffect(() => {
    placeStoryTextRef.current = placeStoryText;
    const draftKey = selectedStoryKey;
    const timer = window.setTimeout(() => writePlaceStoryDraft(draftKey, placeStoryText), 180);
    return () => {
      window.clearTimeout(timer);
      writePlaceStoryDraft(draftKey, placeStoryText);
    };
  }, [placeStoryText, placeStoryTextRef, selectedStoryKey]);

  useEffect(() => {
    const run = ++storyRequestRunRef.current;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!selectedStoryKey || publicLayoutAccess !== "viewer") {
        setPlaceStories([]);
        setPlaceStoriesCanModerate(false);
        setPlaceStoriesLoading(false);
        setPlaceStoriesLoadedKey(null);
        return null;
      }
      const requestKey = selectedStoryKey;
      setPlaceStoriesLoading(true);
      setPlaceStoriesLoadedKey(null);
      setPlaceStories([]);
      setPlaceStoryFormOpen(false);
      updatePlaceStoryPhoto(null);
      return fetch(`${PLACE_STORIES_API}?placeKey=${encodeURIComponent(selectedStoryKey)}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json().catch(() => null) as PlaceStoriesPayload | null;
          if (!response.ok && response.status !== 503) throw new Error(payload?.error ?? "story load failed");
          return payload;
        })
        .then((payload) => {
          if (storyRequestRunRef.current !== run) return;
          setPlaceStories(Array.isArray(payload?.stories) ? payload.stories : []);
          setPlaceStoriesCanModerate(Boolean(payload?.canModerate));
        })
        .catch((error) => {
          if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError") || storyRequestRunRef.current !== run) return;
          setPlaceStories([]);
          setPlaceStoriesCanModerate(false);
        })
        .finally(() => {
          if (!controller.signal.aborted && storyRequestRunRef.current === run) {
            setPlaceStoriesLoading(false);
            setPlaceStoriesLoadedKey(requestKey);
          }
        });
    });
    return () => controller.abort();
  }, [publicLayoutAccess, selectedStoryKey, setPlaceStories, setPlaceStoriesCanModerate, setPlaceStoriesLoadedKey, setPlaceStoriesLoading, setPlaceStoryFormOpen, storyRequestRunRef, updatePlaceStoryPhoto]);

  useEffect(() => {
    const run = ++eventRequestRunRef.current;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!selectedStoryKey || publicLayoutAccess !== "viewer") {
        setPlaceEvents([]);
        setPlaceEventsCanManage(false);
        setPlaceEventsLoading(false);
        setPlaceEventsLoadedKey(null);
        return null;
      }
      const requestKey = selectedStoryKey;
      setPlaceEventsLoading(true);
      setPlaceEventsLoadedKey(null);
      setPlaceEvents([]);
      setPlaceEventFormOpen(false);
      setPlaceEventEditingId(null);
      setPlaceEventNoPlace(false);
      setPlaceEventMultiPlace(false);
      setPlaceEventPlaces([]);
      setPlaceEventName("");
      setPlaceEventInfo("");
      setPlaceEventExistingPhotoUrl(null);
      updatePlaceEventPhoto(null);
      return fetch(`${PLACE_EVENTS_API}?placeKey=${encodeURIComponent(selectedStoryKey)}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json().catch(() => null) as PlaceEventsPayload | null;
          if (!response.ok && response.status !== 503) throw new Error(payload?.error ?? "event load failed");
          return payload;
        })
        .then((payload) => {
          if (eventRequestRunRef.current !== run) return;
          setPlaceEvents(Array.isArray(payload?.events) ? payload.events : []);
          setPlaceEventsCanManage(Boolean(payload?.canManage));
        })
        .catch((error) => {
          if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError") || eventRequestRunRef.current !== run) return;
          setPlaceEvents([]);
          setPlaceEventsCanManage(false);
        })
        .finally(() => {
          if (!controller.signal.aborted && eventRequestRunRef.current === run) {
            setPlaceEventsLoading(false);
            setPlaceEventsLoadedKey(requestKey);
          }
        });
    });
    return () => controller.abort();
  }, [eventRequestRunRef, placeEventsRefreshKey, publicLayoutAccess, selectedStoryKey, setPlaceEventEditingId, setPlaceEventExistingPhotoUrl, setPlaceEventFormOpen, setPlaceEventInfo, setPlaceEventMultiPlace, setPlaceEventName, setPlaceEventNoPlace, setPlaceEventPlaces, setPlaceEvents, setPlaceEventsCanManage, setPlaceEventsLoadedKey, setPlaceEventsLoading, updatePlaceEventPhoto]);

  return {
    syncReviewedPlaceRequestLocation,
    updatePlaceStoryPhoto,
    retainPlaceStoryPhoto,
    updatePlaceEventPhoto,
    togglePlaceEventMapSelection,
  };
}
