import { API_ORIGIN } from "./api";
const REFRESH_URL = `${API_ORIGIN}/api/auth/refresh`;
const LOGOUT_URL = `${API_ORIGIN}/api/auth/logout`;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const SESSION_STATUS_EVENT = "auth-session-status";
const REFRESH_LOCK_NAME = "afterlight-session-refresh";

let refreshPromise = null;
let installed = false;
let lifecycleInstalled = false;

export class SessionRefreshError extends Error {
  constructor(message, { status = 0, terminal = false } = {}) {
    super(message);
    this.name = "SessionRefreshError";
    this.status = status;
    this.terminal = terminal;
  }
}

function dispatchSessionStatus(status, message = "") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SESSION_STATUS_EVENT, {
    detail: { status, message },
  }));
}

function decodeToken(token) {
  try {
    return JSON.parse(window.atob(token.split(".")[1]));
  } catch (error) {
    return null;
  }
}

export function tokenNeedsRefresh(token, bufferMs = REFRESH_BUFFER_MS) {
  const payload = token && decodeToken(token);
  return !payload?.exp || payload.exp * 1000 <= Date.now() + bufferMs;
}

export function storeAuthentication(data) {
  localStorage.setItem("token", data.token);
  localStorage.setItem("orgName", data.orgName || "Your Organization");
  localStorage.setItem("organizationId", data.organizationId);
  localStorage.setItem("orgType", data.orgType);
  localStorage.setItem("role", data.role || "user");
  if (data.engagementType) localStorage.setItem("engagementType", data.engagementType);
  else localStorage.removeItem("engagementType");
  localStorage.setItem("accountScope", data.accountScope || "organization");
  localStorage.setItem(
    "availableWorkspaces",
    JSON.stringify(data.availableWorkspaces || [data.accountScope || "organization"])
  );
  if (data.platformRole) localStorage.setItem("platformRole", data.platformRole);
  else localStorage.removeItem("platformRole");
  localStorage.setItem("assumedOrganization", data.assumedOrganization ? "true" : "false");
  if (data.platformSessionId) localStorage.setItem("platformSessionId", data.platformSessionId);
  else localStorage.removeItem("platformSessionId");
  const payload = decodeToken(data.token);
  if (payload?.userId) localStorage.setItem("userId", payload.userId);
  dispatchSessionStatus("active");
  window.dispatchEvent(new Event("auth-session-changed"));
}

export function clearAuthentication() {
  ["token", "orgName", "organizationId", "orgType", "role", "userId", "loginTime",
    "platformRole", "assumedOrganization", "platformSessionId", "accountScope", "availableWorkspaces", "resourceType", "billingAccess", "engagementType"]
    .forEach((key) => localStorage.removeItem(key));
  window.dispatchEvent(new Event("auth-session-cleared"));
}

async function requestAccessToken(nativeFetch) {
  let response;
  try {
    response = await nativeFetch(REFRESH_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    throw new SessionRefreshError("The session service is temporarily unreachable.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SessionRefreshError(
      data.message || data.error || "The session could not be refreshed.",
      {
        status: response.status,
        terminal: response.status === 401 || response.status === 403,
      }
    );
  }
  if (!data.token) {
    throw new SessionRefreshError("The session service returned an invalid response.");
  }
  storeAuthentication(data);
  return data.token;
}

async function requestWithCrossTabLock(nativeFetch, force, staleToken) {
  const locks = typeof navigator !== "undefined" ? navigator.locks : null;
  if (!locks?.request) return requestAccessToken(nativeFetch);
  return locks.request(REFRESH_LOCK_NAME, async () => {
    const currentToken = localStorage.getItem("token");
    if (staleToken && currentToken && currentToken !== staleToken) return currentToken;
    if (!force && currentToken && !tokenNeedsRefresh(currentToken)) return currentToken;
    return requestAccessToken(nativeFetch);
  });
}

function handleRefreshFailure(error) {
  if (error?.terminal) {
    clearAuthentication();
    return false;
  }
  dispatchSessionStatus(
    typeof navigator !== "undefined" && navigator.onLine === false
      ? "offline"
      : "unavailable",
    error?.message || "The session could not be refreshed."
  );
  return null;
}

export async function refreshAccessToken(
  nativeFetch = window.fetch.bind(window),
  { force = false, staleToken = "" } = {}
) {
  if (!refreshPromise) {
    refreshPromise = requestWithCrossTabLock(nativeFetch, force, staleToken).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function restoreSession(nativeFetch = window.fetch.bind(window)) {
  const token = localStorage.getItem("token");
  if (token && !tokenNeedsRefresh(token, 0)) return true;
  try {
    await refreshAccessToken(nativeFetch, { force: true, staleToken: token || "" });
    return true;
  } catch (error) {
    const result = handleRefreshFailure(error);
    return result === false ? false : Boolean(token);
  }
}

export async function logoutSession() {
  try {
    await window.fetch(LOGOUT_URL, { method: "POST", credentials: "include" });
  } catch (error) {
    // Local logout still completes if the server is temporarily unreachable.
  } finally {
    clearAuthentication();
  }
}

export async function isExpiredAuthResponse(response) {
  if (response.status !== 401 && response.status !== 403) return false;
  try {
    const body = await response.clone().json();
    if (body.code === "SESSION_REFRESH_UNAVAILABLE") return false;
    if (response.status === 401) return true;
    return /invalid token|session expired/i.test(body.message || body.error || "");
  } catch (error) {
    return response.status === 401;
  }
}

export function installAuthenticatedFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const isBackend = url.startsWith(API_ORIGIN);
    const isSessionEndpoint = url === REFRESH_URL || url === LOGOUT_URL || url.endsWith("/api/login");
    const originalHeaders = new Headers(
      init.headers || (typeof input !== "string" ? input.headers : undefined)
    );
    const usesBearer = /^Bearer /i.test(originalHeaders.get("Authorization") || "");

    if (!isBackend || isSessionEndpoint || !usesBearer) {
      return nativeFetch(input, isBackend ? { ...init, credentials: "include" } : init);
    }

    let token = localStorage.getItem("token");
    if (tokenNeedsRefresh(token)) {
      try {
        token = await refreshAccessToken(nativeFetch);
      } catch (error) {
        handleRefreshFailure(error);
        token = localStorage.getItem("token");
      }
    }
    if (token) originalHeaders.set("Authorization", `Bearer ${token}`);

    const requestInit = { ...init, headers: originalHeaders, credentials: "include" };
    let response = await nativeFetch(input, requestInit);
    if (await isExpiredAuthResponse(response)) {
      try {
        token = await refreshAccessToken(nativeFetch, { force: true, staleToken: token });
        originalHeaders.set("Authorization", `Bearer ${token}`);
        response = await nativeFetch(input, { ...requestInit, headers: originalHeaders });
      } catch (error) {
        handleRefreshFailure(error);
      }
    }
    return response;
  };
}

export function installSessionLifecycle() {
  if (lifecycleInstalled || typeof window === "undefined") return;
  lifecycleInstalled = true;

  const refreshIfNeeded = async () => {
    const token = localStorage.getItem("token");
    if (!token || !tokenNeedsRefresh(token)) return;
    try {
      await refreshAccessToken();
    } catch (error) {
      handleRefreshFailure(error);
    }
  };
  const handleVisibility = () => {
    if (document.visibilityState === "visible") refreshIfNeeded();
  };
  const handleOnline = () => {
    dispatchSessionStatus("active");
    refreshIfNeeded();
  };
  const handleOffline = () => dispatchSessionStatus("offline");
  const handleStorage = (event) => {
    if (event.key !== "token") return;
    if (event.newValue) dispatchSessionStatus("active");
    else window.dispatchEvent(new Event("auth-session-cleared"));
  };

  window.addEventListener("pageshow", refreshIfNeeded);
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  window.addEventListener("storage", handleStorage);
  document.addEventListener("visibilitychange", handleVisibility);
  window.setInterval(() => {
    if (document.visibilityState === "visible") refreshIfNeeded();
  }, 60 * 1000);
}

export { SESSION_STATUS_EVENT };
