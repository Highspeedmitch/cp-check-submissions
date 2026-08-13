import React, { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";

const STATUS_LABELS = {
  unbilled: "Draft",
  pending_review: "Awaiting customer review",
  declined: "Needs revision",
  approving: "Sending to AP",
  submitted: "AP delivery submitted",
  paid: "Paid",
  failed: "AP delivery failed",
  void: "Void",
};

function statusLabel(invoice) {
  if (invoice.status === "submitted" && invoice.delivery?.status === "accepted") {
    return "AP email queued";
  }
  if (invoice.status === "submitted" && invoice.delivery?.status === "delivered") {
    return "Delivered to AP";
  }
  return STATUS_LABELS[invoice.status] || invoice.status.replaceAll("_", " ");
}

function money(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function apDestination(invoice) {
  const property = invoice.propertySnapshot || {};
  if (property.apMethod === "email") return property.apEmail || "AP email not configured";
  if (property.apMethod === "portal") return property.apPortal || "AP portal not configured";
  return "Manual download";
}

function createResendRequestId() {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `invoice_resend_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

function resendAttemptLabel(status) {
  return ({
    sending: "sending",
    accepted: "accepted by the email provider",
    delayed: "delayed by the email provider",
    delivered: "delivered to the recipient mail server",
    partial_failure: "partially delivered",
    failed: "failed",
  })[status] || String(status || "completed").replaceAll("_", " ");
}

function ResendReviewDialog({ dialog, busy, onClose, onChange, onSubmit }) {
  if (!dialog) return null;
  const selected = new Set(dialog.recipientUserIds);
  return (
    <div className="beta-dialog-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <form className="beta-dialog platform-review-resend-dialog" role="dialog" aria-modal="true"
        aria-labelledby="review-resend-title" aria-describedby="review-resend-description"
        onSubmit={onSubmit}>
        <div className="beta-dialog-header">
          <div>
            <p className="beta-eyebrow">Customer review recovery</p>
            <h2 id="review-resend-title">Resend review email</h2>
          </div>
          <button type="button" className="beta-dialog-close" disabled={busy}
            onClick={onClose} aria-label="Close resend review dialog">&times;</button>
        </div>
        <p id="review-resend-description" className="beta-dialog-copy">
          Resend the existing inspection report and invoice for {dialog.invoice.propertySnapshot?.name || "this property"}. The invoice and approval state will not change.
        </p>

        {dialog.loading ? <div className="beta-empty-state">Loading assigned property managers...</div> : (
          <>
            <fieldset className="platform-review-resend-recipients">
              <legend>Recipients</legend>
              {dialog.recipients.length ? dialog.recipients.map((recipient) => (
                <label key={recipient._id}>
                  <input type="checkbox" checked={selected.has(recipient._id)} disabled={busy}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...selected, recipient._id]
                        : [...selected].filter((id) => id !== recipient._id);
                      onChange({ recipientUserIds: next });
                    }} />
                  <span><strong>{recipient.name}</strong><small>{recipient.email}</small></span>
                </label>
              )) : <p className="beta-dialog-error">No active property manager with an email address is currently assigned.</p>}
            </fieldset>
            <label className="beta-field">Reason for resending
              <textarea value={dialog.reason} maxLength={500} disabled={busy}
                placeholder="For example: Customer mail quarantine was cleared."
                onChange={(event) => onChange({ reason: event.target.value })} />
            </label>
            <p className="beta-dialog-note">
              Each selected manager will receive a fresh approval link. The email provider accepting a message does not guarantee that it avoids the recipient's quarantine or spam controls.
            </p>
            {dialog.lastAttempt?.completedAt && (
              <p className="beta-dialog-note">Last resend was {resendAttemptLabel(dialog.lastAttempt.status)} on {new Date(dialog.lastAttempt.completedAt).toLocaleString()}.</p>
            )}
          </>
        )}

        {dialog.error && <p className="beta-dialog-error" role="alert">{dialog.error}</p>}
        <div className="beta-dialog-actions">
          <button type="button" className="beta-button secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="beta-button" disabled={busy || dialog.loading
            || !dialog.recipientUserIds.length || !dialog.reason.trim()}>
            {busy ? "Resending..." : "Resend Email"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PlatformServiceBilling() {
  const [invoices, setInvoices] = useState([]);
  const [amounts, setAmounts] = useState({});
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resendDialog, setResendDialog] = useState(null);
  const [resendBusy, setResendBusy] = useState(false);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      const result = await api.get(`/api/billing/platform-service-invoices${query}`);
      setInvoices(result);
      setAmounts((current) => {
        const next = { ...current };
        result.forEach((invoice) => {
          if (next[invoice._id] === undefined) {
            next[invoice._id] = invoice.amountCents == null ? "" : (invoice.amountCents / 100).toFixed(2);
          }
        });
        return next;
      });
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  async function run(invoiceId, action, successMessage) {
    if (busy) return;
    setBusy(`${invoiceId}-${action}`);
    setError("");
    setMessage("");
    try {
      if (action === "amount") {
        const amountCents = Math.round(Number(amounts[invoiceId]) * 100);
        if (!Number.isInteger(amountCents) || amountCents <= 0) {
          throw new Error("Enter a valid customer invoice amount.");
        }
        await api.put(`/api/billing/platform-service-invoices/${invoiceId}/amount`, { amountCents });
      } else {
        await api.post(`/api/billing/platform-service-invoices/${invoiceId}/${action}`, {});
      }
      setMessage(successMessage);
      await loadInvoices();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function openResendDialog(invoice) {
    if (busy || resendBusy) return;
    setError("");
    setMessage("");
    setResendDialog({
      invoice,
      loading: true,
      recipients: [],
      recipientUserIds: [],
      reason: "",
      requestId: createResendRequestId(),
      lastAttempt: null,
      error: "",
    });
    try {
      const result = await api.get(
        `/api/billing/platform-service-invoices/${invoice._id}/review-recipients`
      );
      setResendDialog((current) => current?.invoice._id === invoice._id ? {
        ...current,
        loading: false,
        recipients: result.recipients || [],
        recipientUserIds: (result.recipients || []).map((recipient) => recipient._id),
        lastAttempt: result.lastAttempt || null,
      } : current);
    } catch (requestError) {
      setResendDialog((current) => current?.invoice._id === invoice._id ? {
        ...current,
        loading: false,
        error: requestError.message,
      } : current);
    }
  }

  async function resendReviewEmail(event) {
    event.preventDefault();
    if (!resendDialog || resendBusy) return;
    if (!resendDialog.recipientUserIds.length || !resendDialog.reason.trim()) return;
    setResendBusy(true);
    setResendDialog((current) => ({ ...current, error: "" }));
    try {
      const result = await api.post(
        `/api/billing/platform-service-invoices/${resendDialog.invoice._id}/resend-review`,
        {
          recipientUserIds: resendDialog.recipientUserIds,
          reason: resendDialog.reason.trim(),
          requestId: resendDialog.requestId,
        }
      );
      setResendDialog(null);
      setMessage(result.warning || result.message || "The review email was accepted by the email provider.");
      await loadInvoices();
    } catch (requestError) {
      setResendDialog((current) => ({ ...current, error: requestError.message }));
    } finally {
      setResendBusy(false);
    }
  }

  return (
    <div className="platform-service-billing">
      {error && <p className="beta-alert error" role="alert">{error}</p>}
      {message && <p className="beta-alert success" role="status">{message}</p>}

      <section className="beta-panel">
        <div className="beta-section-heading platform-billing-heading">
          <div>
            <p className="beta-eyebrow">Afterlight accounts receivable</p>
            <h2>Service Invoices</h2>
            <p>Prepare Afterlight charges, send them for customer review, and reconcile AP payment independently from contractor earnings.</p>
          </div>
          <label className="beta-form-field platform-billing-filter">Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All active invoices</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </section>

      {loading ? <div className="beta-empty-state">Loading service invoices...</div> : invoices.length ? (
        <div className="platform-service-invoice-list">
          {invoices.map((invoice) => {
            const editable = ["unbilled", "declined"].includes(invoice.status);
            const actionBusy = busy.startsWith(`${invoice._id}-`);
            return (
              <article className="beta-panel platform-service-invoice" key={invoice._id}>
                <div className="beta-card-header">
                  <div>
                    <p className="beta-eyebrow">{invoice.organizationId?.name || "Customer organization"}</p>
                    <h3>{invoice.propertySnapshot?.name || "Property inspection"}</h3>
                    <p>{new Date(invoice.inspectionDate).toLocaleDateString()} · Performed by {invoice.submitterId?.username || invoice.submitterId?.email || "resource"}</p>
                  </div>
                  <span className={`beta-status ${invoice.status === "paid" || ["delivered", "recorded"].includes(invoice.delivery?.status) ? "success" : invoice.status === "declined" || invoice.status === "failed" ? "declined" : "warning"}`}>
                    {statusLabel(invoice)}
                  </span>
                </div>

                <dl className="beta-detail-list">
                  <div><dt>Invoice</dt><dd>{invoice.invoiceNumber || "Not generated"}</dd></div>
                  <div><dt>Client amount</dt><dd>{invoice.amountCents == null ? "Not set" : money(invoice.amountCents)}</dd></div>
                  <div><dt>AP method</dt><dd>{invoice.propertySnapshot?.apMethod || "download"}</dd></div>
                  <div><dt>AP destination</dt><dd>{apDestination(invoice)}</dd></div>
                  {invoice.delivery?.providerMessageId && <div><dt>Delivery provider reference</dt><dd>{invoice.delivery.providerMessageId}</dd></div>}
                </dl>

                {invoice.status === "declined" && invoice.review?.declineReason && (
                  <p className="beta-alert error"><strong>Customer feedback:</strong> {invoice.review.declineReason}</p>
                )}
                {invoice.status === "failed" && (
                  <p className="beta-alert error">The customer approved this invoice, but AP delivery failed. Their property manager can retry delivery after the AP configuration is corrected.</p>
                )}
                {invoice.review?.emailError && invoice.status !== "failed" && (
                  <p className="beta-alert error"><strong>Billing attention:</strong> {invoice.review.emailError}</p>
                )}

                {editable && (
                  <div className="beta-form-grid platform-service-invoice-controls">
                    <label className="beta-form-field">Customer invoice amount
                      <input type="number" min="0.01" step="0.01" value={amounts[invoice._id] ?? ""}
                        onChange={(event) => setAmounts((current) => ({ ...current, [invoice._id]: event.target.value }))} />
                    </label>
                  </div>
                )}

                <div className="beta-card-actions">
                  {editable && <button type="button" className="beta-button secondary compact" disabled={actionBusy}
                    onClick={() => run(invoice._id, "amount", "Customer invoice amount saved.")}>Save Amount</button>}
                  {editable && invoice.amountCents > 0 && <button type="button" className="beta-button secondary compact" disabled={actionBusy}
                    onClick={() => run(invoice._id, "generate", "Afterlight invoice PDF generated.")}>{invoice.pdfUrl ? "Regenerate PDF" : "Generate PDF"}</button>}
                  {invoice.pdfUrl && <a className="beta-link-button compact" href={invoice.pdfUrl} target="_blank" rel="noreferrer">View PDF</a>}
                  {invoice.status === "unbilled" && invoice.pdfUrl && <button type="button" className="beta-button compact" disabled={actionBusy}
                    onClick={() => run(invoice._id, "submit", "Invoice sent for customer review.")}>Send for Customer Review</button>}
                  {invoice.status === "pending_review" && <button type="button" className="beta-button secondary compact" disabled={actionBusy || resendBusy}
                    onClick={() => openResendDialog(invoice)}>Resend Review Email</button>}
                  {invoice.status === "submitted" && <button type="button" className="beta-button compact" disabled={actionBusy}
                    onClick={() => window.confirm("Has Afterlight confirmed receipt of this customer payment?") && run(invoice._id, "mark-paid", "Customer invoice marked paid.")}>Mark Paid</button>}
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="beta-empty-state">No Afterlight service invoices match this view.</div>}

      <ResendReviewDialog
        dialog={resendDialog}
        busy={resendBusy}
        onClose={() => !resendBusy && setResendDialog(null)}
        onChange={(changes) => setResendDialog((current) => ({ ...current, ...changes }))}
        onSubmit={resendReviewEmail}
      />
    </div>
  );
}
