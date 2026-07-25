const API_ORIGIN = "https://cp-check-submissions-dev-backend.onrender.com";
const REFRESH_URL = `${API_ORIGIN}/api/auth/refresh`;
const LOGOUT_URL = `${API_ORIGIN}/api/auth/logout`;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

let refreshPromise = null;
let installed = false;

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
  const payload = decodeToken(data.token);
  if (payload?.userId) localStorage.setItem("userId", payload.userId);
}

export function clearAuthentication() {
  ["token", "orgName", "organizationId", "orgType", "role", "userId", "loginTime"]
    .forEach((key) => localStorage.removeItem(key));
  window.dispatchEvent(new Event("auth-session-cleared"));
}

export async function refreshAccessToken(nativeFetch = window.fetch.bind(window)) {
  if (!refreshPromise) {
    refreshPromise = nativeFetch(REFRESH_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    }).then(async (response) => {
      if (!response.ok) throw new Error("Session expired.");
      const data = await response.json();
      storeAuthentication(data);
      return data.token;
    }).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function restoreSession() {
  const token = localStorage.getItem("token");
  if (token && !tokenNeedsRefresh(token, 0)) return true;
  try {
    await refreshAccessToken();
    return true;
  } catch (error) {
    clearAuthentication();
    return false;
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

async function isExpiredAuthResponse(response) {
  if (response.status === 401) return true;
  if (response.status !== 403) return false;
  try {
    const body = await response.clone().json();
    return /invalid token|session expired/i.test(body.message || body.error || "");
  } catch (error) {
    return false;
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
        clearAuthentication();
      }
    }
    if (token) originalHeaders.set("Authorization", `Bearer ${token}`);

    const requestInit = { ...init, headers: originalHeaders, credentials: "include" };
    let response = await nativeFetch(input, requestInit);
    if (await isExpiredAuthResponse(response)) {
      try {
        token = await refreshAccessToken(nativeFetch);
        originalHeaders.set("Authorization", `Bearer ${token}`);
        response = await nativeFetch(input, { ...requestInit, headers: originalHeaders });
      } catch (error) {
        clearAuthentication();
      }
    }
    return response;
  };
}
