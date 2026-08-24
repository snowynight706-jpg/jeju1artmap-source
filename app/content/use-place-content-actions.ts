"use client";

import type { Dispatch, SetStateAction } from "react";
import type { DirectoryPlace, MapElement } from "../map/core/types";
import type { DirectoryStorage } from "../place-directory/contracts";
import type { PlaceDirectoryRecord } from "./types";
import { usePlaceEventRequestActions } from "./use-place-event-request-actions";
import { usePlaceStoryActions } from "./use-place-story-actions";
import type { usePlaceContentWorkspace } from "./use-place-content-workspace";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type ContentWorkspace = ReturnType<typeof usePlaceContentWorkspace>;

type UsePlaceContentActionsOptions = {
  content: ContentWorkspace;
  selected: MapElement | null;
  selectedDirectoryPlace: DirectoryPlace | null;
  selectedStoryKey: string | null;
  markerGroupSize: number;
  selectedId: string | null;
  elementsRef: { current: MapElement[] };
  mergeDirectoryRecords: (records: PlaceDirectoryRecord[], current: DirectoryPlace[]) => DirectoryPlace[];
  replaceElements: (updater: (current: MapElement[]) => MapElement[]) => void;
  replaceDirectoryPlaces: (updater: (current: DirectoryPlace[]) => DirectoryPlace[]) => void;
  pushHistory: () => void;
  focusMapPosition: (x: number, y: number, elementId: string) => void;
  setSelectedId: StateSetter<string | null>;
  setSelectedNoteId: StateSetter<string | null>;
  setSelectedDenseLabelId: StateSetter<string | null>;
  setRightOpen: StateSetter<boolean>;
  setPlaceDirectoryUpdatedAt: StateSetter<string | null>;
  setPlaceDirectoryStorage: StateSetter<DirectoryStorage>;
  setToast: StateSetter<string>;
};

export function usePlaceContentActions({
  content,
  selected,
  selectedDirectoryPlace,
  selectedStoryKey,
  markerGroupSize,
  selectedId,
  elementsRef,
  mergeDirectoryRecords,
  replaceElements,
  replaceDirectoryPlaces,
  pushHistory,
  focusMapPosition,
  setSelectedId,
  setSelectedNoteId,
  setSelectedDenseLabelId,
  setRightOpen,
  setPlaceDirectoryUpdatedAt,
  setPlaceDirectoryStorage,
  setToast,
}: UsePlaceContentActionsOptions) {
  const storyActions = usePlaceStoryActions({
    selected,
    selectedDirectoryPlace,
    selectedStoryKey,
    placeStoryFormOpen: content.placeStoryFormOpen,
    placeStoryAuthor: content.placeStoryAuthor,
    placeStoryText: content.placeStoryText,
    placeStoryPhoto: content.placeStoryPhoto,
    placeStorySubmitting: content.placeStorySubmitting,
    storyCameraPermission: content.storyCameraPermission,
    storyReportTarget: content.storyReportTarget,
    storyReportReason: content.storyReportReason,
    storyReportDetail: content.storyReportDetail,
    storyReportSubmitting: content.storyReportSubmitting,
    reportedStoryIds: content.reportedStoryIds,
    placeStoryActionId: content.placeStoryActionId,
    uploadDiagnosticActionId: content.uploadDiagnosticActionId,
    performanceDiagnosticActionId: content.performanceDiagnosticActionId,
    uploadDiagnostics: content.uploadDiagnostics,
    performanceDiagnostics: content.performanceDiagnostics,
    placeStoryTextRef: content.placeStoryTextRef,
    updatePlaceStoryPhoto: content.updatePlaceStoryPhoto,
    setPlaceStoryFormOpen: content.setPlaceStoryFormOpen,
    setPlaceStoryAuthor: content.setPlaceStoryAuthor,
    setPlaceStoryText: content.setPlaceStoryText,
    setPlaceStorySubmitting: content.setPlaceStorySubmitting,
    setStoryCameraPermission: content.setStoryCameraPermission,
    setPlaceStories: content.setPlaceStories,
    setReviewCountsByPlace: content.setReviewCountsByPlace,
    setGlobalStoriesPage: content.setGlobalStoriesPage,
    setGlobalStoriesRefreshKey: content.setGlobalStoriesRefreshKey,
    setStoryReportTarget: content.setStoryReportTarget,
    setStoryReportReason: content.setStoryReportReason,
    setStoryReportDetail: content.setStoryReportDetail,
    setStoryReportSubmitting: content.setStoryReportSubmitting,
    setReportedStoryIds: content.setReportedStoryIds,
    setPlaceStoryActionId: content.setPlaceStoryActionId,
    setGlobalStories: content.setGlobalStories,
    setUploadDiagnosticActionId: content.setUploadDiagnosticActionId,
    setUploadDiagnostics: content.setUploadDiagnostics,
    setPerformanceDiagnosticActionId: content.setPerformanceDiagnosticActionId,
    setPerformanceDiagnostics: content.setPerformanceDiagnostics,
    setToast,
  });
  const eventRequestActions = usePlaceEventRequestActions({
    placeEventEditingId: content.placeEventEditingId,
    placeEventNoPlace: content.placeEventNoPlace,
    placeEventPlaces: content.placeEventPlaces,
    placeEventDialogOffset: content.placeEventDialogOffset,
    placeEventName: content.placeEventName,
    placeEventInfo: content.placeEventInfo,
    placeEventStartsAt: content.placeEventStartsAt,
    placeEventEndsAt: content.placeEventEndsAt,
    placeEventVisibleFrom: content.placeEventVisibleFrom,
    placeEventVisibleUntil: content.placeEventVisibleUntil,
    placeEventPhoto: content.placeEventPhoto,
    placeEventSubmitting: content.placeEventSubmitting,
    placeEventActionId: content.placeEventActionId,
    placeRequestSubmitting: content.placeRequestSubmitting,
    placeRequestName: content.placeRequestName,
    placeRequestArea: content.placeRequestArea,
    placeRequestAddress: content.placeRequestAddress,
    placeRequestDescription: content.placeRequestDescription,
    placeRequestCategory: content.placeRequestCategory,
    placeRequestMarkerStyle: content.placeRequestMarkerStyle,
    placeRequestLocation: content.placeRequestLocation,
    placeRequestActionId: content.placeRequestActionId,
    markerGroupSize,
    selectedId,
    elementsRef,
    updatePlaceEventPhoto: content.updatePlaceEventPhoto,
    mergeDirectoryRecords,
    replaceElements,
    replaceDirectoryPlaces,
    pushHistory,
    focusMapPosition,
    setPlaceEventFormOpen: content.setPlaceEventFormOpen,
    setPlaceEventEditingId: content.setPlaceEventEditingId,
    setPlaceEventNoPlace: content.setPlaceEventNoPlace,
    setPlaceEventMultiPlace: content.setPlaceEventMultiPlace,
    setPlaceEventPlaces: content.setPlaceEventPlaces,
    setPlaceEventName: content.setPlaceEventName,
    setPlaceEventInfo: content.setPlaceEventInfo,
    setPlaceEventStartsAt: content.setPlaceEventStartsAt,
    setPlaceEventEndsAt: content.setPlaceEventEndsAt,
    setPlaceEventVisibleFrom: content.setPlaceEventVisibleFrom,
    setPlaceEventVisibleUntil: content.setPlaceEventVisibleUntil,
    setPlaceEventExistingPhotoUrl: content.setPlaceEventExistingPhotoUrl,
    setPlaceEventDialogOffset: content.setPlaceEventDialogOffset,
    setPlaceEventSubmitting: content.setPlaceEventSubmitting,
    setPlaceEventActionId: content.setPlaceEventActionId,
    setPlaceEvents: content.setPlaceEvents,
    setPlaceEventsRefreshKey: content.setPlaceEventsRefreshKey,
    setGlobalEvents: content.setGlobalEvents,
    setGlobalEventsPage: content.setGlobalEventsPage,
    setGlobalEventsRefreshKey: content.setGlobalEventsRefreshKey,
    setPlaceRequestSubmitting: content.setPlaceRequestSubmitting,
    setPlaceRequestName: content.setPlaceRequestName,
    setPlaceRequestArea: content.setPlaceRequestArea,
    setPlaceRequestAddress: content.setPlaceRequestAddress,
    setPlaceRequestDescription: content.setPlaceRequestDescription,
    setPlaceRequestCategory: content.setPlaceRequestCategory,
    setPlaceRequestMarkerStyle: content.setPlaceRequestMarkerStyle,
    setPlaceRequestLocation: content.setPlaceRequestLocation,
    setPlaceRequestPickingLocation: content.setPlaceRequestPickingLocation,
    setPlaceRequestFormOpen: content.setPlaceRequestFormOpen,
    setPlaceRequestActionId: content.setPlaceRequestActionId,
    setPlaceRequests: content.setPlaceRequests,
    setPlaceRequestsRefreshKey: content.setPlaceRequestsRefreshKey,
    setSelectedId,
    setSelectedNoteId,
    setSelectedDenseLabelId,
    setRightOpen,
    setGlobalStoriesOpen: content.setGlobalStoriesOpen,
    setPlaceDirectoryUpdatedAt,
    setPlaceDirectoryStorage,
    setToast,
  });

  return { ...storyActions, ...eventRequestActions };
}
