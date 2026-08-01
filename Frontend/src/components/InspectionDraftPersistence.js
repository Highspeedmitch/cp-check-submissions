import React, { useEffect, useRef, useState } from "react";
import {
  loadInspectionDraft,
  saveInspectionDraft,
} from "../services/inspectionDrafts";

function savedTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function InspectionDraftPersistence({
  draftKey,
  responses,
  photoGroups,
  metadata,
  onRestore,
  disabled = false,
}) {
  const [state, setState] = useState({ status: "loading", savedAt: "" });
  const hydratedKey = useRef("");
  const onRestoreRef = useRef(onRestore);
  const latestDraft = useRef(null);
  onRestoreRef.current = onRestore;
  latestDraft.current = { key: draftKey, responses, photoGroups, metadata };

  useEffect(() => {
    let active = true;
    hydratedKey.current = "";
    setState({ status: "loading", savedAt: "" });
    loadInspectionDraft(draftKey)
      .then((draft) => {
        if (!active) return;
        if (draft) {
          onRestoreRef.current?.(draft);
          setState({ status: "restored", savedAt: draft.savedAt });
        } else {
          setState({ status: "idle", savedAt: "" });
        }
        hydratedKey.current = draftKey;
      })
      .catch(() => {
        if (!active) return;
        hydratedKey.current = draftKey;
        setState({ status: "unavailable", savedAt: "" });
      });
    return () => { active = false; };
  }, [draftKey]);

  useEffect(() => {
    if (disabled || hydratedKey.current !== draftKey) return undefined;
    setState((current) => ({ ...current, status: "saving" }));
    const timer = window.setTimeout(() => {
      saveInspectionDraft({ key: draftKey, responses, photoGroups, metadata })
        .then((record) => setState({
          status: record ? "saved" : "idle",
          savedAt: record?.savedAt || "",
        }))
        .catch(() => setState((current) => ({ ...current, status: "unavailable" })));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [disabled, draftKey, metadata, photoGroups, responses]);

  useEffect(() => {
    const persistLatest = () => {
      if (hydratedKey.current === draftKey && !disabled && latestDraft.current) {
        saveInspectionDraft(latestDraft.current).catch(() => {});
      }
    };
    const persistWhenHidden = () => {
      if (document.visibilityState === "hidden") persistLatest();
    };
    window.addEventListener("pagehide", persistLatest);
    document.addEventListener("visibilitychange", persistWhenHidden);
    return () => {
      window.removeEventListener("pagehide", persistLatest);
      document.removeEventListener("visibilitychange", persistWhenHidden);
    };
  }, [disabled, draftKey]);

  if (["loading", "idle"].includes(state.status)) return null;
  const copy = {
    restored: `Draft recovered from ${savedTime(state.savedAt)}.`,
    saving: "Saving draft on this device…",
    saved: `Draft saved on this device at ${savedTime(state.savedAt)}.`,
    unavailable: "This browser could not save the draft. Keep this page open until submission completes.",
  }[state.status];
  return <p className={`inspection-draft-status ${state.status}`} role="status">{copy}</p>;
}
