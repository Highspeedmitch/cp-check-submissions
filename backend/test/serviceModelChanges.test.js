const test = require("node:test");
const assert = require("node:assert/strict");
const ServiceModelChangeRequest = require("../models/serviceModelChangeRequest");
const {
  createServiceModelChangeHandlers,
} = require("../Routes/serviceModelChanges");
const { defaultStoredLicense } = require("../services/licenseEntitlements");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function organization({ serviceModel = "managed", tier = null } = {}) {
  return {
    _id: "org-1",
    name: "Example Organization",
    serviceModel,
    license: defaultStoredLicense(serviceModel, tier),
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

function userModel(user, { administrators = 1, users = 4 } = {}) {
  return {
    findById() { return userQuery(user); },
    async countDocuments(query) { return query.role === "admin" ? administrators : users; },
  };
}

function invitationModel({ administrators = 0, users = 0 } = {}) {
  return {
    async countDocuments(query) { return query.role === "admin" ? administrators : users; },
  };
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
  assert.deepEqual(ServiceModelChangeRequest.schema.path("changeType").enumValues, ["service_model", "license_tier", "custom_capacity"]);
  assert.equal(ServiceModelChangeRequest.schema.path("changeType").defaultValue, "service_model");
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
    UserModel: userModel(requester),
    InvitationModel: invitationModel({ administrators: 1, users: 1 }),
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
    requestedLicenseTier: "tier_1",
    reason: "We are bringing inspections in-house.",
    proposedEffectiveDate: "2026-09-01",
  }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(org.serviceModel, "managed");
  assert.equal(org.saveCount, 0);
  assert.equal(createdRequest.currentServiceModel, "managed");
  assert.equal(createdRequest.requestedServiceModel, "platform");
  assert.equal(createdRequest.changeType, "service_model");
  assert.equal(createdRequest.currentLicenseTier, null);
  assert.equal(createdRequest.requestedLicenseTier, "tier_1");
  assert.equal(createdRequest.organizationSnapshot.propertyCount, 2);
  assert.equal(createdRequest.organizationSnapshot.propertyOverrideCount, 1);
  assert.equal(createdRequest.organizationSnapshot.requestedAdminLimit, 2);
  assert.equal(createdRequest.organizationSnapshot.requestedUserLimit, 5);
  assert.equal(createdRequest.organizationSnapshot.pendingAdministratorCount, 1);
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
    changeType: "service_model",
    currentServiceModel: "managed",
    requestedServiceModel: "platform",
    currentLicenseTier: null,
    requestedLicenseTier: "tier_1",
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
  assert.equal(org.license.tier, "tier_1");
  assert.equal(org.license.adminLimit, 2);
  assert.equal(org.license.userLimit, 5);
  assert.equal(org.license.propertyLimit, 10);
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

test("tiered organizations can request a higher tier without mutating their license", async () => {
  const org = organization({ serviceModel: "platform", tier: "tier_1" });
  const requester = { _id: "admin-1", email: "admin@example.com", username: "Admin" };
  let createdRequest;
  let platformAudit;
  let platformNotification;
  const handlers = createServiceModelChangeHandlers({
    OrganizationModel: { async findById() { return org; } },
    UserModel: userModel(requester, { administrators: 2, users: 5 }),
    InvitationModel: invitationModel(),
    RequestModel: {
      async findOne() { return null; },
      async create(details) {
        createdRequest = {
          _id: "request-tier-1",
          ...details,
          status: "pending_review",
          notification: {},
          createdAt: new Date("2026-08-05T12:00:00.000Z"),
          updatedAt: new Date("2026-08-05T12:00:00.000Z"),
          async save() {},
        };
        return createdRequest;
      },
    },
    PlatformAuditModel: { async create(entry) { platformAudit = entry; } },
    sendPlatformEmail: async () => {},
    notifyPlatform: async (details) => { platformNotification = details; },
    now: () => new Date("2026-08-05T12:00:00.000Z"),
  });
  const res = response();

  await handlers.createRequest(organizationRequest({
    changeType: "license_tier",
    requestedLicenseTier: "tier_2",
    reason: "We need capacity for a growing portfolio.",
    proposedEffectiveDate: "2026-09-01",
  }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(org.license.tier, "tier_1");
  assert.equal(org.saveCount, 0);
  assert.equal(createdRequest.changeType, "license_tier");
  assert.equal(createdRequest.currentServiceModel, "platform");
  assert.equal(createdRequest.requestedServiceModel, "platform");
  assert.equal(createdRequest.currentLicenseTier, "tier_1");
  assert.equal(createdRequest.requestedLicenseTier, "tier_2");
  assert.equal(createdRequest.organizationSnapshot.currentUserLimit, 5);
  assert.equal(createdRequest.organizationSnapshot.requestedUserLimit, 20);
  assert.equal(createdRequest.organizationSnapshot.activeAdministratorCount, 2);
  assert.equal(createdRequest.organizationSnapshot.activeUserCount, 5);
  assert.equal(platformAudit.action, "license_tier_change_requested");
  assert.equal(platformNotification.event.type, "license_tier_change_requested");
});

test("managed-service organizations cannot submit license tier requests", async () => {
  const org = organization();
  const requester = { _id: "admin-1", email: "admin@example.com", username: "Admin" };
  const handlers = createServiceModelChangeHandlers({
    OrganizationModel: { async findById() { return org; } },
    UserModel: userModel(requester),
    InvitationModel: invitationModel(),
    RequestModel: { async findOne() { return null; } },
  });
  const res = response();

  await handlers.createRequest(organizationRequest({
    changeType: "license_tier",
    requestedLicenseTier: "tier_2",
    reason: "This should not be available.",
  }), res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /only for SaaS and Hybrid/i);
});

test("platform approval applies a tier increase without changing fulfillment", async () => {
  const org = organization({ serviceModel: "hybrid", tier: "tier_1" });
  org.license.adminSeatVersion = 7;
  org.license.propertyLimit = 60;
  const requester = { _id: "admin-1", email: "admin@example.com", username: "Admin" };
  const request = {
    _id: "request-tier-1",
    organizationId: "org-1",
    requestedBy: "admin-1",
    changeType: "license_tier",
    currentServiceModel: "hybrid",
    requestedServiceModel: "hybrid",
    currentLicenseTier: "tier_1",
    requestedLicenseTier: "tier_2",
    reason: "Portfolio expansion",
    status: "pending_review",
    organizationSnapshot: {
      currentAdminLimit: 2,
      currentUserLimit: 5,
      currentPropertyLimit: 60,
      requestedAdminLimit: 3,
      requestedUserLimit: 20,
      requestedPropertyLimit: 60,
      currentAfterlightPortfolioMinimumPercent: 15,
      requestedAfterlightPortfolioMinimumPercent: 12,
    },
    messages: [],
    notification: {},
    async save() {},
  };
  let platformAudit;
  let fulfillmentAuditCreated = false;
  let requesterNotification;
  const handlers = createServiceModelChangeHandlers({
    RequestModel: { async findOne() { return request; } },
    OrganizationModel: { async findById() { return org; } },
    UserModel: userModel(requester),
    FulfillmentAuditModel: { async create() { fulfillmentAuditCreated = true; } },
    PlatformAuditModel: { async create(entry) { platformAudit = entry; } },
    sendRequesterEmail: async () => {},
    notifyUser: async (details) => { requesterNotification = details; },
    now: () => new Date("2026-08-05T13:00:00.000Z"),
  });
  const previousPolicy = { ...org.fulfillmentPolicy };
  const previousOverride = org.properties[0].fulfillmentPolicy.defaultSource;
  const res = response();

  await handlers.reviewRequest(platformRequest({ action: "approve", response: "Approved." }, request._id), res);

  assert.equal(res.statusCode, 200);
  assert.equal(org.serviceModel, "hybrid");
  assert.equal(org.license.tier, "tier_2");
  assert.equal(org.license.adminLimit, 3);
  assert.equal(org.license.userLimit, 20);
  assert.equal(org.license.propertyLimit, 60);
  assert.equal(org.license.adminSeatVersion, 7);
  assert.deepEqual(org.fulfillmentPolicy, previousPolicy);
  assert.equal(org.properties[0].fulfillmentPolicy.defaultSource, previousOverride);
  assert.equal(fulfillmentAuditCreated, false);
  assert.equal(platformAudit.action, "license_tier_change_approved");
  assert.deepEqual(platformAudit.metadata.requestedLimits, { admin: 3, users: 20, properties: 60 });
  assert.equal(platformAudit.metadata.requestedAfterlightPortfolioMinimumPercent, 12);
  assert.equal(requesterNotification.type, "license_tier_change_approved");
});

test("Tier 3 organizations can request custom administrator capacity without mutating their license", async () => {
  const org = organization({ serviceModel: "platform", tier: "tier_3" });
  const requester = { _id: "admin-1", email: "admin@example.com", username: "Admin" };
  let createdRequest;
  let platformAudit;
  let platformNotification;
  const handlers = createServiceModelChangeHandlers({
    OrganizationModel: { async findById() { return org; } },
    UserModel: userModel(requester, { administrators: 5, users: 30 }),
    InvitationModel: invitationModel(),
    RequestModel: {
      async findOne() { return null; },
      async create(details) {
        createdRequest = {
          _id: "request-capacity-1",
          ...details,
          status: "pending_review",
          notification: {},
          createdAt: new Date("2026-08-05T14:00:00.000Z"),
          updatedAt: new Date("2026-08-05T14:00:00.000Z"),
          async save() {},
        };
        return createdRequest;
      },
    },
    PlatformAuditModel: { async create(entry) { platformAudit = entry; } },
    sendPlatformEmail: async () => {},
    notifyPlatform: async (details) => { platformNotification = details; },
    now: () => new Date("2026-08-05T14:00:00.000Z"),
  });
  const res = response();

  await handlers.createRequest(organizationRequest({
    changeType: "custom_capacity",
    requestedAdminLimit: 8,
    reason: "We need additional regional administrators.",
  }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(org.license.adminLimit, 5);
  assert.equal(org.saveCount, 0);
  assert.equal(createdRequest.changeType, "custom_capacity");
  assert.equal(createdRequest.currentLicenseTier, "tier_3");
  assert.equal(createdRequest.requestedLicenseTier, "tier_3");
  assert.equal(createdRequest.organizationSnapshot.currentAdminLimit, 5);
  assert.equal(createdRequest.organizationSnapshot.requestedAdminLimit, 8);
  assert.equal(createdRequest.organizationSnapshot.requestedUserLimit, 50);
  assert.equal(platformAudit.action, "custom_capacity_change_requested");
  assert.equal(platformNotification.event.type, "custom_capacity_change_requested");
});

test("custom administrator capacity is rejected below Tier 3", async () => {
  const org = organization({ serviceModel: "hybrid", tier: "tier_2" });
  const requester = { _id: "admin-1", email: "admin@example.com", username: "Admin" };
  const handlers = createServiceModelChangeHandlers({
    OrganizationModel: { async findById() { return org; } },
    UserModel: userModel(requester),
    InvitationModel: invitationModel(),
    RequestModel: { async findOne() { return null; } },
  });
  const res = response();

  await handlers.createRequest(organizationRequest({
    changeType: "custom_capacity",
    requestedAdminLimit: 6,
    reason: "This should require Tier 3.",
  }), res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /only for Tier 3/i);
});

test("custom administrator capacity must increase the current Tier 3 limit", async () => {
  const org = organization({ serviceModel: "platform", tier: "tier_3" });
  const requester = { _id: "admin-1", email: "admin@example.com", username: "Admin" };
  const handlers = createServiceModelChangeHandlers({
    OrganizationModel: { async findById() { return org; } },
    UserModel: userModel(requester),
    InvitationModel: invitationModel(),
    RequestModel: { async findOne() { return null; } },
  });
  const res = response();

  await handlers.createRequest(organizationRequest({
    changeType: "custom_capacity",
    requestedAdminLimit: 5,
    reason: "This does not increase capacity.",
  }), res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /whole number greater than 5/i);
});

test("platform approval applies custom administrator capacity without changing other entitlements", async () => {
  const org = organization({ serviceModel: "hybrid", tier: "tier_3" });
  org.license.adminSeatVersion = 9;
  org.license.userLimit = 80;
  org.license.propertyLimit = 300;
  const requester = { _id: "admin-1", email: "admin@example.com", username: "Admin" };
  const request = {
    _id: "request-capacity-1",
    organizationId: "org-1",
    requestedBy: "admin-1",
    changeType: "custom_capacity",
    currentServiceModel: "hybrid",
    requestedServiceModel: "hybrid",
    currentLicenseTier: "tier_3",
    requestedLicenseTier: "tier_3",
    reason: "Regional administration growth",
    status: "pending_review",
    organizationSnapshot: {
      currentAdminLimit: 5,
      requestedAdminLimit: 8,
      currentUserLimit: 80,
      requestedUserLimit: 80,
      currentPropertyLimit: 300,
      requestedPropertyLimit: 300,
    },
    messages: [],
    notification: {},
    async save() {},
  };
  let platformAudit;
  let fulfillmentAuditCreated = false;
  let requesterNotification;
  const handlers = createServiceModelChangeHandlers({
    RequestModel: { async findOne() { return request; } },
    OrganizationModel: { async findById() { return org; } },
    UserModel: userModel(requester),
    FulfillmentAuditModel: { async create() { fulfillmentAuditCreated = true; } },
    PlatformAuditModel: { async create(entry) { platformAudit = entry; } },
    sendRequesterEmail: async () => {},
    notifyUser: async (details) => { requesterNotification = details; },
    now: () => new Date("2026-08-05T15:00:00.000Z"),
  });
  const previousPolicy = { ...org.fulfillmentPolicy };
  const previousOverride = org.properties[0].fulfillmentPolicy.defaultSource;
  const res = response();

  await handlers.reviewRequest(platformRequest({ action: "approve", response: "Approved." }, request._id), res);

  assert.equal(res.statusCode, 200);
  assert.equal(org.serviceModel, "hybrid");
  assert.equal(org.license.tier, "tier_3");
  assert.equal(org.license.adminLimit, 8);
  assert.equal(org.license.userLimit, 80);
  assert.equal(org.license.propertyLimit, 300);
  assert.equal(org.license.adminSeatVersion, 9);
  assert.deepEqual(org.fulfillmentPolicy, previousPolicy);
  assert.equal(org.properties[0].fulfillmentPolicy.defaultSource, previousOverride);
  assert.equal(fulfillmentAuditCreated, false);
  assert.equal(platformAudit.action, "custom_capacity_change_approved");
  assert.deepEqual(platformAudit.metadata.requestedLimits, { admin: 8, users: 80, properties: 300 });
  assert.equal(requesterNotification.type, "custom_capacity_change_approved");
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
