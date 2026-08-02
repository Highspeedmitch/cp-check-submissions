const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sendSystemEmail,
  requiredEmailConfig,
} = require("../services/systemEmail");

const EMAIL_ENV_KEYS = [
  "SES_REGION",
  "SES_ACCESS_KEY_ID",
  "SES_SECRET_ACCESS_KEY",
  "SES_SESSION_TOKEN",
  "SYSTEM_EMAIL_ADDRESS",
  "SYSTEM_EMAIL_NAME",
];

function preserveEnvironment() {
  return Object.fromEntries(
    EMAIL_ENV_KEYS.map((key) => [key, process.env[key]])
  );
}

function restoreEnvironment(previous) {
  EMAIL_ENV_KEYS.forEach((key) => {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  });
}

function configureSesEnvironment() {
  process.env.SES_REGION = "us-east-2";
  process.env.SES_ACCESS_KEY_ID = "test-access-key";
  process.env.SES_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.SYSTEM_EMAIL_ADDRESS = "notifications@afterlightinspections.com";
  process.env.SYSTEM_EMAIL_NAME = "Afterlight Notifications";
}

test("reports missing Amazon SES email configuration clearly", () => {
  const previous = preserveEnvironment();
  try {
    EMAIL_ENV_KEYS.forEach((key) => delete process.env[key]);
    assert.throws(
      () => requiredEmailConfig(),
      /senderAddress, region, accessKeyId, secretAccessKey/
    );
  } finally {
    restoreEnvironment(previous);
  }
});

test("uses Amazon SES as the only email provider", () => {
  const previous = preserveEnvironment();
  try {
    configureSesEnvironment();
    assert.equal(requiredEmailConfig().provider, "ses");
  } finally {
    restoreEnvironment(previous);
  }
});

test("supports temporary Amazon SES credentials with a session token", () => {
  const previous = preserveEnvironment();
  try {
    configureSesEnvironment();
    process.env.SES_SESSION_TOKEN = "test-session-token";
    assert.equal(requiredEmailConfig().sessionToken, "test-session-token");
  } finally {
    restoreEnvironment(previous);
  }
});

test("sends MIME email with attachments through Amazon SES", async () => {
  const previous = preserveEnvironment();
  let request;
  try {
    configureSesEnvironment();
    const sesClient = {
      sendRawEmail(params) {
        request = params;
        return {
          promise: async () => ({ MessageId: "ses-message-id" }),
        };
      },
    };

    const result = await sendSystemEmail({
      to: "recipient@example.com",
      subject: "Afterlight SES test",
      text: "Delivery test",
      attachments: [{
        filename: "test.txt",
        content: Buffer.from("attachment"),
        contentType: "text/plain",
      }],
    }, { sesClient });

    assert.equal(result.provider, "ses");
    assert.equal(result.messageId, "ses-message-id");
    assert.equal(request.Source, "notifications@afterlightinspections.com");
    const mime = request.RawMessage.Data.toString("utf8");
    assert.match(
      mime,
      /From: Afterlight Notifications <notifications@afterlightinspections\.com>/
    );
    assert.match(mime, /To: recipient@example\.com/);
    assert.match(mime, /Subject: Afterlight SES test/);
    assert.match(mime, /filename=test\.txt/);
  } finally {
    restoreEnvironment(previous);
  }
});
