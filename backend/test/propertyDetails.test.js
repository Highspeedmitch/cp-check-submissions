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
    region: "Uncategorized",
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

test("property details normalize a named route region and enforce its length", () => {
  assert.equal(normalizePropertyDetails({
    name: "Property",
    propertyCode: "P1",
    physicalAddress: "1 Main",
    lat: 32.2,
    lng: -110.9,
    region: "  Tucson   - East/Central  ",
  }, "COM").region, "Tucson - East/Central");

  assert.throws(() => normalizePropertyDetails({
    name: "Property",
    propertyCode: "P1",
    physicalAddress: "1 Main",
    lat: 32.2,
    lng: -110.9,
    region: "x".repeat(101),
  }, "COM"), /100 characters/i);
});
