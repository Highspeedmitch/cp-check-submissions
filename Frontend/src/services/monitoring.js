import React from "react";
import * as Sentry from "@sentry/react";

let initialized = false;

function boundedSampleRate(value, fallback = 0.05) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function initializeFrontendMonitoring(env = process.env) {
  const dsn = String(env.REACT_APP_SENTRY_DSN || "").trim();
  if (!dsn || initialized) return Boolean(dsn && initialized);
  Sentry.init({
    dsn,
    environment: env.REACT_APP_SENTRY_ENVIRONMENT || env.NODE_ENV || "development",
    release: env.REACT_APP_SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    tracesSampleRate: boundedSampleRate(env.REACT_APP_SENTRY_TRACES_SAMPLE_RATE),
  });
  initialized = true;
  return true;
}

export function captureFrontendException(error, context = {}) {
  if (!initialized) return false;
  Sentry.withScope((scope) => {
    if (context.tags) scope.setTags(context.tags);
    if (context.extra) scope.setExtras(context.extra);
    if (context.level) scope.setLevel(context.level);
    Sentry.captureException(error);
  });
  return true;
}

export function MonitoringBoundary({ children }) {
  if (!initialized) return children;
  return (
    <Sentry.ErrorBoundary fallback={({ resetError }) => (
      <div className="beta-page">
        <main className="beta-page-shell">
          <div className="beta-empty-state" role="alert">
            <h1>Something went wrong</h1>
            <p>The problem was reported. You can retry this screen or return to the dashboard.</p>
            <div className="beta-card-actions">
              <button type="button" className="beta-button" onClick={resetError}>Try again</button>
              <a className="beta-button secondary" href="/dashboard">Dashboard</a>
            </div>
          </div>
        </main>
      </div>
    )}>
      {children}
    </Sentry.ErrorBoundary>
  );
}

export { boundedSampleRate };
