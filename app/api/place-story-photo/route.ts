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
    "SELECT photo_key AS photoKey, status FROM place_stories WHERE id = ?",
  ).bind(id).first() as { photoKey: string | null; status: string } | null;
  if (!row?.photoKey || (row.status !== "published" && !ownerAccess(request, runtime))) return new Response("photo not found", { status: 404 });
  const object = await runtime.BUCKET.get(row.photoKey);
  if (!object) return new Response("photo not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", row.status === "published" ? "public, max-age=3600" : "private, no-store");
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
