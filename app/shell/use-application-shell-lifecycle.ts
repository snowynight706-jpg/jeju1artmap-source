"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import type { PublicLayoutAccess } from "../map/core/types";

const ADMIN_SESSION_API = "/api/admin-session";
export const PUBLIC_VIEW_COOKIE = "jfac_map_public_view";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type MutableRef<T> = { current: T };
type LeftPanelMode = "assets" | "places" | "calibration" | "print";

type UseApplicationShellLifecycleOptions = {
  publicLayoutAccess: PublicLayoutAccess;
  adminPassword: string;
  adminLoginOpen: boolean;
  placeRequestFormOpen: boolean;
  placeEventFormOpen: boolean;
  databaseEditorOpen: boolean;
  publicHistoryOpen: boolean;
  editorDraftSaving: boolean;
  shortcutHelpOpen: boolean;
  leftPanelRef: MutableRef<HTMLElement | null>;
  placeQueryInputRef: MutableRef<HTMLInputElement | null>;
  databaseEditorQueryInputRef: MutableRef<HTMLInputElement | null>;
  saveEditorDraft: () => void | Promise<void>;
  undo: () => void;
  redo: () => void;
  setAdminLoginError: StateSetter<string>;
  setAdminLoginSubmitting: StateSetter<boolean>;
  setShortcutHelpOpen: StateSetter<boolean>;
  setLeftOpen: StateSetter<boolean>;
  setLeftPanelMode: StateSetter<LeftPanelMode>;
  setCalibrationMode: StateSetter<boolean>;
};

export function useApplicationShellLifecycle({
  publicLayoutAccess,
  adminPassword,
  adminLoginOpen,
  placeRequestFormOpen,
  placeEventFormOpen,
  databaseEditorOpen,
  publicHistoryOpen,
  editorDraftSaving,
  shortcutHelpOpen,
  leftPanelRef,
  placeQueryInputRef,
  databaseEditorQueryInputRef,
  saveEditorDraft,
  undo,
  redo,
  setAdminLoginError,
  setAdminLoginSubmitting,
  setShortcutHelpOpen,
  setLeftOpen,
  setLeftPanelMode,
  setCalibrationMode,
}: UseApplicationShellLifecycleOptions) {
  const adminShortcutActionsRef = useRef({ saveDraft: () => {}, undo: () => {}, redo: () => {} });

  useEffect(() => {
    adminShortcutActionsRef.current = {
      saveDraft: () => { void saveEditorDraft(); },
      undo,
      redo,
    };
  });

  useEffect(() => {
    const handleAdminShortcut = (event: KeyboardEvent) => {
      if (publicLayoutAccess !== "editor") return;

      const target = event.target as HTMLElement | null;
      const editingText = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const blockingDialogOpen = adminLoginOpen
        || placeRequestFormOpen
        || placeEventFormOpen
        || databaseEditorOpen
        || publicHistoryOpen;

      if (modifier && !event.altKey && !event.shiftKey && key === "s") {
        event.preventDefault();
        if (!editorDraftSaving) adminShortcutActionsRef.current.saveDraft();
        return;
      }

      if (!editingText && !modifier && !event.altKey && event.key === "?" && !blockingDialogOpen) {
        event.preventDefault();
        setShortcutHelpOpen((current) => !current);
        return;
      }

      if (shortcutHelpOpen) return;

      if (databaseEditorOpen) {
        if (!editingText && !modifier && !event.altKey && !event.shiftKey && event.key === "/") {
          event.preventDefault();
          databaseEditorQueryInputRef.current?.focus();
        }
        return;
      }

      if (adminLoginOpen || placeRequestFormOpen || placeEventFormOpen) return;

      if (modifier && !event.altKey && key === "z" && !editingText) {
        event.preventDefault();
        if (event.shiftKey) adminShortcutActionsRef.current.redo();
        else adminShortcutActionsRef.current.undo();
        return;
      }

      if (!editingText && !modifier && !event.altKey && !event.shiftKey && event.key === "/") {
        event.preventDefault();
        setLeftOpen(true);
        setLeftPanelMode("places");
        setCalibrationMode(false);
        window.requestAnimationFrame(() => {
          leftPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          window.requestAnimationFrame(() => placeQueryInputRef.current?.focus());
        });
      }
    };

    window.addEventListener("keydown", handleAdminShortcut);
    return () => window.removeEventListener("keydown", handleAdminShortcut);
  }, [
    adminLoginOpen,
    databaseEditorOpen,
    databaseEditorQueryInputRef,
    editorDraftSaving,
    leftPanelRef,
    placeEventFormOpen,
    placeQueryInputRef,
    placeRequestFormOpen,
    publicHistoryOpen,
    publicLayoutAccess,
    setCalibrationMode,
    setLeftOpen,
    setLeftPanelMode,
    setShortcutHelpOpen,
    shortcutHelpOpen,
  ]);

  const submitSharedAdminLogin = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adminPassword) {
      setAdminLoginError("공유 관리자 비밀번호를 입력해 주세요.");
      return;
    }
    setAdminLoginSubmitting(true);
    setAdminLoginError("");
    try {
      const response = await fetch(ADMIN_SESSION_API, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setAdminLoginError(response.status === 429
          ? "입력 횟수가 많습니다. 15분 뒤 다시 시도해 주세요."
          : response.status === 401
            ? "비밀번호가 맞지 않습니다."
            : payload?.error === "shared admin login unavailable"
              ? "공유 관리자 로그인이 아직 설정되지 않았습니다."
              : "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      window.location.reload();
    } catch {
      setAdminLoginError("로그인 연결을 확인하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setAdminLoginSubmitting(false);
    }
  }, [adminPassword, setAdminLoginError, setAdminLoginSubmitting]);

  const signOutSharedAdmin = useCallback(async () => {
    try {
      await fetch(ADMIN_SESSION_API, { method: "DELETE", credentials: "same-origin" });
    } finally {
      window.location.reload();
    }
  }, []);

  const switchPublicView = useCallback((enabled: boolean) => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${PUBLIC_VIEW_COOKIE}=${enabled ? "1" : ""}; Path=/; SameSite=Strict; Max-Age=${enabled ? 43_200 : 0}${secure}`;
    window.location.reload();
  }, []);

  return { submitSharedAdminLogin, signOutSharedAdmin, switchPublicView };
}
