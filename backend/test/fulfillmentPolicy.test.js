const test = require("node:test");
const assert = require("node:assert/strict");
const {
  organizationDefaultSource,
  propertyDefaultSource,
  resolveAssignmentFulfillment,
  legacyFulfillmentSnapshot,
} = require("../services/fulfillmentPolicy");

test("service models provide safe fulfillment defaults", () => {
  assert.equal(organizationDefaultSource({ serviceModel: "platform" }), "customer_employee");
  assert.equal(organizationDefaultSource({ serviceModel: "managed" }), "afterlight_staff");
  assert.equal(organizationDefaultSource({ serviceModel: "hybrid" }), "customer_employee");
});

test("property defaults override the organization without changing policy history", () => {
  const organization = {
    serviceModel: "hybrid",
    fulfillmentPolicy: { defaultSource: "customer_employee", version: 4 },
  };
  const property = { fulfillmentPolicy: { defaultSource: "afterlight_contractor" } };
  assert.equal(propertyDefaultSource(organization, property), "afterlight_contractor");

  const snapshot = resolveAssignmentFulfillment({ organization, property, actorUserId: "admin-1" });
  assert.equal(snapshot.source, "afterlight_contractor");
  assert.equal(snapshot.sourceOrigin, "property_default");
  assert.equal(snapshot.queue, "afterlight_coverage");
  assert.equal(snapshot.invoiceRouting, "afterlight_service_billing");
  assert.equal(snapshot.policyVersion, 4);
});

test("assignment overrides derive customer employee invoice suppression", () => {
  const snapshot = resolveAssignmentFulfillment({
    organization: { serviceModel: "managed", fulfillmentPolicy: { defaultSource: "afterlight_staff", version: 3 } },
    property: { fulfillmentPolicy: { defaultSource: null } },
    requestedSource: "customer_employee",
    actorUserId: "admin-1",
  });
  assert.equal(snapshot.sourceOrigin, "assignment_override");
  assert.equal(snapshot.inheritedSource, "afterlight_staff");
  assert.equal(snapshot.queue, "customer_assigned");
  assert.equal(snapshot.invoiceRequired, false);
  assert.equal(snapshot.invoiceRouting, "none");
  assert.equal(snapshot.invoiceVisibility, "none");
});

test("legacy work retains the existing client billing behavior", () => {
  assert.deepEqual(legacyFulfillmentSnapshot(), {
    source: "legacy",
    sourceOrigin: "legacy",
    queue: "customer_assigned",
    invoiceRouting: "legacy_client_billing",
    invoiceVisibility: "submitter_and_organization_oversight",
    invoiceRequired: true,
    policyVersion: 0,
    resolvedAt: null,
    resolvedBy: null,
  });
});
