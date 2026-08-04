const test = require("node:test");
const assert = require("node:assert/strict");
const requireCurrentOrganizationPresence = require("../middleware/requireCurrentOrganizationPresence");

function responseRecorder() {
  const state = {};
  return {
    state,
    response: {
      status(statusCode) {
        state.statusCode = statusCode;
        return this;
      },
      json(body) {
        state.body = body;
        return this;
      },
    },
  };
}

test("current organization users retain organization route access", () => {
  const { response } = responseRecorder();
  let continued = false;
  requireCurrentOrganizationPresence(
    { user: { organizationArchivedAt: null } },
    response,
    () => { continued = true; }
  );
  assert.equal(continued, true);
});

test("archived organization users are denied organization-only routes", () => {
  const { state, response } = responseRecorder();
  requireCurrentOrganizationPresence(
    { user: { organizationArchivedAt: new Date("2026-08-03T12:00:00.000Z") } },
    response,
    () => assert.fail("archived organization access must not continue")
  );
  assert.deepEqual(state, {
    statusCode: 403,
    body: { error: "This organization user has been archived." },
  });
});
