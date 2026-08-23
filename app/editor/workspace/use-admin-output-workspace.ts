"use client";

import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { MAP_ASPECT, type CalibrationPoint } from "../../map/calibration/model";
import { elementDefaults } from "../../map/core/element-defaults";
import type {
  DenseLabelPosition,
  DirectoryPlace,
  DocumentState,
  LandmarkDefaultPosition,
  MapAsset,
  MapElement,
  PublicLayoutAccess,
  ReviewNote,
  ReviewStatus,
} from "../../map/core/types";
import { normalizeOptionalLabelScaleSteps } from "../../map/labels/density.mjs";
import type { PrintAuditReport } from "../../map/print/audit";
import { renderHighResolutionMapPng } from "../../map/print/export";
import { loadImage } from "../../media/photo-processing";
import { cloneDocument } from "../document/rules";
import {
  fetchPublicHistoryEntry,
  loadPublicLayout,
  publishPublicLayout,
  saveEditorHistory,
  saveLabelDensitySettings,
  type BaseMapMode,
  type EditorDraftPayload,
  type OptionalLabelScaleStep,
  type PublicLayoutHistoryEntry,
  type PublicLayoutHistoryItem,
  type PublicViewSettings,
  type UploadedBaseMap,
} from "../persistence/public-layout-client";

type MutableRef<T> = { current: T };
type StateSetter<T> = Dispatch<SetStateAction<T>>;
type EditorDraftSyncState = "ready" | "saving" | "saved" | "error" | "conflict";
type PrintPolicy = { marker: boolean; label: boolean };

type UseAdminOutputWorkspaceOptions = {
  exporting: boolean;
  exportWidth: 8944 | 12000;
  printAudit: PrintAuditReport;
  baseMap: BaseMapMode;
  mapSvg: string;
  mapPng: string;
  uploadedBaseMap: UploadedBaseMap | null;
  printRecommendedOnly: boolean;
  mergeDenseLabels: boolean;
  layoutName: string;
  reviewNotes: ReviewNote[];
  reviewStatusText: Record<ReviewStatus, string>;
  publicLayoutAccess: PublicLayoutAccess;
  optionalLabelScaleSteps: OptionalLabelScaleStep[];
  optionalLabelScaleSaving: boolean;
  editorDraftSaving: boolean;
  publicLayoutPublishing: boolean;
  publicLayoutRevision: number;
  publicHistoryActionId: string | null;
  markerLabelsVisible: boolean;
  screenRecommendedOnly: boolean;
  markerGroupSize: number;
  builtInAssets: MapAsset[];
  defaultDirectoryPlaces: DirectoryPlace[];
  initialCalibrationPoints: CalibrationPoint[];
  factoryLandmarkDefaultPositions: LandmarkDefaultPosition[];
  elementsRef: MutableRef<MapElement[]>;
  assetsRef: MutableRef<MapAsset[]>;
  denseLabelPositionsRef: MutableRef<DenseLabelPosition[]>;
  denseLabelExcludedIdsRef: MutableRef<string[]>;
  labelDensitySettingsRevisionRef: MutableRef<number>;
  publishedLayoutDocumentRef: MutableRef<DocumentState | null>;
  publishedLayoutViewRef: MutableRef<PublicViewSettings | null>;
  publishedLayoutRevisionRef: MutableRef<number>;
  editorDraftDocumentRef: MutableRef<DocumentState | null>;
  editorDraftViewRef: MutableRef<PublicViewSettings | null>;
  editorDraftRevisionRef: MutableRef<number>;
  uploadedBaseMapOriginalSource: (metadata: UploadedBaseMap | null) => string;
  printPolicyFor: (element: MapElement) => PrintPolicy;
  currentDocument: () => DocumentState;
  sanitizeDocument: (document: DocumentState) => DocumentState;
  pushHistory: () => void;
  setDocument: (document: DocumentState) => void;
  setPrintAuditOpen: StateSetter<boolean>;
  setPrintPreviewMode: StateSetter<boolean>;
  setToast: StateSetter<string>;
  setExporting: StateSetter<boolean>;
  setLayoutName: StateSetter<string>;
  setOptionalLabelScaleSteps: StateSetter<OptionalLabelScaleStep[]>;
  setSaveState: StateSetter<string>;
  setEditorDraftSyncState: StateSetter<EditorDraftSyncState>;
  setOptionalLabelScaleSaving: StateSetter<boolean>;
  setEditorDraftUpdatedAt: StateSetter<string | null>;
  setPublicHistory: StateSetter<PublicLayoutHistoryItem[]>;
  setEditorDraftSaving: StateSetter<boolean>;
  setPublicLayoutPublishing: StateSetter<boolean>;
  setPublicLayoutPublishedAt: StateSetter<string | null>;
  setPublicLayoutRevision: StateSetter<number>;
  setPublicHistoryActionId: StateSetter<string | null>;
  setPublicHistoryOpen: StateSetter<boolean>;
  setBaseMap: StateSetter<BaseMapMode>;
  setMarkerLabelsVisible: StateSetter<boolean>;
  setMergeDenseLabels: StateSetter<boolean>;
  setScreenRecommendedOnly: StateSetter<boolean>;
  setMarkerGroupSize: StateSetter<number>;
};

export function useAdminOutputWorkspace(options: UseAdminOutputWorkspaceOptions) {
  const {
    exporting,
    exportWidth,
    printAudit,
    baseMap,
    mapSvg,
    mapPng,
    uploadedBaseMap,
    printRecommendedOnly,
    mergeDenseLabels,
    layoutName,
    reviewNotes,
    reviewStatusText,
    publicLayoutAccess,
    optionalLabelScaleSteps,
    optionalLabelScaleSaving,
    editorDraftSaving,
    publicLayoutPublishing,
    publicLayoutRevision,
    publicHistoryActionId,
    markerLabelsVisible,
    screenRecommendedOnly,
    markerGroupSize,
    builtInAssets,
    defaultDirectoryPlaces,
    initialCalibrationPoints,
    factoryLandmarkDefaultPositions,
    elementsRef,
    assetsRef,
    denseLabelPositionsRef,
    denseLabelExcludedIdsRef,
    labelDensitySettingsRevisionRef,
    publishedLayoutDocumentRef,
    publishedLayoutViewRef,
    publishedLayoutRevisionRef,
    editorDraftDocumentRef,
    editorDraftViewRef,
    editorDraftRevisionRef,
    uploadedBaseMapOriginalSource,
    printPolicyFor,
    currentDocument,
    sanitizeDocument,
    pushHistory,
    setDocument,
    setPrintAuditOpen,
    setPrintPreviewMode,
    setToast,
    setExporting,
    setLayoutName,
    setOptionalLabelScaleSteps,
    setSaveState,
    setEditorDraftSyncState,
    setOptionalLabelScaleSaving,
    setEditorDraftUpdatedAt,
    setPublicHistory,
    setEditorDraftSaving,
    setPublicLayoutPublishing,
    setPublicLayoutPublishedAt,
    setPublicLayoutRevision,
    setPublicHistoryActionId,
    setPublicHistoryOpen,
    setBaseMap,
    setMarkerLabelsVisible,
    setMergeDenseLabels,
    setScreenRecommendedOnly,
    setMarkerGroupSize,
  } = options;

  const download = (name: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const downloadBlob = (name: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const exportHighResolutionPng = async () => {
    if (exporting) return;
    setPrintAuditOpen(true);
    if (printAudit.issues.length > 0 && !window.confirm(`인쇄 전 자동 점검에서 ${printAudit.issues.length}건을 확인했습니다. 현재 상태로도 PNG를 만들까요?`)) {
      setPrintPreviewMode(true);
      setToast("점검 항목을 확인한 뒤 다시 출력해 주세요.");
      return;
    }
    setExporting(true);
    setToast(`${exportWidth.toLocaleString()}px 고화질 사본을 합성하고 있습니다.`);
    try {
      const mapSource = baseMap === "svg"
        ? mapSvg
        : baseMap === "png"
          ? mapPng
          : uploadedBaseMapOriginalSource(uploadedBaseMap) || mapSvg;
      const placedElements = elementsRef.current.filter((element) => element.mapVisible);
      const markerElements = placedElements.filter((element) => printPolicyFor(element).marker);
      const labelElements = placedElements.filter((element) => printPolicyFor(element).label);
      const markerIds = new Set(markerElements.map((element) => element.id));
      const labelOnlyCount = labelElements.reduce(
        (count, element) => count + Number(!markerIds.has(element.id)),
        0,
      );
      if (labelOnlyCount) {
        setToast(`마커 없이 라벨만 출력되는 장소가 ${labelOnlyCount}곳 있습니다. 고화질 사본을 계속 합성합니다.`);
      }
      const { blob, outputHeight } = await renderHighResolutionMapPng({
        exportWidth,
        mapSource,
        placedElements,
        markerElements,
        labelElements,
        assets: assetsRef.current,
        mergeDenseLabels,
        denseLabelPositions: denseLabelPositionsRef.current,
        denseLabelExcludedIds: denseLabelExcludedIdsRef.current,
        loadImage,
      });
      const sizeMb = blob.size / 1024 / 1024;
      downloadBlob(`제주원도심_${printRecommendedOnly ? "추천장소" : "전체배치"}_고화질_${exportWidth}px.png`, blob);
      setToast(`고화질 PNG 사본을 만들었습니다 · ${exportWidth.toLocaleString()}×${outputHeight.toLocaleString()}px · ${sizeMb.toFixed(1)}MB`);
    } catch {
      setToast("고화질 사본 생성에 실패했습니다. 8,944px로 낮추거나 업로드 지도 상태를 확인해 주세요.");
    } finally {
      setExporting(false);
    }
  };

  const exportJson = () => {
    const payload = {
      schemaVersion: 8,
      exportedAt: new Date().toISOString(),
      map: {
        baseMap,
        aspect: MAP_ASPECT,
        coordinateSystem: "normalized-percent",
        calibration: "six-point-distance-weighted",
        landmarkDefaults: "user-editable",
        denseLabelPositions: "server-synced-user-editable",
        denseLabelGrouping: "all-names-compact-columns-manual-exclusion",
      },
      ...cloneDocument(currentDocument()),
    };
    download(`제주원도심_배치안_${layoutName.replaceAll(" ", "_")}.json`, JSON.stringify(payload, null, 2), "application/json");
    setToast("현재 배치 상태를 JSON으로 내보냈습니다.");
  };

  const importJson = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<DocumentState>;
        if (!Array.isArray(parsed.elements)) throw new Error("invalid");
        pushHistory();
        setDocument(createImportedDocument(parsed, initialCalibrationPoints, {
          builtInAssets,
          defaultDirectoryPlaces,
          factoryLandmarkDefaultPositions,
        }));
        setLayoutName(file.name.replace(/\.json$/i, ""));
        setToast("JSON 배치안을 불러왔습니다. 삭제 대상 장소는 자동 제외됩니다.");
      } catch {
        setToast("지원하지 않거나 손상된 JSON 파일입니다.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const exportNotesJson = () => download(
    "제주원도심_골목검토메모.json",
    JSON.stringify({ exportedAt: new Date().toISOString(), reviewNotes }, null, 2),
    "application/json",
  );

  const exportNotesCsv = () => {
    const rows = [
      ["메모 ID", "상태", "X(%)", "Y(%)", "내용"],
      ...reviewNotes.map((note) => [
        note.id,
        reviewStatusText[note.status],
        note.x.toFixed(3),
        note.y.toFixed(3),
        note.text,
      ]),
    ];
    download(
      "제주원도심_골목검토메모.csv",
      `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`,
      "text/csv;charset=utf-8",
    );
  };

  const updateOptionalLabelScaleLimit = (index: number, value: number) => {
    if (!Number.isFinite(value)) return;
    setOptionalLabelScaleSteps((current) => normalizeOptionalLabelScaleSteps(current.map((step, stepIndex) => (
      stepIndex === index ? { ...step, limit: value } : step
    ))));
    setSaveState("배포본 라벨 단계 변경됨");
    setEditorDraftSyncState("ready");
  };

  const resetOptionalLabelScaleLimits = () => {
    setOptionalLabelScaleSteps(normalizeOptionalLabelScaleSteps(undefined));
    setSaveState("배포본 라벨 단계 기본값 복원됨");
    setEditorDraftSyncState("ready");
    setToast("배포본 축척별 전체 라벨 개수를 기본값으로 복원했습니다.");
  };

  const currentPublicViewSettings = (): PublicViewSettings => ({
    baseMap,
    markerLabelsVisible,
    mergeDenseLabels,
    screenRecommendedOnly,
    defaultMarkerSize: markerGroupSize,
    optionalLabelScaleSteps: normalizeOptionalLabelScaleSteps(optionalLabelScaleSteps),
  });

  const applyPublicViewSettings = (view: PublicViewSettings | null | undefined) => {
    if (!view) return;
    setBaseMap(view.baseMap);
    setMarkerLabelsVisible(view.markerLabelsVisible);
    setMergeDenseLabels(view.mergeDenseLabels);
    setScreenRecommendedOnly(view.screenRecommendedOnly);
    setMarkerGroupSize(clamp(view.defaultMarkerSize, 0.8, 15));
    setOptionalLabelScaleSteps(normalizeOptionalLabelScaleSteps(view.optionalLabelScaleSteps));
  };

  const rememberEditorDraft = (draft: EditorDraftPayload) => {
    const document = sanitizeDocument(draft.document);
    editorDraftDocumentRef.current = document;
    editorDraftViewRef.current = draft.view;
    editorDraftRevisionRef.current = draft.revision;
    setEditorDraftUpdatedAt(draft.updatedAt);
    setEditorDraftSyncState("saved");
    return document;
  };

  const saveOptionalLabelScaleLimits = async () => {
    if (publicLayoutAccess !== "editor" || optionalLabelScaleSaving || editorDraftSaving || publicLayoutPublishing) return;
    setOptionalLabelScaleSaving(true);
    setSaveState("공개 라벨 단계 서버 저장 중");
    try {
      const { response, payload } = await saveLabelDensitySettings(
        normalizeOptionalLabelScaleSteps(optionalLabelScaleSteps),
        labelDensitySettingsRevisionRef.current,
      );
      if (!response.ok || !payload?.labelDensitySettings) {
        throw new Error(response.status === 409 ? "label-settings-conflict" : (payload?.error ?? "label scale save failed"));
      }
      const savedSteps = normalizeOptionalLabelScaleSteps(payload.labelDensitySettings.optionalLabelScaleSteps);
      labelDensitySettingsRevisionRef.current = payload.labelDensitySettings.revision;
      setOptionalLabelScaleSteps(savedSteps);
      if (publishedLayoutViewRef.current) {
        publishedLayoutViewRef.current = { ...publishedLayoutViewRef.current, optionalLabelScaleSteps: savedSteps };
      }
      if (editorDraftViewRef.current) {
        editorDraftViewRef.current = { ...editorDraftViewRef.current, optionalLabelScaleSteps: savedSteps };
      }
      setSaveState("공개 라벨 단계 즉시 반영됨");
      setToast("축척별 전체 라벨 개수를 저장했습니다. 공개본 업데이트 없이 공개 지도에 반영됩니다.");
    } catch (error) {
      if (error instanceof Error && error.message === "label-settings-conflict") {
        setToast("다른 화면에서 라벨 단계가 변경되었습니다. 새로고침한 뒤 다시 저장해 주세요.");
      } else {
        setToast("축척별 전체 라벨 개수를 서버에 저장하지 못했습니다. 현재 입력값은 이 화면에 유지됩니다.");
      }
    } finally {
      setOptionalLabelScaleSaving(false);
    }
  };

  const rememberPublicHistoryItem = (item: PublicLayoutHistoryItem | undefined) => {
    if (!item) return;
    setPublicHistory((current) => [item, ...current.filter((candidate) => candidate.id !== item.id)]);
  };

  const refreshPublicHistory = async () => {
    try {
      const { response, payload } = await loadPublicLayout("no-store");
      if (response.ok && Array.isArray(payload?.history)) setPublicHistory(payload.history);
    } catch {
      // The just-created entry remains visible even if this non-critical refresh fails.
    }
  };

  const saveEditorDraft = async () => {
    if (publicLayoutAccess !== "editor" || editorDraftSaving) return;
    setEditorDraftSaving(true);
    setEditorDraftSyncState("saving");
    try {
      const { response, payload } = await saveEditorHistory(
        cloneDocument(currentDocument()),
        currentPublicViewSettings(),
      );
      if (!response.ok || !payload?.draft || !payload.historyEntry) throw new Error(payload?.error ?? "history save failed");
      rememberEditorDraft(payload.draft);
      rememberPublicHistoryItem(payload.historyEntry as PublicLayoutHistoryItem);
      setSaveState("공개본 기록 저장됨");
      setToast("현재 편집 상태를 공개본 기록에 저장했습니다. 공개 화면은 변경되지 않았습니다.");
    } catch {
      setEditorDraftSyncState("error");
      setToast("공개본 기록을 저장하지 못했습니다. 기기 임시 복구본은 유지됩니다.");
    } finally {
      setEditorDraftSaving(false);
    }
  };

  const publishCurrentLayout = async () => {
    if (publicLayoutAccess !== "editor" || publicLayoutPublishing) return;
    if (elementsRef.current.some((element) => element.placeRequestId && !element.directoryId)) {
      setToast("지도 검수 중인 장소 요청이 있습니다. 요청을 승인하거나 반려한 뒤 공개본을 업데이트해 주세요.");
      return;
    }
    setPublicLayoutPublishing(true);
    setToast("현재 편집 상태를 공개 배치본으로 저장하고 있습니다.");
    try {
      const document = cloneDocument(currentDocument());
      const view = currentPublicViewSettings();
      const { response, payload } = await publishPublicLayout(document, view, publicLayoutRevision);
      if (!response.ok) {
        if (response.status === 409) throw new Error("conflict");
        if (response.status === 422) throw new Error("pending-place-request");
        throw new Error(payload?.error ?? "publish failed");
      }
      const publishedDocument = payload?.document ? sanitizeDocument(payload.document) : document;
      publishedLayoutDocumentRef.current = publishedDocument;
      publishedLayoutViewRef.current = payload?.view ?? view;
      setPublicLayoutPublishedAt(payload?.publishedAt ?? new Date().toISOString());
      const nextRevision = payload?.revision ?? publicLayoutRevision + 1;
      publishedLayoutRevisionRef.current = nextRevision;
      setPublicLayoutRevision(nextRevision);
      setDocument(publishedDocument);
      if (payload?.draft) rememberEditorDraft(payload.draft);
      rememberPublicHistoryItem(payload?.historyEntry as PublicLayoutHistoryItem | undefined);
      await refreshPublicHistory();
      const completedCount = Math.max(0, Number(payload?.reviewCompletedCount ?? 0));
      setToast(completedCount > 0
        ? `공개 배치본을 업데이트하고 미검수 ${completedCount}개를 검수완료로 전환했습니다.`
        : "공개 배치본을 업데이트했습니다. 모든 항목이 검수완료 상태입니다.");
    } catch (error) {
      setToast(error instanceof Error && error.message === "conflict"
        ? "다른 기기에서 공개본이 변경되었습니다. 새로고침해 최신 공개본을 확인한 뒤 다시 게시해 주세요."
        : error instanceof Error && error.message === "pending-place-request"
          ? "지도 검수 중인 장소 요청을 먼저 승인하거나 반려해 주세요."
          : "공개 배치본을 저장하지 못했습니다. 로그인 및 연결 상태를 확인해 주세요.");
    } finally {
      setPublicLayoutPublishing(false);
    }
  };

  const loadPublicHistoryEntry = async (item: PublicLayoutHistoryItem) => {
    if (publicLayoutAccess !== "editor" || publicHistoryActionId) return;
    if (!window.confirm(`${item.kind === "snapshot" ? "저장 기록" : "공개 기록"} ${new Date(item.createdAt).toLocaleString("ko-KR")} 상태를 편집 화면에 불러올까요? 현재 상태는 기기 자동복구에 유지됩니다.`)) return;
    setPublicHistoryActionId(item.id);
    try {
      const { response, payload } = await fetchPublicHistoryEntry(item.id);
      const entry = payload?.historyEntry as PublicLayoutHistoryEntry | undefined;
      if (!response.ok || !entry?.document || !entry.view) throw new Error(payload?.error ?? "history load failed");
      pushHistory();
      setDocument(sanitizeDocument(entry.document));
      applyPublicViewSettings(entry.view);
      setLayoutName(`공개본 기록 · ${new Date(entry.createdAt).toLocaleString("ko-KR")}`);
      setSaveState("공개본 기록 불러옴");
      setPublicHistoryOpen(false);
      setToast("선택한 기록을 편집 화면에 불러왔습니다. 공개 화면은 아직 변경되지 않았습니다.");
    } catch {
      setToast("선택한 공개본 기록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
    } finally {
      setPublicHistoryActionId(null);
    }
  };

  return {
    download,
    exportHighResolutionPng,
    exportJson,
    importJson,
    exportNotesJson,
    exportNotesCsv,
    updateOptionalLabelScaleLimit,
    resetOptionalLabelScaleLimits,
    saveOptionalLabelScaleLimits,
    saveEditorDraft,
    publishCurrentLayout,
    refreshPublicHistory,
    loadPublicHistoryEntry,
  };
}

function createImportedDocument(
  parsed: Partial<DocumentState>,
  initialCalibrationPoints: DocumentState["calibrationPoints"],
  defaults: {
    builtInAssets: MapAsset[];
    defaultDirectoryPlaces: DirectoryPlace[];
    factoryLandmarkDefaultPositions: LandmarkDefaultPosition[];
  },
): DocumentState {
  return {
    elements: parsed.elements!.map((item) => ({ ...elementDefaults, ...item })) as MapElement[],
    assets: [
      ...defaults.builtInAssets,
      ...(Array.isArray(parsed.assets)
        ? parsed.assets.filter((item) => !defaults.builtInAssets.some((builtIn) => builtIn.id === item.id))
        : []),
    ],
    reviewNotes: Array.isArray(parsed.reviewNotes) ? parsed.reviewNotes : [],
    directoryPlaces: Array.isArray(parsed.directoryPlaces) ? parsed.directoryPlaces : defaults.defaultDirectoryPlaces,
    calibrationPoints: Array.isArray(parsed.calibrationPoints) ? parsed.calibrationPoints : initialCalibrationPoints,
    landmarkDefaultPositions: Array.isArray(parsed.landmarkDefaultPositions)
      ? parsed.landmarkDefaultPositions
      : defaults.factoryLandmarkDefaultPositions,
    denseLabelPositions: Array.isArray(parsed.denseLabelPositions) ? parsed.denseLabelPositions : [],
    denseLabelExcludedIds: Array.isArray(parsed.denseLabelExcludedIds) ? parsed.denseLabelExcludedIds : [],
    placementOverrides: Array.isArray(parsed.placementOverrides) ? parsed.placementOverrides : [],
  };
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
