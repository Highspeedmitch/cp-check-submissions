function normalizePropertyDetails(input, orgType) {
  const name = String(input.name || "").trim();
  const propertyCode = String(input.propertyCode || "").trim();
  const physicalAddress = String(input.physicalAddress || "").trim();
  const lat = input.lat === "" || input.lat === null || input.lat === undefined
    ? Number.NaN
    : Number(input.lat);
  const lng = input.lng === "" || input.lng === null || input.lng === undefined
    ? Number.NaN
    : Number(input.lng);

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

  return { name, propertyCode, physicalAddress, lat, lng };
}

module.exports = { normalizePropertyDetails };
