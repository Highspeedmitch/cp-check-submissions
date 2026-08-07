import React, { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

function dollars(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function approvalToken() {
  const fragment = window.location.hash.replace(/^#/, "");
  return new URLSearchParams(fragment).get("token") || "";
}

function completedMessage(invoice) {
  if (invoice?.decision === "approved") {
    return `This invoice was approved${invoice.approvedBy ? ` by ${invoice.approvedBy}` : ""}.`;
  }
  if (invoice?.status && invoice.status !== "pending_review") {
    return "This invoice is no longer awaiting approval.";
  }
  return "This approval link has already been used.";
}

export default function InvoiceEmailApproval() {
  const token = useMemo(approvalToken, []);
  const [invoice, setInvoice] = useState(null);
  const [canApprove, setCanApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setError("This approval link is invalid or incomplete.");
      return;
    }
    api.post("/api/invoice-email-actions/resolve", { token }, { auth: false })
      .then((result) => {
        setInvoice(result.invoice);
        setCanApprove(Boolean(result.canApprove));
        if (!result.canApprove) setMessage(completedMessage(result.invoice));
      })
      .catch((requestError) => setError(requestError.message));
  }, [token]);

  async function approve() {
    if (busy || !canApprove) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.post(
        "/api/invoice-email-actions/approve",
        { token },
        { auth: false }
      );
      setInvoice(result.invoice);
      setCanApprove(false);
      setMessage(result.message || "Invoice approved and sent to accounts payable.");
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    } catch (requestError) {
      if (requestError.data?.approvalRecorded && requestError.data?.invoice) {
        setInvoice(requestError.data.invoice);
        setCanApprove(false);
      }
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="beta-page invoice-email-approval-page">
      <main className="invoice-email-approval-shell">
        <header className="invoice-email-approval-brand">
          <img src="/apple-touch-icon.png" alt="" />
          <div><strong>Afterlight</strong><span>Secure invoice approval</span></div>
        </header>

        {error && <p className="beta-alert error" role="alert">{error}</p>}
        {message && <p className="beta-alert success" role="status">{message}</p>}
        {!invoice && !error && <div className="beta-empty-state" role="status">Loading invoice details...</div>}

        {invoice && (
          <section className="beta-panel invoice-email-approval-card">
            <span className="beta-eyebrow">Property manager approval</span>
            <div className="beta-section-heading">
              <div>
                <h1>Approve invoice</h1>
                <p>{invoice.propertyName}</p>
              </div>
              <strong className="beta-invoice-review-amount">{dollars(invoice.amountCents)}</strong>
            </div>
            <dl className="beta-detail-list">
              <div><dt>Invoice</dt><dd>{invoice.invoiceNumber}</dd></div>
              <div><dt>Property code</dt><dd>{invoice.propertyCode}</dd></div>
              <div><dt>Inspection date</dt><dd>{new Date(invoice.inspectionDate).toLocaleDateString()}</dd></div>
              <div><dt>AP destination</dt><dd>{invoice.apDestination}</dd></div>
            </dl>

            {canApprove && (
              <>
                <p className="invoice-email-approval-disclosure">
                  Confirming records your approval and immediately queues the approved invoice for delivery to the configured accounts-payable email. This action cannot be undone from this link.
                </p>
                <button type="button" className="beta-button invoice-email-approval-button" disabled={busy} onClick={approve}>
                  {busy ? "Approving and sending..." : "Approve & Send to AP"}
                </button>
              </>
            )}
          </section>
        )}
        <p className="invoice-email-approval-help">
          To decline or request changes, use the "Review or decline in Afterlight" link in the email.
        </p>
      </main>
    </div>
  );
}
