const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const configurationPath = path.resolve(__dirname, "../../infra/inspection-bucket-cors.json");

test("inspection bucket CORS permits browser uploads from every supported frontend", () => {
  const configuration = JSON.parse(fs.readFileSync(configurationPath, "utf8"));
  const rules = configuration.CORSRules.filter((rule) => (
    rule.ID === "afterlight-browser-inspection-uploads"
  ));

  assert.equal(rules.length, 1);
  const [rule] = rules;
  assert.deepEqual(rule.AllowedMethods, ["POST"]);
  assert.deepEqual(rule.AllowedHeaders, ["*"]);
  assert.ok(rule.ExposeHeaders.includes("ETag"));
  assert.ok(rule.AllowedOrigins.includes("https://app.afterlightinspections.com"));
  assert.ok(rule.AllowedOrigins.includes("https://dev.afterlightinspections.com"));
  assert.ok(rule.AllowedOrigins.includes("https://afterlightinspections-dev.onrender.com"));
  assert.ok(rule.AllowedOrigins.includes("http://localhost:3000"));
  assert.equal(rule.AllowedOrigins.includes("*"), false);
});
