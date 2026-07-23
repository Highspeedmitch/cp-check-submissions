const test = require("node:test");
const assert = require("node:assert/strict");
const authenticateToken = require("../middleware/authenticateToken");

test("rejects a request without an authorization token", () => {
  const req = { headers: {} };
  let response;
  const res = {
    status(statusCode) {
      response = { statusCode };
      return this;
    },
    json(body) {
      response.body = body;
      return this;
    },
  };

  authenticateToken(req, res, () => assert.fail("next should not be called"));

  assert.deepEqual(response, {
    statusCode: 401,
    body: { message: "Access denied. No token provided." },
  });
});
