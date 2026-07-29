import React, { useState } from "react";
import { api } from "../services/api";
import { storeAuthentication } from "../services/session";

export default function AssumedAccessBanner() {
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState("");
  if (localStorage.getItem("assumedOrganization") !== "true") return null;

  async function exitOrganization() {
    if (exiting) return;
    setExiting(true);
    setError("");
    try {
      storeAuthentication(await api.post("/api/platform/exit", {}));
      window.location.assign("/platform");
    } catch (requestError) {
      setError(requestError.message);
      setExiting(false);
    }
  }

  return (
    <div className="beta-alert warning" role="status">
      <strong>Platform administrator viewing {localStorage.getItem("orgName")}</strong>
      {" "}
      <button className="beta-text-button" type="button" onClick={exitOrganization} disabled={exiting}>
        {exiting ? "Exiting..." : "Exit organization"}
      </button>
      {error && <span> {error}</span>}
    </div>
  );
}
