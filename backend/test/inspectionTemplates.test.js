const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_COM_FIELDS,
  defaultInspectionTemplate,
  mergeTemplateWithOverride,
  normalizePropertyOverride,
  validateFields,
} = require("../services/inspectionTemplates");

function templateDocument() {
  return {
    _id: "template-1",
    version: 1,
    name: "Standard Commercial Property Inspection",
    title: "Commercial Property Inspection Checklist",
    fields: DEFAULT_COM_FIELDS,
  };
}

test("default COM template preserves every existing form field", () => {
  const definition = defaultInspectionTemplate("org-1");
  assert.equal(definition.fields.length, 16);
  assert.deepEqual(
    definition.fields.filter((field) => field.type === "yes_no_issue").map((field) => field.key),
    [
      "parkingLotLights", "securityLights", "underCanopyLights", "tenantSigns",
      "graffiti", "dumpsters", "trashCans", "waterLeaks", "waterLeaksTenant",
      "dangerousTrees", "brokenCurbs", "potholes",
    ]
  );
});

test("property overrides omit optional fields but retain locked identity fields", () => {
  const effective = mergeTemplateWithOverride(templateDocument(), {
    omittedFieldKeys: ["businessName", "potholes"],
    additionalFields: [{
      key: "property_loadingDock",
      label: "Is the loading dock secure?",
      reportLabel: "Loading Dock",
      type: "yes_no_issue",
      allowPhotos: true,
    }],
  });
  assert.equal(effective.fields.some((field) => field.key === "businessName"), true);
  assert.equal(effective.fields.some((field) => field.key === "potholes"), false);
  assert.equal(effective.fields.some((field) => field.key === "property_loadingDock"), true);
});

test("property override validation rejects collisions with organization fields", () => {
  assert.throws(() => normalizePropertyOverride(templateDocument(), {
    additionalFields: [{
      key: "potholes",
      label: "Replacement potholes",
      type: "text",
    }],
  }), /cannot replace organization fields/);
});

test("template validation rejects duplicate and unsupported fields", () => {
  assert.throws(() => validateFields([
    { key: "duplicate", label: "One", type: "text" },
    { key: "duplicate", label: "Two", type: "text" },
  ]), /must be unique/);
  assert.throws(() => validateFields([
    { key: "invalid", label: "Invalid", type: "number" },
  ]), /Unsupported field type/);
});
