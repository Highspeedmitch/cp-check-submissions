const mongoose = require("mongoose");
const Organization = require("../models/organization");
const {
  assertLicenseCapacity,
  currentLicenseCapacity,
  touchCapacityVersion,
  withSession,
} = require("./licenseCapacity");

async function defaultTransactionRunner(work) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function reserveLicensedCapacity({
  organizationId,
  dimension,
  additional = 1,
  actorUserId = null,
  now = new Date(),
  work,
  OrganizationModel = Organization,
  transactionRunner = defaultTransactionRunner,
  capacityOptions = {},
}) {
  return transactionRunner(async (session) => {
    const organization = await withSession(OrganizationModel.findById(organizationId), session);
    if (!organization) {
      const error = new Error("Organization not found.");
      error.status = 404;
      error.code = "ORGANIZATION_NOT_FOUND";
      throw error;
    }

    const capacity = await currentLicenseCapacity({
      organization,
      session,
      now,
      ...capacityOptions,
    });
    assertLicenseCapacity({ summary: capacity, dimension, additional });

    const value = await work({ organization, session, capacity });
    touchCapacityVersion(organization, { actorUserId, now });
    await organization.save({ session });
    return { organization, capacity, value };
  });
}

function licensedCapacityErrorBody(error, fallback) {
  return {
    error: error.status ? error.message : fallback,
    ...(error.code ? { code: error.code } : {}),
    ...(error.capacity ? { capacity: error.capacity } : {}),
    ...(Number.isInteger(error.remaining) ? { remaining: error.remaining } : {}),
  };
}

module.exports = {
  defaultTransactionRunner,
  licensedCapacityErrorBody,
  reserveLicensedCapacity,
};
