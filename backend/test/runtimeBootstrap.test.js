const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeRuntime } = require("../runtimeBootstrap");

test("shared runtime initialization validates config and initializes push services", () => {
  const calls = [];
  const env = { NODE_ENV: "test" };
  const result = initializeRuntime({
    env,
    validateSecurity(received) { calls.push(["security", received]); },
    validateTotp(received) { calls.push(["totp", received]); },
    initializePush(received) {
      calls.push(["firebase", received]);
      return true;
    },
  });

  assert.deepEqual(calls, [
    ["security", env],
    ["totp", env],
    ["firebase", env],
  ]);
  assert.equal(result.firebaseConfigured, true);
  assert.equal(typeof result.monitoringEnabled, "boolean");
});
