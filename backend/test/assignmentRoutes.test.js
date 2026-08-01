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
  assert.equal(savedAssignment.organizationId, "org-1");
  assert.equal(savedAssignment.eventType, "Maintenance");
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
  });
  const res = response();

  await handlers.listSchedulerUsers({
    user: { role: "admin", organizationId: "org-1" },
    query: { roles: "all" },
  }, res);

  assert.equal(res.body, users);
  assert.equal(userQuery.organizationId, "org-1");
  assert.deepEqual(userQuery.role, {
    $in: ["user", "contractor", "cleaner"],
  });
});

test("assignment updates remain scoped to the authenticated organization", async () => {
  let updateQuery;
  const updated = { _id: "assignment-1", propertyName: "San Clemente" };
  const handlers = createAssignmentHandlers({
    AssignmentModel: {
      async findOneAndUpdate(query, changes, options) {
        updateQuery = query;
        assert.deepEqual(changes, { propertyName: "San Clemente" });
        assert.deepEqual(options, { new: true });
        return updated;
      },
    },
  });
  const res = response();

  await handlers.updateAssignment({
    user: { role: "admin", organizationId: "org-1" },
    params: { id: "assignment-1" },
    body: { propertyName: "San Clemente" },
  }, res);

  assert.deepEqual(updateQuery, {
    _id: "assignment-1",
    organizationId: "org-1",
  });
  assert.deepEqual(res.body, { success: true, assignment: updated });
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

test("assignment updates discard tenant and audit fields from request bodies", async () => {
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
    },
  }, response());

  assert.deepEqual(changes, { status: "completed" });
});
