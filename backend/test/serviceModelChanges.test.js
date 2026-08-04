const test = require("node:test");
const assert = require("node:assert/strict");
const ServiceModelChangeRequest = require("../models/serviceModelChangeRequest");
const {
  createServiceModelChangeHandlers,
} = require("../Routes/serviceModelChanges");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function organization() {
  return {
    _id: "org-1",
    name: "Example Organization",
    serviceModel: "managed",
    fulfillmentPolicy: { defaultSource: "afterlight_staff", version: 4 },
    properties: [
      { _id: "property-1", name: "One", fulfillmentPolicy: { defaultSource: "customer_employee" } },
      { _id: "property-2", name: "Two", fulfillmentPolicy: { defaultSource: null } },
    ],
    saveCount: 0,
    async save() { this.saveCount += 1; },
  };
}

function userQuery(user) {
  return { async select() { return user; } };
}

function organizationRequest(body = {}) {
  return {
    user: { role: "admin", userId: "admin-1", organizationId: "org-1", assumedOrganization: false },
    body,
    params: {},
    ip: "127.0.0.1",
    get: () => "test-agent",
  };
}

function platformRequest(body = {}, id = "request-1") {
  return {
    user: { role: "user", platformRole: "platform_admin", userId: "platform-1", assumedOrganization: false },
    body,
    params: { id },
    ip: "127.0.0.1",
    get: () => "test-agent",
  };
}

test("service model request schema retains the review workflow", () => {
  assert.deepEqual(ServiceModelChangeRequest.schema.path("status").enumValues, [
    "pending_review", "information_requested", "approved", "denied", "canceled",
  ]);
  assert.equal(ServiceModelChangeRequest.schema.path("reason").options.maxlength, 2000);
  assert.equal(ServiceModelChangeRequest.schema.path("organizationId").options.index, true);
});

test("organization administrators submit a non-mutating request and notify platform admins", async () => {
  const org = organization();
  const requester = { _id: "admin-1", email: "admin@example.com", username: "Admin" };
  let createdRequest;
  let emailDetails;
  let platformAudit;
  let platformNotification;
  const handlers = createServiceModelChangeHandlers({
    OrganizationModel: { async findById() { return org; } },
    UserModel: { findById() { return userQuery(requester); } },
    RequestModel: {
      async findOne() { return null; },
      async create(details) {
        createdRequest = {
          _id: "request-1",
          ...details,
          status: "pending_review",
          notification: {},
          createdAt: new Date("2026-08-03T12:00:00.000Z"),
          updatedAt: new Date("2026-08-03T12:00:00.000Z"),
          async save() {},
        };
        return createdRequest;
      },
    },
    PlatformAuditModel: { async create(entry) { platformAudit = entry; } },
    sendPlatformEmail: async (details) => { emailDetails = details; },
    notifyPlatform: async (details) => { platformNotification = details; },
    notifyUser: async () => {},
    now: () => new Date("2026-08-03T12:00:00.000Z"),
  });
  const res = response();

  await handlers.createRequest(organizationRequest({
    requestedServiceModel: "platform",
    reason: "We are bringing inspections in-house.",
    proposedEffectiveDate: "2026-09-01",
  }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(org.serviceModel, "managed");
  assert.equal(org.saveCount, 0);
  assert.equal(createdRequest.currentServiceModel, "managed");
  assert.equal(createdRequest.requestedServiceModel, "platform");
  assert.equal(createdRequest.organizationSnapshot.propertyCount, 2);
  assert.equal(createdRequest.organizationSnapshot.propertyOverrideCount, 1);
  assert.equal(createdRequest.notification.platformEmailSentAt.toISOString(), "2026-08-03T12:00:00.000Z");
  assert.equal(emailDetails.organization, org);
  assert.equal(emailDetails.requester, requester);
  assert.equal(platformAudit.action, "service_model_change_requested");
  assert.equal(platformNotification.event.type, "service_model_change_requested");
  assert.equal(platformNotification.contextOrganizationId, "org-1");
  assert.equal(res.body.emailDelivered, true);
});

test("platform approval applies the model to future work and clears property overrides", async () => {
  const org = organization();
  const requester = { _id: "admin-1", email: "admin@example.com", username: "Admin" };
  const request = {
    _id: "request-1",
    organizationId: "org-1",
    requestedBy: "admin-1",
    currentServiceModel: "managed",
    requestedServiceModel: "platform",
    reason: "Move inspections in-house",
    status: "pending_review",
    organizationSnapshot: {},
    messages: [],
    notification: {},
    createdAt: new Date("2026-08-03T12:00:00.000Z"),
    async save() {},
  };
  let fulfillmentAudit;
  let platformAudit;
  let requesterEmail;
  let requesterNotification;
  const handlers = createServiceModelChangeHandlers({
    RequestModel: { async findOne() { return request; } },
    OrganizationModel: { async findById() { return org; } },
    UserModel: { findById() { return userQuery(requester); } },
    FulfillmentAuditModel: { async create(entry) { fulfillmentAudit = entry; } },
    PlatformAuditModel: { async create(entry) { platformAudit = entry; } },
    sendRequesterEmail: async (details) => { requesterEmail = details; },
    notifyPlatform: async () => {},
    notifyUser: async (details) => { requesterNotification = details; },
    now: () => new Date("2026-08-04T12:00:00.000Z"),
  });
  const res = response();

  await handlers.reviewRequest(platformRequest({ action: "approve", response: "Approved for September." }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(org.serviceModel, "platform");
  assert.equal(org.fulfillmentPolicy.defaultSource, "customer_employee");
  assert.equal(org.fulfillmentPolicy.version, 5);
  assert.equal(org.properties[0].fulfillmentPolicy.defaultSource, null);
  assert.equal(request.status, "approved");
  assert.equal(request.appliedAt.toISOString(), "2026-08-04T12:00:00.000Z");
  assert.equal(fulfillmentAudit.action, "service_model_change_approved");
  assert.equal(fulfillmentAudit.metadata.clearedPropertyOverrides, 1);
  assert.equal(platformAudit.action, "service_model_change_approved");
  assert.equal(requesterEmail.request, request);
  assert.equal(requesterNotification.type, "service_model_change_approved");
  assert.equal(requesterNotification.route, "/service-delivery");
  assert.equal(res.body.emailDelivered, true);
});

test("platform admins can request information and the organization can respond", async () => {
  const org = organization();
  const requester = { _id: "admin-1", email: "admin@example.com", username: "Admin" };
  const request = {
    _id: "request-1",
    organizationId: "org-1",
    requestedBy: "admin-1",
    currentServiceModel: "managed",
    requestedServiceModel: "hybrid",
    reason: "Need seasonal support",
    status: "pending_review",
    organizationSnapshot: {},
    messages: [],
    notification: {},
    createdAt: new Date("2026-08-03T12:00:00.000Z"),
    async save() {},
  };
  const platformNotifications = [];
  const requesterNotifications = [];
  const handlers = createServiceModelChangeHandlers({
    RequestModel: {
      async findOne(query) {
        if (query.status === "information_requested" && request.status !== "information_requested") return null;
        return request;
      },
    },
    OrganizationModel: { async findById() { return org; } },
    UserModel: { findById() { return userQuery(requester); } },
    FulfillmentAuditModel: { async create() {} },
    PlatformAuditModel: { async create() {} },
    sendRequesterEmail: async () => {},
    sendPlatformEmail: async () => {},
    notifyPlatform: async (details) => { platformNotifications.push(details); },
    notifyUser: async (details) => { requesterNotifications.push(details); },
    now: () => new Date("2026-08-04T12:00:00.000Z"),
  });
  const reviewRes = response();

  await handlers.reviewRequest(platformRequest({
    action: "request_information",
    response: "Which properties need Afterlight coverage?",
  }), reviewRes);

  assert.equal(reviewRes.statusCode, 200);
  assert.equal(request.status, "information_requested");
  assert.equal(request.messages[0].actorScope, "platform_admin");
  assert.equal(requesterNotifications[0].type, "service_model_information_requested");

  const respondRes = response();
  const respondReq = organizationRequest({ message: "Winterhaven Square only." });
  respondReq.params.id = "request-1";
  await handlers.respondToInformationRequest(respondReq, respondRes);

  assert.equal(respondRes.statusCode, 200);
  assert.equal(respondRes.body.emailDelivered, true);
  assert.equal(request.status, "pending_review");
  assert.equal(request.messages[1].message, "Winterhaven Square only.");
  assert.equal(platformNotifications[0].event.type, "service_model_information_supplied");
});
