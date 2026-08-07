const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_COM_FIELDS,
  defaultInspectionTemplate,
  mergeTemplateWithOverride,
  normalizePropertyOverride,
  orderFieldsByLockedAnchors,
  validateFields,
  validateOrganizationFields,
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

test("organization templates reorder unlocked fields while preserving locked anchors", () => {
  const current = [
    { key: "before", label: "Before", type: "text" },
    { key: "lockedField", label: "Locked", type: "text", locked: true },
    { key: "first", label: "First", type: "text" },
    { key: "second", label: "Second", type: "text" },
  ];
  const reordered = validateOrganizationFields([
    current[0], current[1], current[3], current[2],
  ], current);

  assert.deepEqual(reordered.map((field) => field.key), ["before", "lockedField", "second", "first"]);
  assert.deepEqual(reordered.map((field) => field.order), [0, 1, 2, 3]);
  assert.throws(() => validateOrganizationFields([
    current[3], current[1], current[0], current[2],
  ], current), /across a locked inspection field/);
});

test("organization template validation rejects changes to locked fields", () => {
  const current = [
    { key: "lockedField", label: "Locked", type: "text", locked: true },
    { key: "optionalField", label: "Optional", type: "text" },
  ];
  assert.throws(() => validateOrganizationFields([
    { ...current[0], label: "Changed" },
    current[1],
  ], current), /locked and cannot be changed/);
  assert.throws(() => validateOrganizationFields([current[1]], current), /cannot be removed/);
  assert.throws(() => validateOrganizationFields([
    { key: "newField", label: "New", type: "text" },
    ...current,
  ], current), /cannot be inserted before a locked inspection field/);
});

test("property field ordering retains locked anchors and drives the effective template", () => {
  const template = templateDocument();
  const additionalField = {
    key: "property_loadingDock",
    label: "Is the loading dock secure?",
    type: "yes_no_issue",
    section: "Property Condition",
  };
  const unlockedKeys = template.fields.filter((field) => !field.locked).map((field) => field.key);
  const fieldOrder = [
    "businessName",
    "propertyAddress",
    additionalField.key,
    ...unlockedKeys,
  ];
  const normalized = normalizePropertyOverride(template, {
    omittedFieldKeys: [],
    additionalFields: [additionalField],
    fieldOrder,
  });
  const effective = mergeTemplateWithOverride(template, normalized);

  assert.deepEqual(effective.fields.slice(0, 4).map((field) => field.key), [
    "businessName", "propertyAddress", "property_loadingDock", "parkingLotLights",
  ]);
  assert.deepEqual(effective.fields.map((field) => field.order),
    effective.fields.map((_field, index) => index));
  assert.throws(() => orderFieldsByLockedAnchors(
    [...template.fields, additionalField],
    [additionalField.key, ...template.fields.map((field) => field.key)],
    { strict: true }
  ), /across a locked inspection field/);
});

test("disabled organization fields retain their configured property position", () => {
  const template = templateDocument();
  const canonicalKeys = template.fields.map((field) => field.key);
  const requestedOrder = [
    "businessName",
    "propertyAddress",
    "potholes",
    ...canonicalKeys.filter((key) => !["businessName", "propertyAddress", "potholes"].includes(key)),
  ];
  const normalized = normalizePropertyOverride(template, {
    omittedFieldKeys: ["potholes"],
    additionalFields: [],
    fieldOrder: requestedOrder,
  });
  const disabled = mergeTemplateWithOverride(template, normalized);
  const reenabled = mergeTemplateWithOverride(template, {
    ...normalized,
    omittedFieldKeys: [],
  });

  assert.equal(disabled.fields.some((field) => field.key === "potholes"), false);
  assert.equal(disabled.override.fieldOrder[2], "potholes");
  assert.equal(reenabled.fields[2].key, "potholes");
});

test("previous visible-only property orders are reconciled to include disabled fields", () => {
  const template = templateDocument();
  const visibleOrder = template.fields
    .filter((field) => field.key !== "potholes")
    .map((field) => field.key);
  const normalized = normalizePropertyOverride(template, {
    omittedFieldKeys: ["potholes"],
    additionalFields: [],
    fieldOrder: visibleOrder,
  });

  assert.equal(normalized.fieldOrder.length, template.fields.length);
  assert.equal(normalized.fieldOrder.includes("potholes"), true);
});
