const test = require("node:test");
const assert = require("node:assert/strict");
const { serializeOrganizationOnboarding } = require("../services/organizationOnboarding");

function organization(overrides = {}) {
  return {
    _id: "org-1",
    name: "Example Organization",
    orgType: "COM",
    reportingTimezone: "America/Phoenix",
    serviceModel: "managed",
    fulfillmentPolicy: { defaultSource: "afterlight_staff" },
    properties: [],
    security: { adminActionPasskeyHash: "" },
    onboarding: { status: "in_progress", initiatedAt: new Date("2026-08-04T12:00:00Z") },
    ...overrides,
  };
}

test("guided onboarding derives required progress from current organization configuration", () => {
  const result = serializeOrganizationOnboarding({ organization: organization() });
  assert.equal(result.guided, true);
  assert.deepEqual(result.progress, { requiredComplete: 1, requiredTotal: 3, percent: 33 });
  assert.equal(result.canComplete, false);
  assert.equal(result.steps.find((item) => item.id === "security").complete, false);
  assert.equal(result.steps.find((item) => item.id === "property").complete, false);
});

test("security and a first property make guided onboarding ready to complete", () => {
  const result = serializeOrganizationOnboarding({
    organization: organization({
      properties: [{ _id: "property-1" }],
      security: { adminActionPasskeyHash: "hash" },
    }),
    activeUserCount: 2,
    completedSubmissionCount: 1,
  });
  assert.equal(result.progress.percent, 100);
  assert.equal(result.canComplete, true);
  assert.equal(result.steps.find((item) => item.id === "team").complete, true);
  assert.equal(result.steps.find((item) => item.id === "first_report").complete, true);
});

test("legacy organizations can use the guide without being enrolled or prompted", () => {
  const result = serializeOrganizationOnboarding({
    organization: organization({ onboarding: undefined }),
  });
  assert.equal(result.guided, false);
  assert.equal(result.status, "established");
  assert.equal(result.canComplete, false);
});
