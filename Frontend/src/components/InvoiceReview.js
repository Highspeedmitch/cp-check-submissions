import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../services/api";
import PageHeader from "./ui/PageHeader";
import ContextualHelpLink from "./help/ContextualHelpLink";

function dollars(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function statusLabel(invoice) {
  if (invoice.status === "submitted" && invoice.delivery?.status === "accepted") {
    return "AP email queued";
  }
  if (invoice.status === "submitted" && invoice.delivery?.status === "delivered") {
    return "Delivered to AP";
  }
  return invoice.status.replaceAll("_", " ");
}

export default function InvoiceReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get(`/api/billing/${id}/review`)
      .then(setInvoice)
      .catch((err) => setError(err.message));
  }, [id]);

  const afterlightServiceInvoice = invoice?.billingOwner === "afterlight_platform"
    || invoice?.fulfillmentSnapshot?.invoiceRouting === "afterlight_service_billing";

  async function decide(action) {
    if (busy) return;
    if (action === "decline" && !reason.trim()) {
      setError(afterlightServiceInvoice
        ? "Enter a reason so Afterlight billing knows what to revise."
        : "Enter a reason so the field operator knows what to revise.");
      return;
    }
    setBusy(action);
    setError("");
    try {
      const updated = await api.post(`/api/billing/${id}/${action}`,
        action === "decline" ? { reason: reason.trim() } : {});
      setInvoice((current) => ({
        ...updated,
        submitterId: updated.submitterId?.email ? updated.submitterId : current?.submitterId,
      }));
      setMessage(updated.warning || (action === "approve"
        ? "Invoice approved and sent to AP."
        : afterlightServiceInvoice
          ? "Invoice declined and returned to Afterlight billing."
          : "Invoice declined and returned to the field operator."));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const reviewable = invoice?.status === "pending_review";
  const retryable = invoice?.status === "failed";

  return (
    <div className="beta-page">
      <main className="beta-page-shell">
        <PageHeader
          onBack={() => navigate("/billing")}
          eyebrow="Property manager review"
          title="Invoice Review"
          subtitle={afterlightServiceInvoice
            ? "Review Afterlight's service invoice before sending it to accounts payable."
            : "Review the contractor invoice before sending it to accounts payable."}
          actions={<ContextualHelpLink slug="review-an-invoice" />}
        />

        {error && <p className="beta-alert error" role="alert">{error}</p>}
        {message && <p className={`beta-alert ${/queued/i.test(message) ? "notice" : "success"}`} role="status">{message}</p>}
        {!invoice && !error && <div className="beta-empty-state">Loading invoice…</div>}

        {invoice && (
          <section className="beta-panel">
            <div className="beta-section-heading">
              <div>
                <h2>{invoice.propertySnapshot.name}</h2>
                <p>Invoice {invoice.invoiceNumber}</p>
              </div>
              <strong className="beta-invoice-review-amount">{dollars(invoice.amountCents)}</strong>
            </div>
            <dl className="beta-detail-list">
              <div><dt>Property code</dt><dd>{invoice.propertySnapshot.propertyCode}</dd></div>
              <div><dt>Inspection date</dt><dd>{new Date(invoice.inspectionDate).toLocaleDateString()}</dd></div>
              <div><dt>{afterlightServiceInvoice ? "Inspection performed by" : "Submitted by"}</dt><dd>{invoice.submitterId?.username || invoice.submitterId?.email}</dd></div>
              {afterlightServiceInvoice && <div><dt>Billing owner</dt><dd>Afterlight</dd></div>}
              <div><dt>AP method</dt><dd>{invoice.propertySnapshot.apMethod || "download"}</dd></div>
              <div><dt>Status</dt><dd>{statusLabel(invoice)}</dd></div>
              {invoice.delivery?.providerMessageId && <div><dt>Delivery provider reference</dt><dd>{invoice.delivery.providerMessageId}</dd></div>}
            </dl>

            {invoice.pdfUrl && (
              <div className="beta-card-actions">
                <a className="beta-link-button" href={invoice.pdfUrl} target="_blank" rel="noreferrer">
                  View Invoice PDF
                </a>
              </div>
            )}

            {reviewable && (
              <label className="beta-form-field full">
                Decline reason
                <textarea
                  value={reason}
                  maxLength="1000"
                  placeholder="Only required when declining."
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
            )}

            {(reviewable || retryable) && (
              <div className="beta-card-actions">
                <button className="beta-button" disabled={Boolean(busy)}
                  onClick={() => decide("approve")}>
                  {busy === "approve" ? "Sending…" : retryable ? "Retry AP Delivery" : "Approve & Send to AP"}
                </button>
                {reviewable && (
                  <button className="beta-button danger" disabled={Boolean(busy)}
                    onClick={() => decide("decline")}>
                    {busy === "decline" ? "Declining…" : "Decline Invoice"}
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
