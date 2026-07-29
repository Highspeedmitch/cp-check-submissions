const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sendSystemEmail,
  requiredEmailConfig,
  resetTokenCache,
} = require("../services/systemEmail");

const EMAIL_ENV_KEYS = [
  "SYSTEM_EMAIL_PROVIDER",
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "SES_REGION",
  "SES_ACCESS_KEY_ID",
  "SES_SECRET_ACCESS_KEY",
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

function configureGraphEnvironment() {
  process.env.SYSTEM_EMAIL_PROVIDER = "graph";
  process.env.MICROSOFT_TENANT_ID = "tenant-id";
  process.env.MICROSOFT_CLIENT_ID = "client-id";
  process.env.MICROSOFT_CLIENT_SECRET = "client-secret";
  process.env.SYSTEM_EMAIL_ADDRESS = "notifications@afterlightinspections.com";
  process.env.SYSTEM_EMAIL_NAME = "Afterlight Notifications";
}

function configureSesEnvironment() {
  process.env.SYSTEM_EMAIL_PROVIDER = "ses";
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
    process.env.SYSTEM_EMAIL_PROVIDER = "ses";
    assert.throws(
      () => requiredEmailConfig(),
      /senderAddress, region, accessKeyId, secretAccessKey/
    );
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

test("sends MIME email through Graph and reuses a valid access token", async () => {
  const previousFetch = global.fetch;
  const previous = preserveEnvironment();
  const calls = [];
  try {
    configureGraphEnvironment();
    resetTokenCache();
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("/oauth2/v2.0/token")) {
        return new Response(JSON.stringify({
          access_token: "graph-token",
          expires_in: 3600,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 202 });
    };

    await sendSystemEmail({
      to: "recipient@example.com",
      subject: "Afterlight test",
      text: "Delivery test",
    });
    await sendSystemEmail({
      to: "second@example.com",
      subject: "Second test",
      text: "Second delivery",
    });

    assert.equal(
      calls.filter((call) => call.url.includes("/oauth2/v2.0/token")).length,
      1
    );
    const graphCalls = calls.filter((call) => call.url.includes("/sendMail"));
    assert.equal(graphCalls.length, 2);
    assert.equal(graphCalls[0].options.headers.Authorization, "Bearer graph-token");
  } finally {
    global.fetch = previousFetch;
    resetTokenCache();
    restoreEnvironment(previous);
  }
});
