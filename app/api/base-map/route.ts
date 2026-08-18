import { adminAccess, type AdminRuntimeEnv } from "../../admin-auth";
import {
  BUNDLED_V20_SCREEN_REVISION,
  CURRENT_MAP_KEY,
  readUploadedBaseMapMetadata,
  SCREEN_2048_MAP_KEY,
  SCREEN_4096_MAP_KEY,
  screenVariantKey,
  type BaseMapScreenVariant,
  uploadedMapVersion,
} from "../../base-map-storage";

export const runtime = "edge";

const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;
const MAX_SCREEN_UPLOAD_BYTES = 12 * 1024 * 1024;

type RuntimeEnv = AdminRuntimeEnv & {
  ASSETS?: Fetcher;
  BUCKET?: R2Bucket;
};

async function runtimeEnv() {
  const workers = await import("cloudflare:workers");
  return workers.env as unknown as RuntimeEnv;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function isScreenVariant(value: string | null): value is BaseMapScreenVariant {
  return value === "screen-2048" || value === "screen-4096";
}

function etagMatches(request: Request, etag: string) {
  const candidate = request.headers.get("if-none-match");
  if (!candidate) return false;
  return candidate.split(",").some((value) => {
    const normalized = value.trim().replace(/^W\//, "");
    return normalized === etag || normalized === "*";
  });
}

function imageHeaders(object: R2Object, immutable: boolean, mapName: string, version: string) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", immutable
    ? "public, max-age=31536000, immutable"
    : "public, max-age=0, must-revalidate");
  headers.set("etag", object.httpEtag);
  headers.set("x-base-map-name", encodeURIComponent(mapName));
  headers.set("x-base-map-version", encodeURIComponent(version));
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

async function bundledScreenResponse(request: Request, assets: Fetcher | undefined, variant: BaseMapScreenVariant) {
  if (!assets) return json({ error: "static asset storage unavailable" }, 503);
  const requestedRevision = new URL(request.url).searchParams.get("v")?.trim() ?? "";
  if (requestedRevision !== BUNDLED_V20_SCREEN_REVISION) return json({ error: "base map screen revision unavailable" }, 404);
  const fileName = variant === "screen-2048"
    ? "wondosim-base-map-v20-screen-2048.webp"
    : "wondosim-base-map-v20-screen-4096.webp";
  const assetUrl = new URL(`/maps/${fileName}`, request.url);
  const asset = await assets.fetch(new Request(assetUrl, { method: "GET" }));
  if (!asset.ok) return json({ error: "base map screen asset unavailable" }, 404);
  const headers = new Headers(asset.headers);
  const etag = headers.get("etag") ?? `"${BUNDLED_V20_SCREEN_REVISION}-${variant}"`;
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("content-type", "image/webp");
  headers.set("etag", etag);
  headers.set("x-content-type-options", "nosniff");
  if (etagMatches(request, etag)) return new Response(null, { status: 304, headers });
  return new Response(asset.body, { headers });
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  const canUpload = adminAccess(request, runtime).allowed;
  const url = new URL(request.url);
  const bundledVariant = url.searchParams.get("bundled");
  if (isScreenVariant(bundledVariant)) return bundledScreenResponse(request, runtime.ASSETS, bundledVariant);
  const bucket = runtime.BUCKET;
  if (!bucket) return json({ available: false, canUpload }, 404);
  if (url.searchParams.get("meta") === "1") {
    const metadata = await readUploadedBaseMapMetadata(bucket, canUpload);
    return json(metadata ?? { available: false, canUpload });
  }

  const original = await bucket.get(CURRENT_MAP_KEY);
  if (!original) return json({ available: false }, 404);
  const version = uploadedMapVersion(original);
  const requestedVersion = url.searchParams.get("v")?.trim() ?? "";
  if (requestedVersion && requestedVersion !== "current" && requestedVersion !== version) {
    return json({ error: "base map version unavailable", currentVersion: version }, 404);
  }

  const requestedVariant = url.searchParams.get("variant");
  let object = original;
  if (isScreenVariant(requestedVariant)) {
    const screenObject = await bucket.get(screenVariantKey(requestedVariant));
    if (!screenObject || screenObject.customMetadata?.sourceVersion !== version) {
      return json({ error: "base map screen variant unavailable" }, 404);
    }
    object = screenObject;
  }

  const immutable = Boolean(requestedVersion && requestedVersion !== "current" && requestedVersion === version);
  const name = original.customMetadata?.name ?? "업로드 베이스맵";
  const headers = imageHeaders(object, immutable, name, version);
  if (etagMatches(request, object.httpEtag)) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}

export async function POST(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.BUCKET) return json({ error: "storage unavailable" }, 503);
  if (!adminAccess(request, runtime).allowed) return json({ error: "admin authentication required" }, 403);

  const url = new URL(request.url);
  const variant = url.searchParams.get("variant");
  if (isScreenVariant(variant)) {
    const sourceVersion = url.searchParams.get("sourceVersion")?.trim() ?? "";
    const current = await runtime.BUCKET.head(CURRENT_MAP_KEY);
    if (!current || !sourceVersion || uploadedMapVersion(current) !== sourceVersion) {
      return json({ error: "base map changed before screen variant upload" }, 409);
    }
    const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (contentType !== "image/webp") return json({ error: "screen variant must be webp" }, 415);
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_SCREEN_UPLOAD_BYTES) return json({ error: "screen variant too large" }, 413);
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_SCREEN_UPLOAD_BYTES) return json({ error: "screen variant too large" }, 413);
    const width = Math.round(Number(url.searchParams.get("width") ?? 0));
    const height = Math.round(Number(url.searchParams.get("height") ?? 0));
    const maximumWidth = variant === "screen-2048" ? 2048 : 4096;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > maximumWidth || height > maximumWidth) {
      return json({ error: "invalid screen variant dimensions" }, 400);
    }
    await runtime.BUCKET.put(screenVariantKey(variant), bytes, {
      httpMetadata: { contentType: "image/webp" },
      customMetadata: { sourceVersion, width: String(width), height: String(height) },
    });
    return json({ stored: true, variant, sourceVersion, width, height, size: bytes.byteLength });
  }

  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) return json({ error: "unsupported file type" }, 415);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_UPLOAD_BYTES) return json({ error: "file too large" }, 413);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_UPLOAD_BYTES) return json({ error: "file too large" }, 413);

  const name = (url.searchParams.get("name") ?? "업로드 베이스맵").slice(0, 180);
  const width = Number(url.searchParams.get("width") ?? 0);
  const height = Number(url.searchParams.get("height") ?? 0);
  const uploadedAt = new Date().toISOString();
  await runtime.BUCKET.put(CURRENT_MAP_KEY, bytes, {
    httpMetadata: { contentType },
    customMetadata: {
      name,
      width: Number.isFinite(width) ? String(Math.round(width)) : "0",
      height: Number.isFinite(height) ? String(Math.round(height)) : "0",
      uploadedAt,
    },
  });
  await runtime.BUCKET.delete([SCREEN_2048_MAP_KEY, SCREEN_4096_MAP_KEY]);
  const metadata = await readUploadedBaseMapMetadata(runtime.BUCKET, true);
  return json(metadata ?? { available: true, canUpload: true, name, width, height, uploadedAt, size: bytes.byteLength, contentType });
}
