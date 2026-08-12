const test = require("node:test");
const assert = require("node:assert/strict");
const {
  recordsById,
  deploymentSummariesByResource,
} = require("../services/directoryStats");

test("directory statistics are addressable by string and object-like identifiers", () => {
  const rows = recordsById([
    { _id: { toString: () => "resource-1" }, assignmentCount: 4 },
  ]);
  assert.equal(rows.get("resource-1").assignmentCount, 4);
});

test("deployment summaries count deployments and deduplicate organization names", () => {
  const summaries = deploymentSummariesByResource([
    { resourceProfileId: "resource-1", organizationId: { name: "PICOR" } },
    { resourceProfileId: "resource-1", organizationId: { name: "PICOR" } },
    { resourceProfileId: "resource-1", organizationId: { name: "Other" } },
    { resourceProfileId: "resource-2", organizationId: null },
  ]);

  assert.deepEqual(summaries.get("resource-1"), {
    deploymentCount: 3,
    deployedOrganizations: ["PICOR", "Other"],
  });
  assert.deepEqual(summaries.get("resource-2"), {
    deploymentCount: 1,
    deployedOrganizations: [],
  });
});
