import { saveInspectionDraft } from "./inspectionDrafts";
import { captureFrontendException } from "./monitoring";

const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_QUALITY = 0.82;

export class InspectionSubmissionError extends Error {
  constructor(message, phase, cause = null, jobId = "") {
    super(message);
    this.name = "InspectionSubmissionError";
    this.phase = phase;
    this.jobId = jobId;
    this.cause = cause;
  }
}

function submissionContext({ orgType, photoCount, jobId = "" }) {
  return {
    tags: {
      area: "inspection_submission",
      phase: "unknown",
    },
    extra: {
      orgType: String(orgType || "unknown"),
      photoCount: Number(photoCount || 0),
      ...(jobId ? { jobId: String(jobId) } : {}),
    },
  };
}

function recordSubmissionFailure(error, phase, context, level = "error") {
  captureFrontendException(error, {
    ...context,
    tags: { ...context.tags, phase },
    level,
  });
}

function phaseError(error, phase, message, context, jobId = "") {
  if (error instanceof InspectionSubmissionError) return error;
  recordSubmissionFailure(error, phase, context);
  return new InspectionSubmissionError(message, phase, error, jobId);
}

function preparationMessage(error) {
  if (Number(error?.status) > 0 && error?.message) return error.message;
  return "Afterlight could not begin this inspection submission. Check your connection and try again.";
}

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
      formData.append("photos", optimized, `${encodeURIComponent(fieldName)}--${optimized.name}`);
    }
  }
}

export function mergePhotoSelection(currentFiles, selectedFiles, maxFiles = 6) {
  return [
    ...(Array.isArray(currentFiles) ? currentFiles : []),
    ...Array.from(selectedFiles || []),
  ].slice(0, maxFiles);
}

function idempotencyKey() {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `inspection_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function flattenPhotoGroups(photoGroups = {}) {
  return Object.entries(photoGroups).flatMap(([fieldName, files]) =>
    Array.from(files || []).map((file) => ({ fieldName, file }))
  );
}

function inspectionDraftIdentity({ property, orgType, assignmentId, responses, photos }) {
  return JSON.stringify({
    property,
    orgType,
    assignmentId,
    responses,
    photos: photos.map(({ fieldName, file }) => ({
      fieldName,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    })),
  });
}

function draftIdempotency(property, fingerprint) {
  const organizationId = window.localStorage.getItem("organizationId") || "unknown-organization";
  const userId = window.localStorage.getItem("userId") || "unknown-user";
  const storageKey = `afterlight:inspection-upload:${organizationId}:${userId}:${property}`;
  try {
    const existing = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    if (existing?.fingerprint === fingerprint && existing?.key) {
      return { storageKey, key: existing.key };
    }
    const key = idempotencyKey();
    window.localStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }));
    return { storageKey, key };
  } catch (_error) {
    return { storageKey: "", key: idempotencyKey() };
  }
}

async function uploadToSignedPost(upload, file) {
  const body = new FormData();
  Object.entries(upload.fields || {}).forEach(([key, value]) => body.append(key, value));
  body.append("Content-Type", file.type);
  body.append("file", file, file.name);
  const response = await fetch(upload.url, { method: "POST", body });
  if (!response.ok) {
    throw new Error(`Photo upload failed with status ${response.status}.`);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function waitForInspectionJob(api, jobId, options = {}) {
  const timeoutMs = options.timeoutMs || 120000;
  const pollMs = options.pollMs || 1500;
  const startedAt = Date.now();
  let current;
  while (Date.now() - startedAt < timeoutMs) {
    current = await api.get(`/api/inspection-jobs/${jobId}`);
    options.onProgress?.({ phase: current.status, job: current });
    if (["completed", "failed"].includes(current.status)) return current;
    await delay(pollMs);
  }
  return current || { jobId, status: "queued" };
}

export async function submitInspectionJob({
  api,
  property,
  orgType,
  responses,
  photoGroups,
  assignmentId = "",
  draft: offlineDraft = null,
  saveDraft = saveInspectionDraft,
  onProgress,
  onWarning,
}) {
  const photos = flattenPhotoGroups(photoGroups);
  const context = submissionContext({ orgType, photoCount: photos.length });
  const fingerprint = inspectionDraftIdentity({ property, orgType, assignmentId, responses, photos });
  const uploadDraft = draftIdempotency(property, fingerprint);
  onProgress?.({ phase: "preparing", total: photos.length });

  if (offlineDraft) {
    try {
      await saveDraft(offlineDraft);
    } catch (error) {
      recordSubmissionFailure(error, "draft_storage", context, "warning");
      onWarning?.({
        phase: "draft_storage",
        message: "This browser could not update the offline draft. Submission will continue.",
      });
    }
  }

  let prepared;
  try {
    prepared = await api.post("/api/inspection-jobs", {
      property,
      orgType,
      assignmentId: assignmentId || undefined,
      responses,
      idempotencyKey: uploadDraft.key,
      photos: photos.map(({ fieldName, file }) => ({ fieldName, fileName: file.name })),
    });
  } catch (error) {
    throw phaseError(error, "api_preparation", preparationMessage(error), context);
  }

  const jobId = String(prepared.jobId || "");
  const jobContext = submissionContext({ orgType, photoCount: photos.length, jobId });

  if (prepared.status === "uploading") {
    if (prepared.uploads.length !== photos.length) {
      const error = new Error("The server returned an incomplete photo upload plan.");
      throw phaseError(
        error,
        "photo_upload_plan",
        "Afterlight returned an incomplete photo upload plan. Try submitting the inspection again.",
        jobContext,
        jobId
      );
    }
    for (let index = 0; index < photos.length; index += 1) {
      const optimized = await optimizePhoto(photos[index].file);
      try {
        await uploadToSignedPost(prepared.uploads[index], optimized);
      } catch (error) {
        throw phaseError(
          error,
          "photo_upload",
          "A photo could not be uploaded. Check your connection and try again; the inspection form remains open.",
          jobContext,
          jobId
        );
      }
      onProgress?.({ phase: "uploading", completed: index + 1, total: photos.length });
    }
    try {
      await api.post(`/api/inspection-jobs/${prepared.jobId}/complete-uploads`, {});
    } catch (error) {
      throw phaseError(
        error,
        "upload_finalization",
        "The photos uploaded, but Afterlight could not queue the inspection. Try submitting again to safely resume.",
        jobContext,
        jobId
      );
    }
  }

  onProgress?.({ phase: "queued", jobId: prepared.jobId });
  let result;
  try {
    result = await waitForInspectionJob(api, prepared.jobId, { onProgress });
  } catch (error) {
    throw phaseError(
      error,
      "status_refresh",
      "The inspection was queued, but its status could not be refreshed. Check the dashboard before submitting again.",
      jobContext,
      jobId
    );
  }
  if (result.status === "failed") {
    const error = new Error(result.error || "Report processing failed.");
    throw phaseError(
      error,
      "report_processing",
      result.error || "Afterlight could not generate the inspection report.",
      jobContext,
      jobId
    );
  }
  if (uploadDraft.storageKey && ["queued", "processing", "completed", "failed"].includes(result.status)) {
    window.localStorage.removeItem(uploadDraft.storageKey);
  }
  return result;
}
