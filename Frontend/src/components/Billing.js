import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "./ui/PageHeader";
import { NOTIFICATION_SECTIONS, useMarkNotificationsRead } from "../services/notificationCenter";

const API = "https://cp-check-submissions-dev-backend.onrender.com/api/billing";

function dollars(cents) {
  if (cents == null) return "Not set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function statusLabel(status) {
  if (status === "submitted") return "Awaiting Payment";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function Billing() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const isOversight = role === "admin" || role === "property_manager";
  const [invoices, setInvoices] = useState([]);
  const [status, setStatus] = useState("");
  const [amounts, setAmounts] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [properties, setProperties] = useState([]);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  useMarkNotificationsRead(NOTIFICATION_SECTIONS.billing);

  const loadInvoices = useCallback(async () => {
    try {
      const response = await fetch(`${API}${status ? `?status=${status}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load billing.");
      setInvoices(data);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [status, token]);

  useEffect(() => {
    loadInvoices();
    if (role === "admin") {
      fetch(`${API}/properties`, { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => response.json())
        .then((data) => Array.isArray(data) && setProperties(data.map((property) => ({
          ...property,
          defaultInspectionAmountDollars: property.defaultInspectionAmountCents == null
            ? ""
            : (property.defaultInspectionAmountCents / 100).toFixed(2),
        }))));
    }
    const timer = setInterval(loadInvoices, 30000);
    return () => clearInterval(timer);
  }, [loadInvoices, role, token]);

  function updateProperty(id, field, value) {
    setProperties(properties.map((property) =>
      property._id === id ? { ...property, [field]: value } : property
    ));
  }

  async function saveProperty(property) {
    const response = await fetch(`${API}/properties/${property._id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        ...property,
        defaultInspectionAmountCents: property.defaultInspectionAmountDollars === ""
          ? null
          : Math.round(Number(property.defaultInspectionAmountDollars) * 100),
      }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "Unable to save property billing.");
    setMessage(`${property.name} billing settings saved.`);
    setError("");
    await loadInvoices();
  }

  async function action(id, path, options = {}) {
    const response = await fetch(`${API}/${id}/${path}`, {
      method: options.method || "POST",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Billing action failed.");
      return null;
    }
    setError("");
    setMessage(path === "submit" ? "Invoice submitted successfully." : path === "mark-paid" ? "Invoice marked paid." : "");
    await loadInvoices();
    return data;
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

  function InvoiceActions({ invoice }) {
    return (
      <div className="beta-table-actions">
        {!isOversight && invoice.status === "unbilled" && (
          <>
            <button className="beta-button secondary compact" onClick={() => saveAmount(invoice)}>Save Amount</button>
            <button className="beta-button secondary compact" onClick={() => generate(invoice)}>Review PDF</button>
            {invoice.pdfUrl && <button className="beta-button compact" onClick={() => action(invoice._id, "submit")}>Submit to AP</button>}
          </>
        )}
        {invoice.pdfUrl && (
          <a className="beta-link-button" href={invoice.pdfUrl} target="_blank" rel="noreferrer">View PDF</a>
        )}
        {isOversight && invoice.status === "submitted" && (
          <button className="beta-button compact" onClick={() => action(invoice._id, "mark-paid")}>Mark Paid</button>
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
                      <input value={property.streetAddress || ""} onChange={(e) => updateProperty(property._id, "streetAddress", e.target.value)} />
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
                  <button className="beta-button compact" onClick={() => saveProperty(property)}>Save settings</button>
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
          <label className="beta-form-field">Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All invoices</option>
              <option value="unbilled">Unbilled</option>
              <option value="submitted">Awaiting payment</option>
              <option value="paid">Paid</option>
            </select>
          </label>
        </div>

        {error && <p className="beta-alert error">{error}</p>}
        {message && <p className="beta-alert success">{message}</p>}

        <section className="beta-panel beta-desktop-table">
          <table className="beta-data-table">
            <thead>
              <tr>
                <th>Property</th><th>Inspection</th>
                {isOversight && <th>Submitter</th>}
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
                    {!isOversight && invoice.status === "unbilled"
                      ? <input className="beta-amount-input" type="number" min="0" step="0.01"
                          value={amounts[invoice._id] ?? (invoice.amountCents ? invoice.amountCents / 100 : "")}
                          onChange={(e) => setAmounts({ ...amounts, [invoice._id]: e.target.value })} />
                      : <strong>{dollars(invoice.amountCents)}</strong>}
                  </td>
                  <td><span className={`beta-status ${invoice.status}`}>{statusLabel(invoice.status)}</span></td>
                  <td>{invoice.propertySnapshot.apMethod || "download"}</td>
                  <td><InvoiceActions invoice={invoice} /></td>
                </tr>
              ))}
              {!invoices.length && <tr><td colSpan="7">No invoices match this view.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="beta-mobile-list">
          {invoices.map((invoice) => (
            <article className="beta-invoice-card" key={invoice._id}>
              <div className="beta-card-header">
                <div>
                  <h3>{invoice.propertySnapshot.name}</h3>
                  <p>{invoice.propertySnapshot.propertyCode || "Property code needed"}</p>
                </div>
                <div className="beta-invoice-total">
                  <strong>{dollars(invoice.amountCents)}</strong>
                  <span className={`beta-status ${invoice.status}`}>{statusLabel(invoice.status)}</span>
                </div>
              </div>
              <dl className="beta-detail-list">
                <div><dt>Inspection date</dt><dd>{new Date(invoice.inspectionDate).toLocaleDateString()}</dd></div>
                <div><dt>AP method</dt><dd>{invoice.propertySnapshot.apMethod || "download"}</dd></div>
                {isOversight && <div><dt>Submitter</dt><dd>{invoice.submitterId?.username || invoice.submitterId?.email}</dd></div>}
              </dl>
              {!isOversight && invoice.status === "unbilled" && (
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
        </section>
      </main>
    </div>
  );
}
