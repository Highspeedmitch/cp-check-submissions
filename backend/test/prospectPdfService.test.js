const test = require("node:test");
const assert = require("node:assert/strict");
const { generateProspectAssessmentPDF } = require("../prospectPdfService");

test("generates a standalone prospect assessment PDF", async () => {
  const pdf = await generateProspectAssessmentPDF({
    assessment: {
      businessName: "Sample Center",
      propertyAddress: "100 Main Street, Phoenix, AZ",
      createdAt: new Date("2026-07-29T12:00:00Z"),
      responses: {
        parkingLotLights: "yes",
        parkingLotLightsDescription: "Two fixtures appeared unlit.",
        additionalComments: "Exterior observations only.",
      },
      templateSnapshot: {
        title: "Complimentary Exterior Property Assessment",
        fields: [
          { key: "parkingLotLights", label: "Parking lot lighting", type: "yes_no_issue" },
          { key: "additionalComments", label: "Additional observations", type: "textarea" },
        ],
      },
    },
  });
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdf.length > 1000);
});

test("generates a prospect PDF when the shopping center name is unavailable", async () => {
  const pdf = await generateProspectAssessmentPDF({
    assessment: {
      businessName: "",
      propertyAddress: "100 Main Street, Phoenix, AZ",
      createdAt: new Date("2026-07-29T12:00:00Z"),
      responses: {},
      templateSnapshot: {
        title: "Complimentary Exterior Property Assessment",
        fields: [],
      },
    },
  });
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdf.length > 1000);
});
