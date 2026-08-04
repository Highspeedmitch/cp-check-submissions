const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_PROPERTY_RECIPIENTS,
  mergePropertyInspectionRecipients,
  normalizeEmailAddress,
  normalizePropertyEmails,
  withoutAutomaticPropertyEmails,
} = require("../services/propertyEmails");

test("single AP email addresses are normalized and validated", () => {
  assert.equal(normalizeEmailAddress(" AP@Example.com ", "AP email address"), "ap@example.com");
  assert.throws(
    () => normalizeEmailAddress("not-an-email", "AP email address"),
    /valid AP email address/
  );
});

test("property inspection emails are normalized and deduplicated", () => {
  assert.deepEqual(
    normalizePropertyEmails([" Manager@Example.com ", "manager@example.com", "ap@example.com"]),
    ["manager@example.com", "ap@example.com"]
  );
});

test("assigned property manager emails cannot be added as manual recipients", () => {
  assert.throws(
    () => normalizePropertyEmails(
      ["ops@example.com", "MANAGER@example.com"],
      { automaticEmails: ["manager@example.com"] }
    ),
    (error) => error.status === 409 && /included automatically/.test(error.message)
  );
});

test("automatic managers and manual business recipients merge without duplicate delivery", () => {
  assert.deepEqual(
    mergePropertyInspectionRecipients(
      ["ops@example.com", "manager@example.com"],
      ["MANAGER@example.com", "regional@example.com"]
    ),
    ["ops@example.com", "manager@example.com", "regional@example.com"]
  );
  assert.deepEqual(
    withoutAutomaticPropertyEmails(
      ["ops@example.com", "MANAGER@example.com"],
      ["manager@example.com"]
    ),
    ["ops@example.com"]
  );
});

test("property inspection emails may be cleared", () => {
  assert.deepEqual(normalizePropertyEmails([]), []);
});

test("invalid property inspection emails are rejected", () => {
  assert.throws(
    () => normalizePropertyEmails(["not-an-email"]),
    /Enter a valid email address/
  );
  assert.throws(
    () => normalizePropertyEmails(Array.from(
      { length: MAX_PROPERTY_RECIPIENTS + 1 },
      (_, index) => `recipient${index}@example.com`
    )),
    /up to 25/
  );
});
