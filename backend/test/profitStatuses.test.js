const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { getLatestProfitStatuses } = require("../services/profitStatuses");

function organizationModel(properties) {
  return {
    findById() {
      return {
        select() {
          return { lean: async () => ({ properties }) };
        },
      };
    },
  };
}

test("returns one latest upload per property from one aggregation", async () => {
  const organizationId = new mongoose.Types.ObjectId().toString();
  const firstPropertyId = new mongoose.Types.ObjectId();
  const secondPropertyId = new mongoose.Types.ObjectId();
  const uploadedAt = new Date("2026-07-15T12:00:00.000Z");
  let receivedPipeline;

  const statuses = await getLatestProfitStatuses({
    organizationId,
    Organization: organizationModel([
      { _id: firstPropertyId },
      { _id: secondPropertyId },
    ]),
    Profit: {
      aggregate: async (pipeline) => {
        receivedPipeline = pipeline;
        return [{ _id: firstPropertyId, uploadedAt }];
      },
    },
  });

  assert.deepEqual(statuses, {
    [firstPropertyId.toString()]: { uploadedAt },
  });
  assert.equal(receivedPipeline[0].$match.organizationId.toString(), organizationId);
  assert.deepEqual(receivedPipeline[0].$match.propertyId.$in, [
    firstPropertyId,
    secondPropertyId,
  ]);
  assert.deepEqual(receivedPipeline[2].$group, {
    _id: "$propertyId",
    uploadedAt: { $first: "$uploadedAt" },
  });
});

test("returns an empty status map when properties have no profit records", async () => {
  const statuses = await getLatestProfitStatuses({
    organizationId: new mongoose.Types.ObjectId().toString(),
    Organization: organizationModel([{ _id: new mongoose.Types.ObjectId() }]),
    Profit: { aggregate: async () => [] },
  });

  assert.deepEqual(statuses, {});
});

test("returns null when the authenticated organization does not exist", async () => {
  const Organization = {
    findById() {
      return {
        select() {
          return { lean: async () => null };
        },
      };
    },
  };

  const statuses = await getLatestProfitStatuses({
    organizationId: new mongoose.Types.ObjectId().toString(),
    Organization,
    Profit: { aggregate: async () => assert.fail("aggregation should not run") },
  });

  assert.equal(statuses, null);
});
