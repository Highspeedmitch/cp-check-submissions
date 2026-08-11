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
    grossSquareFeet: null,
    propertyType: null,
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

test("Boutique property details require a whole-number size strictly below 5,000 square feet", () => {
  const details = normalizePropertyDetails({
    name: "Small Office",
    propertyCode: "SM-1",
    physicalAddress: "10 Main Street",
    lat: 32.2,
    lng: -110.9,
    grossSquareFeet: "4999",
    propertyType: "individual_suite",
  }, "COM", { serviceModel: "boutique" });
  assert.equal(details.grossSquareFeet, 4999);
  assert.equal(details.propertyType, "individual_suite");

  const base = {
    name: "Small Office",
    propertyCode: "SM-1",
    physicalAddress: "10 Main Street",
    lat: 32.2,
    lng: -110.9,
  };
  assert.throws(
    () => normalizePropertyDetails(base, "COM", "boutique"),
    (error) => error.code === "BOUTIQUE_PROPERTY_SIZE_REQUIRED"
  );
  assert.throws(
    () => normalizePropertyDetails({ ...base, grossSquareFeet: 5000 }, "COM", "boutique"),
    (error) => error.code === "BOUTIQUE_PROPERTY_SIZE_EXCEEDED"
  );
  assert.throws(
    () => normalizePropertyDetails({ ...base, grossSquareFeet: 4999.5 }, "COM", "boutique"),
    (error) => error.code === "PROPERTY_SIZE_INVALID"
  );
});
