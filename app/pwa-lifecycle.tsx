"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };
type MobilePlatform = "ios" | "other";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<InstallChoice>;
}

const defaultBrowserThemeColor = "#F6F6F6";
const standaloneStatusBarColors: Record<string, string> = {
  "stormy": "#2B2D33",
  "nordic-sand": "#3A3835",
  "lilac": "#26222F",
  "urban-blush": "#6E5B63",
  "harbor-morning": "#26313B",
};

function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function getMobilePlatform(): MobilePlatform | null {
  const browserNavigator = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };
  const ipadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const iosDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent) || ipadDesktopMode;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const mobileDevice = typeof browserNavigator.userAgentData?.mobile === "boolean"
    ? browserNavigator.userAgentData.mobile
    : mobileUserAgent || ipadDesktopMode;

  if (!mobileDevice) return null;
  return iosDevice ? "ios" : "other";
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
  const [mobilePlatform, setMobilePlatform] = useState<MobilePlatform | null>(null);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [appInstalled, setAppInstalled] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const online = useSyncExternalStore(subscribeToOnlineStatus, onlineSnapshot, () => true);
  const updateRequestedRef = useRef(false);

  useEffect(() => {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const syncStatusBarTheme = () => {
      const appShell = document.querySelector<HTMLElement>(".app-shell[data-ui-theme]");
      const themeId = appShell?.dataset.uiTheme ?? "stormy";
      const statusBarColor = standaloneStatusBarColors[themeId] ?? standaloneStatusBarColors.stormy;
      const themeMeta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

      document.documentElement.style.setProperty("--app-status-bar-color", statusBarColor);
      themeMeta?.setAttribute("content", isStandaloneDisplay() ? statusBarColor : defaultBrowserThemeColor);
    };

    syncStatusBarTheme();
    const appShell = document.querySelector<HTMLElement>(".app-shell[data-ui-theme]");
    const themeObserver = appShell ? new MutationObserver(syncStatusBarTheme) : null;
    themeObserver?.observe(appShell!, { attributes: true, attributeFilter: ["data-ui-theme"] });
    standaloneQuery.addEventListener("change", syncStatusBarTheme);

    return () => {
      themeObserver?.disconnect();
      standaloneQuery.removeEventListener("change", syncStatusBarTheme);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const viewportTags = Array.from(document.head.querySelectorAll<HTMLMetaElement>('meta[name="viewport"]'));
    const activeViewport = viewportTags.at(-1);
    activeViewport?.setAttribute("content", "width=device-width, initial-scale=1, viewport-fit=cover");
    viewportTags.slice(0, -1).forEach((tag) => tag.remove());

    const standalone = isStandaloneDisplay();
    queueMicrotask(() => {
      if (disposed) return;
      setAppInstalled(standalone);
      if (process.env.NODE_ENV === "production" && !standalone) {
        setMobilePlatform(getMobilePlatform());
      }
    });

    if (!("serviceWorker" in navigator)) {
      return () => { disposed = true; };
    }

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
        registrations
          .filter((registration) => registration.scope.startsWith(window.location.origin))
          .map((registration) => registration.unregister()),
      ));
      return () => { disposed = true; };
    }

    let loadListenerAttached = false;

    const handleBeforeInstall = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      if (!isStandaloneDisplay()) setInstallPrompt(promptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setInstallGuideOpen(false);
      setAppInstalled(true);
    };
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
    if (!installPrompt) {
      setInstallGuideOpen(true);
      return;
    }

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") setAppInstalled(true);
    } catch {
      setInstallPrompt(null);
      setInstallGuideOpen(true);
    }
  };

  const applyUpdate = () => {
    if (!waitingWorker) return;
    setApplyingUpdate(true);
    updateRequestedRef.current = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  };

  const showMobileInstall = Boolean(mobilePlatform) && !appInstalled;

  return (
    <>
      {showMobileInstall && (
        <button
          type="button"
          className="pwa-install-button"
          onClick={installApp}
          aria-haspopup={installPrompt ? undefined : "dialog"}
          aria-expanded={installGuideOpen}
          aria-controls="pwa-install-guide"
        >
          <img src="/icons/icon-192.png" alt="" aria-hidden="true" />
          앱 설치
        </button>
      )}
      {showMobileInstall && installGuideOpen && (
        <aside
          id="pwa-install-guide"
          className="pwa-install-guide"
          role="dialog"
          aria-label="원도심 아트맵 앱 설치 안내"
        >
          <img src="/icons/icon-192.png" alt="" aria-hidden="true" />
          <span>
            <strong>원도심 아트맵 앱 설치</strong>
            <small>
              {mobilePlatform === "ios"
                ? "Safari에서 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하세요."
                : "브라우저 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요."}
            </small>
          </span>
          <button type="button" onClick={() => setInstallGuideOpen(false)} aria-label="설치 안내 닫기">
            닫기
          </button>
        </aside>
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
