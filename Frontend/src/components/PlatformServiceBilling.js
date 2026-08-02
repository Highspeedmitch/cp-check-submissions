import React, { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";

const STATUS_LABELS = {
  unbilled: "Draft",
  pending_review: "Awaiting customer review",
  declined: "Needs revision",
  approving: "Sending to AP",
  submitted: "Sent to AP",
  paid: "Paid",
  failed: "AP delivery failed",
  void: "Void",
};

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

export default function PlatformServiceBilling() {
  const [invoices, setInvoices] = useState([]);
  const [amounts, setAmounts] = useState({});
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
                  <span className={`beta-status ${invoice.status === "paid" || invoice.status === "submitted" ? "success" : invoice.status === "declined" || invoice.status === "failed" ? "declined" : "warning"}`}>
                    {STATUS_LABELS[invoice.status] || invoice.status.replaceAll("_", " ")}
                  </span>
                </div>

                <dl className="beta-detail-list">
                  <div><dt>Invoice</dt><dd>{invoice.invoiceNumber || "Not generated"}</dd></div>
                  <div><dt>Client amount</dt><dd>{invoice.amountCents == null ? "Not set" : money(invoice.amountCents)}</dd></div>
                  <div><dt>AP method</dt><dd>{invoice.propertySnapshot?.apMethod || "download"}</dd></div>
                  <div><dt>AP destination</dt><dd>{apDestination(invoice)}</dd></div>
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
                  {invoice.status === "submitted" && <button type="button" className="beta-button compact" disabled={actionBusy}
                    onClick={() => window.confirm("Has Afterlight confirmed receipt of this customer payment?") && run(invoice._id, "mark-paid", "Customer invoice marked paid.")}>Mark Paid</button>}
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="beta-empty-state">No Afterlight service invoices match this view.</div>}
    </div>
  );
}
