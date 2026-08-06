const test = require("node:test");
const assert = require("node:assert/strict");
const {
  backendMonitoringEnabled,
  boundedSampleRate,
  initializeBackendMonitoring,
} = require("../monitoring");

test("error monitoring stays disabled when no DSN is configured", () => {
  assert.equal(initializeBackendMonitoring({}), false);
  assert.equal(backendMonitoringEnabled(), false);
});

test("trace sampling accepts only bounded values", () => {
  assert.equal(boundedSampleRate("0.1"), 0.1);
  assert.equal(boundedSampleRate("2"), 0.05);
  assert.equal(boundedSampleRate("invalid"), 0.05);
});
