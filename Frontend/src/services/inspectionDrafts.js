const DATABASE_NAME = "afterlight-field-work";
const DATABASE_VERSION = 1;
const STORE_NAME = "inspection-drafts";

let databasePromise = null;
let persistenceRequested = false;

function openDatabase() {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Durable browser storage is unavailable."));
  }
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open draft storage."));
    request.onblocked = () => reject(new Error("Draft storage is blocked by another app window."));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

async function runTransaction(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error || new Error("Draft storage request failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Draft storage was interrupted."));
    transaction.onerror = () => reject(transaction.error || new Error("Draft storage transaction failed."));
    transaction.oncomplete = () => resolve(result);
  });
}

function fileRecord(file) {
  return {
    name: file.name || "inspection-photo.jpg",
    type: file.type || "application/octet-stream",
    lastModified: file.lastModified || Date.now(),
    blob: file instanceof Blob ? file.slice(0, file.size, file.type) : file,
  };
}

function restoredFile(record) {
  if (!record?.blob) return null;
  return new File([record.blob], record.name, {
    type: record.type || record.blob.type,
    lastModified: record.lastModified,
  });
}

export function inspectionDraftKey(formType, property) {
  const organizationId = localStorage.getItem("organizationId") || "unknown-organization";
  const userId = localStorage.getItem("userId") || "unknown-user";
  return [organizationId, userId, formType, property].map((value) => String(value || "")).join("::");
}

export function inspectionDraftHasContent(responses = {}, photoGroups = {}) {
  const hasResponse = Object.values(responses || {}).some((value) => {
    if (value && typeof value === "object") return inspectionDraftHasContent(value, {});
    return String(value || "").trim().length > 0;
  });
  return hasResponse || Object.values(photoGroups || {}).some((files) => files?.length > 0);
}

export function serializeInspectionDraft({ key, responses, photoGroups, metadata = {} }) {
  return {
    key,
    responses,
    metadata,
    savedAt: new Date().toISOString(),
    photoGroups: Object.fromEntries(Object.entries(photoGroups || {}).map(([field, files]) => [
      field,
      Array.from(files || []).map(fileRecord),
    ])),
  };
}

export function hydrateInspectionDraft(record) {
  if (!record) return null;
  return {
    ...record,
    photoGroups: Object.fromEntries(Object.entries(record.photoGroups || {}).map(([field, files]) => [
      field,
      files.map(restoredFile).filter(Boolean),
    ])),
  };
}

async function requestPersistentStorage() {
  if (persistenceRequested) return;
  persistenceRequested = true;
  try {
    if (navigator.storage?.persisted && navigator.storage?.persist) {
      const persistent = await navigator.storage.persisted();
      if (!persistent) await navigator.storage.persist();
    }
  } catch (_error) {
    // Drafts remain available under the browser's ordinary storage policy.
  }
}

export async function saveInspectionDraft(draft) {
  if (!inspectionDraftHasContent(draft.responses, draft.photoGroups)) {
    await deleteInspectionDraft(draft.key);
    return null;
  }
  await requestPersistentStorage();
  const record = serializeInspectionDraft(draft);
  await runTransaction("readwrite", (store) => store.put(record));
  return record;
}

export async function loadInspectionDraft(key) {
  const record = await runTransaction("readonly", (store) => store.get(key));
  return hydrateInspectionDraft(record);
}

export async function deleteInspectionDraft(key) {
  if (!key) return;
  await runTransaction("readwrite", (store) => store.delete(key));
}
