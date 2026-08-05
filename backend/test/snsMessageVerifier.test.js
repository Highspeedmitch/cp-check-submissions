const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  assertTrustedSnsUrl,
  buildCanonicalSnsMessage,
  verifySnsMessage,
} = require("../services/snsMessageVerifier");

const TOPIC_ARN = "arn:aws:sns:us-east-2:123456789012:afterlight-dev-events";

function signedMessage(overrides = {}) {
  const keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const message = {
    Type: "Notification",
    MessageId: "sns-message-1",
    TopicArn: TOPIC_ARN,
    Message: JSON.stringify({ eventType: "Delivery" }),
    Timestamp: "2026-08-04T15:00:00.000Z",
    SignatureVersion: "2",
    SigningCertURL: "https://sns.us-east-2.amazonaws.com/SimpleNotificationService-test.pem",
    ...overrides,
  };
  message.Signature = crypto.sign(
    "RSA-SHA256",
    Buffer.from(buildCanonicalSnsMessage(message), "utf8"),
    keys.privateKey
  ).toString("base64");
  return {
    message,
    publicKey: keys.publicKey.export({ type: "spki", format: "pem" }),
  };
}

test("verifies an SNS signature from the configured topic", async () => {
  const { message, publicKey } = signedMessage();
  assert.equal(await verifySnsMessage(message, {
    expectedTopicArn: TOPIC_ARN,
    loadCertificate: async () => publicKey,
  }), true);
});

test("rejects tampered SNS content and unexpected topics", async () => {
  const { message, publicKey } = signedMessage();
  await assert.rejects(
    verifySnsMessage({ ...message, Message: "tampered" }, {
      expectedTopicArn: TOPIC_ARN,
      loadCertificate: async () => publicKey,
    }),
    /signature is invalid/
  );
  await assert.rejects(
    verifySnsMessage(message, {
      expectedTopicArn: "arn:aws:sns:us-east-2:123456789012:another-topic",
      loadCertificate: async () => publicKey,
    }),
    /unexpected topic/
  );
});

test("restricts SNS certificate and confirmation URLs to the topic region", () => {
  assert.equal(
    assertTrustedSnsUrl(
      "https://sns.us-east-2.amazonaws.com/SimpleNotificationService-test.pem",
      TOPIC_ARN,
      { certificate: true }
    ).hostname,
    "sns.us-east-2.amazonaws.com"
  );
  assert.throws(
    () => assertTrustedSnsUrl(
      "https://example.com/SimpleNotificationService-test.pem",
      TOPIC_ARN,
      { certificate: true }
    ),
    /does not match/
  );
  assert.throws(
    () => assertTrustedSnsUrl(
      "http://sns.us-east-2.amazonaws.com/?Action=ConfirmSubscription",
      TOPIC_ARN
    ),
    /trusted HTTPS/
  );
});
