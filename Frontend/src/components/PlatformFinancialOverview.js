import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

const CATEGORY_LABELS = {
  aws: "AWS",
  ai: "AI services",
  hosting: "Hosting",
  software: "Software",
  payroll: "Payroll",
  other: "Other",
};

const SOURCE_LABELS = {
  customer_employee: "Customer employee",
  customer_contractor: "Customer contractor",
  afterlight_staff: "Afterlight staff",
  afterlight_contractor: "Afterlight contractor",
};

function currentMonth() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function money(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format((cents || 0) / 100);
}

function exactMoney(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function dateLabel(value) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function emptyCostForm() {
  return {
    name: "",
    amount: "",
    category: "other",
    recurrence: "one_time",
    classification: "estimated",
  };
}

export default function PlatformFinancialOverview() {
  const [month, setMonth] = useState(currentMonth);
  const [overview, setOverview] = useState(null);
  const [costForm, setCostForm] = useState(emptyCostForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get(`/api/platform-finance/overview?month=${encodeURIComponent(month)}`);
      setOverview(result);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const metrics = useMemo(() => {
    if (!overview) return [];
    const { summary } = overview;
    return [
      ["Projected revenue", money(summary.projectedRevenueCents)],
      ["Earned revenue", money(summary.earnedRevenueCents)],
      ["Projected payouts", money(summary.projectedPayoutCents)],
      ["Earned payouts", money(summary.earnedPayoutCents)],
      ["Operating costs", money(summary.projectedOperatingCostCents)],
      ["Projected net", money(summary.projectedNetCents)],
      ["Earned net", money(summary.earnedNetCents)],
      ["Outstanding A/R", money(summary.outstandingReceivableCents)],
    ];
  }, [overview]);

  async function addCost(event) {
    event.preventDefault();
    if (busy) return;
    const amountCents = Math.round(Number(costForm.amount) * 100);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      setError("Enter a positive operating cost amount.");
      return;
    }
    setBusy("add-cost");
    setError("");
    setMessage("");
    try {
      await api.post("/api/platform-finance/costs", {
        name: costForm.name,
        amountCents,
        category: costForm.category,
        startMonth: month,
        recurrence: costForm.recurrence,
        classification: costForm.classification,
      });
      setCostForm(emptyCostForm());
      setMessage("Operating cost added.");
      await loadOverview();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function updateCost(cost, changes, successMessage) {
    if (busy) return;
    setBusy(`cost-${cost._id}`);
    setError("");
    setMessage("");
    try {
      await api.put(`/api/platform-finance/costs/${cost._id}`, changes);
      setMessage(successMessage);
      await loadOverview();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function removeCost(cost) {
    const prompt = cost.recurrence === "monthly"
      ? `Stop ${cost.name} for ${month} and future months?`
      : `Remove ${cost.name} from the financial overview?`;
    if (busy || !window.confirm(prompt)) return;
    setBusy(`cost-${cost._id}`);
    setError("");
    setMessage("");
    try {
      await api.delete(`/api/platform-finance/costs/${cost._id}?month=${encodeURIComponent(month)}`);
      setMessage(cost.recurrence === "monthly" ? "Recurring operating cost ended." : "Operating cost removed.");
      await loadOverview();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="platform-financial-overview">
      {error && <p className="beta-alert error" role="alert">{error}</p>}
      {message && <p className="beta-alert success" role="status">{message}</p>}

      <section className="beta-panel platform-finance-heading-panel">
        <div className="beta-section-heading platform-finance-heading">
          <div>
            <p className="beta-eyebrow">Management finance</p>
            <h2>Monthly Financial Overview</h2>
            <p>Forecast Afterlight service revenue, resource payouts, and operating costs from work scheduled in the selected month.</p>
          </div>
          <label className="beta-form-field platform-finance-month">Reporting month
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
        </div>
      </section>

      {loading && !overview ? <div className="beta-empty-state">Loading financial overview...</div> : overview && (
        <>
          <section className="platform-metric-board platform-finance-metric-board" aria-label="Monthly financial summary">
            {metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </section>

          <section className="beta-panel platform-finance-coverage">
            <div>
              <span>Properties with work</span>
              <strong>{overview.summary.propertyCount.toLocaleString()}</strong>
            </div>
            <div>
              <span>Afterlight scheduled</span>
              <strong>{overview.summary.scheduledAfterlightCount.toLocaleString()}</strong>
            </div>
            <div>
              <span>Afterlight completed</span>
              <strong>{overview.summary.completedAfterlightCount.toLocaleString()}</strong>
            </div>
            <div>
              <span>Customer-resource assignments</span>
              <strong>{overview.summary.internalAssignmentCount.toLocaleString()}</strong>
            </div>
          </section>

          {(overview.summary.missingCustomerRateCount > 0 || overview.summary.missingPayoutRateCount > 0) && (
            <p className="beta-alert notice platform-finance-warning" role="status">
              {overview.summary.missingCustomerRateCount > 0
                ? `${overview.summary.missingCustomerRateCount} Afterlight assignment${overview.summary.missingCustomerRateCount === 1 ? " is" : "s are"} missing a customer rate. `
                : ""}
              {overview.summary.missingPayoutRateCount > 0
                ? `${overview.summary.missingPayoutRateCount} contractor assignment${overview.summary.missingPayoutRateCount === 1 ? " is" : "s are"} missing a payout rate.`
                : ""}
            </p>
          )}

          <section className="beta-panel platform-finance-cost-panel">
            <div className="beta-section-heading">
              <div>
                <p className="beta-eyebrow">Operating expenses</p>
                <h2>Monthly Costs</h2>
                <p>Actual costs affect the earned result. Both estimates and actuals are included in the projected result.</p>
              </div>
            </div>
            <form className="platform-finance-cost-form" onSubmit={addCost}>
              <label className="beta-form-field">Cost name
                <input required maxLength="120" placeholder="Render hosting" value={costForm.name}
                  onChange={(event) => setCostForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="beta-form-field">Amount
                <input required type="number" min="0.01" step="0.01" placeholder="0.00" value={costForm.amount}
                  onChange={(event) => setCostForm((current) => ({ ...current, amount: event.target.value }))} />
              </label>
              <label className="beta-form-field">Category
                <select value={costForm.category}
                  onChange={(event) => setCostForm((current) => ({ ...current, category: event.target.value }))}>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="beta-form-field">Timing
                <select value={costForm.recurrence}
                  onChange={(event) => setCostForm((current) => ({ ...current, recurrence: event.target.value }))}>
                  <option value="one_time">This month only</option>
                  <option value="monthly">Monthly from this month</option>
                </select>
              </label>
              <label className="beta-form-field">Status
                <select value={costForm.classification}
                  onChange={(event) => setCostForm((current) => ({ ...current, classification: event.target.value }))}>
                  <option value="estimated">Estimated</option>
                  <option value="actual">Actual</option>
                </select>
              </label>
              <button type="submit" className="beta-button compact" disabled={busy === "add-cost"}>
                {busy === "add-cost" ? "Adding..." : "Add Cost"}
              </button>
            </form>

            {overview.costs.length ? (
              <div className="beta-table-wrap platform-finance-table-wrap">
                <table className="beta-data-table platform-finance-cost-table">
                  <thead><tr><th>Cost</th><th>Category</th><th>Amount</th><th>Timing</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {overview.costs.map((cost) => {
                      const costBusy = busy === `cost-${cost._id}`;
                      return (
                        <tr key={cost._id}>
                          <td data-label="Cost"><strong>{cost.name}</strong></td>
                          <td data-label="Category">{CATEGORY_LABELS[cost.category] || "Other"}</td>
                          <td data-label="Amount">{exactMoney(cost.amountCents)}</td>
                          <td data-label="Timing">{cost.recurrence === "monthly" ? `Monthly from ${cost.startMonth}` : cost.startMonth}</td>
                          <td data-label="Status"><span className={`beta-status ${cost.classification === "actual" ? "success" : "warning"}`}>{cost.classification}</span></td>
                          <td data-label="Actions"><div className="beta-table-actions">
                            <button type="button" className="beta-button secondary compact" disabled={costBusy}
                              onClick={() => updateCost(
                                cost,
                                { classification: cost.classification === "actual" ? "estimated" : "actual" },
                                cost.classification === "actual" ? "Cost marked estimated." : "Cost marked actual."
                              )}>
                              Mark {cost.classification === "actual" ? "Estimated" : "Actual"}
                            </button>
                            <button type="button" className="beta-text-button" disabled={costBusy} onClick={() => removeCost(cost)}>{cost.recurrence === "monthly" ? "Stop" : "Remove"}</button>
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <div className="beta-empty-state platform-finance-empty">No operating costs apply to this month yet.</div>}
          </section>

          <section className="beta-panel">
            <div className="beta-section-heading">
              <div><p className="beta-eyebrow">Customer performance</p><h2>Organization Forecast</h2><p>Margin excludes shared operating costs because they are not allocated to organizations.</p></div>
            </div>
            {overview.organizations.length ? (
              <div className="beta-table-wrap platform-finance-table-wrap">
                <table className="beta-data-table platform-finance-organization-table">
                  <thead><tr><th>Organization</th><th>Scheduled</th><th>Completed</th><th>Internal</th><th>Projected revenue</th><th>Earned revenue</th><th>Projected payouts</th><th>Earned payouts</th><th>Margin</th></tr></thead>
                  <tbody>{overview.organizations.map((organization) => (
                    <tr key={organization.organizationId}>
                      <td data-label="Organization"><strong>{organization.organizationName}</strong></td>
                      <td data-label="Scheduled">{organization.scheduledAfterlightCount}</td>
                      <td data-label="Completed">{organization.completedAfterlightCount}</td>
                      <td data-label="Internal">{organization.internalAssignmentCount}</td>
                      <td data-label="Projected revenue">{exactMoney(organization.projectedRevenueCents)}</td>
                      <td data-label="Earned revenue">{exactMoney(organization.earnedRevenueCents)}</td>
                      <td data-label="Projected payouts">{exactMoney(organization.projectedPayoutCents)}</td>
                      <td data-label="Earned payouts">{exactMoney(organization.earnedPayoutCents)}</td>
                      <td data-label="Margin"><strong>{exactMoney(organization.projectedMarginCents)}</strong></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <div className="beta-empty-state platform-finance-empty">No assignments are scheduled for this month.</div>}
          </section>

          <section className="beta-panel">
            <div className="beta-section-heading">
              <div><p className="beta-eyebrow">Calculation detail</p><h2>Assignment Breakdown</h2><p>Internal assignments are shown for volume and excluded from Afterlight service revenue and payouts.</p></div>
            </div>
            {overview.assignments.length ? (
              <div className="beta-table-wrap platform-finance-table-wrap">
                <table className="beta-data-table platform-finance-assignment-table">
                  <thead><tr><th>Date</th><th>Organization / property</th><th>Fulfillment</th><th>Status</th><th>Revenue</th><th>Payout</th></tr></thead>
                  <tbody>{overview.assignments.map((assignment) => (
                    <tr key={assignment.assignmentId}>
                      <td data-label="Date">{dateLabel(assignment.startDate)}</td>
                      <td data-label="Organization / property"><strong>{assignment.organizationName}</strong><small>{assignment.propertyName}</small></td>
                      <td data-label="Fulfillment">{SOURCE_LABELS[assignment.fulfillmentSource] || assignment.fulfillmentSource}</td>
                      <td data-label="Status"><span className={`beta-status ${assignment.status === "completed" ? "success" : "warning"}`}>{assignment.status}</span></td>
                      <td data-label="Revenue">{assignment.revenueSource === "not_billable" ? "Not billable" : assignment.revenueSource === "missing" ? "Rate missing" : exactMoney(assignment.revenueCents)}</td>
                      <td data-label="Payout">{assignment.payoutSource === "not_applicable" ? "None" : assignment.payoutSource === "missing" ? "Rate missing" : exactMoney(assignment.payoutCents)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <div className="beta-empty-state platform-finance-empty">No assignment detail is available for this month.</div>}
          </section>
        </>
      )}
    </div>
  );
}

export { currentMonth, money };
