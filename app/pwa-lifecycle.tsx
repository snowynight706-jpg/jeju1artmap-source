"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<InstallChoice>;
}

function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function subscribeToOnlineStatus(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function onlineSnapshot() {
  return navigator.onLine;
}

export default function PwaLifecycle() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const online = useSyncExternalStore(subscribeToOnlineStatus, onlineSnapshot, () => true);
  const updateRequestedRef = useRef(false);

  useEffect(() => {
    const viewportTags = Array.from(document.head.querySelectorAll<HTMLMetaElement>('meta[name="viewport"]'));
    const activeViewport = viewportTags.at(-1);
    activeViewport?.setAttribute("content", "width=device-width, initial-scale=1, viewport-fit=cover");
    viewportTags.slice(0, -1).forEach((tag) => tag.remove());

    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
        registrations
          .filter((registration) => registration.scope.startsWith(window.location.origin))
          .map((registration) => registration.unregister()),
      ));
      return;
    }

    let disposed = false;
    let loadListenerAttached = false;

    const handleBeforeInstall = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      if (!isStandaloneDisplay()) setInstallPrompt(promptEvent);
    };
    const handleInstalled = () => setInstallPrompt(null);
    const handleControllerChange = () => {
      if (!updateRequestedRef.current) return;
      updateRequestedRef.current = false;
      window.location.reload();
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/service-worker.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (disposed) return;

        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed"
              && navigator.serviceWorker.controller
              && !disposed
            ) {
              setWaitingWorker(installing);
            }
          });
        });

        await registration.update();
      } catch {
        // PWA 등록 실패가 핵심 지도 렌더링을 방해하지 않도록 조용히 종료한다.
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    if (document.readyState === "complete") {
      queueMicrotask(() => void register());
    } else {
      loadListenerAttached = true;
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      disposed = true;
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      if (loadListenerAttached) window.removeEventListener("load", register);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const applyUpdate = () => {
    if (!waitingWorker) return;
    setApplyingUpdate(true);
    updateRequestedRef.current = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  };

  return (
    <>
      {installPrompt && (
        <button type="button" className="pwa-install-button" onClick={installApp}>
          <span aria-hidden="true">↓</span> 앱 설치
        </button>
      )}
      {waitingWorker && (
        <aside className="pwa-update-notice" role="status" aria-live="polite">
          <span><strong>새 버전이 있습니다.</strong><small>최신 원도심 아트맵으로 전환합니다.</small></span>
          <button type="button" onClick={applyUpdate} disabled={applyingUpdate}>
            {applyingUpdate ? "적용 중" : "업데이트"}
          </button>
        </aside>
      )}
      {!online && (
        <aside className="pwa-offline-notice" role="status" aria-live="polite">
          현재 인터넷 연결이 없습니다. 최신 장소 정보는 연결 후 다시 확인해 주세요.
        </aside>
      )}
    </>
  );
}
