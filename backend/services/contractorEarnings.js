const ContractorEarning = require("../models/contractorEarning");

async function ensureContractorEarning({
  assignment,
  submission,
  property,
  EarningModel = ContractorEarning,
}) {
  if (assignment?.fulfillment?.source !== "afterlight_contractor") return null;
  const amountCents = assignment.compensationSnapshot?.amountCents;
  if (!assignment.resourceProfileId || !Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("The contractor assignment is missing its compensation snapshot.");
  }
  return EarningModel.findOneAndUpdate(
    { assignmentId: assignment._id },
    {
      $setOnInsert: {
        resourceProfileId: assignment.resourceProfileId,
        userId: assignment.userId,
        organizationId: assignment.organizationId,
        propertyId: property._id,
        assignmentId: assignment._id,
        submissionId: submission._id,
        grossAmountCents: amountCents,
        reimbursementCents: 0,
        currency: assignment.compensationSnapshot.currency || "USD",
        compensationSnapshot: assignment.compensationSnapshot,
        status: "pending_approval",
        earnedAt: submission.submittedAt || new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

module.exports = { ensureContractorEarning };
