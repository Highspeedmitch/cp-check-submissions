const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const assignmentRouter = require("../Routes/assignments");
const {
  createAssignmentHandlers,
  createAssignmentRouter,
} = require("../Routes/assignments");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("assignment router preserves the existing scheduler API paths", () => {
  const routes = assignmentRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  assert.deepEqual(routes, [
    { path: "/assignments", methods: ["post"] },
    { path: "/assignments", methods: ["get"] },
    { path: "/assignments/history", methods: ["get"] },
    { path: "/users", methods: ["get"] },
    { path: "/assignments/:id", methods: ["delete"] },
    { path: "/assignments/:id", methods: ["put"] },
  ]);
});

test("authentication is scoped to assignment routes instead of the entire API", () => {
  const routeAuthentication = (_req, _res, next) => next();
  const router = createAssignmentRouter({}, routeAuthentication);

  for (const layer of router.stack.filter((entry) => entry.route)) {
    assert.equal(layer.route.stack[0].handle, routeAuthentication);
  }

  const appSource = fs.readFileSync(
    path.join(__dirname, "..", "app.js"),
    "utf8"
  );
  assert.match(appSource, /app\.use\("\/api", require\("\.\/Routes\/assignments"\)\);/);
  assert.doesNotMatch(
    appSource,
    /app\.use\("\/api", authenticateToken, require\("\.\/Routes\/assignments"\)\);/
  );
});

test("assignment creation retains admin and organization scoping", async () => {
  let userQuery;
  let overlapQuery;
  let savedAssignment;
  let notification;

  class AssignmentModel {
    constructor(data) {
      Object.assign(this, data);
      this._id = "assignment-1";
    }

    async save() {
      savedAssignment = this;
    }

    static async findOne(query) {
      overlapQuery = query;
      return null;
    }
  }

  const UserModel = {
    findOne(query) {
      userQuery = query;
      return {
        select() {
          return {
            async lean() {
              return { _id: "user-1", role: "user", engagementType: "customer_employee" };
            },
          };
        },
      };
    },
  };

  const handlers = createAssignmentHandlers({
    AssignmentModel,
    OrganizationModel: {
      async findById(id) {
        assert.equal(id, "org-1");
        return {
          serviceModel: "hybrid",
          fulfillmentPolicy: { defaultSource: "customer_employee", version: 2 },
          properties: [{ name: "Broadway Center", fulfillmentPolicy: { defaultSource: null } }],
        };
      },
    },
    UserModel,
    notifyUser: async (payload) => {
      notification = payload;
    },
  });
  const req = {
    user: { role: "admin", organizationId: "org-1" },
    body: {
      propertyName: "Broadway Center",
      userId: "user-1",
      eventType: "Maintenance",
      startDate: "2026-07-28T01:00:00.000Z",
      endDate: "2026-07-28T02:00:00.000Z",
      oneTimeCheckRequest: "Check rear lighting",
    },
  };
  const res = response();

  await handlers.createAssignment(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(userQuery.organizationId, "org-1");
  assert.deepEqual(userQuery.accountStatus, { $ne: "inactive" });
  assert.equal(overlapQuery.organizationId, "org-1");
  assert.equal(overlapQuery.propertyName, "Broadway Center");
  assert.equal(overlapQuery.status, "scheduled");
  assert.equal(savedAssignment.organizationId, "org-1");
  assert.equal(savedAssignment.assignedBy, req.user.userId);
  assert.equal(savedAssignment.eventType, "Maintenance");
  assert.equal(savedAssignment.fulfillment.source, "customer_employee");
  assert.equal(savedAssignment.fulfillment.queue, "customer_assigned");
  assert.equal(savedAssignment.fulfillment.invoiceRouting, "none");
  assert.equal(notification.userId, "user-1");
  assert.equal(notification.type, "assignment_created");
});

test("assignment creation defaults an omitted end date to the start date", async () => {
  let savedAssignment;
  let overlapQuery;
  let resolvedStartDate;

  class AssignmentModel {
    constructor(data) {
      Object.assign(this, data);
      this._id = "assignment-single-day";
    }

    async save() {
      savedAssignment = this;
    }

    static async findOne(query) {
      overlapQuery = query;
      return null;
    }
  }

  const handlers = createAssignmentHandlers({
    AssignmentModel,
    OrganizationModel: {
      async findById() {
        return {
          serviceModel: "hybrid",
          fulfillmentPolicy: { defaultSource: "customer_employee", version: 1 },
          properties: [{ _id: "property-1", name: "Broadway Center" }],
        };
      },
    },
    resolveAssignee: async ({ startDate }) => {
      resolvedStartDate = startDate;
      return {
        userId: "user-1",
        resourceProfileId: null,
        resourceDeploymentId: null,
        compensationSnapshot: null,
      };
    },
    notifyUser: async () => {},
  });
  const res = response();

  await handlers.createAssignment({
    user: { role: "admin", userId: "admin-1", organizationId: "org-1" },
    body: {
      propertyName: "Broadway Center",
      userId: "user-1",
      startDate: "2026-08-15",
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(savedAssignment.startDate.toISOString(), "2026-08-15T00:00:00.000Z");
  assert.equal(savedAssignment.endDate.toISOString(), savedAssignment.startDate.toISOString());
  assert.equal(resolvedStartDate.toISOString(), savedAssignment.startDate.toISOString());
  assert.equal(
    overlapQuery.$or[0].startDate.$lte.toISOString(),
    savedAssignment.startDate.toISOString()
  );
});

test("non-admin users still cannot create assignments", async () => {
  const handlers = createAssignmentHandlers();
  const res = response();

  await handlers.createAssignment({
    user: { role: "user", organizationId: "org-1" },
    body: {},
  }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Forbidden" });
});

test("assignment fulfillment overrides are snapshotted and audited", async () => {
  let savedAssignment;
  let auditEntry;
  class AssignmentModel {
    constructor(data) {
      Object.assign(this, data);
      this._id = "assignment-override";
    }
    async save() { savedAssignment = this; }
    static async findOne() { return null; }
  }
  const handlers = createAssignmentHandlers({
    AssignmentModel,
    OrganizationModel: {
      async findById() {
        return {
          serviceModel: "managed",
          fulfillmentPolicy: { defaultSource: "afterlight_staff", version: 5 },
          properties: [{ name: "Broadway Center", fulfillmentPolicy: { defaultSource: null } }],
        };
      },
    },
    UserModel: {
      findOne() {
        return { select: () => ({ lean: async () => ({
          _id: "user-1",
          role: "user",
          engagementType: "customer_employee",
        }) }) };
      },
    },
    FulfillmentAuditModel: {
      async create(entry) { auditEntry = entry; },
    },
    notifyUser: async () => {},
  });
  const res = response();

  await handlers.createAssignment({
    user: { role: "admin", userId: "admin-1", organizationId: "org-1" },
    body: {
      propertyName: "Broadway Center",
      userId: "user-1",
      startDate: "2026-08-02T00:00:00.000Z",
      endDate: "2026-08-03T00:00:00.000Z",
      fulfillmentSource: "customer_employee",
      fulfillmentOverrideReason: "Customer team has coverage",
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(savedAssignment.fulfillment.source, "customer_employee");
  assert.equal(savedAssignment.fulfillment.invoiceRequired, false);
  assert.equal(auditEntry.action, "assignment_fulfillment_overridden");
  assert.deepEqual(auditEntry.previousValue, { source: "afterlight_staff" });
  assert.equal(auditEntry.reason, "Customer team has coverage");
});

test("SaaS organizations cannot create Afterlight assignments through a crafted request", async () => {
  let assigneeResolutionAttempted = false;
  const handlers = createAssignmentHandlers({
    OrganizationModel: {
      async findById() {
        return {
          serviceModel: "platform",
          fulfillmentPolicy: { defaultSource: "customer_employee", version: 6 },
          properties: [{ _id: "property-1", name: "Broadway Center" }],
        };
      },
    },
    resolveAssignee: async () => {
      assigneeResolutionAttempted = true;
      throw new Error("should not resolve");
    },
  });
  const res = response();

  await handlers.createAssignment({
    user: { role: "admin", userId: "admin-1", organizationId: "org-1" },
    body: {
      propertyName: "Broadway Center",
      userId: "afterlight-user-1",
      startDate: "2026-08-15",
      fulfillmentSource: "afterlight_staff",
    },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Managed Service and Hybrid/i);
  assert.equal(assigneeResolutionAttempted, false);
});

test("Afterlight contractor assignments retain deployment and immutable compensation links", async () => {
  let savedAssignment;
  let notification;
  class AssignmentModel {
    constructor(data) {
      Object.assign(this, data);
      this._id = "assignment-resource-1";
    }
    async save() { savedAssignment = this; }
    static async findOne() { return null; }
  }
  const snapshot = {
    payeeType: "afterlight_contractor",
    rateType: "per_assignment",
    amountCents: 6250,
    currency: "USD",
    snapshottedAt: new Date("2026-08-02T12:00:00.000Z"),
  };
  const handlers = createAssignmentHandlers({
    AssignmentModel,
    OrganizationModel: {
      async findById() {
        return {
          serviceModel: "managed",
          fulfillmentPolicy: { defaultSource: "afterlight_contractor", version: 2 },
          properties: [{ _id: "property-1", name: "Broadway Center", fulfillmentPolicy: { defaultSource: null } }],
        };
      },
    },
    resolveAssignee: async () => ({
      userId: "resource-user-1",
      resourceProfileId: "resource-1",
      resourceDeploymentId: "deployment-1",
      compensationSnapshot: snapshot,
    }),
    notifyUser: async (payload) => { notification = payload; },
  });
  const res = response();

  await handlers.createAssignment({
    user: { role: "admin", userId: "admin-1", organizationId: "org-1" },
    body: {
      propertyName: "Broadway Center",
      userId: "resource-user-1",
      startDate: "2026-08-12T12:00:00.000Z",
      endDate: "2026-08-12T13:00:00.000Z",
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(savedAssignment.resourceProfileId, "resource-1");
  assert.equal(savedAssignment.resourceDeploymentId, "deployment-1");
  assert.equal(savedAssignment.compensationSnapshot, snapshot);
  assert.equal(res.body.assignment.compensationSnapshot, undefined);
  assert.equal(notification.route, "/resource");
  assert.equal(notification.recipientScope, "afterlight_resource");
});

test("property managers only list assignments for managed properties", async () => {
  let assignmentQuery;
  const assignments = [{
    _id: "assignment-1",
    compensationSnapshot: { amountCents: 9000, currency: "USD" },
  }];
  const handlers = createAssignmentHandlers({
    OrganizationModel: {
      async findById(id) {
        assert.equal(id, "org-1");
        return { properties: [] };
      },
    },
    AssignmentModel: {
      find(query) {
        assignmentQuery = query;
        return {
          async sort(sort) {
            assert.deepEqual(sort, { startDate: 1 });
            return assignments;
          },
        };
      },
    },
    managedPropertiesForUser: () => [
      { name: "Broadway Center" },
      { name: "San Clemente" },
    ],
  });
  const res = response();

  await handlers.listAssignments({
    user: {
      role: "property_manager",
      userId: "pm-1",
      organizationId: "org-1",
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{ _id: "assignment-1" }]);
  assert.equal(assignmentQuery.organizationId, "org-1");
  assert.deepEqual(assignmentQuery.propertyName, {
    $in: ["Broadway Center", "San Clemente"],
  });
});

test("ordinary users only list their own assignments", async () => {
  let assignmentQuery;
  const handlers = createAssignmentHandlers({
    AssignmentModel: {
      find(query) {
        assignmentQuery = query;
        return { async sort() { return []; } };
      },
    },
  });

  await handlers.listAssignments({
    user: { role: "user", userId: "user-1", organizationId: "org-1" },
  }, response());

  assert.deepEqual(assignmentQuery, {
    organizationId: "org-1",
    status: "scheduled",
    userId: "user-1",
  });
});

test("assignment history returns a read-only audit view without contractor compensation", async () => {
  let assignmentQuery;
  const assignedAt = new Date("2026-08-01T16:00:00.000Z");
  const scheduledAt = new Date("2026-08-03T16:00:00.000Z");
  const submittedAt = new Date("2026-08-03T18:30:00.000Z");
  const handlers = createAssignmentHandlers({
    AssignmentModel: {
      find(query) {
        assignmentQuery = query;
        return {
          select() { return this; },
          sort() { return this; },
          limit() { return this; },
          async lean() {
            return [{
              _id: "assignment-1",
              propertyName: "Black Crown",
              userId: "resource-user-1",
              assignedBy: null,
              startDate: scheduledAt,
              endDate: scheduledAt,
              createdAt: assignedAt,
              completedAt: null,
              status: "completed",
              eventType: "QA Check",
              fulfillment: {
                source: "afterlight_contractor",
                resolvedBy: "admin-1",
              },
              compensationSnapshot: { amountCents: 9000, currency: "USD" },
            }];
          },
        };
      },
    },
    SubmissionModel: {
      find() {
        return {
          select() { return this; },
          async lean() {
            return [{ assignmentId: "assignment-1", submittedAt }];
          },
        };
      },
    },
    UserModel: {
      find() {
        return {
          select() { return this; },
          async lean() {
            return [
              { _id: "resource-user-1", username: "Inspector One", email: "inspector@example.com" },
              { _id: "admin-1", username: "Admin One", email: "admin@example.com" },
            ];
          },
        };
      },
    },
  });
  const res = response();

  await handlers.listAssignmentHistory({
    user: { role: "admin", userId: "admin-1", organizationId: "org-1" },
  }, res);

  assert.deepEqual(assignmentQuery, {
    organizationId: "org-1",
    status: { $in: ["completed", "canceled"] },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{
    _id: "assignment-1",
    propertyName: "Black Crown",
    status: "completed",
    fulfillmentType: "afterlight_contractor",
    eventType: "QA Check",
    assignedTo: {
      _id: "resource-user-1",
      name: "Inspector One",
      email: "inspector@example.com",
    },
    assignedBy: {
      _id: "admin-1",
      name: "Admin One",
      email: "admin@example.com",
    },
    scheduledAt,
    scheduledThrough: scheduledAt,
    assignedAt,
    completedAt: submittedAt,
    canceledAt: null,
  }]);
  assert.equal(res.body[0].compensationSnapshot, undefined);
});

test("assignment history is restricted to a property manager's managed properties", async () => {
  let assignmentQuery;
  const handlers = createAssignmentHandlers({
    OrganizationModel: {
      async findById() {
        return { properties: [{ name: "Black Crown" }, { name: "Other Property" }] };
      },
    },
    AssignmentModel: {
      find(query) {
        assignmentQuery = query;
        return {
          select() { return this; },
          sort() { return this; },
          limit() { return this; },
          async lean() { return []; },
        };
      },
    },
    managedPropertiesForUser: () => [{ name: "Black Crown" }],
  });

  await handlers.listAssignmentHistory({
    user: { role: "property_manager", userId: "pm-1", organizationId: "org-1" },
  }, response());

  assert.deepEqual(assignmentQuery.propertyName, { $in: ["Black Crown"] });
});

test("ordinary users cannot access assignment history", async () => {
  const handlers = createAssignmentHandlers();
  const res = response();

  await handlers.listAssignmentHistory({
    user: { role: "user", userId: "user-1", organizationId: "org-1" },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Management access required." });
});

test("scheduler user lookup retains organization and role filters", async () => {
  let userQuery;
  let schedulerRequest;
  const users = [{ _id: "user-1", role: "user" }];
  const handlers = createAssignmentHandlers({
    OrganizationModel: {
      async findById() { return { serviceModel: "hybrid" }; },
    },
    UserModel: {
      find(query) {
        userQuery = query;
        return {
          async select(selection) {
            assert.equal(selection, "_id email role engagementType");
            return users;
          },
        };
      },
    },
    schedulerResources: async (details) => {
      schedulerRequest = details;
      return [];
    },
  });
  const res = response();

  await handlers.listSchedulerUsers({
    user: { role: "admin", organizationId: "org-1" },
    query: { roles: "all" },
  }, res);

  assert.deepEqual(res.body, users);
  assert.equal(userQuery.organizationId, "org-1");
  assert.deepEqual(userQuery.role, {
    $in: ["user", "contractor", "cleaner", "property_manager", "client"],
  });
  assert.equal(schedulerRequest.serviceModel, "hybrid");
});

test("SaaS scheduler lookup returns tenant workers without querying Afterlight deployments", async () => {
  let schedulerLookupAttempted = false;
  const users = [{ _id: "user-1", role: "contractor" }];
  const handlers = createAssignmentHandlers({
    OrganizationModel: {
      async findById() { return { serviceModel: "platform" }; },
    },
    UserModel: {
      find() {
        return { async select() { return users; } };
      },
    },
    schedulerResources: async () => {
      schedulerLookupAttempted = true;
      return [{ _id: "afterlight-user-1" }];
    },
  });
  const res = response();

  await handlers.listSchedulerUsers({
    user: { role: "admin", organizationId: "org-1" },
    query: { roles: "all" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, users);
  assert.equal(schedulerLookupAttempted, false);
});

test("retained Afterlight assignments can be rescheduled after a SaaS transition", async () => {
  let assigneeResolutionAttempted = false;
  let savedChanges;
  const existing = {
    _id: "assignment-1",
    organizationId: "org-1",
    propertyName: "Broadway Center",
    userId: "afterlight-user-1",
    startDate: new Date("2026-08-10T00:00:00.000Z"),
    endDate: new Date("2026-08-10T00:00:00.000Z"),
    fulfillment: { source: "afterlight_staff", queue: "afterlight_coverage" },
    resourceProfileId: "resource-1",
    resourceDeploymentId: "deployment-1",
    compensationSnapshot: undefined,
  };
  const handlers = createAssignmentHandlers({
    OrganizationModel: {
      async findById() {
        return {
          serviceModel: "platform",
          properties: [{ _id: "property-1", name: "Broadway Center" }],
        };
      },
    },
    AssignmentModel: {
      async findOne() { return existing; },
      async findOneAndUpdate(_query, update) {
        savedChanges = update.$set;
        return { ...existing, ...update.$set };
      },
    },
    resolveAssignee: async () => {
      assigneeResolutionAttempted = true;
      throw new Error("should not resolve a retained deployment");
    },
    notifyUser: async () => {},
  });
  const res = response();

  await handlers.updateAssignment({
    user: { role: "admin", userId: "admin-1", organizationId: "org-1" },
    params: { id: "assignment-1" },
    body: {
      startDate: "2026-08-20",
      endDate: "2026-08-20",
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(assigneeResolutionAttempted, false);
  assert.equal(savedChanges.userId, "afterlight-user-1");
  assert.equal(savedChanges.resourceProfileId, "resource-1");
  assert.equal(savedChanges.resourceDeploymentId, "deployment-1");
  assert.equal(savedChanges.fulfillment.source, "afterlight_staff");
});

test("assignment updates remain scoped to the authenticated organization", async () => {
  let updateQuery;
  const updated = { _id: "assignment-1", notes: "Gate code confirmed" };
  const handlers = createAssignmentHandlers({
    AssignmentModel: {
      async findOneAndUpdate(query, changes, options) {
        updateQuery = query;
        assert.deepEqual(changes, {
          $set: { notes: "Gate code confirmed" },
          $inc: { calendarSequence: 1 },
        });
        assert.deepEqual(options, { new: true });
        return updated;
      },
    },
  });
  const res = response();

  await handlers.updateAssignment({
    user: { role: "admin", organizationId: "org-1" },
    params: { id: "assignment-1" },
    body: { notes: "Gate code confirmed" },
  }, res);

  assert.deepEqual(updateQuery, {
    _id: "assignment-1",
    organizationId: "org-1",
    status: "scheduled",
  });
  assert.deepEqual(res.body, { success: true, assignment: updated });
});

test("property managers cannot move assignments outside their managed property scope", async () => {
  const organization = {
    serviceModel: "managed",
    properties: [
      { _id: "property-1", name: "Managed Property" },
      { _id: "property-2", name: "Unmanaged Property" },
    ],
  };
  const handlers = createAssignmentHandlers({
    OrganizationModel: { async findById() { return organization; } },
    AssignmentModel: {
      async findOne() {
        return {
          _id: "assignment-1",
          propertyName: "Managed Property",
          userId: "user-1",
          startDate: new Date("2026-08-10T12:00:00.000Z"),
          fulfillment: { source: "afterlight_staff" },
        };
      },
      async findOneAndUpdate() {
        assert.fail("an out-of-scope update must not be written");
      },
    },
    managedPropertiesForUser: () => [organization.properties[0]],
  });
  const res = response();

  await handlers.updateAssignment({
    user: { role: "property_manager", userId: "pm-1", organizationId: "org-1" },
    params: { id: "assignment-1" },
    body: { propertyName: "Unmanaged Property" },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "You do not manage this property." });
});

test("rescheduling the same contractor revalidates deployment without changing the agreed rate", async () => {
  const originalSnapshot = {
    payeeType: "afterlight_contractor",
    rateType: "per_assignment",
    amountCents: 6250,
    currency: "USD",
  };
  let writtenChanges;
  let notification;
  const handlers = createAssignmentHandlers({
    OrganizationModel: {
      async findById() {
        return { properties: [{ _id: "property-1", name: "Broadway Center" }] };
      },
    },
    AssignmentModel: {
      async findOne() {
        return {
          _id: "assignment-1",
          propertyName: "Broadway Center",
          userId: "resource-user-1",
          resourceProfileId: "resource-1",
          organizationId: "org-1",
          startDate: new Date("2026-08-10T12:00:00.000Z"),
          endDate: new Date("2026-08-10T13:00:00.000Z"),
          fulfillment: { source: "afterlight_contractor" },
          compensationSnapshot: originalSnapshot,
        };
      },
      async findOneAndUpdate(_query, changes) {
        writtenChanges = changes.$set;
        return { _id: "assignment-1", organizationId: "org-1", propertyName: "Broadway Center", ...changes.$set };
      },
    },
    resolveAssignee: async () => ({
      userId: "resource-user-1",
      resourceProfileId: "resource-1",
      resourceDeploymentId: "deployment-1",
      compensationSnapshot: { ...originalSnapshot, amountCents: 9000 },
    }),
    notifyUser: async (payload) => { notification = payload; },
  });
  const res = response();

  await handlers.updateAssignment({
    user: { role: "admin", userId: "admin-1", organizationId: "org-1" },
    params: { id: "assignment-1" },
    body: { startDate: "2026-08-12T12:00:00.000Z" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(writtenChanges.compensationSnapshot, originalSnapshot);
  assert.equal(writtenChanges.resourceDeploymentId, "deployment-1");
  assert.equal(notification.type, "assignment_rescheduled");
  assert.equal(notification.recipientScope, "afterlight_resource");
});

test("updating only the start date makes the assignment single-day", async () => {
  let writtenChanges;
  const handlers = createAssignmentHandlers({
    OrganizationModel: {
      async findById() {
        return { properties: [{ _id: "property-1", name: "Broadway Center" }] };
      },
    },
    AssignmentModel: {
      async findOne() {
        return {
          _id: "assignment-1",
          propertyName: "Broadway Center",
          userId: "user-1",
          startDate: new Date("2026-08-10T00:00:00.000Z"),
          endDate: new Date("2026-08-12T00:00:00.000Z"),
          fulfillment: { source: "customer_employee" },
        };
      },
      async findOneAndUpdate(_query, changes) {
        writtenChanges = changes.$set;
        return { _id: "assignment-1", ...changes.$set };
      },
    },
    resolveAssignee: async () => ({
      userId: "user-1",
      resourceProfileId: null,
      resourceDeploymentId: null,
      compensationSnapshot: null,
    }),
    notifyUser: async () => {},
  });
  const res = response();

  await handlers.updateAssignment({
    user: { role: "admin", userId: "admin-1", organizationId: "org-1" },
    params: { id: "assignment-1" },
    body: { startDate: "2026-08-20" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(writtenChanges.startDate.toISOString(), "2026-08-20T00:00:00.000Z");
  assert.equal(writtenChanges.endDate.toISOString(), writtenChanges.startDate.toISOString());
});

test("assignment cancellation remains scoped and publishes a calendar revision", async () => {
  let cancelQuery;
  let cancelUpdate;
  let cancelOptions;
  let notification;
  const handlers = createAssignmentHandlers({
    AssignmentModel: {
      async findOneAndUpdate(query, update, options) {
        cancelQuery = query;
        cancelUpdate = update;
        cancelOptions = options;
        return {
          _id: "assignment-1",
          organizationId: "org-1",
          userId: "resource-user-1",
          resourceProfileId: "resource-1",
          propertyName: "Broadway Center",
        };
      },
    },
    notifyUser: async (payload) => { notification = payload; },
  });
  const res = response();

  await handlers.deleteAssignment({
    user: { role: "admin", userId: "admin-1", organizationId: "org-1" },
    params: { id: "assignment-1" },
  }, res);

  assert.deepEqual(cancelQuery, {
    _id: "assignment-1",
    organizationId: "org-1",
    status: "scheduled",
  });
  assert.equal(cancelUpdate.$set.status, "canceled");
  assert.equal(cancelUpdate.$set.canceledBy, "admin-1");
  assert.ok(cancelUpdate.$set.canceledAt instanceof Date);
  assert.deepEqual(cancelUpdate.$inc, { calendarSequence: 1 });
  assert.deepEqual(cancelOptions, { new: true });
  assert.equal(notification.type, "assignment_canceled");
  assert.equal(notification.recipientScope, "afterlight_resource");
  assert.deepEqual(res.body, {
    success: true,
    message: "Assignment canceled successfully",
  });
});

test("assignment reassignment notifies the previous and new assignees", async () => {
  const notifications = [];
  const existing = {
    _id: "assignment-1",
    organizationId: "org-1",
    propertyName: "Broadway Center",
    userId: "user-1",
    resourceProfileId: null,
    startDate: new Date("2026-08-10T12:00:00.000Z"),
    endDate: new Date("2026-08-10T13:00:00.000Z"),
    fulfillment: { source: "customer_employee" },
  };
  const handlers = createAssignmentHandlers({
    OrganizationModel: {
      async findById() {
        return { properties: [{ _id: "property-1", name: "Broadway Center" }] };
      },
    },
    AssignmentModel: {
      async findOne() { return existing; },
      async findOneAndUpdate(_query, update) {
        return {
          ...existing,
          ...update.$set,
          userId: "resource-user-2",
          resourceProfileId: "resource-2",
        };
      },
    },
    resolveAssignee: async () => ({
      userId: "resource-user-2",
      resourceProfileId: "resource-2",
      resourceDeploymentId: "deployment-2",
      compensationSnapshot: { amountCents: 7000, currency: "USD" },
    }),
    notifyUser: async (payload) => { notifications.push(payload); },
  });

  await handlers.updateAssignment({
    user: { role: "admin", userId: "admin-1", organizationId: "org-1" },
    params: { id: "assignment-1" },
    body: { userId: "resource-user-2" },
  }, response());

  assert.equal(notifications.length, 2);
  assert.equal(notifications[0].type, "assignment_reassigned");
  assert.match(notifications[0].body, /no longer assigned/);
  assert.equal(notifications[1].userId, "resource-user-2");
  assert.equal(notifications[1].recipientScope, "afterlight_resource");
});

test("non-admin users cannot update or delete assignments", async () => {
  const handlers = createAssignmentHandlers();
  const updateResponse = response();
  const deleteResponse = response();
  const request = {
    user: { role: "user", userId: "user-1", organizationId: "org-1" },
    params: { id: "assignment-1" },
    body: { status: "completed" },
  };

  await handlers.updateAssignment(request, updateResponse);
  await handlers.deleteAssignment(request, deleteResponse);

  assert.equal(updateResponse.statusCode, 403);
  assert.deepEqual(updateResponse.body, { error: "Forbidden" });
  assert.equal(deleteResponse.statusCode, 403);
  assert.deepEqual(deleteResponse.body, { error: "Forbidden" });
});

test("assignment updates discard tenant, audit, and completion fields from request bodies", async () => {
  let changes;
  const handlers = createAssignmentHandlers({
    AssignmentModel: {
      async findOneAndUpdate(_query, update) {
        changes = update;
        return { _id: "assignment-1", ...update.$set };
      },
    },
  });

  await handlers.updateAssignment({
    user: { role: "admin", userId: "admin-1", organizationId: "org-1" },
    params: { id: "assignment-1" },
    body: {
      status: "completed",
      organizationId: "org-2",
      createdAt: "forged",
      notes: "Gate code confirmed",
    },
  }, response());

  assert.deepEqual(changes, {
    $set: { notes: "Gate code confirmed" },
    $inc: { calendarSequence: 1 },
  });
});
