"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [storage, setStorage] = useState<"loading" | "persistent" | "local" | "error">("loading");
  const [storageError, setStorageError] = useState<string | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const revisionRef = useRef(0);

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
          revision?: number;
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
        revisionRef.current = Number.isInteger(payload?.revision) ? Number(payload?.revision) : 0;
        setStorage(payload?.persistent ? "persistent" : "local");
        setStorageError(null);
        setRemoteReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setStorage("local");
        setStorageError("라벨 설정 서버를 불러오지 못해 기기 저장본을 사용하고 있습니다.");
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
          revision: revisionRef.current,
        }),
      }).then(async (response) => {
        const payload = await response.json().catch(() => null) as { error?: string; maximumItems?: number; revision?: number } | null;
        if (!response.ok) {
          const message = response.status === 403
            ? "소유자 인증이 만료되어 서버에 저장하지 못했습니다."
            : response.status === 409
              ? "다른 관리자 변경과 충돌했습니다. 최신 설정을 다시 불러온 뒤 저장해 주세요."
              : response.status === 400 && payload?.maximumItems
                ? `통합 라벨 한 묶음은 최대 ${payload.maximumItems}곳까지 저장할 수 있습니다.`
                : payload?.error
                  ? `라벨 설정을 서버에 저장하지 못했습니다: ${payload.error}`
                  : `라벨 설정을 서버에 저장하지 못했습니다. (HTTP ${response.status})`;
          setStorage("error");
          setStorageError(message);
          return;
        }
        revisionRef.current = Number.isInteger(payload?.revision) ? Number(payload?.revision) : revisionRef.current + 1;
        setStorage("persistent");
        setStorageError(null);
      }).catch(() => {
        setStorage("error");
        setStorageError("네트워크 오류로 라벨 설정을 서버에 저장하지 못했습니다. 기기 저장본은 유지됩니다.");
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [canEdit, excludedElementIdsRef, hydrated, localUpdatedAtRef, positionsRef, publicLayoutAccess, remoteReady, settingsSignature]);

  return {
    denseLabelSettingsCanEdit: canEdit,
    denseLabelSettingsStorage: storage,
    denseLabelSettingsError: storageError,
  };
}
