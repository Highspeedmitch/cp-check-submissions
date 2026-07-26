const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { generateChecklistPDF } = require("../pdfservice");

test("generates a COM checklist PDF from an effective inspection template", async () => {
  const template = {
    fields: [
      { key: "businessName", label: "Shopping Center Name", type: "text" },
      { key: "propertyAddress", label: "Property Address", type: "text" },
      {
        key: "property_loadingDock",
        label: "Is the loading dock secure?",
        reportLabel: "Loading Dock",
        type: "yes_no_issue",
      },
      {
        key: "property_notes",
        label: "Property-specific notes",
        type: "textarea",
      },
    ],
  };
  const result = await generateChecklistPDF({
    orgType: "COM",
    selectedProperty: "Test Center",
    businessName: "Test Center",
    propertyAddress: "1 Main Street",
    property_loadingDock: "yes",
    property_loadingDockDescription: "Gate latch is damaged.",
    property_notes: "Follow up with the property manager.",
  }, [], template);

  try {
    const buffer = fs.readFileSync(result.filePath);
    assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
    assert.ok(buffer.length > 1000);
  } finally {
    if (fs.existsSync(result.filePath)) fs.unlinkSync(result.filePath);
  }
});
