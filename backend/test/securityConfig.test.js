const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getJwtSecret,
  validateRuntimeConfig,
} = require("../config/security");

test("JWT configuration has no built-in fallback", () => {
  assert.throws(
    () => getJwtSecret({}),
    /JWT_SECRET is required/
  );
  assert.equal(
    getJwtSecret({ JWT_SECRET: "configured-secret" }),
    "configured-secret"
  );
});

test("production startup reports all missing required configuration", () => {
  assert.throws(
    () => validateRuntimeConfig({
      NODE_ENV: "production",
      JWT_SECRET: "configured-secret",
    }),
    /MONGO_URI, S3_BUCKET_NAME, AWS_REGION, ADMIN_PASSKEY, ADD_PROPERTY_PASSKEY, REMOVE_PROPERTY_PASSKEY/
  );
});
