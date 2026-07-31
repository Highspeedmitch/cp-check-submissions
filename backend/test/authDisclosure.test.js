const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const serverSource = fs.readFileSync(
  path.join(__dirname, "..", "server.js"),
  "utf8"
);

test("public login failures do not identify the invalid credential", () => {
  assert.doesNotMatch(serverSource, /Invalid credentials \(user not found\)/);
  assert.doesNotMatch(serverSource, /Invalid credentials \(incorrect password\)/);
  assert.match(serverSource, /The email or password you entered is incorrect/);
  assert.match(serverSource, /bcrypt\.compare\(suppliedPassword, INVALID_LOGIN_PASSWORD_HASH\)/);
});

test("password recovery does not disclose account existence", () => {
  assert.doesNotMatch(serverSource, /No account found with that email/);
  assert.match(serverSource, /If the email matches an account, password reset instructions will be sent/);
});
