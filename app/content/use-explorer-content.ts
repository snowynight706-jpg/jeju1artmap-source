"use client";

import { useEffect, useState } from "react";
import type { PublicLayoutAccess } from "../map/core/types";
import {
  PLACE_EVENTS_API,
  PLACE_REGISTRATION_REQUESTS_API,
  PLACE_STORIES_API,
} from "./client";
import type {
  GlobalContentTab,
  PerformanceDiagnostic,
  PerformanceDiagnosticsPayload,
  PlaceEvent,
  PlaceEventsPayload,
  PlaceRegistrationRequest,
  PlaceRegistrationRequestsPayload,
  PlaceStoriesPayload,
  PlaceStory,
  PlaceStoryDiagnosticsPayload,
  PlaceStoryUploadDiagnostic,
} from "./types";

type ExplorerLoadOptions = {
  access: PublicLayoutAccess;
  open: boolean;
  tab: GlobalContentTab;
};

function requestWasAborted(error: unknown, controller: AbortController) {
  return controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
}

export function useExplorerStories({ access, open, tab }: ExplorerLoadOptions) {
  const [globalStories, setGlobalStories] = useState<PlaceStory[]>([]);
  const [globalStoriesPage, setGlobalStoriesPage] = useState(1);
  const [globalStoriesPageCount, setGlobalStoriesPageCount] = useState(0);
  const [globalStoriesTotal, setGlobalStoriesTotal] = useState<number | null>(null);
  const [globalStoriesCanModerate, setGlobalStoriesCanModerate] = useState(false);
  const [globalStoriesLoading, setGlobalStoriesLoading] = useState(false);
  const [globalStoriesError, setGlobalStoriesError] = useState(false);
  const [globalStoriesRefreshKey, setGlobalStoriesRefreshKey] = useState(0);

  useEffect(() => {
    if (access === "loading" || !open || tab !== "reviews") return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      setGlobalStoriesLoading(true);
      setGlobalStoriesError(false);
      return fetch(`${PLACE_STORIES_API}?scope=all&page=${globalStoriesPage}`, { cache: "no-store", signal: controller.signal });
    })
      .then(async (response) => {
        if (!response) return null;
        const payload = await response.json().catch(() => null) as PlaceStoriesPayload | null;
        if (!response.ok) throw new Error(payload?.error ?? "global story load failed");
        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted || !payload) return;
        setGlobalStories(Array.isArray(payload.stories) ? payload.stories : []);
        setGlobalStoriesTotal(Math.max(0, Number(payload.total ?? 0)));
        setGlobalStoriesPageCount(Math.max(0, Number(payload.pageCount ?? 0)));
        setGlobalStoriesCanModerate(Boolean(payload.canModerate));
        const normalizedPage = Math.max(1, Number(payload.page ?? globalStoriesPage));
        if (normalizedPage !== globalStoriesPage) setGlobalStoriesPage(normalizedPage);
      })
      .catch((error) => {
        if (requestWasAborted(error, controller)) return;
        setGlobalStories([]);
        setGlobalStoriesCanModerate(false);
        setGlobalStoriesError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setGlobalStoriesLoading(false);
      });
    return () => controller.abort();
  }, [access, globalStoriesPage, globalStoriesRefreshKey, open, tab]);

  return {
    globalStories,
    globalStoriesPage,
    globalStoriesPageCount,
    globalStoriesTotal,
    globalStoriesCanModerate,
    globalStoriesLoading,
    globalStoriesError,
    globalStoriesRefreshKey,
    setGlobalStories,
    setGlobalStoriesPage,
    setGlobalStoriesTotal,
    setGlobalStoriesRefreshKey,
  };
}

export function useExplorerDiagnostics({ access, open, tab }: ExplorerLoadOptions) {
  const [uploadDiagnostics, setUploadDiagnostics] = useState<PlaceStoryUploadDiagnostic[]>([]);
  const [uploadDiagnosticsLoading, setUploadDiagnosticsLoading] = useState(false);
  const [uploadDiagnosticsError, setUploadDiagnosticsError] = useState(false);
  const [uploadDiagnosticsRefreshKey, setUploadDiagnosticsRefreshKey] = useState(0);
  const [performanceDiagnostics, setPerformanceDiagnostics] = useState<PerformanceDiagnostic[]>([]);
  const [performanceDiagnosticsLoading, setPerformanceDiagnosticsLoading] = useState(false);
  const [performanceDiagnosticsError, setPerformanceDiagnosticsError] = useState(false);
  const [performanceDiagnosticsRefreshKey, setPerformanceDiagnosticsRefreshKey] = useState(0);

  useEffect(() => {
    if (access !== "editor" || !open || tab !== "reviews") return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      setUploadDiagnosticsLoading(true);
      setUploadDiagnosticsError(false);
      return fetch(`${PLACE_STORIES_API}?scope=upload-diagnostics`, { cache: "no-store", signal: controller.signal });
    })
      .then(async (response) => {
        if (!response) return null;
        const payload = await response.json().catch(() => null) as PlaceStoryDiagnosticsPayload | null;
        if (!response.ok) throw new Error(payload?.error ?? "upload diagnostics load failed");
        return payload;
      })
      .then((payload) => {
        if (!controller.signal.aborted && payload) setUploadDiagnostics(Array.isArray(payload.diagnostics) ? payload.diagnostics : []);
      })
      .catch((error) => {
        if (!requestWasAborted(error, controller)) setUploadDiagnosticsError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setUploadDiagnosticsLoading(false);
      });
    return () => controller.abort();
  }, [access, open, tab, uploadDiagnosticsRefreshKey]);

  useEffect(() => {
    if (access !== "editor" || !open || tab !== "reviews") return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      setPerformanceDiagnosticsLoading(true);
      setPerformanceDiagnosticsError(false);
      return fetch(`${PLACE_STORIES_API}?scope=performance-diagnostics`, { cache: "no-store", signal: controller.signal });
    })
      .then(async (response) => {
        if (!response) return null;
        const payload = await response.json().catch(() => null) as PerformanceDiagnosticsPayload | null;
        if (!response.ok) throw new Error(payload?.error ?? "performance diagnostics load failed");
        return payload;
      })
      .then((payload) => {
        if (!controller.signal.aborted && payload) setPerformanceDiagnostics(Array.isArray(payload.diagnostics) ? payload.diagnostics : []);
      })
      .catch((error) => {
        if (!requestWasAborted(error, controller)) setPerformanceDiagnosticsError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPerformanceDiagnosticsLoading(false);
      });
    return () => controller.abort();
  }, [access, open, performanceDiagnosticsRefreshKey, tab]);

  return {
    uploadDiagnostics,
    uploadDiagnosticsLoading,
    uploadDiagnosticsError,
    performanceDiagnostics,
    performanceDiagnosticsLoading,
    performanceDiagnosticsError,
    setUploadDiagnostics,
    setUploadDiagnosticsRefreshKey,
    setPerformanceDiagnostics,
    setPerformanceDiagnosticsRefreshKey,
  };
}

export function useExplorerEvents({ access, open, tab }: ExplorerLoadOptions) {
  const [globalEvents, setGlobalEvents] = useState<PlaceEvent[]>([]);
  const [globalEventsPage, setGlobalEventsPage] = useState(1);
  const [globalEventsPageCount, setGlobalEventsPageCount] = useState(0);
  const [globalEventsTotal, setGlobalEventsTotal] = useState<number | null>(null);
  const [globalEventsCanManage, setGlobalEventsCanManage] = useState(false);
  const [globalEventsLoading, setGlobalEventsLoading] = useState(false);
  const [globalEventsError, setGlobalEventsError] = useState(false);
  const [globalEventsRefreshKey, setGlobalEventsRefreshKey] = useState(0);

  useEffect(() => {
    if (access === "loading" || !open || tab !== "events") return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      setGlobalEventsLoading(true);
      setGlobalEventsError(false);
      return fetch(`${PLACE_EVENTS_API}?scope=all&page=${globalEventsPage}`, { cache: "no-store", signal: controller.signal });
    })
      .then(async (response) => {
        if (!response) return null;
        const payload = await response.json().catch(() => null) as PlaceEventsPayload | null;
        if (!response.ok) throw new Error(payload?.error ?? "global event load failed");
        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted || !payload) return;
        setGlobalEvents(Array.isArray(payload.events) ? payload.events : []);
        setGlobalEventsTotal(Math.max(0, Number(payload.total ?? 0)));
        setGlobalEventsPageCount(Math.max(0, Number(payload.pageCount ?? 0)));
        setGlobalEventsCanManage(Boolean(payload.canManage));
        const normalizedPage = Math.max(1, Number(payload.page ?? globalEventsPage));
        if (normalizedPage !== globalEventsPage) setGlobalEventsPage(normalizedPage);
      })
      .catch((error) => {
        if (requestWasAborted(error, controller)) return;
        setGlobalEvents([]);
        setGlobalEventsCanManage(false);
        setGlobalEventsError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setGlobalEventsLoading(false);
      });
    return () => controller.abort();
  }, [access, globalEventsPage, globalEventsRefreshKey, open, tab]);

  return {
    globalEvents,
    globalEventsPage,
    globalEventsPageCount,
    globalEventsTotal,
    globalEventsCanManage,
    globalEventsLoading,
    globalEventsError,
    globalEventsRefreshKey,
    setGlobalEvents,
    setGlobalEventsPage,
    setGlobalEventsTotal,
    setGlobalEventsRefreshKey,
  };
}

export function usePlaceRequests({ access, open, tab }: ExplorerLoadOptions) {
  const [placeRequests, setPlaceRequests] = useState<PlaceRegistrationRequest[]>([]);
  const [placeRequestsPage, setPlaceRequestsPage] = useState(1);
  const [placeRequestsPageCount, setPlaceRequestsPageCount] = useState(0);
  const [placeRequestsTotal, setPlaceRequestsTotal] = useState<number | null>(null);
  const [placeRequestsLoading, setPlaceRequestsLoading] = useState(false);
  const [placeRequestsError, setPlaceRequestsError] = useState(false);
  const [placeRequestsRefreshKey, setPlaceRequestsRefreshKey] = useState(0);

  useEffect(() => {
    if (access !== "editor" || !open || tab !== "place-requests") return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      setPlaceRequestsLoading(true);
      setPlaceRequestsError(false);
      return fetch(`${PLACE_REGISTRATION_REQUESTS_API}?page=${placeRequestsPage}`, { cache: "no-store", signal: controller.signal });
    })
      .then(async (response) => {
        if (!response) return null;
        const payload = await response.json().catch(() => null) as PlaceRegistrationRequestsPayload | null;
        if (!response.ok) throw new Error(payload?.error ?? "place request load failed");
        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted || !payload) return;
        setPlaceRequests(Array.isArray(payload.requests) ? payload.requests : []);
        setPlaceRequestsTotal(Math.max(0, Number(payload.total ?? 0)));
        setPlaceRequestsPageCount(Math.max(0, Number(payload.pageCount ?? 0)));
        const normalizedPage = Math.max(1, Number(payload.page ?? placeRequestsPage));
        if (normalizedPage !== placeRequestsPage) setPlaceRequestsPage(normalizedPage);
      })
      .catch((error) => {
        if (requestWasAborted(error, controller)) return;
        setPlaceRequests([]);
        setPlaceRequestsError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPlaceRequestsLoading(false);
      });
    return () => controller.abort();
  }, [access, open, placeRequestsPage, placeRequestsRefreshKey, tab]);

  return {
    placeRequests,
    placeRequestsPage,
    placeRequestsPageCount,
    placeRequestsTotal,
    placeRequestsLoading,
    placeRequestsError,
    setPlaceRequests,
    setPlaceRequestsPage,
    setPlaceRequestsTotal,
    setPlaceRequestsRefreshKey,
  };
}
