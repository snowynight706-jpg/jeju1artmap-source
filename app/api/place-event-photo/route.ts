import { adminAccess, type AdminRuntimeEnv } from "../../admin-auth";

export const runtime = "edge";

type RuntimeEnv = AdminRuntimeEnv & {
  DB?: D1Database;
  BUCKET?: R2Bucket;
};

async function runtimeEnv() {
  const workers = await import("cloudflare:workers");
  return workers.env as unknown as RuntimeEnv;
}

function ownerAccess(request: Request, runtime: RuntimeEnv) {
  return adminAccess(request, runtime).allowed;
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB || !runtime.BUCKET) return new Response("storage unavailable", { status: 503 });
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return new Response("photo id required", { status: 400 });
  const row = await runtime.DB.prepare(
    "SELECT photo_key AS photoKey, status, visible_from AS visibleFrom, visible_until AS visibleUntil FROM place_events WHERE id = ?",
  ).bind(id).first() as { photoKey: string; status: string; visibleFrom: string; visibleUntil: string } | null;
  const now = new Date().toISOString();
  const isPublic = Boolean(row && row.status === "active" && row.visibleFrom <= now && row.visibleUntil > now);
  if (!row?.photoKey || (!isPublic && !ownerAccess(request, runtime))) return new Response("photo not found", { status: 404 });
  const object = await runtime.BUCKET.get(row.photoKey);
  if (!object) return new Response("photo not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", isPublic ? "public, max-age=300" : "private, no-store");
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  const requestedEtag = request.headers.get("if-none-match");
  if (requestedEtag?.split(",").some((value) => value.trim().replace(/^W\//, "") === object.httpEtag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(object.body, { headers });
}
