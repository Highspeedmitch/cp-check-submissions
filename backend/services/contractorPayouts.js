function buildPayoutLines(earnings) {
  const grouped = new Map();
  for (const earning of earnings) {
    const profile = earning.resourceProfileId;
    const resourceId = String(profile?._id || profile);
    const contractorEmail = String(profile?.email || "").trim().toLowerCase();
    const gustoContractorUuid = String(profile?.gusto?.contractorUuid || "").trim();
    if (!contractorEmail) {
      const error = new Error(`${profile?.displayName || "A contractor"} is missing a Gusto matching email.`);
      error.status = 400;
      throw error;
    }
    const current = grouped.get(resourceId) || {
      resourceProfileId: profile._id || profile,
      contractorEmail,
      gustoContractorUuid,
      earningIds: [],
      grossAmountCents: 0,
      reimbursementCents: 0,
      totalAmountCents: 0,
    };
    current.earningIds.push(earning._id);
    current.grossAmountCents += earning.grossAmountCents;
    current.reimbursementCents += earning.reimbursementCents || 0;
    current.totalAmountCents = current.grossAmountCents + current.reimbursementCents;
    grouped.set(resourceId, current);
  }
  return [...grouped.values()];
}

function newBatchNumber(now = new Date(), suffix = Math.random().toString(36).slice(2, 8).toUpperCase()) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `GUSTO-${date}-${suffix}`;
}

module.exports = { buildPayoutLines, newBatchNumber };
