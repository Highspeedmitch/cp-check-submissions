const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../app");

async function requestHealth(app, t) {
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/health`, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ response, body }));
    }).on("error", reject);
  });
}

test("health endpoint reports readiness without authentication", async (t) => {
  const result = await requestHealth(createApp({ isReady: () => true }), t);

  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.headers["cache-control"], "no-store");
  assert.deepEqual(JSON.parse(result.body), {
    status: "ok",
    service: "afterlight-api",
  });
});

test("health endpoint fails readiness when the database is unavailable", async (t) => {
  const result = await requestHealth(createApp({ isReady: () => false }), t);

  assert.equal(result.response.statusCode, 503);
  assert.deepEqual(JSON.parse(result.body), {
    status: "unavailable",
    service: "afterlight-api",
  });
});
