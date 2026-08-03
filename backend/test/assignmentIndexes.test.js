const test = require("node:test");
const assert = require("node:assert/strict");
const Assignment = require("../models/assignment");
const {
  ensureAssignmentSchedulingIndex,
  isScheduledOnlyIndex,
  matchesScheduleKey,
} = require("../services/assignmentIndexes");

test("assignment schema limits exact-date uniqueness to scheduled work", () => {
  const scheduleIndex = Assignment.schema.indexes().find(([fields]) => (
    fields.propertyName === 1
    && fields.startDate === 1
    && fields.organizationId === 1
  ));

  assert.ok(scheduleIndex);
  assert.equal(scheduleIndex[1].unique, true);
  assert.deepEqual(scheduleIndex[1].partialFilterExpression, { status: "scheduled" });
  assert.equal(scheduleIndex[1].name, "scheduled_property_start_organization_unique");
  assert.equal(Assignment.schema.options.autoIndex, false);
});

test("assignment index matching distinguishes the legacy and scheduled-only indexes", () => {
  const key = { propertyName: 1, startDate: 1, organizationId: 1 };
  assert.equal(matchesScheduleKey({ key }), true);
  assert.equal(matchesScheduleKey({ key: { organizationId: 1, startDate: 1 } }), false);
  assert.equal(isScheduledOnlyIndex({ unique: true }), false);
  assert.equal(isScheduledOnlyIndex({
    unique: true,
    partialFilterExpression: { status: "scheduled" },
  }), true);
});

test("legacy assignment uniqueness is replaced during startup", async () => {
  const dropped = [];
  let createIndexesCalls = 0;
  const AssignmentModel = {
    collection: {
      async indexes() {
        return [
          { name: "_id_", key: { _id: 1 }, unique: true },
          {
            name: "propertyName_1_startDate_1_organizationId_1",
            key: { propertyName: 1, startDate: 1, organizationId: 1 },
            unique: true,
          },
        ];
      },
      async dropIndex(name) { dropped.push(name); },
    },
    async createIndexes() { createIndexesCalls += 1; },
  };

  const result = await ensureAssignmentSchedulingIndex({ AssignmentModel });

  assert.deepEqual(dropped, ["propertyName_1_startDate_1_organizationId_1"]);
  assert.equal(createIndexesCalls, 1);
  assert.deepEqual(result, {
    changed: true,
    indexName: "scheduled_property_start_organization_unique",
  });
});

test("an existing scheduled-only index makes startup migration a no-op", async () => {
  let dropped = false;
  let createIndexesCalls = 0;
  const AssignmentModel = {
    collection: {
      async indexes() {
        return [{
          name: "scheduled_property_start_organization_unique",
          key: { propertyName: 1, startDate: 1, organizationId: 1 },
          unique: true,
          partialFilterExpression: { status: "scheduled" },
        }];
      },
      async dropIndex() { dropped = true; },
    },
    async createIndexes() { createIndexesCalls += 1; },
  };

  const result = await ensureAssignmentSchedulingIndex({ AssignmentModel });

  assert.equal(dropped, false);
  assert.equal(createIndexesCalls, 0);
  assert.deepEqual(result, {
    changed: false,
    indexName: "scheduled_property_start_organization_unique",
  });
});

test("a new assignments collection receives the schema indexes", async () => {
  let createIndexesCalls = 0;
  const AssignmentModel = {
    collection: {
      async indexes() {
        const error = new Error("namespace does not exist");
        error.code = 26;
        throw error;
      },
    },
    async createIndexes() { createIndexesCalls += 1; },
  };

  const result = await ensureAssignmentSchedulingIndex({ AssignmentModel });

  assert.equal(createIndexesCalls, 1);
  assert.deepEqual(result, {
    changed: false,
    indexName: "scheduled_property_start_organization_unique",
  });
});
