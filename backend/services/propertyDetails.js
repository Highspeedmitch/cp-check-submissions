const { normalizeRegion } = require("./routeScopes");
const { normalizePropertySquareFeet, normalizePropertyType } = require("./boutiquePolicy");

function normalizePropertyDetails(input, orgType, organizationOrServiceModel = null) {
  const name = String(input.name || "").trim();
  const propertyCode = String(input.propertyCode || "").trim();
  const physicalAddress = String(input.physicalAddress || "").trim();
  const lat = input.lat === "" || input.lat === null || input.lat === undefined
    ? Number.NaN
    : Number(input.lat);
  const lng = input.lng === "" || input.lng === null || input.lng === undefined
    ? Number.NaN
    : Number(input.lng);
  const region = normalizeRegion(input.region);
  const grossSquareFeet = normalizePropertySquareFeet(
    input.grossSquareFeet,
    organizationOrServiceModel,
    { required: organizationOrServiceModel?.serviceModel === "boutique" || organizationOrServiceModel === "boutique" }
  );
  const propertyType = normalizePropertyType(
    input.propertyType,
    organizationOrServiceModel,
    { required: organizationOrServiceModel?.serviceModel === "boutique" || organizationOrServiceModel === "boutique" }
  );

  if (!name || name.length > 120) {
    throw new Error("Property name is required and must be 120 characters or fewer.");
  }
  if (orgType === "COM" && !propertyCode) {
    throw new Error("A property code is required for commercial properties.");
  }
  if (!physicalAddress) {
    throw new Error("Physical property address is required.");
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error("Enter a valid latitude.");
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error("Enter a valid longitude.");
  }

  return { name, propertyCode, physicalAddress, lat, lng, region, grossSquareFeet, propertyType };
}

module.exports = { normalizePropertyDetails };
