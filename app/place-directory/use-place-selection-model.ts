"use client";

import { useMemo } from "react";
import { normalizePlaceName } from "../core-landmarks";
import { categoryOf, placeContentKey } from "../map/core/model";
import type { DirectoryPlace, MapElement, ReviewNote } from "../map/core/types";
import {
  ART_PLATFORM_FACILITY_NAMES,
  MAIN_HUB_ROLE,
  isPrimaryPublicCategory,
  publicDisplayName,
} from "../place-taxonomy";
import { directoryCategory } from "./model";
import type { DirectoryTaxonomySync } from "./contracts";

type PublicCategoryMeta = {
  id: string;
  name: string;
  color: string;
  iconSrc: string;
};

type UsePlaceSelectionModelOptions = {
  elements: MapElement[];
  reviewNotes: ReviewNote[];
  directoryPlaces: DirectoryPlace[];
  selectedId: string | null;
  selectedFacilityId: string | null;
  selectedNoteId: string | null;
  directoryTaxonomySync: DirectoryTaxonomySync;
  placeDirectoryCanEdit: boolean;
  publicCategoryMetaForPlace: (place: DirectoryPlace, anchor: MapElement) => PublicCategoryMeta;
};

export function usePlaceSelectionModel({
  elements,
  reviewNotes,
  directoryPlaces,
  selectedId,
  selectedFacilityId,
  selectedNoteId,
  directoryTaxonomySync,
  placeDirectoryCanEdit,
  publicCategoryMetaForPlace,
}: UsePlaceSelectionModelOptions) {
  const elementsById = useMemo(() => new Map(elements.map((element) => [element.id, element])), [elements]);
  const elementsByNormalizedName = useMemo(() => {
    const index = new Map<string, MapElement>();
    elements.forEach((element) => {
      const name = normalizePlaceName(element.name);
      if (!index.has(name)) index.set(name, element);
    });
    return index;
  }, [elements]);
  const requestMarkerByRequestId = useMemo(() => {
    const index = new Map<string, MapElement>();
    elements.forEach((element) => {
      if (element.placeRequestId && !element.directoryId && !index.has(element.placeRequestId)) {
        index.set(element.placeRequestId, element);
      }
    });
    return index;
  }, [elements]);
  const directoryPlacesById = useMemo(() => new Map(directoryPlaces.map((place) => [place.id, place])), [directoryPlaces]);
  const directoryPlacesByNormalizedName = useMemo(() => {
    const index = new Map<string, DirectoryPlace>();
    directoryPlaces.forEach((place) => {
      const name = normalizePlaceName(place.name);
      if (!index.has(name)) index.set(name, place);
    });
    return index;
  }, [directoryPlaces]);
  const directoryPlacesByGroup = useMemo(() => {
    const groups = new Map<string, DirectoryPlace[]>();
    directoryPlaces.forEach((place) => {
      if (!place.locationGroupId) return;
      const group = groups.get(place.locationGroupId) ?? [];
      group.push(place);
      groups.set(place.locationGroupId, group);
    });
    groups.forEach((group) => group.sort((a, b) => {
      const order = (ART_PLATFORM_FACILITY_NAMES as readonly string[]).indexOf(normalizePlaceName(a.name));
      const otherOrder = (ART_PLATFORM_FACILITY_NAMES as readonly string[]).indexOf(normalizePlaceName(b.name));
      return (order < 0 ? 99 : order) - (otherOrder < 0 ? 99 : otherOrder) || a.name.localeCompare(b.name, "ko");
    }));
    return groups;
  }, [directoryPlaces]);

  const selected = selectedId ? elementsById.get(selectedId) ?? null : null;
  const selectedNote = reviewNotes.find((note) => note.id === selectedNoteId) ?? null;
  const selectedAnchorDirectoryPlace = selected
    ? (selected.directoryId ? directoryPlacesById.get(selected.directoryId) : undefined)
      ?? directoryPlacesByNormalizedName.get(normalizePlaceName(selected.name))
      ?? null
    : null;
  const selectedFacilityPlace = selectedFacilityId
    ? directoryPlacesById.get(selectedFacilityId) ?? null
    : null;
  const selectedDirectoryPlace = selectedFacilityPlace?.locationGroupId
    && selectedFacilityPlace.locationGroupId === selectedAnchorDirectoryPlace?.locationGroupId
    ? selectedFacilityPlace
    : selectedAnchorDirectoryPlace;
  const selectedUnlinkedPrimaryCategory = selected && isPrimaryPublicCategory(directoryCategory(selected.category))
    ? directoryCategory(selected.category)
    : null;
  const selectedUnlinkedTaxonomySaving = Boolean(selected)
    && directoryTaxonomySync.placeId === selected?.id
    && directoryTaxonomySync.state === "saving";
  const selectedBasicInfoMeta = selected && directoryTaxonomySync.placeId === (selectedDirectoryPlace?.id ?? selected.id)
    ? directoryTaxonomySync.state === "saving"
      ? "DB 저장 중…"
      : directoryTaxonomySync.state === "saved"
        ? "DB 저장됨"
        : directoryTaxonomySync.state === "error"
          ? "DB 저장 실패"
          : selectedDirectoryPlace ? "DB 연결" : "DB 미연결"
    : selectedDirectoryPlace
      ? placeDirectoryCanEdit ? "DB 연결" : "DB 읽기 전용"
      : selected?.placeRequestId ? "승인 대기" : "DB 미연결";
  const selectedStoryKey = selectedDirectoryPlace
    ? `directory:${selectedDirectoryPlace.id}`
    : selected
      ? placeContentKey(selected)
      : null;
  const selectedUsesMapDisplayName = Boolean(selected && selectedDirectoryPlace && (
    selectedDirectoryPlace.id === selected.directoryId
    || (!selected.directoryId && normalizePlaceName(selectedDirectoryPlace.name) === normalizePlaceName(selected.name))
  ));
  const selectedDisplayName = selectedDirectoryPlace && !selectedUsesMapDisplayName
    ? publicDisplayName(selectedDirectoryPlace.name, selectedDirectoryPlace.featuredRole)
    : selected?.name ?? "";
  const selectedLocationGroupId = selectedDirectoryPlace?.locationGroupId ?? null;
  const selectedLocationGroupPlaces = selectedLocationGroupId
    ? directoryPlacesByGroup.get(selectedLocationGroupId) ?? []
    : [];
  const selectedPublicCategory = selected
    ? selectedDirectoryPlace ? publicCategoryMetaForPlace(selectedDirectoryPlace, selected) : categoryOf(selected.category)
    : null;
  const selectedPublicCategoryName = selectedDirectoryPlace?.featuredRole === MAIN_HUB_ROLE
    ? "워크케이션 메인 거점"
    : selectedPublicCategory?.name ?? "";

  return {
    elementsByNormalizedName,
    requestMarkerByRequestId,
    directoryPlacesById,
    directoryPlacesByNormalizedName,
    directoryPlacesByGroup,
    selected,
    selectedNote,
    selectedDirectoryPlace,
    selectedUnlinkedPrimaryCategory,
    selectedUnlinkedTaxonomySaving,
    selectedBasicInfoMeta,
    selectedStoryKey,
    selectedDisplayName,
    selectedLocationGroupPlaces,
    selectedPublicCategory,
    selectedPublicCategoryName,
  };
}
