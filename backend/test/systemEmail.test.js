const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sendSystemEmail,
  requiredEmailConfig,
  resetTokenCache,
} = require("../services/systemEmail");

const EMAIL_ENV_KEYS = [
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "SYSTEM_EMAIL_ADDRESS",
  "SYSTEM_EMAIL_NAME",
];

function configureEmailEnvironment() {
  process.env.MICROSOFT_TENANT_ID = "tenant-id";
  process.env.MICROSOFT_CLIENT_ID = "client-id";
  process.env.MICROSOFT_CLIENT_SECRET = "client-secret";
  process.env.SYSTEM_EMAIL_ADDRESS = "notifications@afterlightinspections.com";
  process.env.SYSTEM_EMAIL_NAME = "Afterlight Notifications";
}

test("reports missing Microsoft Graph email configuration clearly", () => {
  const previous = Object.fromEntries(
    EMAIL_ENV_KEYS.map((key) => [key, process.env[key]])
  );
  try {
    EMAIL_ENV_KEYS.forEach((key) => delete process.env[key]);
    assert.throws(
      () => requiredEmailConfig(),
      /tenantId, clientId, clientSecret, senderAddress/
    );
  } finally {
    EMAIL_ENV_KEYS.forEach((key) => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
});

test("sends MIME email through Graph and reuses a valid access token", async () => {
  const previousFetch = global.fetch;
  const previous = Object.fromEntries(
    EMAIL_ENV_KEYS.map((key) => [key, process.env[key]])
  );
  const calls = [];
  try {
    configureEmailEnvironment();
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
      attachments: [{
        filename: "test.txt",
        content: Buffer.from("attachment"),
        contentType: "text/plain",
      }],
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
    assert.match(
      graphCalls[0].url,
      /users\/notifications%40afterlightinspections\.com\/sendMail$/
    );
    assert.equal(graphCalls[0].options.headers.Authorization, "Bearer graph-token");
    const mime = Buffer.from(graphCalls[0].options.body, "base64").toString("utf8");
    assert.match(
      mime,
      /From: Afterlight Notifications <notifications@afterlightinspections\.com>/
    );
    assert.match(mime, /To: recipient@example\.com/);
    assert.match(mime, /Subject: Afterlight test/);
    assert.match(mime, /filename=test\.txt/);
  } finally {
    global.fetch = previousFetch;
    resetTokenCache();
    EMAIL_ENV_KEYS.forEach((key) => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
});
