const CACHE_PREFIX = "wonartmap-pwa-";
const CACHE_VERSION = "2026-08-20-v5";
const CORE_CACHE = `${CACHE_PREFIX}core-${CACHE_VERSION}`;
const IMAGE_CACHE = `${CACHE_PREFIX}images-${CACHE_VERSION}`;
const BASE_MAP_CACHE = `${CACHE_PREFIX}base-map-${CACHE_VERSION}`;
const CORE_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];
const MAX_CACHED_IMAGES = 140;
const MAX_CACHED_BASE_MAPS = 6;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) => cache.addAll(CORE_ASSETS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all(
      [
        caches.keys().then((keys) => Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CORE_CACHE && key !== IMAGE_CACHE && key !== BASE_MAP_CACHE)
            .map((key) => caches.delete(key)),
        )),
        self.clients.claim(),
      ],
    ),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

async function offlineResponse() {
  return (await caches.match("/offline.html")) ?? new Response(
    "현재 인터넷 연결이 없습니다. 연결 상태를 확인한 후 다시 시도해 주세요.",
    { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

async function trimCache(cacheName, maximumEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const excess = keys.length - maximumEntries;
  if (excess > 0) {
    await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
  }
}

async function staleWhileRevalidateImage(event) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(event.request);
  const refresh = fetch(event.request).then(async (response) => {
    if (response.ok) {
      try {
        await cache.put(event.request, response.clone());
        await trimCache(IMAGE_CACHE, MAX_CACHED_IMAGES);
      } catch {
        // 저장 공간이 부족해도 네트워크에서 받은 원본 이미지는 그대로 표시한다.
      }
    }
    return response;
  });

  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }

  return refresh;
}

async function cacheFirstVersionedBaseMap(request) {
  const cache = await caches.open(BASE_MAP_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    try {
      await cache.put(request, response.clone());
      await trimCache(BASE_MAP_CACHE, MAX_CACHED_BASE_MAPS);
    } catch {
      // 저장 공간이 부족하면 네트워크 응답만 사용한다.
    }
  }
  return response;
}

async function cacheFirstVersionedImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    try {
      await cache.put(request, response.clone());
      await trimCache(IMAGE_CACHE, MAX_CACHED_IMAGES);
    } catch {
      // 저장 공간이 부족하면 네트워크 응답만 사용한다.
    }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 메타데이터는 최신 서버값을 확인하되, 버전이 고정된 베이스맵 본문만 재사용한다.
  const baseMapVersion = url.pathname === "/api/base-map" ? url.searchParams.get("v") : null;
  if (baseMapVersion && baseMapVersion !== "current" && url.searchParams.get("meta") !== "1") {
    event.respondWith(cacheFirstVersionedBaseMap(request));
    return;
  }

  // 장소 DB, 좌표, 관리자 설정, 리뷰·사진 등 모든 서버 API는 캐시하지 않는다.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(offlineResponse));
    return;
  }

  // 해시가 붙은 JS/CSS는 브라우저와 빌드 시스템에 맡겨 새 배포를 즉시 따른다.
  if (request.destination === "script" || request.destination === "style") return;

  if (request.destination === "image") {
    if (url.searchParams.has("v")) {
      event.respondWith(cacheFirstVersionedImage(request).catch(() => caches.match(request)));
      return;
    }
    event.respondWith(staleWhileRevalidateImage(event).catch(() => caches.match(request)));
    return;
  }

  if (CORE_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
  }
});
