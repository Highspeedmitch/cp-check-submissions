const mongoose = require("mongoose");

async function getLatestProfitStatuses({
  organizationId,
  Organization,
  Profit,
}) {
  const organization = await Organization.findById(organizationId)
    .select("properties._id")
    .lean();

  if (!organization) {
    return null;
  }

  const propertyIds = organization.properties.map((property) => property._id);
  const latestProfits = await Profit.aggregate([
    {
      $match: {
        organizationId: new mongoose.Types.ObjectId(organizationId),
        propertyId: { $in: propertyIds },
      },
    },
    { $sort: { propertyId: 1, uploadedAt: -1 } },
    {
      $group: {
        _id: "$propertyId",
        uploadedAt: { $first: "$uploadedAt" },
      },
    },
  ]);

  return Object.fromEntries(
    latestProfits.map((profit) => [
      profit._id.toString(),
      { uploadedAt: profit.uploadedAt },
    ])
  );
}

module.exports = { getLatestProfitStatuses };
