import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import PageHeader from "./ui/PageHeader";

const TEMPLATES = {
  users: [
    "email,role,property_names",
    "person@example.com,property_manager,Property One|Property Two",
  ].join("\n"),
  properties: [
    "name,property_code,physical_address,billing_address,region,latitude,longitude,inspection_recipient_emails",
    "Property One,P-001,100 Main Street,PO Box 100,Central,33.4484,-112.0740,operations@example.com|owner@example.com",
  ].join("\n"),
};

function downloadTemplate(type) {
  const blob = new Blob([TEMPLATES[type]], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "afterlight-" + type + "-onboarding-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function CapacitySummary({ preview }) {
  if (!preview) return null;
  const dimension = preview.type === "properties" ? preview.capacity.properties : preview.capacity.users;
  return (
    <div className={"beta-alert " + (preview.capacityError ? "error" : "notice")}>
      <strong>
        {dimension.unmetered
          ? preview.rowCount + " rows ready for an unmetered Managed Service organization"
          : dimension.allocated + " of " + dimension.limit + " currently allocated; " + preview.rowCount + " requested"}
      </strong>
      {preview.capacityError && <p>{preview.capacityError.error}</p>}
    </div>
  );
}

function CommitDialog({ type, busy, onClose, onCommit }) {
  const [passkey, setPasskey] = useState("");
  return (
    <div className="beta-dialog-overlay">
      <form className="beta-dialog" role="dialog" aria-modal="true"
        aria-labelledby="bulk-import-confirm-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (passkey.trim() && !busy) onCommit(passkey);
        }}>
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">Final verification</span>
            <h2 id="bulk-import-confirm-title">Complete {type} onboarding</h2>
          </div>
          <button type="button" className="beta-dialog-close" aria-label="Close import confirmation"
            onClick={onClose} disabled={busy}>×</button>
        </div>
        <p className="beta-dialog-copy">
          The import is all-or-nothing. If any record or licensed capacity changed after preview,
          nothing will be created and you will be asked to review it again.
        </p>
        <label className="beta-field" htmlFor="bulk-onboarding-passkey">
          <span>Administrative action passkey</span>
          <input id="bulk-onboarding-passkey" type="password" autoComplete="off"
            value={passkey} disabled={busy}
            onChange={(event) => setPasskey(event.target.value)} />
        </label>
        <div className="beta-dialog-actions">
          <button type="button" className="beta-button secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="beta-button" disabled={!passkey.trim() || busy}>
            {busy ? "Importing…" : "Complete import"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AssistanceRequestDialog({ type, suggestedRows, onClose, onSubmit }) {
  const [estimatedRows, setEstimatedRows] = useState(suggestedRows || "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reasonRef = useRef(null);
  const submittingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    reasonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !submittingRef.current) onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (submittingRef.current || reason.trim().length < 10) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        type,
        estimatedRows: estimatedRows === "" ? null : Number(estimatedRows),
        reason: reason.trim(),
      });
    } catch (requestError) {
      setError(requestError.message || "Unable to request onboarding assistance.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="beta-dialog-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !submittingRef.current) onClose();
    }}>
      <form className="beta-dialog" role="dialog" aria-modal="true"
        aria-labelledby="onboarding-assistance-title" onSubmit={submit}>
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">Coordinated onboarding</span>
            <h2 id="onboarding-assistance-title">Request onboarding assistance</h2>
          </div>
          <button type="button" className="beta-dialog-close" aria-label="Close assistance request"
            onClick={onClose} disabled={submitting}>×</button>
        </div>
        <p className="beta-dialog-copy">
          Ask Afterlight to help prepare or coordinate this {type} import. The CSV itself is not attached to this request.
        </p>
        <label className="beta-field" htmlFor="onboarding-assistance-rows">
          <span>Approximate number of records (optional)</span>
          <input id="onboarding-assistance-rows" type="number" min="1" max="10000" step="1"
            value={estimatedRows} disabled={submitting}
            onChange={(event) => { setEstimatedRows(event.target.value); setError(""); }} />
        </label>
        <label className="beta-field" htmlFor="onboarding-assistance-reason">
          <span>What assistance do you need?</span>
          <textarea ref={reasonRef} id="onboarding-assistance-reason" rows="4" minLength="10" maxLength="2000"
            value={reason} disabled={submitting} required
            placeholder="Describe the portfolio change, desired timing, and help needed. Do not include passwords or personal data."
            onChange={(event) => { setReason(event.target.value); setError(""); }} />
        </label>
        <p className="beta-dialog-note">
          This request does not reserve or expand licensed capacity. Every eventual import remains subject to the same capacity check and final passkey verification.
        </p>
        {error && <p className="beta-dialog-error" role="alert">{error}</p>}
        <div className="beta-dialog-actions">
          <button type="button" className="beta-button secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="beta-button" disabled={submitting || reason.trim().length < 10}>
            {submitting ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function BulkOnboarding() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [type, setType] = useState(() => (
    searchParams.get("type") === "properties" ? "properties" : "users"
  ));
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [assistanceOpen, setAssistanceOpen] = useState(false);

  function resetForType(nextType) {
    setType(nextType);
    setSearchParams({ type: nextType }, { replace: true });
    setCsv("");
    setFileName("");
    setPreview(null);
    setError("");
    setMessage("");
  }

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setMessage("");
    setPreview(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setCsv("");
      setFileName("");
      setError("Choose a CSV file.");
      return;
    }
    if (file.size > 512 * 1024) {
      setCsv("");
      setFileName("");
      setError("CSV files must be 512 KB or smaller.");
      return;
    }
    setCsv(await file.text());
    setFileName(file.name);
  }

  async function previewImport() {
    if (!csv || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setPreview(await api.post("/api/bulk-onboarding/preview", { type, csv }));
    } catch (requestError) {
      setPreview(requestError.data?.preview || null);
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function commitImport(passkey) {
    if (!preview?.canCommit || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const verification = await api.post("/api/organization-security/grants", {
        purpose: "bulk_onboarding",
        passkey,
      });
      const result = await api.post("/api/bulk-onboarding/commit", {
        type,
        csv,
        adminActionGrant: verification.grant,
      });
      setMessage(result.message);
      setConfirmOpen(false);
      setPreview(null);
      setCsv("");
      setFileName("");
    } catch (requestError) {
      setPreview(requestError.data?.preview || preview);
      setError(requestError.message);
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function requestAssistance(details) {
    const result = await api.post("/api/bulk-onboarding/assistance-requests", details);
    setMessage(result.message);
    setError("");
    setAssistanceOpen(false);
  }

  return (
    <div className="beta-page beta-bulk-onboarding-page">
      <main className="beta-page-shell">
        <PageHeader
          eyebrow="Organization administration"
          title="Bulk onboarding"
          subtitle="Validate and add users or properties from a CSV without bypassing licensed capacity."
          onBack={() => navigate("/dashboard")}
        />

        {error && <p className="beta-alert error" role="alert">{error}</p>}
        {message && <p className="beta-alert success" role="status">{message}</p>}

        <section className="beta-panel">
          <div className="beta-section-heading">
            <div>
              <h2>1. Choose what to import</h2>
              <p>User imports create invitations. Property imports create organization property records.</p>
            </div>
          </div>
          <div className="beta-bulk-type-picker" role="group" aria-label="Import type">
            <button type="button" className={"beta-button " + (type === "users" ? "" : "secondary")}
              onClick={() => resetForType("users")}>Users</button>
            <button type="button" className={"beta-button " + (type === "properties" ? "" : "secondary")}
              onClick={() => resetForType("properties")}>Properties</button>
          </div>
          <div className="beta-card-actions">
            <button type="button" className="beta-button secondary" onClick={() => downloadTemplate(type)}>
              Download {type} template
            </button>
          </div>
        </section>

        <section className="beta-panel">
          <div className="beta-section-heading">
            <div>
              <h2>2. Upload and preview</h2>
              <p>Up to 250 rows and 512 KB. Separate multiple property names or recipient emails with a vertical bar.</p>
            </div>
          </div>
          <label className="beta-form-field beta-bulk-file-input">
            CSV file
            <input type="file" accept=".csv,text/csv" onChange={chooseFile} />
          </label>
          {fileName && <p className="beta-field-help">Selected: {fileName}</p>}
          <div className="beta-card-actions">
            <button type="button" className="beta-button" disabled={!csv || busy} onClick={previewImport}>
              {busy ? "Checking…" : "Preview import"}
            </button>
          </div>
        </section>

        {preview && (
          <section className="beta-panel">
            <div className="beta-section-heading">
              <div>
                <h2>3. Review {preview.rowCount} rows</h2>
                <p>{preview.validRowCount} rows valid. Every row must pass before the import can continue.</p>
              </div>
            </div>
            <CapacitySummary preview={preview} />
            {preview.capacityError && (
              <div className="beta-card-actions">
                <button type="button" className="beta-button secondary" onClick={() => navigate("/service-delivery")}>
                  Review license options
                </button>
              </div>
            )}
            <div className="beta-table-wrap">
              <table className="beta-data-table beta-bulk-preview-table">
                <thead>
                  <tr><th>Row</th><th>Record</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>
                        <strong>{row.data.email || row.data.name || "Incomplete row"}</strong>
                        <small>{row.data.role || row.data.propertyCode || ""}</small>
                      </td>
                      <td>
                        {row.errors.length
                          ? <ul className="beta-bulk-row-errors">{row.errors.map((item) => <li key={item}>{item}</li>)}</ul>
                          : <span className="beta-status success">Ready</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="beta-card-actions">
              <button type="button" className="beta-button" disabled={!preview.canCommit || busy}
                onClick={() => setConfirmOpen(true)}>
                Continue to verification
              </button>
            </div>
          </section>
        )}

        <section className="beta-panel beta-bulk-assistance">
          <div className="beta-section-heading">
            <div>
              <h2>Need help with a larger onboarding event?</h2>
              <p>Request help with CSV preparation or a coordinated import. Afterlight receives the request details, not your CSV.</p>
            </div>
            <button type="button" className="beta-button secondary" onClick={() => setAssistanceOpen(true)}>
              Request Onboarding Assistance
            </button>
          </div>
          <small>Assistance does not bypass your organization’s license limits or final administrative passkey verification.</small>
        </section>
      </main>
      {confirmOpen && (
        <CommitDialog type={type} busy={busy} onClose={() => setConfirmOpen(false)} onCommit={commitImport} />
      )}
      {assistanceOpen && (
        <AssistanceRequestDialog type={type} suggestedRows={preview?.rowCount}
          onClose={() => setAssistanceOpen(false)} onSubmit={requestAssistance} />
      )}
    </div>
  );
}

export { AssistanceRequestDialog, TEMPLATES, downloadTemplate };
