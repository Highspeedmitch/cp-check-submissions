const LOCAL_FRONTEND_URL = "http://localhost:3000";

function normalizeFrontendOrigin(value) {
  const candidate = String(value || "").trim().replace(/\/+$/, "");
  if (!candidate) return null;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`Invalid frontend origin: ${candidate}`);
  }

  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== candidate) {
    throw new Error(`Frontend origin must be an HTTP(S) origin without a path: ${candidate}`);
  }

  return parsed.origin;
}

function getFrontendUrl(environment = process.env) {
  const configuredUrl = normalizeFrontendOrigin(environment.FRONTEND_URL);
  if (configuredUrl) return configuredUrl;

  if (environment.NODE_ENV === "production") {
    throw new Error("FRONTEND_URL is required in production.");
  }

  return LOCAL_FRONTEND_URL;
}

function getAllowedFrontendOrigins(environment = process.env) {
  const configuredOrigins = String(environment.FRONTEND_ORIGINS || "")
    .split(",")
    .map(normalizeFrontendOrigin)
    .filter(Boolean);
  const primaryOrigin = getFrontendUrl(environment);

  return [...new Set([primaryOrigin, ...configuredOrigins])];
}

function buildFrontendUrl(pathname, environment = process.env) {
  const path = String(pathname || "");
  return new URL(path.startsWith("/") ? path : `/${path}`, getFrontendUrl(environment)).toString();
}

module.exports = {
  LOCAL_FRONTEND_URL,
  normalizeFrontendOrigin,
  getFrontendUrl,
  getAllowedFrontendOrigins,
  buildFrontendUrl,
};
