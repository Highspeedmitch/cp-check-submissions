const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const ResourceProfile = require("../models/resourceProfile");
const ResourceDeployment = require("../models/resourceDeployment");
const ContractorEarning = require("../models/contractorEarning");
const ContractorPayoutBatch = require("../models/contractorPayoutBatch");

test("invited resource profiles omit userId until one shared login is accepted", () => {
  const profile = new ResourceProfile({
    email: "resource@example.com",
    displayName: "Riley Resource",
    createdBy: new mongoose.Types.ObjectId(),
  });
  assert.equal(profile.userId, undefined);
  const userIndex = ResourceProfile.schema.indexes().find(([fields]) => fields.userId === 1);
  assert.deepEqual(userIndex, [
    { userId: 1 },
    { unique: true, partialFilterExpression: { userId: { $exists: true } }, background: true },
  ]);
});

test("resource deployment and payable collections preserve distinct ledger links", () => {
  assert.equal(ResourceDeployment.schema.path("organizationId").options.required, true);
  assert.equal(ContractorEarning.schema.path("assignmentId").options.unique, true);
  assert.equal(ContractorEarning.schema.path("submissionId").options.unique, true);
  assert.deepEqual(ContractorPayoutBatch.schema.path("provider").options.enum, ["gusto"]);
});
