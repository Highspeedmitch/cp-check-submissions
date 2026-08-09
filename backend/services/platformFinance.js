const FINANCIAL_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const AFTERLIGHT_SOURCES = new Set(["afterlight_staff", "afterlight_contractor"]);

function validFinancialMonth(value) {
  return FINANCIAL_MONTH_PATTERN.test(String(value || ""));
}

function financialMonthRange(month) {
  if (!validFinancialMonth(month)) {
    const error = new Error("Select a valid financial month.");
    error.status = 400;
    throw error;
  }
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

function id(value) {
  return String(value?._id || value || "");
}

function positiveCents(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function propertyForAssignment(assignment, organization) {
  return (organization?.properties || []).find(
    (property) => String(property.name) === String(assignment.propertyName)
  );
}

function assignmentRevenue(assignment, organization, invoice) {
  if (invoice?.status === "void") return { amountCents: 0, source: "void" };
  const invoiceAmount = positiveCents(invoice?.amountCents);
  if (invoiceAmount) return { amountCents: invoiceAmount, source: "invoice" };

  const snapshot = assignment.customerChargeSnapshot;
  if (snapshot?.snapshottedAt) {
    return {
      amountCents: positiveCents(snapshot.amountCents) || 0,
      source: positiveCents(snapshot.amountCents) ? "assignment_snapshot" : "missing",
    };
  }

  const legacyAmount = positiveCents(
    propertyForAssignment(assignment, organization)?.defaultInspectionAmountCents
  );
  return {
    amountCents: legacyAmount || 0,
    source: legacyAmount ? "current_property_rate" : "missing",
  };
}

function assignmentPayout(assignment, earning) {
  if (earning?.status === "void") return { amountCents: 0, source: "void" };
  if (Number.isInteger(earning?.grossAmountCents) && earning.grossAmountCents >= 0) {
    return {
      amountCents: earning.grossAmountCents + Math.max(0, Number(earning.reimbursementCents) || 0),
      source: "earning",
    };
  }
  const snapshotAmount = positiveCents(assignment.compensationSnapshot?.amountCents);
  return {
    amountCents: snapshotAmount || 0,
    source: snapshotAmount ? "assignment_snapshot" : "missing",
  };
}

function costAppliesToMonth(cost, month) {
  if (cost.archivedAt || !validFinancialMonth(cost.startMonth)) return false;
  if (cost.endMonth && cost.endMonth < month) return false;
  return cost.recurrence === "monthly"
    ? cost.startMonth <= month
    : cost.startMonth === month;
}

function emptyOrganizationRow(organization) {
  return {
    organizationId: id(organization),
    organizationName: organization?.name || "Unknown organization",
    scheduledAfterlightCount: 0,
    completedAfterlightCount: 0,
    internalAssignmentCount: 0,
    projectedRevenueCents: 0,
    earnedRevenueCents: 0,
    projectedPayoutCents: 0,
    earnedPayoutCents: 0,
    projectedMarginCents: 0,
  };
}

function buildPlatformFinancialOverview({
  month,
  assignments = [],
  organizations = [],
  invoices = [],
  earnings = [],
  costs = [],
} = {}) {
  financialMonthRange(month);
  const organizationById = new Map(organizations.map((organization) => [id(organization), organization]));
  const invoiceByAssignmentId = new Map(invoices.map((invoice) => [id(invoice.assignmentId), invoice]));
  const earningByAssignmentId = new Map(
    earnings.map((earning) => [id(earning.assignmentId), earning])
  );
  const organizationRows = new Map();
  const assignmentRows = [];
  const propertyKeys = new Set();
  const summary = {
    assignmentCount: 0,
    billableAssignmentCount: 0,
    internalAssignmentCount: 0,
    propertyCount: 0,
    scheduledAfterlightCount: 0,
    completedAfterlightCount: 0,
    projectedRevenueCents: 0,
    earnedRevenueCents: 0,
    paidRevenueCents: 0,
    outstandingReceivableCents: 0,
    projectedPayoutCents: 0,
    earnedPayoutCents: 0,
    projectedOperatingCostCents: 0,
    actualOperatingCostCents: 0,
    projectedNetCents: 0,
    earnedNetCents: 0,
    missingCustomerRateCount: 0,
    missingPayoutRateCount: 0,
  };

  assignments.forEach((assignment) => {
    if (!["scheduled", "completed"].includes(assignment.status)) return;
    const organization = organizationById.get(id(assignment.organizationId));
    const organizationKey = id(assignment.organizationId);
    if (!organizationRows.has(organizationKey)) {
      organizationRows.set(organizationKey, emptyOrganizationRow(
        organization || { _id: organizationKey, name: "Unknown organization" }
      ));
    }
    const organizationRow = organizationRows.get(organizationKey);
    const afterlight = assignment.fulfillment?.invoiceRouting === "afterlight_service_billing"
      || AFTERLIGHT_SOURCES.has(assignment.fulfillment?.source);
    summary.assignmentCount += 1;
    propertyKeys.add(`${organizationKey}:${assignment.propertyName}`);

    if (!afterlight) {
      summary.internalAssignmentCount += 1;
      organizationRow.internalAssignmentCount += 1;
      assignmentRows.push({
        assignmentId: id(assignment),
        organizationId: organizationKey,
        organizationName: organizationRow.organizationName,
        propertyName: assignment.propertyName,
        startDate: assignment.startDate,
        status: assignment.status,
        fulfillmentSource: assignment.fulfillment?.source || "customer_employee",
        revenueCents: 0,
        revenueSource: "not_billable",
        payoutCents: 0,
        payoutSource: "not_applicable",
      });
      return;
    }

    const invoice = invoiceByAssignmentId.get(id(assignment));
    const revenue = assignmentRevenue(assignment, organization, invoice);
    const contractor = assignment.fulfillment?.source === "afterlight_contractor";
    const payout = contractor
      ? assignmentPayout(assignment, earningByAssignmentId.get(id(assignment)))
      : { amountCents: 0, source: "not_applicable" };
    const completed = assignment.status === "completed";

    summary.billableAssignmentCount += 1;
    summary.projectedRevenueCents += revenue.amountCents;
    summary.projectedPayoutCents += payout.amountCents;
    organizationRow.projectedRevenueCents += revenue.amountCents;
    organizationRow.projectedPayoutCents += payout.amountCents;
    if (revenue.source === "missing") summary.missingCustomerRateCount += 1;
    if (contractor && payout.source === "missing") summary.missingPayoutRateCount += 1;

    if (completed) {
      summary.completedAfterlightCount += 1;
      summary.earnedRevenueCents += revenue.amountCents;
      summary.earnedPayoutCents += payout.amountCents;
      organizationRow.completedAfterlightCount += 1;
      organizationRow.earnedRevenueCents += revenue.amountCents;
      organizationRow.earnedPayoutCents += payout.amountCents;
      if (invoice?.status === "paid") summary.paidRevenueCents += revenue.amountCents;
      if (!invoice || !["paid", "void"].includes(invoice.status)) {
        summary.outstandingReceivableCents += revenue.amountCents;
      }
    } else {
      summary.scheduledAfterlightCount += 1;
      organizationRow.scheduledAfterlightCount += 1;
    }

    assignmentRows.push({
      assignmentId: id(assignment),
      organizationId: organizationKey,
      organizationName: organizationRow.organizationName,
      propertyName: assignment.propertyName,
      startDate: assignment.startDate,
      status: assignment.status,
      fulfillmentSource: assignment.fulfillment?.source || "afterlight_staff",
      revenueCents: revenue.amountCents,
      revenueSource: revenue.source,
      payoutCents: payout.amountCents,
      payoutSource: payout.source,
      invoiceStatus: invoice?.status || "not_created",
    });
  });

  const applicableCosts = costs.filter((cost) => costAppliesToMonth(cost, month));
  applicableCosts.forEach((cost) => {
    summary.projectedOperatingCostCents += Math.max(0, Number(cost.amountCents) || 0);
    if (cost.classification === "actual") {
      summary.actualOperatingCostCents += Math.max(0, Number(cost.amountCents) || 0);
    }
  });

  summary.propertyCount = propertyKeys.size;
  summary.projectedNetCents = summary.projectedRevenueCents
    - summary.projectedPayoutCents
    - summary.projectedOperatingCostCents;
  summary.earnedNetCents = summary.earnedRevenueCents
    - summary.earnedPayoutCents
    - summary.actualOperatingCostCents;
  organizationRows.forEach((row) => {
    row.projectedMarginCents = row.projectedRevenueCents - row.projectedPayoutCents;
  });

  return {
    month,
    basis: "assignment_start_month",
    summary,
    organizations: [...organizationRows.values()].sort(
      (left, right) => right.projectedRevenueCents - left.projectedRevenueCents
        || left.organizationName.localeCompare(right.organizationName)
    ),
    assignments: assignmentRows.sort(
      (left, right) => new Date(left.startDate) - new Date(right.startDate)
        || left.organizationName.localeCompare(right.organizationName)
    ),
    costs: applicableCosts.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

module.exports = {
  FINANCIAL_MONTH_PATTERN,
  validFinancialMonth,
  financialMonthRange,
  costAppliesToMonth,
  buildPlatformFinancialOverview,
};
