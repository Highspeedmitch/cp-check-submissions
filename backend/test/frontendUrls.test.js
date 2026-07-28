const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeFrontendOrigin,
  getFrontendUrl,
  getAllowedFrontendOrigins,
  buildFrontendUrl,
} = require("../utils/frontendUrls");

test("frontend origins are normalized and deduplicated", () => {
  const environment = {
    NODE_ENV: "production",
    FRONTEND_URL: "https://afterlightinspections-dev.onrender.com/",
    FRONTEND_ORIGINS: [
      "https://cp-check-submissions-dev.onrender.com",
      " https://afterlightinspections-dev.onrender.com/ ",
    ].join(","),
  };

  assert.deepEqual(getAllowedFrontendOrigins(environment), [
    "https://afterlightinspections-dev.onrender.com",
    "https://cp-check-submissions-dev.onrender.com",
  ]);
});

test("frontend links use the configured primary URL", () => {
  const environment = {
    NODE_ENV: "production",
    FRONTEND_URL: "https://afterlightinspections-dev.onrender.com",
  };

  assert.equal(
    buildFrontendUrl("/reset-password?token=test-token", environment),
    "https://afterlightinspections-dev.onrender.com/reset-password?token=test-token"
  );
});

test("production requires a configured frontend URL", () => {
  assert.throws(
    () => getFrontendUrl({ NODE_ENV: "production" }),
    /FRONTEND_URL is required/
  );
});

test("frontend origins reject paths and unsupported protocols", () => {
  assert.throws(
    () => normalizeFrontendOrigin("https://example.com/login"),
    /without a path/
  );
  assert.throws(
    () => normalizeFrontendOrigin("javascript:alert(1)"),
    /HTTP\(S\) origin/
  );
});
