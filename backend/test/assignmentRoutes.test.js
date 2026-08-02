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
              return { _id: "user-1" };
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
  assert.equal(savedAssignment.eventType, "Maintenance");
  assert.equal(savedAssignment.fulfillment.source, "customer_employee");
  assert.equal(savedAssignment.fulfillment.queue, "customer_assigned");
  assert.equal(savedAssignment.fulfillment.invoiceRouting, "none");
  assert.equal(notification.userId, "user-1");
  assert.equal(notification.type, "assignment_created");
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
        return { select: () => ({ lean: async () => ({ _id: "user-1" }) }) };
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
  assert.equal(notification.route, "/resource");
  assert.equal(notification.recipientScope, "afterlight_resource");
});

test("property managers only list assignments for managed properties", async () => {
  let assignmentQuery;
  const assignments = [{ _id: "assignment-1" }];
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
  assert.equal(res.body, assignments);
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

test("scheduler user lookup retains organization and role filters", async () => {
  let userQuery;
  const users = [{ _id: "user-1", role: "user" }];
  const handlers = createAssignmentHandlers({
    UserModel: {
      find(query) {
        userQuery = query;
        return {
          async select(selection) {
            assert.equal(selection, "_id email role");
            return users;
          },
        };
      },
    },
    schedulerResources: async () => [],
  });
  const res = response();

  await handlers.listSchedulerUsers({
    user: { role: "admin", organizationId: "org-1" },
    query: { roles: "all" },
  }, res);

  assert.deepEqual(res.body, users);
  assert.equal(userQuery.organizationId, "org-1");
  assert.deepEqual(userQuery.role, {
    $in: ["user", "contractor", "cleaner"],
  });
});

test("assignment updates remain scoped to the authenticated organization", async () => {
  let updateQuery;
  const updated = { _id: "assignment-1", notes: "Gate code confirmed" };
  const handlers = createAssignmentHandlers({
    AssignmentModel: {
      async findOneAndUpdate(query, changes, options) {
        updateQuery = query;
        assert.deepEqual(changes, { notes: "Gate code confirmed" });
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
          startDate: new Date("2026-08-10T12:00:00.000Z"),
          fulfillment: { source: "afterlight_contractor" },
          compensationSnapshot: originalSnapshot,
        };
      },
      async findOneAndUpdate(_query, changes) {
        writtenChanges = changes;
        return { _id: "assignment-1", ...changes };
      },
    },
    resolveAssignee: async () => ({
      userId: "resource-user-1",
      resourceProfileId: "resource-1",
      resourceDeploymentId: "deployment-1",
      compensationSnapshot: { ...originalSnapshot, amountCents: 9000 },
    }),
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
});

test("assignment deletion remains scoped to the authenticated organization", async () => {
  let deleteQuery;
  const handlers = createAssignmentHandlers({
    AssignmentModel: {
      async findOneAndDelete(query) {
        deleteQuery = query;
        return { _id: "assignment-1" };
      },
    },
  });
  const res = response();

  await handlers.deleteAssignment({
    user: { role: "admin", organizationId: "org-1" },
    params: { id: "assignment-1" },
  }, res);

  assert.deepEqual(deleteQuery, {
    _id: "assignment-1",
    organizationId: "org-1",
    status: "scheduled",
  });
  assert.deepEqual(res.body, {
    success: true,
    message: "Assignment deleted successfully",
  });
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
        return { _id: "assignment-1", ...update };
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

  assert.deepEqual(changes, { notes: "Gate code confirmed" });
});
