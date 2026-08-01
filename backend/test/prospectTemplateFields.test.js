const test = require("node:test");
const assert = require("node:assert/strict");
const {
  defaultProspectFields,
  validateProspectFields,
  withGeneralObservations,
} = require("../services/prospectTemplateFields");
const { getObservationSummary } = require("../pdfservice");
const { isAllowedTemplatePhotoField } = require("../services/inspectionPhotoAccess");

test("complimentary report templates include one photo-enabled General Observations field", () => {
  const fields = defaultProspectFields();
  const observations = fields.filter((field) => field.key === "generalObservations");
  assert.equal(observations.length, 1);
  assert.equal(observations[0].type, "textarea");
  assert.equal(observations[0].allowPhotos, true);
  assert.equal(observations[0].locked, true);
  assert.equal(isAllowedTemplatePhotoField(fields, "generalObservations"), true);
  assert.ok(
    fields.findIndex((field) => field.key === "generalObservations")
      < fields.findIndex((field) => field.key === "additionalComments")
  );
});

test("template validation restores the required General Observations mapping", () => {
  const fields = validateProspectFields([
    { key: "businessName", label: "Business Name", type: "text" },
    { key: "propertyAddress", label: "Property Address", type: "text" },
  ]);
  const observations = fields.find((field) => field.key === "generalObservations");
  assert.equal(observations.label, "General Observations");
  assert.equal(observations.allowPhotos, true);
});

test("existing General Observations requirement is preserved during normalization", () => {
  const fields = withGeneralObservations([{ key: "generalObservations", required: true }]);
  assert.equal(fields[0].required, true);
  assert.equal(fields[0].allowPhotos, true);
});

test("General Observations maps to the PDF summary before other note fields", () => {
  const template = {
    fields: [
      { key: "additionalComments", type: "textarea" },
      { key: "generalObservations", type: "textarea", allowPhotos: true },
    ],
  };
  assert.equal(getObservationSummary({
    additionalComments: "Secondary comment",
    generalObservations: "Primary property observation",
  }, template), "Primary property observation");
});
