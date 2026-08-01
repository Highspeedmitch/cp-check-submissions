const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const authSource = fs.readFileSync(
  path.join(__dirname, "..", "Routes", "auth.js"),
  "utf8"
);

test("public login failures do not identify the invalid credential", () => {
  assert.doesNotMatch(authSource, /Invalid credentials \(user not found\)/);
  assert.doesNotMatch(authSource, /Invalid credentials \(incorrect password\)/);
  assert.match(authSource, /The email or password you entered is incorrect/);
  assert.match(authSource, /bcrypt\.compare\(suppliedPassword, INVALID_LOGIN_PASSWORD_HASH\)/);
});

test("password recovery does not disclose account existence", () => {
  assert.doesNotMatch(authSource, /No account found with that email/);
  assert.match(authSource, /If the email matches an account, password reset instructions will be sent/);
});
