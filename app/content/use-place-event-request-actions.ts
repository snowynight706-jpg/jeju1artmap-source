"use client";

import {
  useRef,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import {
  markerAssetIdForPlace,
  recommendedMarkerStyle,
  type BundledMarkerCategory,
  type BundledMarkerStyle,
} from "../marker-assets";
import { elementDefaults } from "../map/core/element-defaults";
import type { DirectoryPlace, MapElement } from "../map/core/types";
import {
  PLACE_EVENTS_API,
  PLACE_REGISTRATION_REQUESTS_API,
  persistentVisitorId,
} from "./client";
import type {
  PlaceDirectoryRecord,
  PlaceEvent,
  PlaceEventPlace,
  PlaceEventsPayload,
  PlaceRegistrationRequest,
  PlaceRegistrationRequestsPayload,
} from "./types";
import { STORY_PHOTO_MAX_UPLOAD_BYTES, prepareStoryPhoto } from "../media/photo-processing";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type MutableRef<T> = { current: T };
type MapPosition = { x: number; y: number };
type PlaceRequestPatch = Partial<Pick<
  PlaceRegistrationRequest,
  "name" | "area" | "address" | "description" | "category" | "markerStyle" | "markerX" | "markerY"
>>;

type UsePlaceEventRequestActionsOptions = {
  placeEventEditingId: string | null;
  placeEventNoPlace: boolean;
  placeEventPlaces: PlaceEventPlace[];
  placeEventDialogOffset: MapPosition;
  placeEventName: string;
  placeEventInfo: string;
  placeEventStartsAt: string;
  placeEventEndsAt: string;
  placeEventVisibleFrom: string;
  placeEventVisibleUntil: string;
  placeEventPhoto: File | null;
  placeEventSubmitting: boolean;
  placeEventActionId: string | null;
  placeRequestSubmitting: boolean;
  placeRequestName: string;
  placeRequestArea: string;
  placeRequestAddress: string;
  placeRequestDescription: string;
  placeRequestCategory: BundledMarkerCategory;
  placeRequestMarkerStyle: BundledMarkerStyle;
  placeRequestLocation: MapPosition | null;
  placeRequestActionId: string | null;
  markerGroupSize: number;
  selectedId: string | null;
  elementsRef: MutableRef<MapElement[]>;
  updatePlaceEventPhoto: (file: File | null) => void;
  mergeDirectoryRecords: (records: PlaceDirectoryRecord[], current: DirectoryPlace[]) => DirectoryPlace[];
  replaceElements: (updater: (current: MapElement[]) => MapElement[]) => void;
  replaceDirectoryPlaces: (updater: (current: DirectoryPlace[]) => DirectoryPlace[]) => void;
  pushHistory: () => void;
  focusMapPosition: (x: number, y: number, elementId: string) => void;
  setPlaceEventFormOpen: StateSetter<boolean>;
  setPlaceEventEditingId: StateSetter<string | null>;
  setPlaceEventNoPlace: StateSetter<boolean>;
  setPlaceEventMultiPlace: StateSetter<boolean>;
  setPlaceEventPlaces: StateSetter<PlaceEventPlace[]>;
  setPlaceEventName: StateSetter<string>;
  setPlaceEventInfo: StateSetter<string>;
  setPlaceEventStartsAt: StateSetter<string>;
  setPlaceEventEndsAt: StateSetter<string>;
  setPlaceEventVisibleFrom: StateSetter<string>;
  setPlaceEventVisibleUntil: StateSetter<string>;
  setPlaceEventExistingPhotoUrl: StateSetter<string | null>;
  setPlaceEventDialogOffset: StateSetter<MapPosition>;
  setPlaceEventSubmitting: StateSetter<boolean>;
  setPlaceEventActionId: StateSetter<string | null>;
  setPlaceEvents: StateSetter<PlaceEvent[]>;
  setPlaceEventsRefreshKey: StateSetter<number>;
  setGlobalEvents: StateSetter<PlaceEvent[]>;
  setGlobalEventsPage: StateSetter<number>;
  setGlobalEventsRefreshKey: StateSetter<number>;
  setPlaceRequestSubmitting: StateSetter<boolean>;
  setPlaceRequestName: StateSetter<string>;
  setPlaceRequestArea: StateSetter<string>;
  setPlaceRequestAddress: StateSetter<string>;
  setPlaceRequestDescription: StateSetter<string>;
  setPlaceRequestCategory: StateSetter<BundledMarkerCategory>;
  setPlaceRequestMarkerStyle: StateSetter<BundledMarkerStyle>;
  setPlaceRequestLocation: StateSetter<MapPosition | null>;
  setPlaceRequestPickingLocation: StateSetter<boolean>;
  setPlaceRequestFormOpen: StateSetter<boolean>;
  setPlaceRequestActionId: StateSetter<string | null>;
  setPlaceRequests: StateSetter<PlaceRegistrationRequest[]>;
  setPlaceRequestsRefreshKey: StateSetter<number>;
  setSelectedId: StateSetter<string | null>;
  setSelectedNoteId: StateSetter<string | null>;
  setSelectedDenseLabelId: StateSetter<string | null>;
  setRightOpen: StateSetter<boolean>;
  setGlobalStoriesOpen: StateSetter<boolean>;
  setPlaceDirectoryUpdatedAt: StateSetter<string | null>;
  setPlaceDirectoryStorage: StateSetter<"loading" | "persistent" | "bundled">;
  setToast: StateSetter<string>;
};

export function usePlaceEventRequestActions(options: UsePlaceEventRequestActionsOptions) {
  const {
    placeEventEditingId,
    placeEventNoPlace,
    placeEventPlaces,
    placeEventDialogOffset,
    placeEventName,
    placeEventInfo,
    placeEventStartsAt,
    placeEventEndsAt,
    placeEventVisibleFrom,
    placeEventVisibleUntil,
    placeEventPhoto,
    placeEventSubmitting,
    placeEventActionId,
    placeRequestSubmitting,
    placeRequestName,
    placeRequestArea,
    placeRequestAddress,
    placeRequestDescription,
    placeRequestCategory,
    placeRequestMarkerStyle,
    placeRequestLocation,
    placeRequestActionId,
    markerGroupSize,
    selectedId,
    elementsRef,
    updatePlaceEventPhoto,
    mergeDirectoryRecords,
    replaceElements,
    replaceDirectoryPlaces,
    pushHistory,
    focusMapPosition,
    setPlaceEventFormOpen,
    setPlaceEventEditingId,
    setPlaceEventNoPlace,
    setPlaceEventMultiPlace,
    setPlaceEventPlaces,
    setPlaceEventName,
    setPlaceEventInfo,
    setPlaceEventStartsAt,
    setPlaceEventEndsAt,
    setPlaceEventVisibleFrom,
    setPlaceEventVisibleUntil,
    setPlaceEventExistingPhotoUrl,
    setPlaceEventDialogOffset,
    setPlaceEventSubmitting,
    setPlaceEventActionId,
    setPlaceEvents,
    setPlaceEventsRefreshKey,
    setGlobalEvents,
    setGlobalEventsPage,
    setGlobalEventsRefreshKey,
    setPlaceRequestSubmitting,
    setPlaceRequestName,
    setPlaceRequestArea,
    setPlaceRequestAddress,
    setPlaceRequestDescription,
    setPlaceRequestCategory,
    setPlaceRequestMarkerStyle,
    setPlaceRequestLocation,
    setPlaceRequestPickingLocation,
    setPlaceRequestFormOpen,
    setPlaceRequestActionId,
    setPlaceRequests,
    setPlaceRequestsRefreshKey,
    setSelectedId,
    setSelectedNoteId,
    setSelectedDenseLabelId,
    setRightOpen,
    setGlobalStoriesOpen,
    setPlaceDirectoryUpdatedAt,
    setPlaceDirectoryStorage,
    setToast,
  } = options;
  const eventDialogDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const closePlaceEventForm = () => {
    setPlaceEventFormOpen(false);
    setPlaceEventEditingId(null);
    setPlaceEventNoPlace(false);
    setPlaceEventMultiPlace(false);
    setPlaceEventPlaces([]);
    setPlaceEventName("");
    setPlaceEventInfo("");
    setPlaceEventStartsAt("");
    setPlaceEventEndsAt("");
    setPlaceEventVisibleFrom("");
    setPlaceEventVisibleUntil("");
    setPlaceEventExistingPhotoUrl(null);
    updatePlaceEventPhoto(null);
    eventDialogDragRef.current = null;
  };

  const openUnassignedPlaceEventForm = () => {
    const start = new Date();
    const eventEnd = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const visibilityEnd = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    setPlaceEventEditingId(null);
    setPlaceEventNoPlace(true);
    setPlaceEventMultiPlace(false);
    setPlaceEventPlaces([]);
    setPlaceEventName("");
    setPlaceEventInfo("");
    setPlaceEventStartsAt(localDateTimeInputValue(start));
    setPlaceEventEndsAt(localDateTimeInputValue(eventEnd));
    setPlaceEventVisibleFrom(localDateTimeInputValue(start));
    setPlaceEventVisibleUntil(localDateTimeInputValue(visibilityEnd));
    setPlaceEventExistingPhotoUrl(null);
    updatePlaceEventPhoto(null);
    setPlaceEventDialogOffset({ x: 0, y: 0 });
    setPlaceEventFormOpen(true);
  };

  const editPlaceEvent = (event: PlaceEvent) => {
    const places = eventPlaceList(event);
    setPlaceEventEditingId(event.id);
    setPlaceEventNoPlace(places.length === 0);
    setPlaceEventMultiPlace(places.length > 1);
    setPlaceEventPlaces(places);
    setPlaceEventName(event.eventName);
    setPlaceEventInfo(event.eventInfo);
    setPlaceEventStartsAt(localDateTimeInputValue(new Date(event.startsAt)));
    setPlaceEventEndsAt(localDateTimeInputValue(new Date(event.endsAt)));
    setPlaceEventVisibleFrom(localDateTimeInputValue(new Date(event.visibleFrom)));
    setPlaceEventVisibleUntil(localDateTimeInputValue(new Date(event.visibleUntil)));
    setPlaceEventExistingPhotoUrl(event.photoUrl);
    updatePlaceEventPhoto(null);
    setPlaceEventDialogOffset({ x: 0, y: 0 });
    setPlaceEventFormOpen(true);
  };

  const startPlaceEventDialogDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, input, textarea, label")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    eventDialogDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: placeEventDialogOffset.x,
      offsetY: placeEventDialogOffset.y,
    };
  };

  const movePlaceEventDialog = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = eventDialogDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const limitX = Math.max(0, window.innerWidth / 2 - 150);
    const limitY = Math.max(0, window.innerHeight / 2 - 90);
    setPlaceEventDialogOffset({
      x: clamp(drag.offsetX + event.clientX - drag.startX, -limitX, limitX),
      y: clamp(drag.offsetY + event.clientY - drag.startY, -limitY, limitY),
    });
  };

  const endPlaceEventDialogDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (eventDialogDragRef.current?.pointerId !== event.pointerId) return;
    eventDialogDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const submitPlaceEvent = async () => {
    if (placeEventSubmitting) return;
    const eventName = placeEventName.replace(/\s+/g, " ").trim().slice(0, 100);
    const eventInfo = placeEventInfo.trim().slice(0, 1200);
    const startsAtDate = new Date(placeEventStartsAt);
    const endsAtDate = new Date(placeEventEndsAt);
    const visibleFromDate = new Date(placeEventVisibleFrom);
    const visibleUntilDate = new Date(placeEventVisibleUntil);
    if (eventName.length < 2 || eventInfo.length < 2 || (!placeEventNoPlace && !placeEventPlaces.length) || (!placeEventEditingId && !placeEventPhoto)) {
      setToast(placeEventNoPlace ? "행사명·행사정보·사진을 모두 입력해 주세요." : "행사명·행사정보·장소·사진을 모두 입력해 주세요.");
      return;
    }
    if (Number.isNaN(startsAtDate.getTime()) || Number.isNaN(endsAtDate.getTime()) || endsAtDate <= startsAtDate) {
      setToast("행사 종료 시각은 시작 시각보다 뒤여야 합니다.");
      return;
    }
    if (Number.isNaN(visibleFromDate.getTime()) || Number.isNaN(visibleUntilDate.getTime()) || visibleUntilDate <= visibleFromDate) {
      setToast("노출 종료 시각은 시작 시각보다 뒤여야 합니다.");
      return;
    }
    setPlaceEventSubmitting(true);
    try {
      const form = new FormData();
      if (placeEventEditingId) form.set("id", placeEventEditingId);
      form.set("places", JSON.stringify(placeEventNoPlace ? [] : placeEventPlaces));
      form.set("eventName", eventName);
      form.set("eventInfo", eventInfo);
      form.set("startsAt", startsAtDate.toISOString());
      form.set("endsAt", endsAtDate.toISOString());
      form.set("visibleFrom", visibleFromDate.toISOString());
      form.set("visibleUntil", visibleUntilDate.toISOString());
      if (placeEventPhoto) {
        const prepared = await prepareStoryPhoto(placeEventPhoto);
        if (prepared.size > STORY_PHOTO_MAX_UPLOAD_BYTES) throw new Error("photo-too-large");
        form.set("photo", prepared);
      }
      const response = await fetch(PLACE_EVENTS_API, { method: placeEventEditingId ? "PATCH" : "POST", body: form });
      const payload = await response.json().catch(() => null) as PlaceEventsPayload | null;
      if (!response.ok || !payload?.event) {
        if (response.status === 413) throw new Error("photo-too-large");
        throw new Error(payload?.error ?? "event-submit-failed");
      }
      setGlobalEvents((current) => placeEventEditingId
        ? current.map((item) => item.id === payload.event!.id ? payload.event! : item)
        : [payload.event!, ...current.filter((item) => item.id !== payload.event!.id)]);
      setGlobalEventsPage(1);
      setGlobalEventsRefreshKey((current) => current + 1);
      setPlaceEventsRefreshKey((current) => current + 1);
      const wasEditing = Boolean(placeEventEditingId);
      closePlaceEventForm();
      setToast(wasEditing ? "행사 내용을 수정했습니다." : "행사를 저장했습니다. 설정한 노출 기간에 공개 화면에 표시됩니다.");
    } catch (error) {
      setToast(error instanceof Error && error.message === "photo-too-large"
        ? "사진을 처리해도 5MB를 넘습니다. 더 작은 사진을 선택해 주세요."
        : "행사를 저장하지 못했습니다. 장소 연결과 입력 내용을 확인해 주세요.");
    } finally {
      setPlaceEventSubmitting(false);
    }
  };

  const moderatePlaceEvent = async (event: PlaceEvent, status: "active" | "hidden") => {
    if (placeEventActionId) return;
    setPlaceEventActionId(event.id);
    try {
      const response = await fetch(PLACE_EVENTS_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: event.id, status }),
      });
      if (!response.ok) throw new Error("event moderation failed");
      const payload = await response.json().catch(() => null) as { updatedAt?: string } | null;
      const serverNow = Date.parse(payload?.updatedAt ?? "");
      const isVisible = status === "active" && Number.isFinite(serverNow) && Date.parse(event.visibleFrom) <= serverNow && Date.parse(event.visibleUntil) > serverNow;
      setPlaceEvents((current) => current.map((item) => item.id === event.id ? { ...item, status, isVisible } : item));
      setGlobalEvents((current) => current.map((item) => item.id === event.id ? { ...item, status, isVisible } : item));
      setGlobalEventsRefreshKey((current) => current + 1);
      setToast(status === "hidden" ? "행사를 공개 화면에서 숨겼습니다." : isVisible ? "행사를 다시 공개했습니다." : "행사를 활성화했습니다. 설정된 노출 기간에만 공개됩니다.");
    } catch {
      setToast("행사 공개 상태를 변경하지 못했습니다.");
    } finally {
      setPlaceEventActionId(null);
    }
  };

  const togglePlaceEventPin = async (event: PlaceEvent) => {
    if (placeEventActionId) return;
    const isPinned = !event.isPinned;
    setPlaceEventActionId(event.id);
    try {
      const response = await fetch(PLACE_EVENTS_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: event.id, isPinned }),
      });
      const payload = await response.json().catch(() => null) as { isPinned?: boolean } | null;
      if (!response.ok || payload?.isPinned !== isPinned) throw new Error("event pin failed");
      const updatePinnedEvent = (current: PlaceEvent[]) => current
        .map((item) => item.id === event.id ? { ...item, isPinned } : item)
        .sort(compareEventPriority);
      setPlaceEvents(updatePinnedEvent);
      setGlobalEvents(updatePinnedEvent);
      setGlobalEventsPage(1);
      setGlobalEventsRefreshKey((current) => current + 1);
      setToast(isPinned ? "행사를 공개 목록 상단에 고정했습니다." : "행사 상단 고정을 해제했습니다.");
    } catch {
      setToast("행사 상단 고정 상태를 변경하지 못했습니다.");
    } finally {
      setPlaceEventActionId(null);
    }
  };

  const deletePlaceEvent = async (event: PlaceEvent) => {
    if (placeEventActionId || !window.confirm(`‘${event.eventName}’ 행사와 사진을 서버에서 완전히 삭제할까요?`)) return;
    setPlaceEventActionId(event.id);
    try {
      const response = await fetch(`${PLACE_EVENTS_API}?id=${encodeURIComponent(event.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("event delete failed");
      setPlaceEvents((current) => current.filter((item) => item.id !== event.id));
      setGlobalEvents((current) => current.filter((item) => item.id !== event.id));
      setGlobalEventsRefreshKey((current) => current + 1);
      setToast("행사와 사진을 서버에서 완전히 삭제했습니다.");
    } catch {
      setToast("행사를 삭제하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setPlaceEventActionId(null);
    }
  };

  const submitPlaceRegistrationRequest = async () => {
    if (placeRequestSubmitting) return;
    if (placeRequestName.trim().length < 2 || !placeRequestArea || placeRequestAddress.trim().length < 5 || placeRequestDescription.trim().length < 10) {
      setToast("권역·세부지역을 선택하고 장소명·주소·설명을 조금 더 자세히 적어 주세요.");
      return;
    }
    if (!placeRequestLocation) {
      setToast("지도에서 마커 위치를 먼저 지정해 주세요.");
      return;
    }
    setPlaceRequestSubmitting(true);
    try {
      const response = await fetch(PLACE_REGISTRATION_REQUESTS_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: placeRequestName,
          area: placeRequestArea,
          address: placeRequestAddress,
          description: placeRequestDescription,
          category: placeRequestCategory,
          markerStyle: placeRequestMarkerStyle,
          markerX: placeRequestLocation.x,
          markerY: placeRequestLocation.y,
          visitorId: persistentVisitorId(),
        }),
      });
      const payload = await response.json().catch(() => null) as PlaceRegistrationRequestsPayload | null;
      if (!response.ok) {
        if (response.status === 409) throw new Error("duplicate");
        if (response.status === 429) throw new Error("rate-limit");
        throw new Error(payload?.error ?? "request failed");
      }
      setPlaceRequestName("");
      setPlaceRequestArea("");
      setPlaceRequestAddress("");
      setPlaceRequestDescription("");
      setPlaceRequestCategory("culture");
      setPlaceRequestMarkerStyle(recommendedMarkerStyle);
      setPlaceRequestLocation(null);
      setPlaceRequestPickingLocation(false);
      setPlaceRequestFormOpen(false);
      setToast("장소 등록 요청을 보냈습니다. 관리자 검수 후 지도에 반영됩니다.");
    } catch (error) {
      setToast(error instanceof Error && error.message === "duplicate"
        ? "이미 등록된 장소이거나 같은 장소의 검수 요청이 대기 중입니다."
        : error instanceof Error && error.message === "rate-limit"
          ? "오늘 보낼 수 있는 장소 등록 요청 수를 초과했습니다."
          : "장소 등록 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPlaceRequestSubmitting(false);
    }
  };

  const updatePlaceRequestDraft = (id: string, patch: PlaceRequestPatch) => {
    setPlaceRequests((current) => current.map((request) => request.id === id ? { ...request, ...patch } : request));
    const linked = elementsRef.current.find((element) => element.placeRequestId === id && !element.directoryId);
    if (!linked) return;
    const nextCategory = (patch.category ?? linked.category) as BundledMarkerCategory;
    const nextStyle = patch.markerStyle ?? (linked.assetId?.match(/-(01|02|03|v2)-/)?.[1] as BundledMarkerStyle | undefined) ?? recommendedMarkerStyle;
    replaceElements((current) => current.map((element) => element.id === linked.id ? {
      ...element,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.address !== undefined ? { address: patch.address } : {}),
      ...(patch.category !== undefined || patch.markerStyle !== undefined ? {
        category: nextCategory,
        assetId: markerAssetIdForPlace(nextStyle, nextCategory, `${patch.name ?? linked.name} ${patch.description ?? ""}`),
        size: markerGroupSize,
      } : {}),
      ...(typeof patch.markerX === "number" ? { x: patch.markerX, anchorX: patch.markerX } : {}),
      ...(typeof patch.markerY === "number" ? { y: patch.markerY, anchorY: patch.markerY } : {}),
    } : element));
  };

  const savePlaceRequestEdits = async (request: PlaceRegistrationRequest) => {
    if (placeRequestActionId || request.status === "approved") return;
    setPlaceRequestActionId(request.id);
    try {
      const response = await fetch(PLACE_REGISTRATION_REQUESTS_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: request.id, action: "edit", name: request.name, area: request.area, address: request.address, description: request.description, category: request.category, markerStyle: request.markerStyle, markerX: request.markerX, markerY: request.markerY }),
      });
      const payload = await response.json().catch(() => null) as PlaceRegistrationRequestsPayload | null;
      if (!response.ok || !payload?.request) throw new Error(payload?.error ?? "save failed");
      setPlaceRequests((current) => current.map((item) => item.id === request.id ? payload.request! : item));
      setToast("장소 요청의 검수 내용을 저장했습니다.");
    } catch {
      setToast("장소 요청 수정 내용을 저장하지 못했습니다.");
    } finally {
      setPlaceRequestActionId(null);
    }
  };

  const startPlaceRequestReview = async (request: PlaceRegistrationRequest) => {
    if (placeRequestActionId || request.status === "approved" || request.status === "rejected") return;
    const existingElement = elementsRef.current.find((element) => element.placeRequestId === request.id && !element.directoryId);
    if (existingElement) {
      selectReviewElement(existingElement);
      focusMapPosition(existingElement.x, existingElement.y, existingElement.id);
      setToast("검수 중인 마커로 이동했습니다. 위치·크기·라벨을 조정한 뒤 장소 요청을 승인하세요.");
      return;
    }
    setPlaceRequestActionId(request.id);
    try {
      const response = await fetch(PLACE_REGISTRATION_REQUESTS_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: request.id,
          action: "start-review",
          name: request.name,
          area: request.area,
          address: request.address,
          description: request.description,
          category: request.category,
          markerStyle: request.markerStyle,
          markerX: request.markerX,
          markerY: request.markerY,
        }),
      });
      const payload = await response.json().catch(() => null) as PlaceRegistrationRequestsPayload | null;
      if (!response.ok || !payload?.request) throw new Error(payload?.error ?? "review start failed");
      const reviewing = payload.request;
      const x = typeof reviewing.markerX === "number" ? reviewing.markerX : 50;
      const y = typeof reviewing.markerY === "number" ? reviewing.markerY : 50;
      const nextElement: MapElement = {
        ...elementDefaults,
        id: `requested-place-${reviewing.id}`,
        placeRequestId: reviewing.id,
        name: reviewing.name,
        category: reviewing.category,
        x,
        y,
        anchorX: x,
        anchorY: y,
        size: markerGroupSize,
        z: Math.max(0, ...elementsRef.current.map((element) => element.z)) + 1,
        labelVisible: true,
        labelGap: 4,
        assetId: markerAssetIdForPlace(reviewing.markerStyle, reviewing.category, `${reviewing.name} ${reviewing.description}`),
        status: "unchecked",
        address: reviewing.address,
        memo: "장소 등록 요청 검수 중 · 위치·크기·라벨을 조정한 뒤 장소 요청 관리에서 승인하세요.",
      };
      pushHistory();
      replaceElements((current) => [...current.filter((element) => element.placeRequestId !== reviewing.id), nextElement]);
      setPlaceRequests((current) => current.map((item) => item.id === reviewing.id ? reviewing : item));
      selectReviewElement(nextElement);
      focusMapPosition(x, y, nextElement.id);
      setToast("요청자가 지정한 위치에 검수용 마커를 표시했습니다. 조정 후 장소 요청 관리에서 승인하세요.");
    } catch {
      setToast("장소 요청 검수를 시작하지 못했습니다.");
    } finally {
      setPlaceRequestActionId(null);
    }
  };

  const approvePlaceRequest = async (request: PlaceRegistrationRequest) => {
    const reviewElement = elementsRef.current.find((element) => element.placeRequestId === request.id && !element.directoryId);
    if (placeRequestActionId || request.status !== "reviewing" || !reviewElement) {
      if (!placeRequestActionId && request.status !== "approved") setToast("먼저 지도 검수를 시작해 마커 위치를 확인해 주세요.");
      return;
    }
    if (!window.confirm(`‘${request.name}’을(를) 검수한 위치대로 장소 DB와 지도 편집 초안에 반영할까요?`)) return;
    const reviewedCategory = reviewElement.category === "landmark" ? request.category : reviewElement.category as BundledMarkerCategory;
    const reviewedMarkerStyle = (reviewElement.assetId?.match(/^generic-marker-(01|02|03|v2)-/)?.[1] as BundledMarkerStyle | undefined) ?? request.markerStyle;
    setPlaceRequestActionId(request.id);
    try {
      const response = await fetch(PLACE_REGISTRATION_REQUESTS_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: request.id,
          action: "approve",
          name: reviewElement.name,
          area: request.area,
          address: reviewElement.address,
          description: request.description,
          category: reviewedCategory,
          markerStyle: reviewedMarkerStyle,
          markerX: reviewElement.x,
          markerY: reviewElement.y,
        }),
      });
      const payload = await response.json().catch(() => null) as PlaceRegistrationRequestsPayload | null;
      if (!response.ok || !payload?.request || !payload.directory) {
        if (response.status === 409) throw new Error("duplicate");
        throw new Error(payload?.error ?? "approve failed");
      }
      const approved = payload.request;
      const newPlace = mergeDirectoryRecords([payload.directory], [])[0];
      pushHistory();
      replaceDirectoryPlaces((current) => [...current.filter((place) => place.id !== newPlace.id), newPlace]);
      const x = reviewElement?.x ?? approved.markerX ?? 50;
      const y = reviewElement?.y ?? approved.markerY ?? 50;
      const nextElement: MapElement = reviewElement ? {
        ...reviewElement,
        directoryId: newPlace.id,
        name: approved.name,
        category: approved.category,
        x,
        y,
        anchorX: x,
        anchorY: y,
        assetId: markerAssetIdForPlace(approved.markerStyle, approved.category, `${approved.name} ${approved.description}`),
        status: "unchecked",
        address: approved.address,
        memo: "장소 등록 요청 승인 · 최종 표시 상태를 확인한 뒤 공개본을 업데이트하세요.",
      } : {
        ...elementDefaults,
        id: `requested-place-${approved.id}`,
        placeRequestId: approved.id,
        directoryId: newPlace.id,
        name: approved.name,
        category: approved.category,
        x,
        y,
        anchorX: x,
        anchorY: y,
        size: markerGroupSize,
        z: Math.max(0, ...elementsRef.current.map((element) => element.z)) + 1,
        labelVisible: true,
        labelGap: 4,
        assetId: markerAssetIdForPlace(approved.markerStyle, approved.category, `${approved.name} ${approved.description}`),
        status: "unchecked",
        address: approved.address,
        memo: "장소 등록 요청 승인 · 최종 표시 상태를 확인한 뒤 공개본을 업데이트하세요.",
      };
      replaceElements((current) => [...current.filter((element) => element.id !== nextElement.id && element.placeRequestId !== approved.id), nextElement]);
      selectReviewElement(nextElement);
      setPlaceDirectoryUpdatedAt(approved.updatedAt);
      setPlaceDirectoryStorage("persistent");
      setPlaceRequests((current) => current.map((item) => item.id === request.id ? approved : item));
      setPlaceRequestsRefreshKey((current) => current + 1);
      focusMapPosition(x, y, nextElement.id);
      setToast("검수한 위치와 마커를 장소 DB·편집 초안에 반영했습니다. 최종 확인 후 공개본을 업데이트해 주세요.");
    } catch (error) {
      setToast(error instanceof Error && error.message === "duplicate"
        ? "같은 이름의 장소가 이미 DB에 있습니다. 기존 장소를 먼저 확인해 주세요."
        : "장소 요청을 반영하지 못했습니다.");
    } finally {
      setPlaceRequestActionId(null);
    }
  };

  const rejectPlaceRequest = async (request: PlaceRegistrationRequest) => {
    if (placeRequestActionId || request.status === "approved") return;
    const rejectionNote = window.prompt("반려 사유를 내부 메모로 남길 수 있습니다.", request.rejectionNote || "") ?? null;
    if (rejectionNote === null) return;
    setPlaceRequestActionId(request.id);
    try {
      const response = await fetch(PLACE_REGISTRATION_REQUESTS_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: request.id, action: "reject", rejectionNote }),
      });
      const payload = await response.json().catch(() => null) as PlaceRegistrationRequestsPayload | null;
      if (!response.ok || !payload?.request) throw new Error(payload?.error ?? "reject failed");
      removeProvisionalRequestElement(request.id);
      setPlaceRequests((current) => current.map((item) => item.id === request.id ? payload.request! : item));
      setPlaceRequestsRefreshKey((current) => current + 1);
      setToast("장소 등록 요청을 반려 처리했습니다.");
    } catch {
      setToast("장소 등록 요청을 반려 처리하지 못했습니다.");
    } finally {
      setPlaceRequestActionId(null);
    }
  };

  const deletePlaceRequest = async (request: PlaceRegistrationRequest) => {
    if (placeRequestActionId || !window.confirm(`‘${request.name}’ 등록 요청 기록을 완전히 삭제할까요?\n승인된 장소 DB와 마커는 삭제되지 않습니다.`)) return;
    setPlaceRequestActionId(request.id);
    try {
      const response = await fetch(`${PLACE_REGISTRATION_REQUESTS_API}?id=${encodeURIComponent(request.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("delete failed");
      removeProvisionalRequestElement(request.id);
      setPlaceRequests((current) => current.filter((item) => item.id !== request.id));
      setPlaceRequestsRefreshKey((current) => current + 1);
      setToast("장소 등록 요청 기록을 삭제했습니다.");
    } catch {
      setToast("장소 등록 요청 기록을 삭제하지 못했습니다.");
    } finally {
      setPlaceRequestActionId(null);
    }
  };

  const selectReviewElement = (element: MapElement) => {
    setSelectedId(element.id);
    setSelectedNoteId(null);
    setSelectedDenseLabelId(null);
    setRightOpen(true);
    setGlobalStoriesOpen(false);
  };

  const removeProvisionalRequestElement = (requestId: string) => {
    const linkedElement = elementsRef.current.find((element) => element.placeRequestId === requestId && !element.directoryId);
    if (!linkedElement) return;
    pushHistory();
    replaceElements((current) => current.filter((element) => element.id !== linkedElement.id));
    if (selectedId === linkedElement.id) setSelectedId(null);
  };

  return {
    closePlaceEventForm,
    openUnassignedPlaceEventForm,
    editPlaceEvent,
    startPlaceEventDialogDrag,
    movePlaceEventDialog,
    endPlaceEventDialogDrag,
    submitPlaceEvent,
    moderatePlaceEvent,
    togglePlaceEventPin,
    deletePlaceEvent,
    submitPlaceRegistrationRequest,
    updatePlaceRequestDraft,
    savePlaceRequestEdits,
    startPlaceRequestReview,
    approvePlaceRequest,
    rejectPlaceRequest,
    deletePlaceRequest,
  };
}

function localDateTimeInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function eventPlaceList(event: PlaceEvent): PlaceEventPlace[] {
  return Array.isArray(event.places) && event.places.length
    ? event.places
    : event.placeKey && event.placeName ? [{ placeKey: event.placeKey, placeName: event.placeName }] : [];
}

function compareEventPriority(left: PlaceEvent, right: PlaceEvent) {
  if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
