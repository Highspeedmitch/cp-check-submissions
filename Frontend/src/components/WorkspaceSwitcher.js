import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { storeAuthentication } from "../services/session";

function storedWorkspaces() {
  try {
    const workspaces = JSON.parse(localStorage.getItem("availableWorkspaces") || "[]");
    if (Array.isArray(workspaces) && workspaces.length) return workspaces;
  } catch (_error) {
    // Older sessions fall back to their current workspace until the next refresh.
  }
  return [localStorage.getItem("accountScope") || "organization"];
}

export default function WorkspaceSwitcher({ className = "beta-back-link" }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = localStorage.getItem("accountScope") || "organization";
  const workspaces = useMemo(storedWorkspaces, []);
  if (!workspaces.includes("organization") || !workspaces.includes("afterlight_resource")) {
    return null;
  }

  const target = current === "afterlight_resource" ? "organization" : "afterlight_resource";
  const label = target === "afterlight_resource" ? "Resource Portal" : "Organization Workspace";

  async function switchWorkspace() {
    setBusy(true);
    setError("");
    try {
      const authentication = await api.post("/api/auth/workspace", { accountScope: target });
      storeAuthentication(authentication);
      navigate(target === "afterlight_resource" ? "/resource" : "/dashboard", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="beta-workspace-switcher">
      <button type="button" className={className} disabled={busy} onClick={switchWorkspace}>
        {busy ? "Switching..." : label}
      </button>
      {error && <small className="error" role="alert">{error}</small>}
    </span>
  );
}
