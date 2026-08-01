import React, { useEffect, useState } from "react";
import { SESSION_STATUS_EVENT } from "../services/session";

export default function SessionStatusBanner() {
  const [status, setStatus] = useState(() => (
    typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "active"
  ));

  useEffect(() => {
    const handleStatus = (event) => setStatus(event.detail?.status || "active");
    const handleOnline = () => setStatus("active");
    const handleOffline = () => setStatus("offline");
    window.addEventListener(SESSION_STATUS_EVENT, handleStatus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener(SESSION_STATUS_EVENT, handleStatus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (status === "active") return null;
  return (
    <aside className="session-status-banner" role="status">
      {status === "offline"
        ? "You are offline. Afterlight will keep your session and save supported work on this device."
        : "Connection interrupted. Your session is being preserved while Afterlight reconnects."}
    </aside>
  );
}
