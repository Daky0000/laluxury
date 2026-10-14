/**
 * Client-side image compression utility.
 *
 * Runs inside the browser using HTML5 Canvas / createImageBitmap.
 * Scales down large photos (e.g. 10MB-20MB mobile camera photos) before they are
 * sent over the network to the server.
 *
 * Benefits:
 * 1. Prevents exceeding Next.js Server Action body size limits (HTTP 413).
 * 2. Speeds up upload on mobile 4G networks from 20-30s down to < 1s.
 * 3. Prevents server OOM crashes when Sharp processes massive pixel buffers in low-memory containers.
 */

export async function compressImageClient(
  file: File,
  options: { maxDimension?: number; quality?: number } = {},
): Promise<File> {
  // If not running in a browser environment, return unchanged
  if (typeof window === "undefined" || typeof document === "undefined") {
    return file;
  }

  // Only compress raster formats that benefit from resizing: JPEG, PNG, WebP
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return file;
  }

  // If already under 500KB, don't bother compressing
  if (file.size < 500 * 1024) {
    return file;
  }

  const maxDimension = options.maxDimension ?? 2048;
  const quality = options.quality ?? 0.82;

  try {
    // createImageBitmap handles EXIF orientation automatically in modern browsers
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;

    // If both dimensions are within limit and file is under 1.5MB, keep as is
    if (width <= maxDimension && height <= maxDimension && file.size < 1.5 * 1024 * 1024) {
      bitmap.close?.();
      return file;
    }

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    // Prefer webp, fallback to jpeg
    let mimeType = "image/webp";
    let blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );

    if (!blob || blob.type !== "image/webp") {
      mimeType = "image/jpeg";
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
    }

    if (!blob || blob.size >= file.size) {
      return file;
    }

    const ext = mimeType === "image/webp" ? ".webp" : ".jpg";
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    return new File([blob], `${baseName}${ext}`, { type: mimeType });
  } catch {
    // Graceful fallback to original file if compression fails or format is unsupported
    return file;
  }
}
