const test = require("node:test");
const assert = require("node:assert/strict");
const { billingWorkspaceAccess } = require("../services/billingAccess");

function queryResult(value) {
  return { select: () => ({ lean: async () => value }) };
}

test("organization management retains billing oversight", async () => {
  assert.deepEqual(await billingWorkspaceAccess({ role: "admin", accountScope: "organization" }), {
    canAccess: true,
    mode: "administrator",
  });
  assert.deepEqual(await billingWorkspaceAccess({ role: "property_manager", accountScope: "organization" }), {
    canAccess: true,
    mode: "reviewer",
  });
});

test("internal employees and Afterlight resources cannot open Billing", async () => {
  const models = {
    AssignmentModel: { findOne: () => queryResult(null) },
    InvoiceModel: { findOne: () => queryResult(null) },
  };
  assert.deepEqual(await billingWorkspaceAccess({
    userId: "employee-1",
    organizationId: "org-1",
    role: "user",
    accountScope: "organization",
  }, models), { canAccess: false, mode: "none" });
  assert.deepEqual(await billingWorkspaceAccess({
    userId: "resource-1",
    role: "contractor",
    accountScope: "afterlight_resource",
  }, models), { canAccess: false, mode: "none" });
});

test("customer contractors retain their own invoice workflow", async () => {
  let assignmentQuery;
  const access = await billingWorkspaceAccess({
    userId: "contractor-1",
    organizationId: "org-1",
    role: "contractor",
    accountScope: "organization",
  }, {
    AssignmentModel: {
      findOne(query) {
        assignmentQuery = query;
        return queryResult({ _id: "assignment-1" });
      },
    },
    InvoiceModel: { findOne: () => queryResult(null) },
  });
  assert.equal(assignmentQuery["fulfillment.source"], "customer_contractor");
  assert.deepEqual(access, { canAccess: true, mode: "customer_contractor" });
});
