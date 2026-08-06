const Sentry = require("@sentry/node");

let initialized = false;

function boundedSampleRate(value, fallback = 0.05) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

function initializeBackendMonitoring(env = process.env) {
  const dsn = String(env.SENTRY_DSN || "").trim();
  if (!dsn || initialized) return Boolean(dsn && initialized);
  Sentry.init({
    dsn,
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV || "development",
    release: env.SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    tracesSampleRate: boundedSampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
  });
  initialized = true;
  return true;
}

function setupBackendErrorHandler(app) {
  if (initialized) Sentry.setupExpressErrorHandler(app);
}

function captureBackendException(error, context = {}) {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context.tags) scope.setTags(context.tags);
    if (context.extra) scope.setExtras(context.extra);
    Sentry.captureException(error);
  });
}

function backendMonitoringEnabled() {
  return initialized;
}

module.exports = {
  backendMonitoringEnabled,
  boundedSampleRate,
  captureBackendException,
  initializeBackendMonitoring,
  setupBackendErrorHandler,
};
