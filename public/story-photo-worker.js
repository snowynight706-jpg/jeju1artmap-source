self.onmessage = async (event) => {
  const { id, file, attempts, targetBytes } = event.data ?? {};
  if (!id || !(file instanceof Blob) || !Array.isArray(attempts)) return;

  let bitmap = null;
  try {
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      bitmap = await createImageBitmap(file);
    }
    if (!bitmap.width || !bitmap.height) throw new Error("photo-decode-failed");

    let canvas = null;
    let renderedWidth = 0;
    let renderedHeight = 0;
    let smallestBlob = null;

    for (const attempt of attempts) {
      const scale = Math.min(1, attempt.maximumEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      if (!canvas || width !== renderedWidth || height !== renderedHeight) {
        canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) continue;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        renderedWidth = width;
        renderedHeight = height;
      }

      let blob = null;
      try {
        blob = await canvas.convertToBlob({ type: attempt.type, quality: attempt.quality });
      } catch {
        continue;
      }
      if (!blob || blob.type !== attempt.type) continue;
      if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
      if (blob.size <= targetBytes) {
        self.postMessage({ id, ok: true, blob, type: blob.type });
        return;
      }
    }

    self.postMessage({
      id,
      ok: false,
      error: smallestBlob ? "photo-compression-target-failed" : "photo-encode-failed",
    });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : "photo-encode-failed",
    });
  } finally {
    bitmap?.close();
  }
};
