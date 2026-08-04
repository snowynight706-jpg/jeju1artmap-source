export const runtime = "edge";

const CURRENT_MAP_KEY = "base-maps/current";
const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

type RuntimeEnv = {
  BUCKET?: R2Bucket;
  BASE_MAP_OWNER_EMAIL?: string;
};

async function runtimeEnv() {
  const workers = await import("cloudflare:workers");
  return workers.env as unknown as RuntimeEnv;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  const bucket = runtime.BUCKET;
  const ownerEmail = runtime.BASE_MAP_OWNER_EMAIL?.trim().toLowerCase();
  const currentEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const canUpload = Boolean(ownerEmail && currentEmail === ownerEmail);
  if (!bucket) return json({ available: false, canUpload }, 404);
  const object = await bucket.get(CURRENT_MAP_KEY);
  if (!object) return new URL(request.url).searchParams.get("meta") === "1" ? json({ available: false, canUpload }) : json({ available: false }, 404);
  const metadata = {
    available: true,
    canUpload,
    name: object.customMetadata?.name ?? "업로드 베이스맵",
    width: Number(object.customMetadata?.width ?? 0),
    height: Number(object.customMetadata?.height ?? 0),
    uploadedAt: object.customMetadata?.uploadedAt ?? object.uploaded.toISOString(),
    size: object.size,
    contentType: object.httpMetadata?.contentType ?? "image/png",
  };
  if (new URL(request.url).searchParams.get("meta") === "1") return json(metadata);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "public, max-age=60, must-revalidate");
  headers.set("etag", object.httpEtag);
  headers.set("x-base-map-name", encodeURIComponent(metadata.name));
  return new Response(object.body, { headers });
}

export async function POST(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.BUCKET) return json({ error: "storage unavailable" }, 503);
  const ownerEmail = runtime.BASE_MAP_OWNER_EMAIL?.trim().toLowerCase();
  const currentEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!ownerEmail || currentEmail !== ownerEmail) return json({ error: "owner authentication required" }, 403);

  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) return json({ error: "unsupported file type" }, 415);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_UPLOAD_BYTES) return json({ error: "file too large" }, 413);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_UPLOAD_BYTES) return json({ error: "file too large" }, 413);

  const url = new URL(request.url);
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
  return json({ available: true, canUpload: true, name, width, height, uploadedAt, size: bytes.byteLength, contentType });
}
