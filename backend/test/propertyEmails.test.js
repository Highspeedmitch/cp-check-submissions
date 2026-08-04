const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_PROPERTY_RECIPIENTS,
  normalizeEmailAddress,
  normalizePropertyEmails,
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
