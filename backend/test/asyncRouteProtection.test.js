const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

test("Express forwards rejected async route promises to error middleware", async (t) => {
  const app = express();
  app.get("/async-failure", async () => {
    throw new Error("database unavailable");
  });
  app.use((error, _req, res, _next) => {
    res.status(503).json({ error: error.message });
  });

  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  const result = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/async-failure`, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ response, body }));
    }).on("error", reject);
  });

  assert.equal(result.response.statusCode, 503);
  assert.deepEqual(JSON.parse(result.body), { error: "database unavailable" });
  assert.ok(Number(express.version?.split(".")[0] || require("express/package.json").version.split(".")[0]) >= 5);
});
