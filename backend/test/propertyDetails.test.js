const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePropertyDetails } = require("../services/propertyDetails");

test("commercial property details are normalized", () => {
  assert.deepEqual(normalizePropertyDetails({
    name: "  Broadway Center ",
    propertyCode: " BC12 ",
    physicalAddress: " 1 Main Street ",
    lat: "32.22",
    lng: "-110.91",
  }, "COM"), {
    name: "Broadway Center",
    propertyCode: "BC12",
    physicalAddress: "1 Main Street",
    lat: 32.22,
    lng: -110.91,
  });
});

test("commercial property details require code, address, and valid coordinates", () => {
  assert.throws(() => normalizePropertyDetails({
    name: "Property", propertyCode: "", physicalAddress: "1 Main", lat: 1, lng: 1,
  }, "COM"), /property code is required/i);
  assert.throws(() => normalizePropertyDetails({
    name: "Property", propertyCode: "P1", physicalAddress: "", lat: 1, lng: 1,
  }, "COM"), /physical property address is required/i);
  assert.throws(() => normalizePropertyDetails({
    name: "Property", propertyCode: "P1", physicalAddress: "1 Main", lat: 100, lng: 1,
  }, "COM"), /valid latitude/i);
  assert.throws(() => normalizePropertyDetails({
    name: "Property", propertyCode: "P1", physicalAddress: "1 Main", lat: "", lng: "",
  }, "COM"), /valid latitude/i);
});
