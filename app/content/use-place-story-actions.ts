"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { DirectoryPlace, MapElement } from "../map/core/types";
import {
  PLACE_STORIES_API,
  persistentVisitorId,
  sendPlaceStoryUploadDiagnostic,
  writePlaceStoryDraft,
} from "./client";
import type {
  PerformanceDiagnostic,
  PlaceReviewCount,
  PlaceStoriesPayload,
  PlaceStory,
  PlaceStoryUploadDiagnostic,
  StoryCameraPermissionState,
  StoryReportReason,
} from "./types";
import { STORY_PHOTO_TARGET_BYTES, prepareStoryPhoto } from "../media/photo-processing";

const PLACE_STORY_AUTHOR_KEY = "jeju-wondosim-map-review:story-author:v1";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type MutableRef<T> = { current: T };

type UsePlaceStoryActionsOptions = {
  selected: MapElement | null;
  selectedDirectoryPlace: DirectoryPlace | null;
  selectedStoryKey: string | null;
  placeStoryFormOpen: boolean;
  placeStoryAuthor: string;
  placeStoryText: string;
  placeStoryPhoto: File | null;
  placeStorySubmitting: boolean;
  storyCameraPermission: StoryCameraPermissionState;
  storyReportTarget: PlaceStory | null;
  storyReportReason: StoryReportReason;
  storyReportDetail: string;
  storyReportSubmitting: boolean;
  reportedStoryIds: Set<string>;
  placeStoryActionId: string | null;
  uploadDiagnosticActionId: string | null;
  performanceDiagnosticActionId: string | null;
  uploadDiagnostics: PlaceStoryUploadDiagnostic[];
  performanceDiagnostics: PerformanceDiagnostic[];
  placeStoryTextRef: MutableRef<string>;
  updatePlaceStoryPhoto: (file: File | null) => void;
  setPlaceStoryFormOpen: StateSetter<boolean>;
  setPlaceStoryAuthor: StateSetter<string>;
  setPlaceStoryText: StateSetter<string>;
  setPlaceStorySubmitting: StateSetter<boolean>;
  setStoryCameraPermission: StateSetter<StoryCameraPermissionState>;
  setPlaceStories: StateSetter<PlaceStory[]>;
  setReviewCountsByPlace: StateSetter<PlaceReviewCount[]>;
  setGlobalStoriesPage: StateSetter<number>;
  setGlobalStoriesRefreshKey: StateSetter<number>;
  setStoryReportTarget: StateSetter<PlaceStory | null>;
  setStoryReportReason: StateSetter<StoryReportReason>;
  setStoryReportDetail: StateSetter<string>;
  setStoryReportSubmitting: StateSetter<boolean>;
  setReportedStoryIds: StateSetter<Set<string>>;
  setPlaceStoryActionId: StateSetter<string | null>;
  setGlobalStories: StateSetter<PlaceStory[]>;
  setUploadDiagnosticActionId: StateSetter<string | null>;
  setUploadDiagnostics: StateSetter<PlaceStoryUploadDiagnostic[]>;
  setPerformanceDiagnosticActionId: StateSetter<string | null>;
  setPerformanceDiagnostics: StateSetter<PerformanceDiagnostic[]>;
  setToast: StateSetter<string>;
};

export function usePlaceStoryActions(options: UsePlaceStoryActionsOptions) {
  const {
    selected,
    selectedDirectoryPlace,
    selectedStoryKey,
    placeStoryFormOpen,
    placeStoryAuthor,
    placeStoryText,
    placeStoryPhoto,
    placeStorySubmitting,
    storyCameraPermission,
    storyReportTarget,
    storyReportReason,
    storyReportDetail,
    storyReportSubmitting,
    reportedStoryIds,
    placeStoryActionId,
    uploadDiagnosticActionId,
    performanceDiagnosticActionId,
    uploadDiagnostics,
    performanceDiagnostics,
    placeStoryTextRef,
    updatePlaceStoryPhoto,
    setPlaceStoryFormOpen,
    setPlaceStoryAuthor,
    setPlaceStoryText,
    setPlaceStorySubmitting,
    setStoryCameraPermission,
    setPlaceStories,
    setReviewCountsByPlace,
    setGlobalStoriesPage,
    setGlobalStoriesRefreshKey,
    setStoryReportTarget,
    setStoryReportReason,
    setStoryReportDetail,
    setStoryReportSubmitting,
    setReportedStoryIds,
    setPlaceStoryActionId,
    setGlobalStories,
    setUploadDiagnosticActionId,
    setUploadDiagnostics,
    setPerformanceDiagnosticActionId,
    setPerformanceDiagnostics,
    setToast,
  } = options;

  const togglePlaceStoryForm = () => {
    const next = !placeStoryFormOpen;
    if (next && !placeStoryAuthor.trim()) {
      try {
        setPlaceStoryAuthor(localStorage.getItem(PLACE_STORY_AUTHOR_KEY)?.slice(0, 20) ?? "");
      } catch {}
    }
    setPlaceStoryFormOpen(next);
  };

  const requestPlaceStoryCameraPermission = async () => {
    if (storyCameraPermission === "requesting") return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStoryCameraPermission("unavailable");
      setToast("이 기기의 PWA에서는 카메라 권한 확인 기능을 지원하지 않습니다. 사진 선택은 계속 사용할 수 있습니다.");
      return;
    }
    setStoryCameraPermission("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      stream.getTracks().forEach((track) => track.stop());
      setStoryCameraPermission("granted");
      setToast("카메라 권한이 허용되었습니다. ‘카메라 촬영’을 눌러 사진을 촬영할 수 있습니다.");
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      setStoryCameraPermission(denied ? "denied" : "unavailable");
      setToast(denied
        ? "카메라 권한이 차단되었습니다. 기기 설정의 원도심 맵 권한에서 카메라를 허용해 주세요."
        : "이 기기에서 카메라를 사용할 수 없습니다. 갤러리의 ‘사진 1장 선택’을 이용해 주세요.");
    }
  };

  const submitPlaceStory = async () => {
    if (!selected || !selectedStoryKey || placeStorySubmitting) return;
    const authorName = placeStoryAuthor.replace(/\s+/g, " ").trim().slice(0, 20);
    const reviewText = placeStoryText.replace(/\s+/g, " ").trim().slice(0, 220);
    const selectedStoryPlaceName = selectedDirectoryPlace?.name ?? selected.name;
    if (!authorName || reviewText.length < 2) {
      setToast("닉네임과 2자 이상의 짧은 후기를 입력해 주세요.");
      return;
    }
    setPlaceStorySubmitting(true);
    let uploadStage: "prepare" | "request" | "response" = "prepare";
    let preparedPhoto: File | null = null;
    let responseStatus = 0;
    try {
      const form = new FormData();
      form.set("placeKey", selectedStoryKey);
      form.set("placeName", selectedStoryPlaceName);
      form.set("authorName", authorName);
      form.set("reviewText", reviewText);
      form.set("visitorId", persistentVisitorId());
      if (placeStoryPhoto) {
        preparedPhoto = await prepareStoryPhoto(placeStoryPhoto);
        if (preparedPhoto.size > STORY_PHOTO_TARGET_BYTES) throw new Error("photo-compression-target-failed");
        form.set("photo", preparedPhoto);
      }
      uploadStage = "request";
      const response = await fetch(PLACE_STORIES_API, { method: "POST", body: form, cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => null) as PlaceStoriesPayload | null;
      responseStatus = response.status;
      uploadStage = "response";
      if (!response.ok || !payload?.story) {
        if (response.status === 429) throw new Error("rate-limit");
        if (response.status === 413) throw new Error("request-too-large");
        if (response.status === 415) throw new Error("photo-unsupported");
        if (response.status === 503) throw new Error("storage-unavailable");
        if (response.status === 404) throw new Error("place-not-found");
        if (response.status === 400) throw new Error("entry-invalid");
        if (response.status >= 500) throw new Error("server-error");
        throw new Error(payload?.error ?? "story-submit-failed");
      }
      setPlaceStories((current) => [payload.story!, ...current]);
      setReviewCountsByPlace((current) => {
        const matchedIndex = current.findIndex((place) => place.placeKey === selectedStoryKey);
        if (matchedIndex < 0) return [...current, { placeKey: selectedStoryKey, placeName: selectedStoryPlaceName, count: 1, latestCreatedAt: payload.story!.createdAt }];
        return current.map((place, index) => index === matchedIndex ? { ...place, count: place.count + 1, latestCreatedAt: payload.story!.createdAt } : place);
      });
      setGlobalStoriesPage(1);
      setGlobalStoriesRefreshKey((current) => current + 1);
      writePlaceStoryDraft(selectedStoryKey, "");
      placeStoryTextRef.current = "";
      setPlaceStoryText("");
      updatePlaceStoryPhoto(null);
      setPlaceStoryFormOpen(false);
      try { localStorage.setItem(PLACE_STORY_AUTHOR_KEY, authorName); } catch {}
      setToast("사진과 후기를 원도심 아카이브에 남겼습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const errorCode = !navigator.onLine ? "offline" : message || (uploadStage === "request" ? "network-error" : "unknown-error");
      const diagnosticReference = await sendPlaceStoryUploadDiagnostic({
        placeKey: selectedStoryKey,
        stage: uploadStage,
        errorCode,
        responseStatus,
        sourceFile: placeStoryPhoto,
        preparedFile: preparedPhoto,
      });
      const diagnosticSuffix = diagnosticReference ? ` · 오류 ID ${diagnosticReference}` : "";
      setToast((!navigator.onLine
        ? "인터넷 연결을 확인한 뒤 다시 시도해 주세요. 작성한 내용은 현재 화면에 유지됩니다."
        : message === "rate-limit"
        ? "짧은 시간에 등록이 많습니다. 잠시 뒤 다시 시도해 주세요."
        : message === "photo-too-large"
          ? "기기에서 사진 압축 결과를 만들지 못했습니다. 다른 사진 형식으로 다시 선택해 주세요."
          : message === "photo-decode-failed"
            ? "선택한 사진을 기기에서 열지 못했습니다. 사진을 다시 저장하거나 다른 사진을 선택해 주세요."
          : message === "photo-encode-failed"
            ? "기기에서 사진 변환을 완료하지 못했습니다. 원본은 전송하지 않았으며 다른 사진을 선택해 주세요."
          : message === "photo-compression-target-failed"
            ? "사진을 안전한 업로드 용량까지 줄이지 못했습니다. 원본은 전송하지 않았으며 다른 사진을 선택해 주세요."
          : message === "request-too-large"
            ? `사진은 ${preparedPhoto ? `${Math.max(1, Math.round(preparedPhoto.size / 1024))}KB로 준비됐지만 ` : ""}서버 요청 크기 제한에 걸렸습니다.`
          : message === "photo-source-too-large"
            ? "원본 사진이 30MB를 넘습니다. 더 작은 사진을 선택해 주세요."
            : message === "photo-unsupported"
              ? "이 사진 형식을 모바일에서 처리하지 못했습니다. JPEG·PNG·WebP 사진을 선택해 주세요."
              : message === "place-not-found"
                ? "선택한 장소 연결 정보가 현재 배포본과 일치하지 않습니다. 지도를 새로고침한 뒤 다시 시도해 주세요."
                : message === "entry-invalid"
                  ? "닉네임·후기 또는 장소 연결값을 서버가 확인하지 못했습니다. 입력 내용은 그대로 유지됩니다."
              : message === "storage-unavailable"
                ? "후기 저장 서버가 잠시 응답하지 않습니다. 작성한 내용을 유지한 채 잠시 후 다시 시도해 주세요."
                : message === "server-error"
                  ? "후기 저장 서버에서 오류가 발생했습니다. 입력 내용은 유지됩니다."
          : "후기를 저장하지 못했습니다. 입력 내용은 유지되며 오류 원인을 서버에 전송했습니다.") + diagnosticSuffix);
    } finally {
      setPlaceStorySubmitting(false);
    }
  };

  const closePlaceStoryReport = useCallback(() => {
    if (storyReportSubmitting) return;
    setStoryReportTarget(null);
    setStoryReportReason("inappropriate");
    setStoryReportDetail("");
  }, [setStoryReportDetail, setStoryReportReason, setStoryReportTarget, storyReportSubmitting]);

  const openPlaceStoryReport = (story: PlaceStory) => {
    if (reportedStoryIds.has(story.id)) {
      setToast("이미 신고를 접수한 후기입니다.");
      return;
    }
    setStoryReportTarget(story);
    setStoryReportReason("inappropriate");
    setStoryReportDetail("");
  };

  const submitPlaceStoryReport = async () => {
    if (!storyReportTarget || storyReportSubmitting) return;
    setStoryReportSubmitting(true);
    try {
      const response = await fetch(PLACE_STORIES_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "report",
          storyId: storyReportTarget.id,
          reason: storyReportReason,
          detail: storyReportDetail.trim().slice(0, 300),
          visitorId: persistentVisitorId(),
        }),
      });
      if (!response.ok && response.status !== 409) {
        if (response.status === 429) throw new Error("rate-limit");
        throw new Error("report-failed");
      }
      const reportedId = storyReportTarget.id;
      setReportedStoryIds((current) => new Set(current).add(reportedId));
      setStoryReportTarget(null);
      setStoryReportReason("inappropriate");
      setStoryReportDetail("");
      setToast(response.status === 409 ? "이미 접수된 신고입니다." : "신고를 접수했습니다. 관리자가 확인한 뒤 조치합니다.");
    } catch (error) {
      setToast(error instanceof Error && error.message === "rate-limit"
        ? "오늘 접수한 신고가 많습니다. 잠시 뒤 다시 시도해 주세요."
        : "신고를 접수하지 못했습니다. 연결 상태를 확인해 주세요.");
    } finally {
      setStoryReportSubmitting(false);
    }
  };

  const moderatePlaceStory = async (story: PlaceStory, status: "published" | "hidden") => {
    if (placeStoryActionId) return;
    setPlaceStoryActionId(story.id);
    try {
      const response = await fetch(PLACE_STORIES_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: story.id, status }),
      });
      if (!response.ok) {
        setToast("후기 공개 상태를 변경하지 못했습니다.");
        return;
      }
      setPlaceStories((current) => current.map((item) => item.id === story.id ? { ...item, status, reportCount: status === "hidden" ? 0 : item.reportCount, reportSummary: status === "hidden" ? undefined : item.reportSummary } : item));
      setGlobalStories((current) => current.map((item) => item.id === story.id ? { ...item, status, reportCount: status === "hidden" ? 0 : item.reportCount, reportSummary: status === "hidden" ? undefined : item.reportSummary } : item));
      setGlobalStoriesRefreshKey((current) => current + 1);
      setToast(status === "hidden" ? "후기를 공개 목록에서 숨겼습니다." : "후기를 다시 공개했습니다.");
    } catch {
      setToast("후기 공개 상태를 변경하지 못했습니다.");
    } finally {
      setPlaceStoryActionId(null);
    }
  };

  const deletePlaceStory = async (story: PlaceStory) => {
    if (placeStoryActionId || !window.confirm(`‘${story.placeName}’의 ${story.authorName} 후기${story.photoUrl ? "와 사진" : ""}을 서버에서 완전히 삭제할까요?`)) return;
    setPlaceStoryActionId(story.id);
    try {
      const response = await fetch(`${PLACE_STORIES_API}?id=${encodeURIComponent(story.id)}`, { method: "DELETE" });
      if (!response.ok) {
        setToast("후기를 삭제하지 못했습니다. 다시 시도해 주세요.");
        return;
      }
      setPlaceStories((current) => current.filter((item) => item.id !== story.id));
      setGlobalStories((current) => current.filter((item) => item.id !== story.id));
      setGlobalStoriesRefreshKey((current) => current + 1);
      setToast("사진과 후기를 서버에서 완전히 삭제했습니다.");
    } catch {
      setToast("후기를 삭제하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setPlaceStoryActionId(null);
    }
  };

  const deleteUploadDiagnostic = async (diagnosticId: string) => {
    if (uploadDiagnosticActionId) return;
    setUploadDiagnosticActionId(diagnosticId);
    try {
      const response = await fetch(`${PLACE_STORIES_API}?scope=upload-diagnostics`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete-one", id: diagnosticId }),
      });
      if (!response.ok) throw new Error("diagnostic cleanup failed");
      setUploadDiagnostics((current) => current.filter((diagnostic) => diagnostic.id !== diagnosticId));
      setToast("선택한 업로드 오류 로그를 삭제했습니다.");
    } catch {
      setToast("오류 로그를 삭제하지 못했습니다. 관리자 권한과 연결 상태를 확인해 주세요.");
    } finally {
      setUploadDiagnosticActionId(null);
    }
  };

  const clearUploadDiagnostics = async () => {
    if (uploadDiagnosticActionId || !uploadDiagnostics.length || !window.confirm(`해결된 업로드 오류 로그 ${uploadDiagnostics.length}건을 모두 삭제할까요? 삭제 후 복구할 수 없습니다.`)) return;
    setUploadDiagnosticActionId("all");
    try {
      const response = await fetch(`${PLACE_STORIES_API}?scope=upload-diagnostics`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear-all" }),
      });
      if (!response.ok) throw new Error("diagnostic cleanup failed");
      setUploadDiagnostics([]);
      setToast("해결된 업로드 오류 로그를 모두 정리했습니다.");
    } catch {
      setToast("오류 로그 전체 정리를 완료하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setUploadDiagnosticActionId(null);
    }
  };

  const deletePerformanceDiagnostic = async (diagnosticId: string) => {
    if (performanceDiagnosticActionId) return;
    setPerformanceDiagnosticActionId(diagnosticId);
    try {
      const response = await fetch(`${PLACE_STORIES_API}?scope=performance-diagnostics`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete-one", id: diagnosticId }),
      });
      if (!response.ok) throw new Error("performance diagnostic cleanup failed");
      setPerformanceDiagnostics((current) => current.filter((diagnostic) => diagnostic.id !== diagnosticId));
      setToast("선택한 성능 기록을 삭제했습니다.");
    } catch {
      setToast("성능 기록을 삭제하지 못했습니다. 관리자 권한과 연결 상태를 확인해 주세요.");
    } finally {
      setPerformanceDiagnosticActionId(null);
    }
  };

  const clearPerformanceDiagnostics = async () => {
    if (performanceDiagnosticActionId || !performanceDiagnostics.length || !window.confirm(`성능 기록 ${performanceDiagnostics.length}건을 모두 삭제할까요? 삭제 후 복구할 수 없습니다.`)) return;
    setPerformanceDiagnosticActionId("all");
    try {
      const response = await fetch(`${PLACE_STORIES_API}?scope=performance-diagnostics`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear-all" }),
      });
      if (!response.ok) throw new Error("performance diagnostic cleanup failed");
      setPerformanceDiagnostics([]);
      setToast("성능 기록을 모두 정리했습니다.");
    } catch {
      setToast("성능 기록 전체 정리를 완료하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setPerformanceDiagnosticActionId(null);
    }
  };

  return {
    togglePlaceStoryForm,
    requestPlaceStoryCameraPermission,
    submitPlaceStory,
    closePlaceStoryReport,
    openPlaceStoryReport,
    submitPlaceStoryReport,
    moderatePlaceStory,
    deletePlaceStory,
    deleteUploadDiagnostic,
    clearUploadDiagnostics,
    deletePerformanceDiagnostic,
    clearPerformanceDiagnostics,
  };
}
