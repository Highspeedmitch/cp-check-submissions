const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { createSesEventsRouter } = require("../Routes/sesEvents");

function post(server, body) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/api/integrations/ses-events",
      method: "POST",
      headers: {
        "content-type": "text/plain; charset=UTF-8",
        "content-length": Buffer.byteLength(body),
      },
    }, (response) => {
      let responseBody = "";
      response.on("data", (chunk) => { responseBody += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body: responseBody }));
    });
    request.on("error", reject);
    request.end(body);
  });
}

test("accepts a verified SES notification delivered as SNS text", async (t) => {
  let applied;
  const app = express();
  app.use(
    "/api/integrations/ses-events",
    express.text({ type: ["application/json", "text/plain"] }),
    createSesEventsRouter({
      verify: async () => true,
      applyEvent: async (event, metadata) => {
        applied = { event, metadata };
        return { status: "updated" };
      },
    })
  );
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));

  const response = await post(server, JSON.stringify({
    Type: "Notification",
    MessageId: "sns-message-1",
    Message: JSON.stringify({ eventType: "Delivery", mail: { messageId: "ses-message-1" } }),
  }));

  assert.equal(response.status, 204);
  assert.equal(applied.event.eventType, "Delivery");
  assert.equal(applied.metadata.snsMessageId, "sns-message-1");
});

test("returns a retryable response while an invoice delivery record is being saved", async (t) => {
  const app = express();
  app.use(
    "/api/integrations/ses-events",
    express.text({ type: ["application/json", "text/plain"] }),
    createSesEventsRouter({
      verify: async () => true,
      applyEvent: async () => ({ status: "retry" }),
    })
  );
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));

  const response = await post(server, JSON.stringify({
    Type: "Notification",
    MessageId: "sns-message-2",
    Message: JSON.stringify({ eventType: "Delivery" }),
  }));
  assert.equal(response.status, 503);
});

test("confirms a verified SNS subscription without processing an SES event", async (t) => {
  let confirmed;
  let applied = false;
  const app = express();
  app.use(
    "/api/integrations/ses-events",
    express.text({ type: ["application/json", "text/plain"] }),
    createSesEventsRouter({
      verify: async () => true,
      confirm: async (envelope) => { confirmed = envelope; },
      applyEvent: async () => { applied = true; },
    })
  );
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));

  const response = await post(server, JSON.stringify({
    Type: "SubscriptionConfirmation",
    MessageId: "sns-subscription-1",
    TopicArn: "arn:aws:sns:us-east-2:123456789012:afterlight-dev-events",
    SubscribeURL: "https://sns.us-east-2.amazonaws.com/?Action=ConfirmSubscription",
  }));

  assert.equal(response.status, 204);
  assert.equal(confirmed.MessageId, "sns-subscription-1");
  assert.equal(applied, false);
});
