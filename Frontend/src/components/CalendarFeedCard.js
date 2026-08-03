import React, { useEffect, useState } from "react";
import { api, apiUrl } from "../services/api";
import ContextualHelpLink from "./help/ContextualHelpLink";

function dateTime(value) {
  return value ? new Date(value).toLocaleString() : "Not refreshed yet";
}

export default function CalendarFeedCard() {
  const [status, setStatus] = useState(null);
  const [subscriptionUrl, setSubscriptionUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.get("/api/calendar-feed")
      .then((result) => { if (active) setStatus(result); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, []);

  async function generate(rotate = false) {
    if (rotate && !window.confirm(
      "Regenerate this private link? The current link will stop refreshing."
    )) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = rotate
        ? await api.post("/api/calendar-feed/rotate", {})
        : await api.post("/api/calendar-feed", {});
      setStatus({
        connected: true,
        generatedAt: result.generatedAt,
        lastAccessedAt: null,
      });
      setSubscriptionUrl(apiUrl(result.subscriptionPath));
      setMessage("Private calendar link created. Copy it now; Afterlight will not display it again.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(subscriptionUrl);
      setMessage("Private calendar link copied.");
    } catch {
      setError("Copy was blocked. Select and copy the link manually.");
    }
  }

  async function disconnect() {
    if (!window.confirm(
      "Disconnect this feed? Remove the subscribed Afterlight calendar from your calendar app as well."
    )) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.delete("/api/calendar-feed");
      setStatus({ connected: false, generatedAt: null, lastAccessedAt: null });
      setSubscriptionUrl("");
      setMessage("Calendar feed disconnected.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="beta-panel beta-calendar-feed" aria-labelledby="calendar-feed-title">
      <div className="beta-section-heading">
        <div>
          <h2 id="calendar-feed-title">Connect My Calendar</h2>
          <p>Subscribe to your own authorized Afterlight assignments in Apple, Google, or Outlook Calendar.</p>
        </div>
        <ContextualHelpLink slug="connect-my-calendar" />
      </div>

      {status === null && !error && <p>Loading calendar connection...</p>}
      {error && <p className="beta-alert error" role="alert">{error}</p>}
      {message && <p className="beta-alert success" role="status">{message}</p>}

      {status && !status.connected && (
        <div className="beta-calendar-feed-summary">
          <div>
            <strong>Not connected</strong>
            <span>Create a private subscription link, then add it by URL in your calendar app.</span>
          </div>
          <button type="button" className="beta-button" disabled={busy} onClick={() => generate(false)}>
            {busy ? "Creating..." : "Create Private Link"}
          </button>
        </div>
      )}

      {status?.connected && (
        <>
          <div className="beta-calendar-feed-summary">
            <div>
              <span className="beta-status success">Connected</span>
              <span>Last calendar refresh: {dateTime(status.lastAccessedAt)}</span>
            </div>
            <div className="beta-card-actions">
              <button type="button" className="beta-button secondary" disabled={busy} onClick={() => generate(true)}>Regenerate Link</button>
              <button type="button" className="beta-button danger" disabled={busy} onClick={disconnect}>Disconnect</button>
            </div>
          </div>
          {subscriptionUrl && (
            <div className="beta-calendar-feed-secret">
              <label htmlFor="calendar-feed-url">Private subscription URL</label>
              <div>
                <input id="calendar-feed-url" value={subscriptionUrl} readOnly onFocus={(event) => event.target.select()} />
                <button type="button" className="beta-button" onClick={copyLink}>Copy Link</button>
              </div>
              <small>Anyone with this link can read the calendar items it contains. Do not forward or publish it.</small>
            </div>
          )}
        </>
      )}
    </section>
  );
}
