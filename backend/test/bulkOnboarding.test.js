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

test("Boutique property preview enforces required size and the strict 5,000-square-foot boundary", async () => {
  const preview = await previewBulkOnboarding({
    organization: organization({ serviceModel: "boutique", license: undefined }),
    type: "properties",
    csv: [
      "name,property_code,physical_address,billing_address,gross_square_feet,property_type",
      "Eligible,E-1,10 Main St,10 Main St,4999,free_standing",
      "Boundary,B-1,20 Main St,20 Main St,5000,free_standing",
      "Missing,M-1,30 Main St,30 Main St,,free_standing",
    ].join("\n"),
    ...models(),
  });

  assert.equal(preview.rows[0].errors.length, 0);
  assert.equal(preview.rows[0].data.grossSquareFeet, 4999);
  assert.equal(preview.rows[0].data.propertyType, "free_standing");
  assert.match(preview.rows[1].errors.join(" "), /under 5,000 square feet/i);
  assert.match(preview.rows[2].errors.join(" "), /square footage is required/i);
  assert.equal(preview.canCommit, false);
});

test("Boutique property preview cannot expand an organization beyond three properties", async () => {
  const preview = await previewBulkOnboarding({
    organization: organization({
      serviceModel: "boutique",
      license: undefined,
      properties: [
        { _id: "p-1", name: "One", propertyCode: "P-1", grossSquareFeet: 1000 },
        { _id: "p-2", name: "Two", propertyCode: "P-2", grossSquareFeet: 2000 },
      ],
    }),
    type: "properties",
    csv: [
      "name,property_code,physical_address,billing_address,gross_square_feet",
      "Three,P-3,30 Main St,30 Main St,3000",
      "Four,P-4,40 Main St,40 Main St,4000",
    ].join("\n"),
    ...models(),
  });

  assert.equal(preview.capacity.properties.limit, 3);
  assert.equal(preview.capacityError.code, "PROPERTY_LIMIT_REACHED");
  assert.equal(preview.canCommit, false);
});

test("user preview normalizes Field Operator assignment types", async () => {
  const preview = await previewBulkOnboarding({
    organization: organization(),
    type: "users",
    csv: "email,role,engagement_type\ncontractor@example.com,field_operator,customer_contractor",
    ...models(),
  });

  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows[0].data.role, "user");
  assert.equal(preview.rows[0].data.engagementType, "customer_contractor");
});

test("user preview requires cleaners to declare their assignment type", async () => {
  const preview = await previewBulkOnboarding({
    organization: organization(),
    type: "users",
    csv: "email,role,engagement_type\ncleaner@example.com,cleaner,",
    ...models(),
  });

  assert.equal(preview.canCommit, false);
  assert.match(preview.rows[0].errors.join(" "), /Customer Employee or Customer Contractor/);
});
