export const CURRENT_MAP_KEY = "base-maps/current";
export const SCREEN_2048_MAP_KEY = "base-maps/current-screen-2048";
export const SCREEN_4096_MAP_KEY = "base-maps/current-screen-4096";

export type BaseMapScreenVariant = "screen-2048" | "screen-4096";

export type UploadedBaseMapMetadata = {
  available: boolean;
  canUpload?: boolean;
  name: string;
  width: number;
  height: number;
  uploadedAt: string;
  size: number;
  contentType: string;
  originalUrl: string;
  screen2048Url?: string;
  screen4096Url?: string;
};

export const BUNDLED_V20_SOURCE_VERSION = "2026-08-11T08:17:08.055Z";
export const BUNDLED_V20_SCREEN_REVISION = "20260818-v1";

export function uploadedMapVersion(object: Pick<R2Object, "customMetadata" | "uploaded">) {
  return object.customMetadata?.uploadedAt ?? object.uploaded.toISOString();
}

export function screenVariantKey(variant: BaseMapScreenVariant) {
  return variant === "screen-2048" ? SCREEN_2048_MAP_KEY : SCREEN_4096_MAP_KEY;
}

function versionedMapUrl(version: string, variant?: BaseMapScreenVariant) {
  const params = new URLSearchParams({ v: version });
  if (variant) params.set("variant", variant);
  return `/api/base-map?${params.toString()}`;
}

function bundledScreenUrls(version: string) {
  if (version !== BUNDLED_V20_SOURCE_VERSION) return null;
  return {
    screen2048Url: `/api/base-map?bundled=screen-2048&v=${BUNDLED_V20_SCREEN_REVISION}`,
    screen4096Url: `/api/base-map?bundled=screen-4096&v=${BUNDLED_V20_SCREEN_REVISION}`,
  };
}

async function validScreenVariant(bucket: R2Bucket, key: string, sourceVersion: string) {
  const object = await bucket.head(key);
  return object?.customMetadata?.sourceVersion === sourceVersion ? object : null;
}

export async function readUploadedBaseMapMetadata(bucket: R2Bucket | undefined, canUpload = false): Promise<UploadedBaseMapMetadata | null> {
  if (!bucket) return null;
  const original = await bucket.head(CURRENT_MAP_KEY);
  if (!original) return null;

  const uploadedAt = uploadedMapVersion(original);
  const bundled = bundledScreenUrls(uploadedAt);
  if (bundled) {
    return {
      available: true,
      canUpload,
      name: original.customMetadata?.name ?? "업로드 베이스맵",
      width: Number(original.customMetadata?.width ?? 0),
      height: Number(original.customMetadata?.height ?? 0),
      uploadedAt,
      size: original.size,
      contentType: original.httpMetadata?.contentType ?? "image/png",
      originalUrl: versionedMapUrl(uploadedAt),
      ...bundled,
    };
  }

  const [screen2048, screen4096] = await Promise.all([
    validScreenVariant(bucket, SCREEN_2048_MAP_KEY, uploadedAt),
    validScreenVariant(bucket, SCREEN_4096_MAP_KEY, uploadedAt),
  ]);

  return {
    available: true,
    canUpload,
    name: original.customMetadata?.name ?? "업로드 베이스맵",
    width: Number(original.customMetadata?.width ?? 0),
    height: Number(original.customMetadata?.height ?? 0),
    uploadedAt,
    size: original.size,
    contentType: original.httpMetadata?.contentType ?? "image/png",
    originalUrl: versionedMapUrl(uploadedAt),
    screen2048Url: screen2048 ? versionedMapUrl(uploadedAt, "screen-2048") : undefined,
    screen4096Url: screen4096 ? versionedMapUrl(uploadedAt, "screen-4096") : undefined,
  };
}
