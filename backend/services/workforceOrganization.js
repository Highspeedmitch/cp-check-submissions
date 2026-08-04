const Organization = require("../models/organization");

const WORKFORCE_NAME = "Afterlight Resource Network";

async function ensureWorkforceOrganization(OrganizationModel = Organization) {
  return OrganizationModel.findOneAndUpdate(
    { workspaceType: "afterlight_workforce" },
    {
      $setOnInsert: {
        name: WORKFORCE_NAME,
        workspaceType: "afterlight_workforce",
        orgType: "COM",
        serviceModel: "managed",
        fulfillmentPolicy: {
          defaultSource: "afterlight_contractor",
          version: 1,
        },
        properties: [],
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

module.exports = { WORKFORCE_NAME, ensureWorkforceOrganization };
