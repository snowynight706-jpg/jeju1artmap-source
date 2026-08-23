"use client";

export const STORY_PHOTO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const STORY_PHOTO_MAX_SOURCE_BYTES = 30 * 1024 * 1024;
export const STORY_PHOTO_TARGET_BYTES = 1.5 * 1024 * 1024;

const STORY_PHOTO_MAX_EDGE = 1280;
const STORY_PHOTO_ENCODING_ATTEMPTS = [
  { maximumEdge: STORY_PHOTO_MAX_EDGE, type: "image/webp", quality: 0.82 },
  { maximumEdge: STORY_PHOTO_MAX_EDGE, type: "image/webp", quality: 0.7 },
  { maximumEdge: STORY_PHOTO_MAX_EDGE, type: "image/jpeg", quality: 0.78 },
  { maximumEdge: 1080, type: "image/webp", quality: 0.7 },
  { maximumEdge: 1080, type: "image/jpeg", quality: 0.7 },
  { maximumEdge: 900, type: "image/jpeg", quality: 0.64 },
  { maximumEdge: 720, type: "image/jpeg", quality: 0.56 },
  { maximumEdge: 640, type: "image/jpeg", quality: 0.5 },
] as const;

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`image load failed: ${src}`));
    image.src = src;
  });
}

function timedPhotoBlob(canvas: HTMLCanvasElement, type: "image/webp" | "image/jpeg", quality: number) {
  return new Promise<Blob | null>((resolve) => {
    let finished = false;
    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve(null);
    }, 12_000);
    canvas.toBlob((blob) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      resolve(blob);
    }, type, quality);
  });
}

function prepareStoryPhotoInWorker(file: File) {
  if (
    typeof Worker !== "function"
    || typeof OffscreenCanvas !== "function"
    || typeof createImageBitmap !== "function"
  ) return Promise.resolve<File | null>(null);

  return new Promise<File | null>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker("/story-photo-worker.js");
    } catch {
      resolve(null);
      return;
    }
    const requestId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;
    let timeout = 0;
    const finish = (result: File | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker.terminate();
      resolve(result);
    };
    timeout = window.setTimeout(() => finish(null), 30_000);
    worker.onerror = () => finish(null);
    worker.onmessage = (event: MessageEvent<{
      id?: string;
      ok?: boolean;
      blob?: Blob;
      type?: string;
    }>) => {
      const payload = event.data;
      if (payload?.id !== requestId) return;
      if (!payload.ok || !(payload.blob instanceof Blob)) {
        finish(null);
        return;
      }
      const extension = payload.type === "image/jpeg" ? "jpg" : "webp";
      finish(new File(
        [payload.blob],
        `${file.name.replace(/\.[^.]+$/, "") || "wondosim"}.${extension}`,
        { type: payload.type || payload.blob.type },
      ));
    };
    worker.postMessage({
      id: requestId,
      file,
      attempts: STORY_PHOTO_ENCODING_ATTEMPTS,
      targetBytes: STORY_PHOTO_TARGET_BYTES,
    });
  });
}

async function decodeStoryPhoto(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        drawable: bitmap as CanvasImageSource,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // 일부 HEIC·기기별 사진은 아래 이미지 요소 방식으로 다시 시도합니다.
    }
  }
  const source = URL.createObjectURL(file);
  try {
    const image = await loadImage(source);
    return {
      drawable: image as CanvasImageSource,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(source),
    };
  } catch (error) {
    URL.revokeObjectURL(source);
    throw error;
  }
}

export async function prepareStoryPhoto(file: File) {
  if (file.size > STORY_PHOTO_MAX_SOURCE_BYTES) throw new Error("photo-source-too-large");
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= STORY_PHOTO_TARGET_BYTES) return file;
  const workerPrepared = await prepareStoryPhotoInWorker(file);
  if (workerPrepared) return workerPrepared;
  let canvas: HTMLCanvasElement | null = null;
  let release = () => {};
  try {
    const image = await decodeStoryPhoto(file).catch(() => {
      throw new Error("photo-decode-failed");
    });
    release = image.release;
    if (!image.width || !image.height) throw new Error("photo-decode-failed");
    canvas = document.createElement("canvas");
    let smallestBlob: Blob | null = null;
    let renderedWidth = 0;
    let renderedHeight = 0;

    for (const attempt of STORY_PHOTO_ENCODING_ATTEMPTS) {
      const scale = Math.min(1, attempt.maximumEdge / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      let blob: Blob | null = null;
      try {
        if (width !== renderedWidth || height !== renderedHeight) {
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) continue;
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image.drawable, 0, 0, width, height);
          renderedWidth = width;
          renderedHeight = height;
        }
        blob = await timedPhotoBlob(canvas, attempt.type, attempt.quality);
      } catch {
        // 한 인코더가 실패해도 더 작은 JPEG 단계까지 계속 시도합니다.
      }
      if (!blob || blob.type !== attempt.type) continue;
      if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
      if (blob.size <= STORY_PHOTO_TARGET_BYTES) {
        const extension = blob.type === "image/jpeg" ? "jpg" : "webp";
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "wondosim"}.${extension}`, { type: blob.type });
      }
    }

    if (smallestBlob) throw new Error("photo-compression-target-failed");
    throw new Error("photo-encode-failed");
  } catch (error) {
    if (error instanceof Error && [
      "photo-source-too-large",
      "photo-decode-failed",
      "photo-encode-failed",
      "photo-compression-target-failed",
    ].includes(error.message)) throw error;
    throw new Error("photo-encode-failed");
  } finally {
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
    release();
  }
}
