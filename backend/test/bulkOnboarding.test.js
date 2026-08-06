const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseCsv,
  previewBulkOnboarding,
} = require("../services/bulkOnboarding");

function queryResult(value) {
  return {
    select() { return this; },
    session() { return this; },
    async lean() { return value; },
  };
}

function models({ activeUsers = 0, pendingUsers = 0, existingUsers = [], pendingInvites = [] } = {}) {
  return {
    UserModel: {
      countDocuments(filter) {
        return Promise.resolve(filter.role?.$ne === "admin" ? activeUsers : 0);
      },
      find() { return queryResult(existingUsers); },
    },
    InvitationModel: {
      countDocuments(filter) {
        return Promise.resolve(filter.role?.$ne === "admin" ? pendingUsers : 0);
      },
      find() { return queryResult(pendingInvites); },
    },
  };
}

function organization(overrides = {}) {
  return {
    _id: "org-1",
    orgType: "COM",
    serviceModel: "platform",
    license: { tier: "tier_1" },
    properties: [],
    ...overrides,
  };
}

test("CSV parser supports quoted commas and escaped quotes", () => {
  const rows = parseCsv('name,physical_address\n"Store, North","10 ""A"" Street"');
  assert.equal(rows[0].values.name, "Store, North");
  assert.equal(rows[0].values.physical_address, '10 "A" Street');
});

test("property preview normalizes valid rows and reports commercial requirements", async () => {
  const deps = models();
  const preview = await previewBulkOnboarding({
    organization: organization(),
    type: "properties",
    csv: [
      "name,property_code,physical_address,billing_address,region,latitude,longitude,inspection_recipient_emails",
      "North Shop,N-1,10 Main St,PO Box 5,North,33.45,-112.07,ops@example.com|owner@example.com",
      "Missing Fields,,,,,,,",
    ].join("\n"),
    ...deps,
  });
  assert.equal(preview.rowCount, 2);
  assert.equal(preview.rows[0].errors.length, 0);
  assert.deepEqual(preview.rows[0].data.emails, ["ops@example.com", "owner@example.com"]);
  assert.ok(preview.rows[1].errors.length >= 3);
  assert.equal(preview.canCommit, false);
});

test("user preview rejects administrator rows and unknown property assignments", async () => {
  const deps = models();
  const preview = await previewBulkOnboarding({
    organization: organization({
      properties: [{ _id: "property-1", name: "Known Property" }],
    }),
    type: "users",
    csv: [
      "email,role,property_names",
      "admin@example.com,admin,",
      "manager@example.com,property_manager,Missing Property",
    ].join("\n"),
    ...deps,
  });
  assert.match(preview.rows[0].errors.join(" "), /dedicated administrator workflow/i);
  assert.match(preview.rows[1].errors.join(" "), /Property not found/i);
  assert.equal(preview.canCommit, false);
});

test("user preview reserves pending invitations and blocks a file over licensed capacity", async () => {
  const deps = models({ activeUsers: 4, pendingUsers: 1 });
  const preview = await previewBulkOnboarding({
    organization: organization(),
    type: "users",
    csv: "email,role\nnew@example.com,user",
    ...deps,
  });
  assert.equal(preview.capacity.users.allocated, 5);
  assert.equal(preview.capacityError.code, "USER_LIMIT_REACHED");
  assert.equal(preview.canCommit, false);
});

test("managed service bulk onboarding remains unmetered", async () => {
  const deps = models({ activeUsers: 100, pendingUsers: 20 });
  const preview = await previewBulkOnboarding({
    organization: organization({ serviceModel: "managed", license: undefined }),
    type: "users",
    csv: "email,role\nnew@example.com,user",
    ...deps,
  });
  assert.equal(preview.capacity.users.unmetered, true);
  assert.equal(preview.canCommit, true);
});
