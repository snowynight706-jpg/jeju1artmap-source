"use client";

export const PLACE_STORIES_API = "/api/place-stories";
export const PLACE_EVENTS_API = "/api/place-events";
export const PLACE_REGISTRATION_REQUESTS_API = "/api/place-registration-requests";

const PLACE_STORY_VISITOR_KEY = "jeju-wondosim-map-review:story-visitor:v1";
const PLACE_STORY_DRAFTS_KEY = "jeju-wondosim-map-review:story-drafts:v1";

let volatileVisitorId = "";

function newVisitorId() {
  return `${crypto.randomUUID().replaceAll("-", "")}${Date.now().toString(36)}`;
}

export function persistentVisitorId() {
  try {
    const existing = localStorage.getItem(PLACE_STORY_VISITOR_KEY)?.trim();
    if (existing && /^[a-zA-Z0-9_-]{24,100}$/.test(existing)) return existing;
    const next = volatileVisitorId || newVisitorId();
    volatileVisitorId = next;
    localStorage.setItem(PLACE_STORY_VISITOR_KEY, next);
    return next;
  } catch {
    volatileVisitorId ||= newVisitorId();
    return volatileVisitorId;
  }
}

export async function sendPlaceStoryUploadDiagnostic(details: {
  placeKey: string;
  stage: "prepare" | "request" | "response";
  errorCode: string;
  responseStatus: number;
  sourceFile: File | null;
  preparedFile: File | null;
}) {
  try {
    const response = await fetch(PLACE_STORIES_API, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "upload-diagnostic",
        visitorId: persistentVisitorId(),
        placeKey: details.placeKey,
        stage: details.stage,
        errorCode: details.errorCode,
        responseStatus: details.responseStatus,
        sourceSize: details.sourceFile?.size ?? 0,
        preparedSize: details.preparedFile?.size ?? null,
        sourceType: details.sourceFile?.type ?? "",
        preparedType: details.preparedFile?.type ?? null,
        online: navigator.onLine,
      }),
    });
    const payload = await response.json().catch(() => null) as { reference?: unknown } | null;
    return response.ok && typeof payload?.reference === "string" ? payload.reference : null;
  } catch {
    return null;
  }
}

export function sendPerformanceDiagnostic(details: {
  metric: "startup" | "pan-settle" | "pinch-settle";
  durationMs: number;
  elementCount: number;
  labelCount: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  try {
    const deviceNavigator = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { effectiveType?: string };
      standalone?: boolean;
    };
    const report = () => {
      void fetch(PLACE_STORIES_API, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "performance-diagnostic",
          visitorId: persistentVisitorId(),
          metric: details.metric,
          durationMs: Math.round(details.durationMs),
          elementCount: details.elementCount,
          labelCount: details.labelCount,
          viewportWidth: Math.round(details.viewportWidth),
          viewportHeight: Math.round(details.viewportHeight),
          deviceMemory: Number.isFinite(deviceNavigator.deviceMemory) ? deviceNavigator.deviceMemory : null,
          hardwareConcurrency: deviceNavigator.hardwareConcurrency || 0,
          connectionType: deviceNavigator.connection?.effectiveType ?? "",
          standalone: window.matchMedia("(display-mode: standalone)").matches || deviceNavigator.standalone === true,
          online: navigator.onLine,
        }),
      }).catch(() => undefined);
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(report, { timeout: 2000 });
    else globalThis.setTimeout(report, 500);
  } catch {
    // Performance reporting must never interrupt map interaction.
  }
}

export function readPlaceStoryDraft(placeKey: string | null) {
  if (!placeKey) return "";
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PLACE_STORY_DRAFTS_KEY) ?? "{}") as Record<string, unknown>;
    return typeof parsed[placeKey] === "string" ? parsed[placeKey].slice(0, 220) : "";
  } catch {
    return "";
  }
}

export function writePlaceStoryDraft(placeKey: string | null, value: string) {
  if (!placeKey) return;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PLACE_STORY_DRAFTS_KEY) ?? "{}") as Record<string, unknown>;
    const next = Object.fromEntries(Object.entries(parsed).filter(([, draft]) => typeof draft === "string"));
    if (value.trim()) next[placeKey] = value.slice(0, 220);
    else delete next[placeKey];
    sessionStorage.setItem(PLACE_STORY_DRAFTS_KEY, JSON.stringify(next));
  } catch {
    // 세션 저장소가 차단된 환경에서는 현재 입력 상태만 유지합니다.
  }
}
