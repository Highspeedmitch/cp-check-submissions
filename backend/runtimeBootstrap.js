require("dotenv").config();
require("./instrument");

const { backendMonitoringEnabled } = require("./monitoring");
const { validateRuntimeConfig } = require("./config/security");
const { initializeFirebase } = require("./config/firebase");
const { config: validateTotpConfig } = require("./services/totpMfa");

function initializeRuntime({
  env = process.env,
  validateSecurity = validateRuntimeConfig,
  validateTotp = validateTotpConfig,
  initializePush = initializeFirebase,
} = {}) {
  validateSecurity(env);
  validateTotp(env);
  const firebaseConfigured = initializePush(env);
  return {
    firebaseConfigured,
    monitoringEnabled: backendMonitoringEnabled(),
  };
}

module.exports = { initializeRuntime };
