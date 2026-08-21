/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const immutableBuildAsset = url.pathname.startsWith("/assets/");
    const immutableVersionedImage = Boolean(url.searchParams.get("v"))
      && (
        url.pathname.startsWith("/landmarks-screen/")
        || url.pathname.startsWith("/maps/wondosim-base-map-v20-screen-")
        || url.pathname === "/jfac-signature-b.svg"
        || url.pathname === "/jfac-symbol.svg"
      );
    if ((request.method === "GET" || request.method === "HEAD") && (immutableBuildAsset || immutableVersionedImage)) {
      const asset = await env.ASSETS.fetch(request);
      if (!asset.ok) return asset;
      const headers = new Headers(asset.headers);
      headers.set("cache-control", "public, max-age=31536000, immutable");
      if (url.pathname.endsWith(".webp")) headers.set("content-type", "image/webp");
      if (url.pathname.endsWith(".svg")) headers.set("content-type", "image/svg+xml; charset=utf-8");
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    }

    if (url.pathname === "/service-worker.js" || url.pathname === "/manifest.webmanifest") {
      const asset = await env.ASSETS.fetch(request);
      if (!asset.ok) return asset;

      const headers = new Headers(asset.headers);
      headers.set("cache-control", "no-cache, no-store, must-revalidate");
      if (url.pathname === "/service-worker.js") {
        headers.set("content-type", "application/javascript; charset=utf-8");
        headers.set("service-worker-allowed", "/");
      } else {
        headers.set("content-type", "application/manifest+json; charset=utf-8");
      }

      return new Response(asset.body, {
        status: asset.status,
        statusText: asset.statusText,
        headers,
      });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
