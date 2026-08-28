"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { normalizePlaceName } from "../../core-landmarks";
import { markerAssetStatus, recommendedMarkerStyle } from "../../marker-assets";
import { calibratedPlaceCoordinates, type CalibrationPoint } from "../../map/calibration/model";
import { elementDefaults } from "../../map/core/element-defaults";
import { categories, type CategoryId } from "../../map/core/model";
import type {
  DirectoryPlace,
  DocumentState,
  LandmarkDefaultPosition,
  LockedCoordinateSetting,
  MapAsset,
  MapElement,
  PlacementOverride,
  PublicLayoutAccess,
} from "../../map/core/types";
import { normalizeOptionalLabelScaleSteps } from "../../map/labels/density.mjs";
import { readLocalDenseLabelSettings } from "../../map/labels/use-settings-persistence";
import type { MasterDirectoryRow } from "../../master-directory";
import {
  DEFAULT_SITE_IDENTITY,
  type SiteIdentitySettings,
} from "../../site-identity";
import { defaultMarkerAssetId, directoryRecordFromPlace, mapCategoryForDirectoryPlace } from "../../place-directory/model";
import { PLACE_EVENTS_API } from "../../content/client";
import type { PlaceDirectoryRecord, PlaceEventPlace, PlaceEventsPayload, PlaceReviewCount } from "../../content/types";
import {
  cloneDocument,
  isSameMapPlace,
  lockedCoordinateKey,
  lockedCoordinateSettingsFor,
  placementKey,
  sanitizePlacementOverrides,
} from "../document/rules";
import { chooseEditorRestoreSource } from "./editor-draft-restore.mjs";
import { parseVersionedLocalAutosave, shouldRestoreLocalAutosave } from "./local-autosave.mjs";
import { AUTOSAVE_KEY } from "./use-local-autosave";
import {
  CALIBRATION_SETTINGS_KEY,
  LOCKED_COORDINATE_SETTINGS_KEY,
  PLACEMENT_SETTINGS_KEY,
} from "./use-map-settings-persistence";
import {
  loadPublicLayout,
  type BaseMapMode,
  type OptionalLabelScaleStep,
  type PublicLayoutHistoryItem,
  type PublicViewSettings,
  type UploadedBaseMap,
} from "./public-layout-client";

const VISIBILITY_GROUPS_KEY = "jeju-wondosim-map-review:visibility-groups:v1";
const CALIBRATION_GROUPS_KEY = "jeju-wondosim-map-review:calibration-groups:v1";
const MAP_VIEW_SETTINGS_KEY = "jeju-wondosim-map-review:map-view-settings:v1";

type MutableRef<T> = { current: T };
type StateSetter<T> = Dispatch<SetStateAction<T>>;
type CalibrationGroups = Record<"primary" | "secondary" | "tertiary", boolean>;
type EditorDraftSyncState = "ready" | "saving" | "saved" | "error" | "conflict";
type DirectoryStorage = "loading" | "persistent" | "bundled";

type UseApplicationBootstrapOptions = {
  globalEventsRefreshKey: number;
  publicLayoutAccess: PublicLayoutAccess;
  hydrated: boolean;
  editorDraftUpdatedAt: string | null;
  publicLayoutPublishedAt: string | null;
  expandedVisibilityGroups: Record<CategoryId, boolean>;
  expandedCalibrationGroups: CalibrationGroups;
  markerLabelsVisible: boolean;
  mergeDenseLabels: boolean;
  expandedPlacedMarkerGroups: Record<CategoryId, boolean>;
  placeDirectoryApi: string;
  latestTapdongSeasideStageAssetId: string;
  initialElements: MapElement[];
  builtInAssets: MapAsset[];
  defaultDirectoryPlaces: DirectoryPlace[];
  initialCalibrationPoints: CalibrationPoint[];
  factoryLandmarkDefaultPositions: LandmarkDefaultPosition[];
  eventPlaceIndexBootstrappedRef: MutableRef<boolean>;
  publishedLayoutDocumentRef: MutableRef<DocumentState | null>;
  publishedLayoutViewRef: MutableRef<PublicViewSettings | null>;
  publishedLayoutRevisionRef: MutableRef<number>;
  editorDraftDocumentRef: MutableRef<DocumentState | null>;
  editorDraftViewRef: MutableRef<PublicViewSettings | null>;
  editorDraftRevisionRef: MutableRef<number>;
  labelDensitySettingsRevisionRef: MutableRef<number>;
  localCalibrationUpdatedAtRef: MutableRef<number>;
  localLockedCoordinatesUpdatedAtRef: MutableRef<number>;
  localDenseLabelsUpdatedAtRef: MutableRef<number>;
  localPlacementUpdatedAtRef: MutableRef<number>;
  placeDirectoryLoadedRef: MutableRef<boolean>;
  placesRef: MutableRef<DirectoryPlace[]>;
  sanitizeDocument: (document: DocumentState) => DocumentState;
  buildDirectoryPlaces: (rows: MasterDirectoryRow[]) => DirectoryPlace[];
  mergeDirectoryRecords: (records: PlaceDirectoryRecord[], current: DirectoryPlace[]) => DirectoryPlace[];
  assetIdAfterDirectoryCategoryChange: (element: MapElement, category: CategoryId) => string | null;
  setDocument: (document: DocumentState) => void;
  replaceDirectoryPlaces: (updater: (current: DirectoryPlace[]) => DirectoryPlace[]) => void;
  replaceElements: (updater: (current: MapElement[]) => MapElement[]) => void;
  setAdminAccessMethod: StateSetter<"owner" | "shared" | null>;
  setPublicLayoutPublishedAt: StateSetter<string | null>;
  setPublicLayoutRevision: StateSetter<number>;
  setPublicHistory: StateSetter<PublicLayoutHistoryItem[]>;
  setEditorDraftUpdatedAt: StateSetter<string | null>;
  setEditorDraftSyncState: StateSetter<EditorDraftSyncState>;
  setGlobalStoriesTotal: StateSetter<number | null>;
  setGlobalEventsTotal: StateSetter<number | null>;
  setPlaceRequestsTotal: StateSetter<number | null>;
  setEventLinkedPlaces: StateSetter<PlaceEventPlace[]>;
  setReviewCountsByPlace: StateSetter<PlaceReviewCount[]>;
  setUploadedBaseMap: StateSetter<UploadedBaseMap | null>;
  setBaseMapCanUpload: StateSetter<boolean | null>;
  setPublicLayoutAccess: StateSetter<PublicLayoutAccess>;
  setBaseMap: StateSetter<BaseMapMode>;
  setMarkerLabelsVisible: StateSetter<boolean>;
  setMergeDenseLabels: StateSetter<boolean>;
  setScreenRecommendedOnly: StateSetter<boolean>;
  setMarkerGroupSize: StateSetter<number>;
  setOptionalLabelScaleSteps: StateSetter<OptionalLabelScaleStep[]>;
  setSaveState: StateSetter<string>;
  setLeftOpen: StateSetter<boolean>;
  setRightOpen: StateSetter<boolean>;
  setSelectedId: StateSetter<string | null>;
  setHydrated: StateSetter<boolean>;
  setExpandedVisibilityGroups: StateSetter<Record<CategoryId, boolean>>;
  setExpandedCalibrationGroups: StateSetter<CalibrationGroups>;
  setExpandedPlacedMarkerGroups: StateSetter<Record<CategoryId, boolean>>;
  setPlaceDirectoryStorage: StateSetter<DirectoryStorage>;
  setPlaceDirectoryCanEdit: StateSetter<boolean>;
  setPlaceDirectoryUpdatedAt: StateSetter<string | null>;
  setSiteIdentity: (settings: SiteIdentitySettings) => void;
};

export function useApplicationBootstrap(options: UseApplicationBootstrapOptions) {
  const {
    globalEventsRefreshKey,
    publicLayoutAccess,
    hydrated,
    editorDraftUpdatedAt,
    publicLayoutPublishedAt,
    expandedVisibilityGroups,
    expandedCalibrationGroups,
    markerLabelsVisible,
    mergeDenseLabels,
    expandedPlacedMarkerGroups,
    placeDirectoryApi,
    latestTapdongSeasideStageAssetId,
    initialElements,
    builtInAssets,
    defaultDirectoryPlaces,
    initialCalibrationPoints,
    factoryLandmarkDefaultPositions,
    eventPlaceIndexBootstrappedRef,
    publishedLayoutDocumentRef,
    publishedLayoutViewRef,
    publishedLayoutRevisionRef,
    editorDraftDocumentRef,
    editorDraftViewRef,
    editorDraftRevisionRef,
    labelDensitySettingsRevisionRef,
    localCalibrationUpdatedAtRef,
    localLockedCoordinatesUpdatedAtRef,
    localDenseLabelsUpdatedAtRef,
    localPlacementUpdatedAtRef,
    placeDirectoryLoadedRef,
    placesRef,
    sanitizeDocument,
    buildDirectoryPlaces,
    mergeDirectoryRecords,
    assetIdAfterDirectoryCategoryChange,
    setDocument,
    replaceDirectoryPlaces,
    replaceElements,
    setAdminAccessMethod,
    setPublicLayoutPublishedAt,
    setPublicLayoutRevision,
    setPublicHistory,
    setEditorDraftUpdatedAt,
    setEditorDraftSyncState,
    setGlobalStoriesTotal,
    setGlobalEventsTotal,
    setPlaceRequestsTotal,
    setEventLinkedPlaces,
    setReviewCountsByPlace,
    setUploadedBaseMap,
    setBaseMapCanUpload,
    setPublicLayoutAccess,
    setBaseMap,
    setMarkerLabelsVisible,
    setMergeDenseLabels,
    setScreenRecommendedOnly,
    setMarkerGroupSize,
    setOptionalLabelScaleSteps,
    setSaveState,
    setLeftOpen,
    setRightOpen,
    setSelectedId,
    setHydrated,
    setExpandedVisibilityGroups,
    setExpandedCalibrationGroups,
    setExpandedPlacedMarkerGroups,
    setPlaceDirectoryStorage,
    setPlaceDirectoryCanEdit,
    setPlaceDirectoryUpdatedAt,
    setSiteIdentity,
  } = options;

  useEffect(() => {
    if (publicLayoutAccess === "loading") return;
    if (globalEventsRefreshKey === 0 && eventPlaceIndexBootstrappedRef.current) return;
    const controller = new AbortController();
    void fetch(`${PLACE_EVENTS_API}?scope=place-index`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as PlaceEventsPayload | null;
        if (!response.ok && response.status !== 503) throw new Error(payload?.error ?? "event place index load failed");
        return payload;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setEventLinkedPlaces(Array.isArray(payload?.linkedPlaces) ? payload.linkedPlaces : []);
      })
      .catch((error) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setEventLinkedPlaces([]);
      });
    return () => controller.abort();
  }, [eventPlaceIndexBootstrappedRef, globalEventsRefreshKey, publicLayoutAccess, setEventLinkedPlaces]);

  useEffect(() => {
    let cancelled = false;
    loadPublicLayout("no-cache")
      .then(({ response, payload }) => {
        if (!response.ok && response.status !== 503) throw new Error(payload?.error ?? "public layout load failed");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        const canEdit = Boolean(payload?.canEdit);
        setSiteIdentity(payload?.siteIdentity ?? DEFAULT_SITE_IDENTITY);
        setAdminAccessMethod(payload?.accessMethod ?? null);
        const publishedDocument = payload?.document && Array.isArray(payload.document.elements)
          ? sanitizeDocument(payload.document)
          : null;
        publishedLayoutDocumentRef.current = publishedDocument;
        publishedLayoutViewRef.current = payload?.view ?? null;
        setPublicLayoutPublishedAt(payload?.publishedAt ?? null);
        const revision = typeof payload?.revision === "number" ? payload.revision : 0;
        publishedLayoutRevisionRef.current = revision;
        setPublicLayoutRevision(revision);
        setPublicHistory(Array.isArray(payload?.history) ? payload.history : []);
        const serverDraft = payload?.draft?.document && Array.isArray(payload.draft.document.elements)
          ? sanitizeDocument(payload.draft.document)
          : null;
        editorDraftDocumentRef.current = serverDraft;
        editorDraftViewRef.current = payload?.draft?.view ?? null;
        const draftRevision = typeof payload?.draft?.revision === "number" ? payload.draft.revision : 0;
        editorDraftRevisionRef.current = draftRevision;
        setEditorDraftUpdatedAt(payload?.draft?.updatedAt ?? null);
        setEditorDraftSyncState(serverDraft ? "saved" : "ready");
        labelDensitySettingsRevisionRef.current = Math.max(0, Number(payload?.labelDensitySettings?.revision ?? 0));
        if (payload?.contentSummary) {
          setGlobalStoriesTotal(Math.max(0, Number(payload.contentSummary.reviews ?? 0)));
          setGlobalEventsTotal(Math.max(0, Number(payload.contentSummary.events ?? 0)));
          setPlaceRequestsTotal(Math.max(0, Number(payload.contentSummary.placeRequests ?? 0)));
        }
        if (Array.isArray(payload?.eventLinkedPlaces)) {
          eventPlaceIndexBootstrappedRef.current = true;
          setEventLinkedPlaces(payload.eventLinkedPlaces);
        }
        if (Array.isArray(payload?.reviewCountsByPlace)) {
          setReviewCountsByPlace(payload.reviewCountsByPlace);
        }
        if (payload?.uploadedBaseMap?.available) {
          setUploadedBaseMap(payload.uploadedBaseMap);
          setBaseMapCanUpload(Boolean(payload.uploadedBaseMap.canUpload));
        }
        if (canEdit) {
          setPublicLayoutAccess("editor");
          return;
        }
        setPublicLayoutAccess("viewer");
        if (publishedDocument) {
          setDocument(publishedDocument);
          if (payload?.view) {
            applyPublicView(payload.view, {
              setBaseMap,
              setMarkerLabelsVisible,
              setMergeDenseLabels,
              setScreenRecommendedOnly,
              setMarkerGroupSize,
              setOptionalLabelScaleSteps,
            });
          }
          setSaveState("공개 배치본");
        } else {
          setDocument({
            elements: initialElements,
            assets: builtInAssets,
            reviewNotes: [],
            directoryPlaces: defaultDirectoryPlaces,
            calibrationPoints: initialCalibrationPoints,
            landmarkDefaultPositions: factoryLandmarkDefaultPositions,
            denseLabelPositions: [],
            denseLabelExcludedIds: [],
            placementOverrides: [],
          });
          setSaveState("공개 배치본 준비 중");
        }
        setLeftOpen(false);
        setRightOpen(false);
        setSelectedId(null);
        setHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPublicLayoutAccess("viewer");
        setLeftOpen(false);
        setRightOpen(false);
        setSelectedId(null);
        setSaveState("공개 배치본을 불러오지 못함");
        setHydrated(true);
      });
    return () => { cancelled = true; };
  }, [
    builtInAssets,
    defaultDirectoryPlaces,
    editorDraftDocumentRef,
    editorDraftRevisionRef,
    editorDraftViewRef,
    eventPlaceIndexBootstrappedRef,
    factoryLandmarkDefaultPositions,
    initialCalibrationPoints,
    initialElements,
    labelDensitySettingsRevisionRef,
    publishedLayoutDocumentRef,
    publishedLayoutRevisionRef,
    publishedLayoutViewRef,
    sanitizeDocument,
    setAdminAccessMethod,
    setBaseMap,
    setBaseMapCanUpload,
    setDocument,
    setEditorDraftSyncState,
    setEditorDraftUpdatedAt,
    setEventLinkedPlaces,
    setGlobalEventsTotal,
    setGlobalStoriesTotal,
    setHydrated,
    setLeftOpen,
    setMarkerGroupSize,
    setMarkerLabelsVisible,
    setMergeDenseLabels,
    setOptionalLabelScaleSteps,
    setPlaceRequestsTotal,
    setPublicHistory,
    setPublicLayoutAccess,
    setPublicLayoutPublishedAt,
    setPublicLayoutRevision,
    setReviewCountsByPlace,
    setRightOpen,
    setSaveState,
    setScreenRecommendedOnly,
    setSelectedId,
    setSiteIdentity,
    setUploadedBaseMap,
  ]);

  useEffect(() => {
    if (publicLayoutAccess !== "editor") return;
    const timer = window.setTimeout(() => {
      try {
        restoreEditorUiSettings({
          setExpandedVisibilityGroups,
          setExpandedCalibrationGroups,
          setMarkerLabelsVisible,
          setMergeDenseLabels,
          setExpandedPlacedMarkerGroups,
        });

        const persistentCalibration = readStorageValue<{
          calibrationPoints?: CalibrationPoint[];
          landmarkDefaultPositions?: LandmarkDefaultPosition[];
          updatedAt?: string;
        }>(CALIBRATION_SETTINGS_KEY);
        localCalibrationUpdatedAtRef.current = Date.parse(persistentCalibration?.updatedAt ?? "") || 0;
        const persistentLockedCoordinates = readStorageValue<{
          settings?: LockedCoordinateSetting[];
          updatedAt?: string;
        }>(LOCKED_COORDINATE_SETTINGS_KEY);
        localLockedCoordinatesUpdatedAtRef.current = Date.parse(persistentLockedCoordinates?.updatedAt ?? "") || 0;
        const persistentDenseLabels = readLocalDenseLabelSettings();
        localDenseLabelsUpdatedAtRef.current = Date.parse(persistentDenseLabels?.updatedAt ?? "") || 0;
        const persistentPlacement = readStorageValue<{
          settings?: PlacementOverride[];
          updatedAt?: string;
        }>(PLACEMENT_SETTINGS_KEY);
        localPlacementUpdatedAtRef.current = Date.parse(persistentPlacement?.updatedAt ?? "") || 0;

        const raw = localStorage.getItem(AUTOSAVE_KEY);
        const localAutosave = raw ? parseVersionedLocalAutosave(raw) as {
          document: Partial<DocumentState>;
          baseRevision: number | null;
          savedAt?: string;
        } | null : null;
        const hasPublishedServerDocument = Boolean(publishedLayoutDocumentRef.current);
        const canRestoreLocalAutosave = shouldRestoreLocalAutosave(localAutosave, hasPublishedServerDocument, publishedLayoutRevisionRef.current);
        const restoreChoice = chooseEditorRestoreSource({
          localAutosave,
          canRestoreLocalAutosave,
          serverDraftDocument: editorDraftDocumentRef.current,
          serverDraftUpdatedAt: editorDraftUpdatedAt,
          publishedAt: publicLayoutPublishedAt,
        }) as { document: Partial<DocumentState> | null; source: "local" | "server" | "none" };
        const parsed = restoreChoice.document;
        const restoredFromServerDraft = restoreChoice.source === "server";
        if (parsed && Array.isArray(parsed.elements)) {
          const parsedElements = (parsed.elements as MapElement[]).map((item) => {
            const correctedPlace = defaultDirectoryPlaces.find((place) => (
              place.id === item.directoryId || normalizePlaceName(place.name) === normalizePlaceName(item.name)
            ));
            const shouldMoveToCorrectedPosition = Boolean(
              correctedPlace?.coordinateStatus === "geocoded"
              && (/^(default-landmark|starter-marker)-/.test(item.id) || /초기 구성용|초기 배치/.test(item.memo ?? "")),
            );
            const restored = {
              ...elementDefaults,
              ...item,
              ...(correctedPlace?.coordinateStatus === "geocoded" && !item.locked ? {
                anchorX: correctedPlace.x,
                anchorY: correctedPlace.y,
                ...(shouldMoveToCorrectedPosition ? { x: correctedPlace.x, y: correctedPlace.y } : {}),
              } : {}),
            };
            if (restored.name === "탑동해변공연장" && !restored.assetId) {
              return {
                ...restored,
                assetId: latestTapdongSeasideStageAssetId,
                status: "approved" as const,
                directoryId: "place-tapdong-seaside-stage",
              };
            }
            const markerDefault = defaultMarkerAssetId(restored.category, recommendedMarkerStyle, restored.name);
            if (!restored.assetId && markerDefault) {
              return { ...restored, assetId: markerDefault, status: markerAssetStatus(recommendedMarkerStyle) };
            }
            return restored;
          });
          const hasExplicitPlacementState = Array.isArray(persistentPlacement?.settings) || Array.isArray(parsed.placementOverrides);
          const migratedPlacementOverrides = hasExplicitPlacementState
            ? sanitizePlacementOverrides(persistentPlacement?.settings ?? parsed.placementOverrides)
            : sanitizePlacementOverrides([
                ...parsedElements
                  .filter((item) => item.mapVisible === false)
                  .map((item) => ({
                    key: placementKey(item),
                    ...(item.directoryId ? { directoryId: item.directoryId } : {}),
                    name: item.name,
                    state: "unplaced" as const,
                  })),
                ...initialElements
                  .filter((defaultItem) => !parsedElements.some((item) => isSameMapPlace(item, defaultItem)))
                  .map((item) => ({
                    key: placementKey(item),
                    ...(item.directoryId ? { directoryId: item.directoryId } : {}),
                    name: item.name,
                    state: "deleted" as const,
                  })),
                ...(persistentLockedCoordinates?.settings ?? [])
                  .filter((setting) => !parsedElements.some((item) => lockedCoordinateKey(item) === setting.key))
                  .map((setting) => ({
                    key: setting.directoryId
                      ? `directory:${setting.directoryId}`
                      : `name:${setting.category}:${normalizePlaceName(setting.name)}`,
                    ...(setting.directoryId ? { directoryId: setting.directoryId } : {}),
                    name: setting.name,
                    state: "deleted" as const,
                  })),
              ]);
          if (!hasExplicitPlacementState && migratedPlacementOverrides.length) {
            const updatedAt = new Date().toISOString();
            localPlacementUpdatedAtRef.current = Date.parse(updatedAt);
            localStorage.setItem(PLACEMENT_SETTINGS_KEY, JSON.stringify({ settings: migratedPlacementOverrides, updatedAt }));
          }
          const deletedPlacementKeys = new Set(
            migratedPlacementOverrides.filter((item) => item.state === "deleted").map((item) => item.key),
          );
          const mergedElements = [
            ...parsedElements,
            ...initialElements.filter((defaultItem) => (
              !deletedPlacementKeys.has(placementKey(defaultItem))
              && !parsedElements.some((item) => isSameMapPlace(item, defaultItem))
            )),
          ];
          const parsedAssets = Array.isArray(parsed.assets) ? parsed.assets : [];
          const mergedAssets = [
            ...builtInAssets,
            ...parsedAssets.filter((item) => !builtInAssets.some((builtIn) => builtIn.id === item.id)),
          ];
          if (!persistentLockedCoordinates) {
            const migratedSettings = lockedCoordinateSettingsFor(mergedElements);
            if (migratedSettings.length) {
              const updatedAt = new Date().toISOString();
              localLockedCoordinatesUpdatedAtRef.current = Date.parse(updatedAt);
              localStorage.setItem(LOCKED_COORDINATE_SETTINGS_KEY, JSON.stringify({ settings: migratedSettings, updatedAt }));
            }
          }
          setDocument({
            elements: mergedElements,
            assets: mergedAssets,
            reviewNotes: parsed.reviewNotes ?? [],
            directoryPlaces: parsed.directoryPlaces,
            calibrationPoints: persistentCalibration?.calibrationPoints ?? parsed.calibrationPoints,
            landmarkDefaultPositions: persistentCalibration?.landmarkDefaultPositions ?? parsed.landmarkDefaultPositions,
            denseLabelPositions: persistentDenseLabels?.positions ?? parsed.denseLabelPositions,
            denseLabelExcludedIds: persistentDenseLabels?.excludedElementIds ?? parsed.denseLabelExcludedIds,
            placementOverrides: migratedPlacementOverrides,
          });
          if (restoredFromServerDraft) {
            const draftView = editorDraftViewRef.current;
            if (draftView) {
              applyPublicView(draftView, {
                setBaseMap,
                setMarkerLabelsVisible,
                setMergeDenseLabels,
                setScreenRecommendedOnly,
                setMarkerGroupSize,
                setOptionalLabelScaleSteps,
              });
            }
            setSaveState("서버 초안에서 편집 시작");
          } else {
            setSaveState("기기 임시 복구본 적용");
          }
        } else if (publishedLayoutDocumentRef.current) {
          setDocument(cloneDocument(publishedLayoutDocumentRef.current));
          const publishedView = publishedLayoutViewRef.current;
          if (publishedView) {
            applyPublicView(publishedView, {
              setBaseMap,
              setMarkerLabelsVisible,
              setMergeDenseLabels,
              setScreenRecommendedOnly,
              setMarkerGroupSize,
              setOptionalLabelScaleSteps,
            });
          }
          setSaveState("공개 배치본에서 편집 시작");
        } else if (persistentCalibration?.calibrationPoints?.length || persistentDenseLabels || persistentPlacement?.settings?.length) {
          setDocument({
            elements: initialElements,
            assets: builtInAssets,
            reviewNotes: [],
            directoryPlaces: defaultDirectoryPlaces,
            calibrationPoints: persistentCalibration?.calibrationPoints,
            landmarkDefaultPositions: persistentCalibration?.landmarkDefaultPositions,
            denseLabelPositions: persistentDenseLabels?.positions,
            denseLabelExcludedIds: persistentDenseLabels?.excludedElementIds,
            placementOverrides: persistentPlacement?.settings,
          });
          setSaveState("저장된 기준좌표 복구됨");
        }
      } catch {
        setSaveState("자동복구 확인 필요");
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    builtInAssets,
    defaultDirectoryPlaces,
    editorDraftDocumentRef,
    editorDraftUpdatedAt,
    editorDraftViewRef,
    factoryLandmarkDefaultPositions,
    initialCalibrationPoints,
    initialElements,
    latestTapdongSeasideStageAssetId,
    localCalibrationUpdatedAtRef,
    localDenseLabelsUpdatedAtRef,
    localLockedCoordinatesUpdatedAtRef,
    localPlacementUpdatedAtRef,
    publicLayoutAccess,
    publicLayoutPublishedAt,
    publishedLayoutDocumentRef,
    publishedLayoutRevisionRef,
    publishedLayoutViewRef,
    setBaseMap,
    setDocument,
    setExpandedCalibrationGroups,
    setExpandedPlacedMarkerGroups,
    setExpandedVisibilityGroups,
    setHydrated,
    setMarkerGroupSize,
    setMarkerLabelsVisible,
    setMergeDenseLabels,
    setOptionalLabelScaleSteps,
    setSaveState,
    setScreenRecommendedOnly,
  ]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor") return;
    try {
      localStorage.setItem(VISIBILITY_GROUPS_KEY, JSON.stringify(expandedVisibilityGroups));
    } catch {}
  }, [expandedVisibilityGroups, hydrated, publicLayoutAccess]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor") return;
    try {
      localStorage.setItem(CALIBRATION_GROUPS_KEY, JSON.stringify(expandedCalibrationGroups));
    } catch {}
  }, [expandedCalibrationGroups, hydrated, publicLayoutAccess]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor") return;
    try {
      localStorage.setItem(MAP_VIEW_SETTINGS_KEY, JSON.stringify({
        markerLabelsVisible,
        mergeDenseLabels,
        expandedPlacedMarkerGroups,
      }));
    } catch {}
  }, [expandedPlacedMarkerGroups, hydrated, markerLabelsVisible, mergeDenseLabels, publicLayoutAccess]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor" || placeDirectoryLoadedRef.current) return;
    placeDirectoryLoadedRef.current = true;
    let cancelled = false;
    const applyBundledDirectory = async () => {
      let bundledPlaces = defaultDirectoryPlaces;
      try {
        const { masterDirectoryRows } = await import("../../master-directory");
        bundledPlaces = buildDirectoryPlaces(masterDirectoryRows).map((place) => {
          const mapped = calibratedPlaceCoordinates(place.name, place.latitude, place.longitude, initialCalibrationPoints);
          return mapped ? { ...place, ...mapped } : place;
        });
      } catch {}
      if (cancelled) return;
      const bundledRecords = bundledPlaces.map(directoryRecordFromPlace);
      replaceDirectoryPlaces((current) => mergeDirectoryRecords(bundledRecords, current));
      setPlaceDirectoryStorage("bundled");
    };
    fetch(placeDirectoryApi, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as {
          rows?: PlaceDirectoryRecord[];
          persistent?: boolean;
          canEdit?: boolean;
          updatedAt?: string | null;
        } | null;
        if (!response.ok && response.status !== 503) throw new Error("directory load failed");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        setPlaceDirectoryCanEdit(Boolean(payload?.canEdit));
        setPlaceDirectoryUpdatedAt(payload?.updatedAt ?? null);
        const rows = Array.isArray(payload?.rows) ? payload.rows : [];
        if (!payload?.persistent || !rows.length) {
          void applyBundledDirectory();
          return;
        }
        const merged = mergeDirectoryRecords(rows, placesRef.current);
        const byId = new Map(merged.map((place) => [place.id, place]));
        const byName = new Map(merged.map((place) => [normalizePlaceName(place.name), place]));
        replaceDirectoryPlaces(() => merged);
        replaceElements((current) => current.map((element) => {
          const place = (element.directoryId ? byId.get(element.directoryId) : undefined)
            ?? byName.get(normalizePlaceName(element.name));
          if (!place) return element;
          const mapCategory = mapCategoryForDirectoryPlace(place);
          return {
            ...element,
            directoryId: place.id,
            name: place.name,
            category: mapCategory,
            address: place.address,
            addressSourceUrl: place.sourceUrl ?? "",
            assetId: assetIdAfterDirectoryCategoryChange(element, mapCategory),
          };
        }));
        setPlaceDirectoryStorage("persistent");
      })
      .catch(() => {
        if (!cancelled) void applyBundledDirectory();
      });
    return () => { cancelled = true; };
  }, [
    assetIdAfterDirectoryCategoryChange,
    buildDirectoryPlaces,
    defaultDirectoryPlaces,
    hydrated,
    initialCalibrationPoints,
    mergeDirectoryRecords,
    placeDirectoryApi,
    placeDirectoryLoadedRef,
    placesRef,
    publicLayoutAccess,
    replaceDirectoryPlaces,
    replaceElements,
    setPlaceDirectoryCanEdit,
    setPlaceDirectoryStorage,
    setPlaceDirectoryUpdatedAt,
  ]);
}

function readStorageValue<T>(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

function restoreEditorUiSettings(options: {
  setExpandedVisibilityGroups: StateSetter<Record<CategoryId, boolean>>;
  setExpandedCalibrationGroups: StateSetter<CalibrationGroups>;
  setMarkerLabelsVisible: StateSetter<boolean>;
  setMergeDenseLabels: StateSetter<boolean>;
  setExpandedPlacedMarkerGroups: StateSetter<Record<CategoryId, boolean>>;
}) {
  const {
    setExpandedVisibilityGroups,
    setExpandedCalibrationGroups,
    setMarkerLabelsVisible,
    setMergeDenseLabels,
    setExpandedPlacedMarkerGroups,
  } = options;
  const savedVisibilityGroups = readStorageValue<Partial<Record<CategoryId, boolean>>>(VISIBILITY_GROUPS_KEY);
  if (savedVisibilityGroups) {
    setExpandedVisibilityGroups((current) => categories.reduce<Record<CategoryId, boolean>>((next, category) => {
      next[category.id] = typeof savedVisibilityGroups[category.id] === "boolean"
        ? savedVisibilityGroups[category.id]!
        : current[category.id];
      return next;
    }, { ...current }));
  }

  const savedCalibrationGroups = readStorageValue<Partial<CalibrationGroups>>(CALIBRATION_GROUPS_KEY);
  if (savedCalibrationGroups) {
    setExpandedCalibrationGroups((current) => ({
      primary: typeof savedCalibrationGroups.primary === "boolean" ? savedCalibrationGroups.primary : current.primary,
      secondary: typeof savedCalibrationGroups.secondary === "boolean" ? savedCalibrationGroups.secondary : current.secondary,
      tertiary: typeof savedCalibrationGroups.tertiary === "boolean" ? savedCalibrationGroups.tertiary : current.tertiary,
    }));
  }

  const savedMapView = readStorageValue<{
    markerLabelsVisible?: boolean;
    mergeDenseLabels?: boolean;
    expandedPlacedMarkerGroups?: Partial<Record<CategoryId, boolean>>;
  }>(MAP_VIEW_SETTINGS_KEY);
  if (!savedMapView) return;
  if (typeof savedMapView.markerLabelsVisible === "boolean") setMarkerLabelsVisible(savedMapView.markerLabelsVisible);
  if (typeof savedMapView.mergeDenseLabels === "boolean") setMergeDenseLabels(savedMapView.mergeDenseLabels);
  if (savedMapView.expandedPlacedMarkerGroups) {
    setExpandedPlacedMarkerGroups((current) => categories.reduce<Record<CategoryId, boolean>>((next, category) => {
      const saved = savedMapView.expandedPlacedMarkerGroups?.[category.id];
      next[category.id] = typeof saved === "boolean" ? saved : current[category.id];
      return next;
    }, { ...current }));
  }
}

function applyPublicView(view: PublicViewSettings, setters: {
  setBaseMap: StateSetter<BaseMapMode>;
  setMarkerLabelsVisible: StateSetter<boolean>;
  setMergeDenseLabels: StateSetter<boolean>;
  setScreenRecommendedOnly: StateSetter<boolean>;
  setMarkerGroupSize: StateSetter<number>;
  setOptionalLabelScaleSteps: StateSetter<OptionalLabelScaleStep[]>;
}) {
  setters.setBaseMap(view.baseMap);
  setters.setMarkerLabelsVisible(view.markerLabelsVisible);
  setters.setMergeDenseLabels(view.mergeDenseLabels);
  setters.setScreenRecommendedOnly(view.screenRecommendedOnly);
  setters.setMarkerGroupSize(clamp(view.defaultMarkerSize, 0.8, 15));
  setters.setOptionalLabelScaleSteps(normalizeOptionalLabelScaleSteps(view.optionalLabelScaleSteps));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
