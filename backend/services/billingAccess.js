const Assignment = require("../models/assignment");
const Invoice = require("../models/invoice");

async function billingWorkspaceAccess(
  user,
  { AssignmentModel = Assignment, InvoiceModel = Invoice } = {}
) {
  if (!user || user.accountScope === "afterlight_resource" || user.role === "client") {
    return { canAccess: false, mode: "none" };
  }
  if (user.role === "admin") return { canAccess: true, mode: "administrator" };
  if (user.role === "property_manager") return { canAccess: true, mode: "reviewer" };

  const [customerContractorAssignment, customerContractorInvoice] = await Promise.all([
    AssignmentModel.findOne({
      organizationId: user.organizationId,
      userId: user.userId,
      "fulfillment.source": "customer_contractor",
      status: { $ne: "canceled" },
    }).select("_id").lean(),
    InvoiceModel.findOne({
      organizationId: user.organizationId,
      submitterId: user.userId,
      "fulfillmentSnapshot.source": "customer_contractor",
    }).select("_id").lean(),
  ]);
  const canAccess = Boolean(customerContractorAssignment || customerContractorInvoice);
  return { canAccess, mode: canAccess ? "customer_contractor" : "none" };
}

module.exports = { billingWorkspaceAccess };
