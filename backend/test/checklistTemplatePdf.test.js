const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generateChecklistPDF,
  getCommercialResults,
  getObservationSummary,
  getOrderedTemplateFields,
  findingSectionHeight,
  buildChecklistFileName,
} = require("../pdfservice");

test("names inspection PDFs with a safe property name and timestamp", () => {
  assert.equal(
    buildChecklistFileName(
      { selectedProperty: "Álamo Plaza / East: Phase*1" },
      "2026-08-04_09-05-06-AZMT"
    ),
    "Alamo Plaza East Phase 1 - 2026-08-04_09-05-06-AZMT.pdf"
  );
  assert.equal(
    buildChecklistFileName({}, "2026-08-04_09-05-06-AZMT"),
    "Property - 2026-08-04_09-05-06-AZMT.pdf"
  );
});

test("normalizes submitted line breaks for PDF text", () => {
  assert.equal(
    getObservationSummary({ additionalComments: "First line\r\nSecond line\rThird line" }),
    "First line\nSecond line\nThird line"
  );
});

test("does not promote another form response into an unconfigured General Observations field", () => {
  const template = {
    fields: [
      { key: "homelessActivity", label: "Is there any homeless activity of note?", type: "textarea" },
      { key: "additionalComments", label: "Additional Comments", type: "textarea" },
    ],
  };
  assert.equal(
    getObservationSummary({
      homelessActivity: "Homeless activity response",
      additionalComments: "Additional response",
    }, template),
    null
  );
});

test("measures complete finding sections including every photo row", () => {
  assert.equal(findingSectionHeight(62, 0), 99);
  assert.equal(findingSectionHeight(62, 1), 268);
  assert.equal(findingSectionHeight(62, 3), 458);
  assert.equal(findingSectionHeight(62, 6), 648);
});

test("orders PDF results using the effective template field order", () => {
  const template = {
    fields: [
      { key: "later", label: "Later", type: "yes_no_issue", order: 1 },
      { key: "earlier", label: "Earlier", type: "yes_no_issue", order: 0 },
      { key: "notes", label: "Notes", type: "textarea", order: 2 },
    ],
  };

  assert.deepEqual(getOrderedTemplateFields(template).map((field) => field.key), [
    "earlier", "later", "notes",
  ]);
  assert.deepEqual(getCommercialResults({ earlier: "no", later: "yes" }, template)
    .map((field) => field.key), ["earlier", "later"]);
});

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

  assert.equal(result.pdfBuffer.subarray(0, 4).toString(), "%PDF");
  assert.ok(result.pdfBuffer.length > 1000);
});
