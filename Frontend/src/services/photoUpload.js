const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_QUALITY = 0.82;

export function scaledDimensions(width, height, maxDimension = DEFAULT_MAX_DIMENSION) {
  if (width <= maxDimension && height <= maxDimension) return { width, height };
  const scale = maxDimension / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function optimizePhoto(file, options = {}) {
  const maxDimension = options.maxDimension || DEFAULT_MAX_DIMENSION;
  const quality = options.quality || DEFAULT_QUALITY;
  if (!file?.type?.startsWith("image/") || file.type === "image/gif") return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const dimensions = scaledDimensions(bitmap.width, bitmap.height, maxDimension);
    if (dimensions.width === bitmap.width && dimensions.height === bitmap.height
        && file.type === "image/jpeg") {
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    const blob = await canvasBlob(canvas, "image/jpeg", quality);
    if (!blob || blob.size >= file.size) return file;
    const jpegName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], jpegName, { type: "image/jpeg", lastModified: file.lastModified });
  } catch (error) {
    console.warn(`Photo optimization skipped for ${file.name}:`, error);
    return file;
  } finally {
    bitmap?.close?.();
  }
}

export async function appendOptimizedPhotos(formData, photoGroups) {
  // Sequential decoding prevents several full-resolution camera images occupying memory at once.
  for (const [fieldName, files] of Object.entries(photoGroups)) {
    for (const file of files || []) {
      const optimized = await optimizePhoto(file);
      formData.append("photos", optimized, `${fieldName}-${optimized.name}`);
    }
  }
}
