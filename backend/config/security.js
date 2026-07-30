const REQUIRED_PRODUCTION_VARIABLES = [
  "JWT_SECRET",
  "MONGO_URI",
  "S3_BUCKET_NAME",
  "AWS_REGION",
  "ADMIN_PASSKEY",
  "ADD_PROPERTY_PASSKEY",
  "REMOVE_PROPERTY_PASSKEY",
];

function getJwtSecret(env = process.env) {
  const secret = String(env.JWT_SECRET || "").trim();
  if (!secret) {
    throw new Error("JWT_SECRET is required. Refusing to issue or verify tokens.");
  }
  return secret;
}

function validateRuntimeConfig(env = process.env) {
  getJwtSecret(env);
  if (env.NODE_ENV !== "production" && !env.RENDER) return;

  const missing = REQUIRED_PRODUCTION_VARIABLES.filter(
    (name) => !String(env[name] || "").trim()
  );
  if (missing.length) {
    throw new Error(
      `Missing required production configuration: ${missing.join(", ")}`
    );
  }
}

module.exports = {
  REQUIRED_PRODUCTION_VARIABLES,
  getJwtSecret,
  validateRuntimeConfig,
};
