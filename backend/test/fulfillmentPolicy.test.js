const test = require("node:test");
const assert = require("node:assert/strict");
const {
  organizationDefaultSource,
  propertyDefaultSource,
  resolveAssignmentFulfillment,
  resolveDirectSubmissionFulfillment,
  legacyFulfillmentSnapshot,
  fulfillmentSourcesForServiceModel,
  serviceModelAllowsAfterlightResources,
} = require("../services/fulfillmentPolicy");

test("service models provide safe fulfillment defaults", () => {
  assert.equal(organizationDefaultSource({ serviceModel: "platform" }), "customer_employee");
  assert.equal(organizationDefaultSource({ serviceModel: "managed" }), "afterlight_staff");
  assert.equal(organizationDefaultSource({ serviceModel: "hybrid" }), "customer_employee");
});

test("SaaS organizations expose only customer-controlled fulfillment", () => {
  assert.deepEqual(fulfillmentSourcesForServiceModel("platform"), [
    "customer_employee",
    "customer_contractor",
  ]);
  assert.equal(serviceModelAllowsAfterlightResources("platform"), false);
  assert.equal(serviceModelAllowsAfterlightResources("hybrid"), true);
  assert.equal(serviceModelAllowsAfterlightResources("managed"), true);
});

test("SaaS assignment overrides cannot request Afterlight fulfillment", () => {
  assert.throws(() => resolveAssignmentFulfillment({
    organization: {
      serviceModel: "platform",
      fulfillmentPolicy: { defaultSource: "customer_employee", version: 5 },
    },
    property: { fulfillmentPolicy: { defaultSource: null } },
    requestedSource: "afterlight_staff",
    actorUserId: "admin-1",
  }), /only to Managed Service and Hybrid/i);
});

test("stale SaaS property overrides cannot route new work to Afterlight", () => {
  assert.throws(() => resolveAssignmentFulfillment({
    organization: {
      serviceModel: "platform",
      fulfillmentPolicy: { defaultSource: "customer_employee", version: 5 },
    },
    property: { fulfillmentPolicy: { defaultSource: "afterlight_contractor" } },
    actorUserId: "admin-1",
  }), /only to Managed Service and Hybrid/i);
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

test("direct organization submissions are employee work even in a managed organization", () => {
  const snapshot = resolveDirectSubmissionFulfillment({
    organization: {
      serviceModel: "managed",
      fulfillmentPolicy: { defaultSource: "afterlight_staff", version: 7 },
    },
    actorUserId: "employee-1",
  });
  assert.equal(snapshot.source, "customer_employee");
  assert.equal(snapshot.sourceOrigin, "direct_submitter");
  assert.equal(snapshot.inheritedSource, "afterlight_staff");
  assert.equal(snapshot.invoiceRequired, false);
  assert.equal(snapshot.invoiceRouting, "none");
});

test("Afterlight service invoices are hidden from the performing resource", () => {
  const snapshot = resolveAssignmentFulfillment({
    organization: { serviceModel: "managed" },
    property: {},
    actorUserId: "admin-1",
  });
  assert.equal(snapshot.source, "afterlight_staff");
  assert.equal(snapshot.invoiceVisibility, "organization_oversight");
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
