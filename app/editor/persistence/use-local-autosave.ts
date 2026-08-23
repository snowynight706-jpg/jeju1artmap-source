"use client";

import { useEffect } from "react";
import type { DocumentState, PublicLayoutAccess } from "../../map/core/types";

export const AUTOSAVE_KEY = "jeju-wondosim-map-review:autosave:v3";

type LocalAutosavePayload = {
  schemaVersion: 4;
  savedAt: string;
  baseRevision: number;
  document: DocumentState;
};

type UseLocalAutosaveOptions = {
  hydrated: boolean;
  publicLayoutAccess: PublicLayoutAccess;
  document: DocumentState;
  getDocument: () => DocumentState;
  publishedRevisionRef: { current: number };
  setSaveState: (message: string) => void;
  setToast: (message: string) => void;
};

export function useLocalAutosave({
  hydrated,
  publicLayoutAccess,
  document,
  getDocument,
  publishedRevisionRef,
  setSaveState,
  setToast,
}: UseLocalAutosaveOptions) {
  useEffect(() => {
    if (!hydrated || publicLayoutAccess !== "editor") return;
    let idleId: number | null = null;
    const timer = window.setTimeout(() => {
      const save = () => {
        try {
          const autosave: LocalAutosavePayload = {
            schemaVersion: 4,
            savedAt: new Date().toISOString(),
            baseRevision: publishedRevisionRef.current,
            document: getDocument(),
          };
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(autosave));
          setSaveState("자동 저장됨");
        } catch {
          setSaveState("저장 공간 부족");
          setToast("대용량 업로드 자산 때문에 브라우저 저장 공간이 부족합니다. JSON을 내려받아 보관해 주세요.");
        }
      };
      if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(save, { timeout: 1200 });
      else save();
    }, 320);
    return () => {
      window.clearTimeout(timer);
      if (idleId !== null && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
    };
  }, [document, getDocument, hydrated, publicLayoutAccess, publishedRevisionRef, setSaveState, setToast]);
}
