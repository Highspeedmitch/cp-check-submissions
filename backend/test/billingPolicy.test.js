const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const BillingPolicy = require("../models/billingPolicy");
const {
  defaultPolicyDefinition,
  evaluatePolicyAction,
  createPolicySnapshot,
} = require("../services/billingPolicy");

function currentPolicy() {
  return new BillingPolicy(defaultPolicyDefinition(new mongoose.Types.ObjectId()));
}

test("default billing policy preserves submitter control of invoice processing", () => {
  const policy = currentPolicy();
  const invoice = { submitterId: "submitter-1" };
  const submitter = { role: "user", userId: "submitter-1" };
  const otherUser = { role: "user", userId: "submitter-2" };

  for (const action of ["set_amount", "generate_invoice", "submit_invoice"]) {
    assert.equal(evaluatePolicyAction({ policy, action, user: submitter, invoice }).allowed, true);
    assert.equal(evaluatePolicyAction({ policy, action, user: otherUser, invoice }).allowed, false);
    assert.equal(evaluatePolicyAction({
      policy,
      action,
      user: { role: "admin", userId: "submitter-1" },
      invoice,
    }).allowed, false);
  }
});

test("default billing policy preserves manual payment updates for admins and assigned PMs", () => {
  const policy = currentPolicy();
  const property = { propertyManagers: ["pm-1"] };

  assert.equal(evaluatePolicyAction({
    policy,
    action: "mark_paid",
    user: { role: "admin", userId: "admin-1" },
    property,
  }).allowed, true);
  assert.equal(evaluatePolicyAction({
    policy,
    action: "mark_paid",
    user: { role: "property_manager", userId: "pm-1" },
    property,
  }).allowed, true);
  assert.equal(evaluatePolicyAction({
    policy,
    action: "mark_paid",
    user: { role: "property_manager", userId: "pm-2" },
    property,
  }).allowed, false);
  assert.equal(evaluatePolicyAction({
    policy,
    action: "mark_paid",
    user: { role: "user", userId: "submitter-1" },
    property,
  }).allowed, false);
});

test("policy snapshots retain the rules used to create an invoice", () => {
  const policy = currentPolicy();
  const snapshot = createPolicySnapshot(policy);

  assert.equal(snapshot.policyVersion, 1);
  assert.equal(snapshot.amountControl, "submitter_editable");
  assert.equal(snapshot.approvalMode, "none");
  assert.deepEqual(snapshot.submissionAllowedRoles, ["submitter"]);
  assert.deepEqual(snapshot.paymentManualUpdateRoles, ["admin", "property_manager"]);
});
