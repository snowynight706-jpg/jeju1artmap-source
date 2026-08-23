"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  DenseLabelPosition,
  PublicLayoutAccess,
} from "../core/types";

const DENSE_LABEL_SETTINGS_API = "/api/dense-label-settings";
const DENSE_LABEL_SETTINGS_KEY = "jeju-wondosim-map-review:dense-label-settings:v1";

export type LocalDenseLabelSettings = {
  positions?: DenseLabelPosition[];
  excludedElementIds?: string[];
  updatedAt?: string;
};

export function readLocalDenseLabelSettings(): LocalDenseLabelSettings | null {
  try {
    return JSON.parse(localStorage.getItem(DENSE_LABEL_SETTINGS_KEY) ?? "null") as LocalDenseLabelSettings | null;
  } catch {
    return null;
  }
}

type UseDenseLabelSettingsPersistenceOptions = {
  hydrated: boolean;
  publicLayoutAccess: PublicLayoutAccess;
  positions: DenseLabelPosition[];
  excludedElementIds: string[];
  positionsRef: { current: DenseLabelPosition[] };
  excludedElementIdsRef: { current: string[] };
  localUpdatedAtRef: { current: number };
  onRestore: (positions: DenseLabelPosition[], excludedElementIds: string[]) => void;
};

export function useDenseLabelSettingsPersistence({
  hydrated,
  publicLayoutAccess,
  positions,
  excludedElementIds,
  positionsRef,
  excludedElementIdsRef,
  localUpdatedAtRef,
  onRestore,
}: UseDenseLabelSettingsPersistenceOptions) {
  const [canEdit, setCanEdit] = useState(false);
  const [storage, setStorage] = useState<"loading" | "persistent" | "local">("loading");
  const [remoteReady, setRemoteReady] = useState(false);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor") return;
    let cancelled = false;
    fetch(DENSE_LABEL_SETTINGS_API, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as {
          positions?: DenseLabelPosition[];
          excludedElementIds?: string[];
          persistent?: boolean;
          canEdit?: boolean;
          updatedAt?: string | null;
        } | null;
        if (!response.ok && response.status !== 503) throw new Error("dense label settings load failed");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        const remoteUpdatedAt = Date.parse(payload?.updatedAt ?? "") || 0;
        const shouldRestoreRemote = remoteUpdatedAt > 0
          && (localUpdatedAtRef.current === 0 || remoteUpdatedAt >= localUpdatedAtRef.current);
        if (shouldRestoreRemote) {
          const nextPositions = Array.isArray(payload?.positions) ? payload.positions : [];
          const nextExcludedElementIds = Array.isArray(payload?.excludedElementIds) ? payload.excludedElementIds : [];
          onRestore(nextPositions, nextExcludedElementIds);
          localUpdatedAtRef.current = remoteUpdatedAt;
        }
        setCanEdit(Boolean(payload?.canEdit));
        setStorage(payload?.persistent ? "persistent" : "local");
        setRemoteReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setStorage("local");
        setRemoteReady(true);
      });
    return () => { cancelled = true; };
  }, [hydrated, localUpdatedAtRef, onRestore, publicLayoutAccess]);

  const settingsSignature = useMemo(() => JSON.stringify({
    positions,
    excludedElementIds,
  }), [excludedElementIds, positions]);

  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor" || !remoteReady) return;
    const updatedAt = new Date().toISOString();
    localUpdatedAtRef.current = Date.parse(updatedAt);
    try {
      localStorage.setItem(DENSE_LABEL_SETTINGS_KEY, JSON.stringify({
        positions: positionsRef.current,
        excludedElementIds: excludedElementIdsRef.current,
        updatedAt,
      }));
    } catch {}
    if (!canEdit) return;
    const timer = window.setTimeout(() => {
      void fetch(DENSE_LABEL_SETTINGS_API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          positions: positionsRef.current,
          excludedElementIds: excludedElementIdsRef.current,
        }),
      }).then((response) => setStorage(response.ok ? "persistent" : "local"))
        .catch(() => setStorage("local"));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [canEdit, excludedElementIdsRef, hydrated, localUpdatedAtRef, positionsRef, publicLayoutAccess, remoteReady, settingsSignature]);

  return {
    denseLabelSettingsCanEdit: canEdit,
    denseLabelSettingsStorage: storage,
  };
}
