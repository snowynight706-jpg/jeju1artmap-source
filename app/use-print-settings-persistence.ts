"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizePlaceName } from "./core-landmarks";
import {
  printSettingKey,
  type PrintPlaceSetting,
} from "./map-print-settings";
import type { MapElement, PublicLayoutAccess } from "./map/core/types";

const PRINT_SETTINGS_API = "/api/print-settings";

type UsePrintSettingsPersistenceOptions = {
  hydrated: boolean;
  publicLayoutAccess: PublicLayoutAccess;
  screenRecommendedOnly: boolean;
  onMessage: (message: string) => void;
};

export function usePrintSettingsPersistence({
  hydrated,
  publicLayoutAccess,
  screenRecommendedOnly,
  onMessage,
}: UsePrintSettingsPersistenceOptions) {
  const settingsRef = useRef<PrintPlaceSetting[]>([]);
  const [settings, setSettings] = useState<PrintPlaceSetting[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [storage, setStorage] = useState<"loading" | "persistent" | "local">("loading");

  useEffect(() => {
    if (!hydrated || (publicLayoutAccess === "viewer" && !screenRecommendedOnly)) return;
    let cancelled = false;
    fetch(PRINT_SETTINGS_API, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as {
          settings?: PrintPlaceSetting[];
          persistent?: boolean;
          canEdit?: boolean;
        } | null;
        if (!response.ok && response.status !== 503) throw new Error("print settings load failed");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        const nextSettings = Array.isArray(payload?.settings) ? payload.settings : [];
        settingsRef.current = nextSettings;
        setSettings(nextSettings);
        setCanEdit(Boolean(payload?.canEdit));
        setStorage(payload?.persistent ? "persistent" : "local");
      })
      .catch(() => {
        if (!cancelled) setStorage("local");
      });
    return () => { cancelled = true; };
  }, [hydrated, publicLayoutAccess, screenRecommendedOnly]);

  const saveSetting = useCallback(async (
    target: Pick<MapElement, "directoryId" | "category" | "name">,
    patch: Partial<Pick<PrintPlaceSetting, "recommended" | "markerMode" | "labelMode">>,
  ) => {
    if (!canEdit) {
      onMessage("출력 추천 설정은 소유자 로그인 후 영구 저장할 수 있습니다.");
      return;
    }
    const key = printSettingKey(target);
    const existing = settingsRef.current.find((setting) => setting.key === key);
    const next: PrintPlaceSetting = {
      key,
      ...(target.directoryId ? { directoryId: target.directoryId } : {}),
      name: normalizePlaceName(target.name),
      recommended: existing?.recommended ?? false,
      markerMode: existing?.markerMode ?? "auto",
      labelMode: existing?.labelMode ?? "auto",
      ...patch,
    };
    const previous = settingsRef.current;
    const updated = [...previous.filter((setting) => setting.key !== key), next];
    settingsRef.current = updated;
    setSettings(updated);
    try {
      const response = await fetch(PRINT_SETTINGS_API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setting: next }),
      });
      if (!response.ok) throw new Error("print setting save failed");
      setStorage("persistent");
    } catch {
      settingsRef.current = previous;
      setSettings(previous);
      onMessage("출력 추천 설정을 저장하지 못했습니다. 로그인 상태를 확인해 주세요.");
    }
  }, [canEdit, onMessage]);

  return {
    printSettings: settings,
    printSettingsCanEdit: canEdit,
    printSettingsStorage: storage,
    savePrintSetting: saveSetting,
  };
}
