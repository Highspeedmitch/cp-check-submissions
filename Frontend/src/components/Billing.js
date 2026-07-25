import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API = "https://cp-check-submissions-dev-backend.onrender.com/api/billing";

function dollars(cents) {
  if (cents == null) return "Not set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .format(cents / 100);
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
  const [properties, setProperties] = useState([]);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

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

  return (
    <div className="dashboard-container">
      <main className="main-content" style={{ width: "100%" }}>
        <header className="dashboard-header">
          <div className="subtext">{isOversight ? "Managed property billing ledger" : "My contractor invoices"}</div>
          <h1>Billing</h1>
          <button className="logout-btn" onClick={() => navigate("/dashboard")}>Back to Dashboard</button>
        </header>

        <div style={{ padding: "20px" }}>
          {role === "admin" && (
            <details style={{ marginBottom: "20px" }}>
              <summary><strong>Configure Commercial Property Billing</strong></summary>
              {properties.map((property) => (
                <div key={property._id} style={{ padding: "12px", borderBottom: "1px solid #ccc" }}>
                  <strong>{property.name}</strong>{" "}
                  <input
                    placeholder="Property code"
                    value={property.propertyCode || ""}
                    onChange={(e) => updateProperty(property._id, "propertyCode", e.target.value)}
                  />
                  <input
                    placeholder="Billing address"
                    value={property.streetAddress || ""}
                    onChange={(e) => updateProperty(property._id, "streetAddress", e.target.value)}
                  />
                  <input
                    type="number" min="0" step="0.01" placeholder="Suggested amount ($)"
                    value={property.defaultInspectionAmountDollars ?? ""}
                    onChange={(e) => updateProperty(property._id, "defaultInspectionAmountDollars", e.target.value)}
                  />
                  <select
                    value={property.apMethod || "download"}
                    onChange={(e) => updateProperty(property._id, "apMethod", e.target.value)}
                  >
                    <option value="download">Manual download</option>
                    <option value="email">Email</option>
                    <option value="portal">AP portal</option>
                  </select>
                  <input
                    placeholder={property.apMethod === "email" ? "AP email" : "AP portal"}
                    value={property.apMethod === "email" ? property.apEmail || "" : property.apPortal || ""}
                    onChange={(e) => updateProperty(
                      property._id,
                      property.apMethod === "email" ? "apEmail" : "apPortal",
                      e.target.value
                    )}
                  />
                  <button onClick={() => saveProperty(property)}>Save</button>
                </div>
              ))}
            </details>
          )}
          <label>
            Status:{" "}
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="unbilled">Unbilled</option>
              <option value="submitted">Awaiting payment</option>
              <option value="paid">Paid</option>
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          <div style={{ overflowX: "auto", marginTop: "20px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>Property</th><th>Code</th><th>Inspection</th>
                  {isOversight && <th>Submitter</th>}
                  <th>Amount</th><th>Status</th><th>AP Method</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice._id}>
                    <td>{invoice.propertySnapshot.name}<br/><small>{invoice.propertySnapshot.address}</small></td>
                    <td>{invoice.propertySnapshot.propertyCode || "Needs setup"}</td>
                    <td>{new Date(invoice.inspectionDate).toLocaleDateString()}</td>
                    {isOversight && <td>{invoice.submitterId?.username || invoice.submitterId?.email}</td>}
                    <td>
                      {!isOversight && invoice.status === "unbilled" ? (
                        <input
                          type="number" min="0" step="0.01"
                          value={amounts[invoice._id] ?? (invoice.amountCents ? invoice.amountCents / 100 : "")}
                          onChange={(e) => setAmounts({ ...amounts, [invoice._id]: e.target.value })}
                          style={{ width: "90px" }}
                        />
                      ) : dollars(invoice.amountCents)}
                    </td>
                    <td>{invoice.status === "submitted" ? "Awaiting payment" : invoice.status}</td>
                    <td>{invoice.propertySnapshot.apMethod || "download"}</td>
                    <td>
                      {!isOversight && invoice.status === "unbilled" && (
                        <>
                          <button onClick={() => saveAmount(invoice)}>Save Amount</button>
                          <button onClick={() => generate(invoice)}>Review PDF</button>
                          {invoice.pdfUrl && (
                            <button onClick={() => action(invoice._id, "submit")}>Submit to AP</button>
                          )}
                        </>
                      )}
                      {invoice.pdfUrl && <a href={invoice.pdfUrl} target="_blank" rel="noreferrer"> View PDF</a>}
                      {isOversight && invoice.status === "submitted" && (
                        <button onClick={() => action(invoice._id, "mark-paid")}>Mark Paid</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!invoices.length && <tr><td colSpan="8">No invoices match this view.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
