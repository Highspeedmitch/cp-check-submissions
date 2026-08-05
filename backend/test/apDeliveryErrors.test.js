const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SAFE_AP_DELIVERY_ERROR,
  apDeliveryFailure,
} = require("../services/apDeliveryErrors");

test("sanitizes provider failures before persistence, response, and structured logging", () => {
  const rawMessage = "User arn:aws:iam::123456789012:user/sender cannot use configuration-set/private";
  const result = apDeliveryFailure({
    code: "AccessDeniedException",
    message: rawMessage,
    requestId: "request-123",
    statusCode: 403,
    retryable: false,
  });

  assert.equal(result.status, 502);
  assert.equal(result.userMessage, SAFE_AP_DELIVERY_ERROR);
  assert.equal(result.errorCode, "AccessDeniedException");
  assert.equal(result.providerRequestId, "request-123");
  assert.equal(result.httpStatusCode, 403);
  assert.doesNotMatch(JSON.stringify(result), /123456789012|sender|configuration-set\/private/);
});

test("retains safe local AP address validation guidance", () => {
  const result = apDeliveryFailure(new Error("Enter a valid AP email address."));

  assert.equal(result.status, 400);
  assert.equal(result.userMessage, "Enter a valid AP email address.");
});
