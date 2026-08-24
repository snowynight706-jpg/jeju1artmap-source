"use client";

import { useMemo, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { normalizePlaceName } from "../../core-landmarks";
import { loadImage } from "../../media/photo-processing";
import { MAP_ASPECT } from "../../map/calibration/model";
import { elementDefaults } from "../../map/core/element-defaults";
import type { CategoryId } from "../../map/core/model";
import type {
  AssetStatus,
  DirectoryPlace,
  MapAsset,
  MapElement,
  PlacementState,
  ReviewNote,
} from "../../map/core/types";
import { defaultMarkerAssetId } from "../../place-directory/model";
import type { BundledMarkerStyle } from "../../marker-assets";
import { isMainHubPersistenceTarget } from "../document/main-hub-persistence.mjs";
import { uniqueRuntimeId } from "../document/rules";
import type { BaseMapMode, UploadedBaseMap } from "../persistence/public-layout-client";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type MutableRef<T> = { current: T };

type UseAdminMapAssetViewModelOptions = {
  assets: MapAsset[];
  selected: MapElement | null;
};

export function useAdminMapAssetViewModel({ assets, selected }: UseAdminMapAssetViewModelOptions) {
  const compatibleAssets = useMemo(() => selected ? assets.filter((asset) => (
    asset.placeName ? asset.placeName === selected.name : asset.category === selected.category
  )) : assets, [assets, selected]);
  const landmarkAssetGroups = useMemo(() => {
    const groups = new Map<string, MapAsset[]>();
    assets.filter((asset) => asset.category === "landmark" && asset.placeName).forEach((asset) => {
      const group = groups.get(asset.placeName!) ?? [];
      group.push(asset);
      groups.set(asset.placeName!, group);
    });
    return [...groups.entries()].map(([placeName, candidates]) => ({ placeName, candidates }));
  }, [assets]);
  const generalMarkerAssets = useMemo(() => assets.filter((asset) => asset.category !== "landmark"), [assets]);
  const customLandmarkAssets = useMemo(() => assets.filter((asset) => asset.category === "landmark" && !asset.placeName), [assets]);
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  return {
    compatibleAssets,
    landmarkAssetGroups,
    generalMarkerAssets,
    customLandmarkAssets,
    assetsById,
  };
}

type UseAdminMapAssetActionsOptions = {
  assetCategory: CategoryId;
  assetStatus: AssetStatus;
  markerGroupSize: number;
  selected: MapElement | null;
  selectedNote: ReviewNote | null;
  directoryPlaces: DirectoryPlace[];
  uploadedMapApi: string;
  elementsRef: MutableRef<MapElement[]>;
  assetsRef: MutableRef<MapAsset[]>;
  pushHistory: () => void;
  replaceElements: (updater: (current: MapElement[]) => MapElement[]) => void;
  replaceAssets: (updater: (current: MapAsset[]) => MapAsset[]) => void;
  replaceNotes: (updater: (current: ReviewNote[]) => ReviewNote[]) => void;
  updateElement: (id: string, patch: Partial<MapElement>, record?: boolean) => void;
  focusMapPosition: (x: number, y: number, elementId: string) => void;
  setPlacementOverride: (target: MapElement | DirectoryPlace, state: PlacementState | null) => void;
  setSelectedId: StateSetter<string | null>;
  setSelectedNoteId: StateSetter<string | null>;
  setToast: StateSetter<string>;
  setBaseMapUploading: StateSetter<boolean>;
  setUploadedBaseMap: StateSetter<UploadedBaseMap | null>;
  setBaseMapCanUpload: StateSetter<boolean | null>;
  setMapLoaded: StateSetter<boolean>;
  setBaseMap: StateSetter<BaseMapMode>;
  setMarkerStyle: StateSetter<BundledMarkerStyle>;
  setCalibrationDirty: StateSetter<boolean>;
  setResourceOutputDragMode: StateSetter<boolean>;
};

export function useAdminMapAssetActions(options: UseAdminMapAssetActionsOptions) {
  const {
    assetCategory,
    assetStatus,
    markerGroupSize,
    selected,
    selectedNote,
    directoryPlaces,
    uploadedMapApi,
    elementsRef,
    assetsRef,
    pushHistory,
    replaceElements,
    replaceAssets,
    replaceNotes,
    updateElement,
    focusMapPosition,
    setPlacementOverride,
    setSelectedId,
    setSelectedNoteId,
    setToast,
    setBaseMapUploading,
    setUploadedBaseMap,
    setBaseMapCanUpload,
    setMapLoaded,
    setBaseMap,
    setMarkerStyle,
    setCalibrationDirty,
    setResourceOutputDragMode,
  } = options;

  const addAssetElement = (asset: MapAsset) => {
    pushHistory();
    const count = elementsRef.current.filter((item) => item.assetId === asset.id).length + 1;
    const size = asset.category === "landmark" ? 6.4 : markerGroupSize;
    const next: MapElement = {
      ...elementDefaults,
      id: uniqueRuntimeId("element", elementsRef.current.map((item) => item.id)),
      name: asset.placeName ?? (count > 1 ? `${asset.name} ${count}` : asset.name),
      category: asset.category,
      x: 50,
      y: 50,
      anchorX: 50,
      anchorY: 50,
      size,
      z: Math.max(0, ...elementsRef.current.map((item) => item.z)) + 1,
      labelVisible: asset.category === "landmark",
      assetId: asset.id,
      status: "unchecked",
      address: asset.address ?? "",
      addressSourceUrl: asset.addressSourceUrl ?? "",
    };
    replaceElements((current) => [...current, next]);
    setSelectedId(next.id);
    setSelectedNoteId(null);
  };

  const applyLandmarkCandidate = (asset: MapAsset) => {
    const existing = elementsRef.current.find((element) => normalizePlaceName(element.name) === normalizePlaceName(asset.placeName ?? ""));
    if (!existing) {
      addAssetElement(asset);
      setToast(`${asset.placeName}에 ${asset.name} 후보를 적용했습니다.`);
      return;
    }
    updateElement(existing.id, { assetId: asset.id });
    setSelectedId(existing.id);
    setSelectedNoteId(null);
    focusMapPosition(existing.x, existing.y, existing.id);
    setToast(`${asset.placeName} 리소스를 ${asset.name}(으)로 교체했습니다.`);
  };

  const uploadAsset = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    files.forEach((file) => {
      if (!file.type.startsWith("image/") && !file.name.toLowerCase().endsWith(".svg")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = typeof reader.result === "string" ? reader.result : "";
        if (!src) return;
        pushHistory();
        const extension = file.name.split(".").pop()?.toLowerCase();
        const asset: MapAsset = {
          id: uniqueRuntimeId("asset", assetsRef.current.map((item) => item.id)),
          name: file.name.replace(/\.[^.]+$/, ""),
          category: assetCategory,
          status: assetStatus,
          src,
          fileType: extension === "svg" ? "svg" : extension === "png" ? "png" : "image",
          sourceLabel: `사용자 업로드 · ${file.name}`,
          builtIn: false,
        };
        replaceAssets((current) => [...current, asset]);
      };
      reader.readAsDataURL(file);
    });
    event.target.value = "";
  };

  const uploadBaseMap = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 60 * 1024 * 1024) {
      setToast("베이스 지도는 60MB 이하 PNG·JPG·WebP·SVG 이미지로 올려주세요.");
      return;
    }
    setBaseMapUploading(true);
    try {
      const localUrl = URL.createObjectURL(file);
      const image = await loadImage(localUrl);
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      URL.revokeObjectURL(localUrl);
      if (!width || !height) throw new Error("invalid dimensions");
      const aspectDifference = Math.abs(width / height - MAP_ASPECT) / MAP_ASPECT;
      if (aspectDifference > 0.025) {
        setToast(`지도 비율이 기준(${Math.round(MAP_ASPECT * 1000) / 1000})과 달라 업로드하지 않았습니다. 같은 영역·비율의 지도를 사용해 주세요.`);
        return;
      }
      const screen2048 = await prepareBaseMapScreenVariant(image, 2048, 0.86).catch(() => null);
      const screen4096 = await prepareBaseMapScreenVariant(image, 4096, 0.88).catch(() => null);
      const params = new URLSearchParams({ name: file.name, width: String(width), height: String(height) });
      const response = await fetch(`${uploadedMapApi}?${params.toString()}`, {
        method: "POST",
        headers: { "content-type": file.type || "image/png" },
        body: file,
      });
      if (!response.ok) throw new Error(`upload ${response.status}`);
      let metadata = await response.json() as UploadedBaseMap;
      const uploadScreenVariant = async (variant: "screen-2048" | "screen-4096", prepared: { blob: Blob; width: number; height: number } | null) => {
        if (!prepared) return false;
        const variantParams = new URLSearchParams({
          variant,
          sourceVersion: metadata.uploadedAt,
          width: String(prepared.width),
          height: String(prepared.height),
        });
        const variantResponse = await fetch(`${uploadedMapApi}?${variantParams.toString()}`, {
          method: "POST",
          headers: { "content-type": "image/webp" },
          body: prepared.blob,
        });
        return variantResponse.ok;
      };
      const variantResults = await Promise.allSettled([
        uploadScreenVariant("screen-2048", screen2048),
        uploadScreenVariant("screen-4096", screen4096),
      ]);
      if (variantResults.some((result) => result.status === "fulfilled" && result.value)) {
        const metadataResponse = await fetch(`${uploadedMapApi}?meta=1`, { cache: "no-store" });
        if (metadataResponse.ok) metadata = await metadataResponse.json() as UploadedBaseMap;
      }
      setUploadedBaseMap(metadata);
      setBaseMapCanUpload(Boolean(metadata.canUpload));
      setMapLoaded(false);
      setBaseMap("uploaded");
      setToast(`${file.name}을(를) 저장하고 화면용 경량 지도를 함께 준비했습니다.`);
    } catch {
      setToast("베이스 지도를 저장하지 못했습니다. 소유자 로그인과 파일 형식을 확인해 주세요.");
    } finally {
      setBaseMapUploading(false);
    }
  };

  const moveLayer = (direction: "front" | "back" | "forward" | "backward") => {
    if (!selected) return;
    const zs = elementsRef.current.map((item) => item.z);
    let z = selected.z;
    if (direction === "front") z = Math.max(...zs) + 1;
    if (direction === "back") z = Math.min(...zs) - 1;
    if (direction === "forward") z += 1;
    if (direction === "backward") z -= 1;
    updateElement(selected.id, { z });
  };

  const applyGroupSize = (group: "landmark" | "marker", size: number) => {
    pushHistory();
    replaceElements((current) => current.map((item) => (
      group === "landmark" ? (item.category === "landmark" ? { ...item, size } : item) : (item.category !== "landmark" ? { ...item, size } : item)
    )));
    setToast(group === "landmark" ? `랜드마크 ${size.toFixed(1)}% 일괄 적용` : `일반 마커 ${size.toFixed(1)}% 일괄 적용`);
  };

  const applyMarkerStyle = (style: BundledMarkerStyle) => {
    pushHistory();
    setMarkerStyle(style);
    replaceElements((current) => current.map((item) => {
      const place = item.directoryId
        ? directoryPlaces.find((candidate) => candidate.id === item.directoryId)
        : directoryPlaces.find((candidate) => normalizePlaceName(candidate.name) === normalizePlaceName(item.name));
      const nextAssetId = defaultMarkerAssetId(item.category, style, `${item.name} ${place?.subtype ?? ""}`);
      return nextAssetId ? { ...item, assetId: nextAssetId } : item;
    }));
    const styleName = style === "v2" ? "리뉴얼 최종 원형" : style === "01" ? "기본 핀형" : style === "02" ? "아치 배지형" : "유기적 원형";
    setToast(`범용 마커를 ${styleName}으로 통일했습니다.`);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    pushHistory();
    const duplicate = {
      ...selected,
      id: uniqueRuntimeId("element", elementsRef.current.map((item) => item.id)),
      directoryId: undefined,
      name: `${selected.name} 복사본`,
      locked: false,
      status: "unchecked" as const,
      x: clamp(selected.x + 1.2, 0, 100),
      y: clamp(selected.y + 1.2, 0, 100),
      z: Math.max(0, ...elementsRef.current.map((item) => item.z)) + 1,
    };
    replaceElements((current) => [...current, duplicate]);
    setSelectedId(duplicate.id);
  };

  const toggleSelectedCoordinateReview = () => {
    if (!selected) return;
    const locked = !selected.locked;
    updateElement(selected.id, { locked });
    setCalibrationDirty(true);
    if (locked) setResourceOutputDragMode(false);
    setToast(locked
      ? `${selected.name} 좌표를 고정하고 최종 검수를 완료했습니다.`
      : `${selected.name} 좌표 고정을 해제해 검수 필요 상태로 돌렸습니다.`);
  };

  const deleteSelected = () => {
    if (!selected || selected.locked) return;
    if (isMainHubPersistenceTarget(selected)) {
      setPlacementOverride(selected, null);
      updateElement(selected.id, { mapVisible: true });
      setToast("제주소통협력센터는 주요 거점이므로 지도에서 삭제할 수 없습니다.");
      return;
    }
    pushHistory();
    setPlacementOverride(selected, "deleted");
    replaceElements((current) => current.filter((item) => item.id !== selected.id));
    setSelectedId(null);
  };

  const deleteSelectedNote = () => {
    if (!selectedNote) return;
    pushHistory();
    replaceNotes((current) => current.filter((note) => note.id !== selectedNote.id));
    setSelectedNoteId(null);
  };

  return {
    addAssetElement,
    applyLandmarkCandidate,
    uploadAsset,
    uploadBaseMap,
    moveLayer,
    applyGroupSize,
    applyMarkerStyle,
    duplicateSelected,
    toggleSelectedCoordinateReview,
    deleteSelected,
    deleteSelectedNote,
  };
}

async function prepareBaseMapScreenVariant(image: HTMLImageElement, maximumWidth: 2048 | 4096, quality: number) {
  const scale = Math.min(1, maximumWidth / Math.max(image.naturalWidth, 1));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  canvas.width = 1;
  canvas.height = 1;
  return blob?.type === "image/webp" ? { blob, width, height } : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
