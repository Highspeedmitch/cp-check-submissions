const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeAccountStatus,
  isValidAccountStatus,
} = require("../utils/accountStatus");

test("legacy users without an account status default to active", () => {
  assert.equal(normalizeAccountStatus(undefined), "active");
  assert.equal(normalizeAccountStatus(null), "active");
  assert.equal(normalizeAccountStatus(""), "active");
});

test("explicit account statuses are preserved and validated", () => {
  assert.equal(normalizeAccountStatus("inactive"), "inactive");
  assert.equal(isValidAccountStatus("active"), true);
  assert.equal(isValidAccountStatus("inactive"), true);
  assert.equal(isValidAccountStatus("suspended"), false);
});
