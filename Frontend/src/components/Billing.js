import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "./ui/PageHeader";
import { NOTIFICATION_SECTIONS, useMarkNotificationsRead } from "../services/notificationCenter";
import { api } from "../services/api";
import ContextualHelpLink from "./help/ContextualHelpLink";

function dollars(cents) {
  if (cents == null) return "Not set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function statusLabel(invoice) {
  const labels = {
    unbilled: "Draft",
    pending_review: "Awaiting PM Review",
    declined: "Needs Revision",
    approving: "Sending to AP",
    submitted: "Sent to AP",
    failed: "AP Delivery Failed",
    paid: "Paid",
    void: "Void",
  };
  if (invoice.status === "submitted" && invoice.delivery?.status === "accepted") {
    return "AP Email Queued";
  }
  if (invoice.status === "submitted" && invoice.delivery?.status === "delivered") {
    return "Delivered to AP";
  }
  return labels[invoice.status] || invoice.status;
}

function invoiceRoutingLabel(invoice) {
  const routing = invoice.fulfillmentSnapshot?.invoiceRouting;
  if (routing === "afterlight_service_billing") return "Afterlight service";
  if (routing === "customer_accounts_payable") return "Customer contractor";
  return "Standard billing";
}

function isAfterlightServiceInvoice(invoice) {
  return invoice.billingOwner === "afterlight_platform"
    || invoice.fulfillmentSnapshot?.invoiceRouting === "afterlight_service_billing";
}

export default function Billing() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const isPropertyManager = role === "property_manager";
  const isOversight = role === "admin" || role === "property_manager";
  const [invoices, setInvoices] = useState([]);
  const [status, setStatus] = useState("");
  const [view, setView] = useState("active");
  const [submitterFilter, setSubmitterFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [filterOptions, setFilterOptions] = useState({ users: [], properties: [] });
  const [amounts, setAmounts] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyActions, setBusyActions] = useState({});
  const helpSlug = !isOversight && invoices.some((invoice) => invoice.status === "declined")
    ? "revise-a-declined-invoice"
    : isPropertyManager
      ? "review-an-invoice"
      : "prepare-and-send-an-invoice";
  useMarkNotificationsRead(NOTIFICATION_SECTIONS.billing);

  const setBusy = (key, value) => setBusyActions((current) => ({ ...current, [key]: value }));
  const selectView = (nextView) => {
    setView(nextView);
    setStatus("");
  };

  const loadInvoices = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const params = new URLSearchParams({ archive: view });
      if (status) params.set("status", status);
      if (isOversight && submitterFilter) params.set("submitterId", submitterFilter);
      if (isOversight && propertyFilter) params.set("propertyId", propertyFilter);
      const data = await api.get(`/api/billing?${params.toString()}`);
      setInvoices(data);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [isOversight, propertyFilter, status, submitterFilter, view]);

  useEffect(() => {
    loadInvoices(true);
    const timer = setInterval(loadInvoices, 30000);
    return () => clearInterval(timer);
  }, [loadInvoices]);

  useEffect(() => {
    if (role === "admin") {
      api.get("/api/billing/properties")
        .then((data) => Array.isArray(data) && setProperties(data.map((property) => ({
          ...property,
          defaultInspectionAmountDollars: property.defaultInspectionAmountCents == null
            ? ""
            : (property.defaultInspectionAmountCents / 100).toFixed(2),
        }))))
        .catch((err) => setError(err.message));
    }
    if (isOversight) {
      api.get("/api/billing/filter-options")
        .then((data) => setFilterOptions({
          users: Array.isArray(data?.users) ? data.users : [],
          properties: Array.isArray(data?.properties) ? data.properties : [],
        }))
        .catch((err) => setError(err.message));
    }
  }, [isOversight, role]);

  function updateProperty(id, field, value) {
    setProperties(properties.map((property) =>
      property._id === id ? { ...property, [field]: value } : property
    ));
  }

  async function saveProperty(property) {
    const actionKey = `property:${property._id}`;
    if (busyActions[actionKey]) return;
    setBusy(actionKey, true);
    setMessage("");
    try {
      await api.put(`/api/billing/properties/${property._id}`, {
        ...property,
        defaultInspectionAmountCents: property.defaultInspectionAmountDollars === ""
          ? null
          : Math.round(Number(property.defaultInspectionAmountDollars) * 100),
      });
      setMessage(`${property.name} billing settings saved.`);
      setError("");
      await loadInvoices();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(actionKey, false);
    }
  }

  async function action(id, path, options = {}) {
    const actionKey = `${id}:${path}`;
    if (busyActions[actionKey]) return null;
    setBusy(actionKey, true);
    setMessage("");
    try {
      const data = await apiRequestForMethod(
        options.method || "POST",
        `/api/billing/${id}/${path}`,
        options.body
      );
      setError("");
      setMessage(
        data?.warning || (path === "submit" ? "Invoice sent to the property manager for review."
          : path === "approve" ? "Invoice approved and sent to AP."
          : path === "decline" ? "Invoice declined and returned to the submitter."
          : path === "mark-paid" ? "Invoice marked paid."
          : path === "amount" ? "Invoice amount saved."
          : path === "archive" ? "Invoice archived."
          : path === "restore" ? "Invoice restored."
          : "")
      );
      await loadInvoices();
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(actionKey, false);
    }
  }

  function apiRequestForMethod(method, path, body) {
    if (method === "PUT") return api.put(path, body);
    return api.post(path, body);
  }

  async function saveAmount(invoice) {
    const value = amounts[invoice._id] ?? (invoice.amountCents ? invoice.amountCents / 100 : "");
    await action(invoice._id, "amount", {
      method: "PUT",
      body: { amountCents: Math.round(Number(value) * 100) },
    });
  }

  async function generate(invoice) {
    const data = await action(invoice._id, "generate");
    if (data?.pdfUrl) window.open(data.pdfUrl, "_blank", "noopener,noreferrer");
  }

  async function decline(invoice) {
    const reason = window.prompt(isAfterlightServiceInvoice(invoice)
      ? "Why is this invoice being declined? Afterlight billing will use this to revise it."
      : "Why is this invoice being declined? The submitter will use this to revise it.");
    if (reason === null) return;
    if (!reason.trim()) {
      setError("A decline reason is required.");
      return;
    }
    await action(invoice._id, "decline", { body: { reason: reason.trim() } });
  }

  function InvoiceActions({ invoice }) {
    const isBusy = (path) => Boolean(busyActions[`${invoice._id}:${path}`]);
    return (
      <div className="beta-table-actions">
        {!isOversight && ["unbilled", "declined"].includes(invoice.status) && (
          <>
            <button className="beta-button secondary compact" disabled={isBusy("amount")} onClick={() => saveAmount(invoice)}>
              {isBusy("amount") ? "Saving…" : "Save Amount"}
            </button>
            <button className="beta-button secondary compact" disabled={isBusy("generate")} onClick={() => generate(invoice)}>
              {isBusy("generate") ? "Generating…" : "Review PDF"}
            </button>
            {invoice.status === "unbilled" && invoice.pdfUrl && <button className="beta-button compact" disabled={isBusy("submit")} onClick={() => action(invoice._id, "submit")}>
              {isBusy("submit") ? "Sending…" : "Send for Approval"}
            </button>}
          </>
        )}
        {invoice.pdfUrl && (
          <a className="beta-link-button" href={invoice.pdfUrl} target="_blank" rel="noreferrer">View PDF</a>
        )}
        {isPropertyManager && invoice.status === "pending_review" && (
          <>
            <button className="beta-button compact" disabled={isBusy("approve")} onClick={() => action(invoice._id, "approve")}>
              {isBusy("approve") ? "Sending…" : "Approve & Send to AP"}
            </button>
            <button className="beta-button danger compact" disabled={isBusy("decline")} onClick={() => decline(invoice)}>
              {isBusy("decline") ? "Declining…" : "Decline"}
            </button>
          </>
        )}
        {isPropertyManager && invoice.status === "failed" && (
          <button className="beta-button compact" disabled={isBusy("approve")} onClick={() => action(invoice._id, "approve")}>
            {isBusy("approve") ? "Retrying…" : "Retry AP Delivery"}
          </button>
        )}
        {isOversight && !isAfterlightServiceInvoice(invoice) && invoice.status === "submitted" && (
          <button className="beta-button compact" disabled={isBusy("mark-paid")} onClick={() => action(invoice._id, "mark-paid")}>
            {isBusy("mark-paid") ? "Updating…" : "Mark Paid"}
          </button>
        )}
        {view === "active" && invoice.status === "paid" && (
          <button className="beta-button secondary compact" disabled={isBusy("archive")}
            onClick={() => action(invoice._id, "archive", { method: "PUT" })}>
            {isBusy("archive") ? "Archivingâ€¦" : "Archive Invoice"}
          </button>
        )}
        {view === "archived" && (
          <button className="beta-button secondary compact" disabled={isBusy("restore")}
            onClick={() => action(invoice._id, "restore", { method: "PUT" })}>
            {isBusy("restore") ? "Restoringâ€¦" : "Restore Invoice"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="beta-page">
      <main className="beta-page-shell">
        <PageHeader
          onBack={() => navigate("/dashboard")}
          title="Billing"
          subtitle={isOversight ? "Managed property billing ledger" : "My contractor invoices"}
          actions={<ContextualHelpLink slug={helpSlug} />}
        />

        {role === "admin" && (
          <details className="beta-panel beta-settings-panel">
            <summary>
              <span>
                <strong>Commercial property billing settings</strong>
                <small>Property codes, suggested amounts, and AP destinations</small>
              </span>
            </summary>
            <div className="beta-settings-list">
              {properties.map((property) => (
                <section className="beta-settings-card" key={property._id}>
                  <h3>{property.name}</h3>
                  <div className="beta-form-grid">
                    <label className="beta-form-field">Property code
                      <input value={property.propertyCode || ""} onChange={(e) => updateProperty(property._id, "propertyCode", e.target.value)} />
                    </label>
                    <label className="beta-form-field">Billing address
                      <input value={property.billingAddress || ""} onChange={(e) => updateProperty(property._id, "billingAddress", e.target.value)} />
                    </label>
                    <label className="beta-form-field">Suggested amount
                      <input type="number" min="0" step="0.01" value={property.defaultInspectionAmountDollars ?? ""}
                        onChange={(e) => updateProperty(property._id, "defaultInspectionAmountDollars", e.target.value)} />
                    </label>
                    <label className="beta-form-field">AP method
                      <select value={property.apMethod || "download"} onChange={(e) => updateProperty(property._id, "apMethod", e.target.value)}>
                        <option value="download">Manual download</option>
                        <option value="email">Email</option>
                        <option value="portal">AP portal</option>
                      </select>
                    </label>
                    <label className="beta-form-field full">{property.apMethod === "email" ? "AP email" : "AP portal"}
                      <input value={property.apMethod === "email" ? property.apEmail || "" : property.apPortal || ""}
                        onChange={(e) => updateProperty(property._id, property.apMethod === "email" ? "apEmail" : "apPortal", e.target.value)} />
                    </label>
                  </div>
                  <button className="beta-button compact" disabled={busyActions[`property:${property._id}`]} onClick={() => saveProperty(property)}>
                    {busyActions[`property:${property._id}`] ? "Saving…" : "Save settings"}
                  </button>
                </section>
              ))}
            </div>
          </details>
        )}

        <div className="beta-toolbar">
          <div>
            <h2>Invoices</h2>
            <p>{invoices.length} {invoices.length === 1 ? "invoice" : "invoices"} in this view</p>
          </div>
        </div>
        <div className="beta-tabs" aria-label="Invoice view">
          <button className={view === "active" ? "active" : ""} onClick={() => selectView("active")}>
            All
          </button>
          <button className={view === "archived" ? "active" : ""} onClick={() => selectView("archived")}>
            Archived
          </button>
        </div>
        <div className="beta-toolbar beta-filter-toolbar">
          {view === "active" && (
            <label className="beta-form-field">Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="unbilled">Draft</option>
                <option value="pending_review">Awaiting PM review</option>
                <option value="declined">Needs revision</option>
                <option value="submitted">AP delivery submitted</option>
                <option value="failed">AP delivery failed</option>
                <option value="paid">Paid</option>
              </select>
            </label>
          )}
          {isOversight && (
            <>
              <label className="beta-form-field">Submitted by
                <select value={submitterFilter} onChange={(e) => setSubmitterFilter(e.target.value)}>
                  <option value="">All users</option>
                  {filterOptions.users.map((user) => (
                    <option key={user._id} value={user._id}>{user.username || user.email}</option>
                  ))}
                </select>
              </label>
              <label className="beta-form-field">Property
                <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
                  <option value="">All properties</option>
                  {filterOptions.properties.map((property) => (
                    <option key={property._id} value={property._id}>{property.name}</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>

        {error && <p className="beta-alert error">{error}</p>}
        {message && <p className={`beta-alert ${/queued/i.test(message) ? "notice" : "success"}`}>{message}</p>}
        {loading && <div className="beta-empty-state">Loading invoices…</div>}

        {!loading && <section className="beta-panel beta-desktop-table">
          <table className="beta-data-table">
            <thead>
              <tr>
                <th>Property</th><th>Inspection</th>
                {isOversight && <th>Submitter / performer</th>}
                <th>Amount</th><th>Status</th><th>AP Method</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice._id}>
                  <td><strong>{invoice.propertySnapshot.name}</strong><br/><small>{invoice.propertySnapshot.propertyCode || "Needs setup"}</small></td>
                  <td>{new Date(invoice.inspectionDate).toLocaleDateString()}</td>
                  {isOversight && <td>{invoice.submitterId?.username || invoice.submitterId?.email}</td>}
                  <td>
                    {!isOversight && ["unbilled", "declined"].includes(invoice.status)
                      ? <input className="beta-amount-input" type="number" min="0" step="0.01"
                          value={amounts[invoice._id] ?? (invoice.amountCents ? invoice.amountCents / 100 : "")}
                          onChange={(e) => setAmounts({ ...amounts, [invoice._id]: e.target.value })} />
                      : <strong>{dollars(invoice.amountCents)}</strong>}
                  </td>
                  <td>
                    <span className={`beta-status ${invoice.status}`}>{statusLabel(invoice)}</span>
                    {invoice.review?.declineReason && <><br/><small>{invoice.review.declineReason}</small></>}
                    {invoice.delivery?.error && <><br/><small>{invoice.delivery.error}</small></>}
                    {invoice.delivery?.providerMessageId && <><br/><small>Provider ref: {invoice.delivery.providerMessageId}</small></>}
                  </td>
                  <td>{invoice.propertySnapshot.apMethod || "download"}<br/><small>{invoiceRoutingLabel(invoice)}</small></td>
                  <td><InvoiceActions invoice={invoice} /></td>
                </tr>
              ))}
              {!invoices.length && <tr><td colSpan="7">No invoices match this view.</td></tr>}
            </tbody>
          </table>
        </section>}

        {!loading && <section className="beta-mobile-list">
          {invoices.map((invoice) => (
            <article className="beta-invoice-card" key={invoice._id}>
              <div className="beta-card-header">
                <div>
                  <h3>{invoice.propertySnapshot.name}</h3>
                  <p>{invoice.propertySnapshot.propertyCode || "Property code needed"}</p>
                </div>
                <div className="beta-invoice-total">
                  <strong>{dollars(invoice.amountCents)}</strong>
                  <span className={`beta-status ${invoice.status}`}>{statusLabel(invoice)}</span>
                </div>
              </div>
              <dl className="beta-detail-list">
                <div><dt>Inspection date</dt><dd>{new Date(invoice.inspectionDate).toLocaleDateString()}</dd></div>
                <div><dt>AP method</dt><dd>{invoice.propertySnapshot.apMethod || "download"}</dd></div>
                <div><dt>Billing route</dt><dd>{invoiceRoutingLabel(invoice)}</dd></div>
                {isOversight && <div><dt>{isAfterlightServiceInvoice(invoice) ? "Inspection performed by" : "Submitter"}</dt><dd>{invoice.submitterId?.username || invoice.submitterId?.email}</dd></div>}
                {invoice.review?.declineReason && <div><dt>Decline reason</dt><dd>{invoice.review.declineReason}</dd></div>}
                {invoice.delivery?.error && <div><dt>Delivery error</dt><dd>{invoice.delivery.error}</dd></div>}
                {invoice.delivery?.providerMessageId && <div><dt>Delivery provider reference</dt><dd>{invoice.delivery.providerMessageId}</dd></div>}
                {invoice.archivedAt && <div><dt>Archived</dt><dd>{new Date(invoice.archivedAt).toLocaleDateString()}</dd></div>}
              </dl>
              {!isOversight && ["unbilled", "declined"].includes(invoice.status) && (
                <label className="beta-form-field">Invoice amount
                  <input type="number" min="0" step="0.01"
                    value={amounts[invoice._id] ?? (invoice.amountCents ? invoice.amountCents / 100 : "")}
                    onChange={(e) => setAmounts({ ...amounts, [invoice._id]: e.target.value })} />
                </label>
              )}
              <InvoiceActions invoice={invoice} />
            </article>
          ))}
          {!invoices.length && <div className="beta-empty-state">No invoices match this view.</div>}
        </section>}
      </main>
    </div>
  );
}
