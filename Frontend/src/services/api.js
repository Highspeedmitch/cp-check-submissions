export const API_ORIGIN = (
  process.env.REACT_APP_API_ORIGIN
  || "https://cp-check-submissions-dev-backend.onrender.com"
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiRequest(path, options = {}) {
  const {
    body,
    headers: suppliedHeaders,
    auth = true,
    ...requestOptions
  } = options;
  const headers = new Headers(suppliedHeaders || {});
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const isStringBody = typeof body === "string";

  if (auth) {
    const token = localStorage.getItem("token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  if (body != null && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(buildUrl(path), {
    ...requestOptions,
    credentials: "include",
    headers,
    body: body == null || isFormData || isStringBody ? body : JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") || "";
  let data = null;
  if (response.status !== 204) {
    if (contentType.includes("application/json")) {
      data = await response.json().catch(() => null);
    } else {
      data = await response.text().catch(() => "");
    }
  }

  if (!response.ok) {
    const serverMessage = typeof data === "object"
      ? data?.error || data?.message
      : data;
    throw new ApiError(
      serverMessage || `Request failed with status ${response.status}.`,
      response.status,
      data
    );
  }

  return data;
}

export const api = {
  get: (path, options) => apiRequest(path, { ...options, method: "GET" }),
  post: (path, body, options) => apiRequest(path, { ...options, method: "POST", body }),
  put: (path, body, options) => apiRequest(path, { ...options, method: "PUT", body }),
  patch: (path, body, options) => apiRequest(path, { ...options, method: "PATCH", body }),
  delete: (path, options) => apiRequest(path, { ...options, method: "DELETE" }),
};
