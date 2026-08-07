const InspectionTemplate = require("../models/inspectionTemplate");
const Organization = require("../models/organization");
const { canAccessProperty } = require("./propertyAccess");

const FIELD_TYPES = ["text", "textarea", "yes_no_issue"];
const MAX_TEMPLATE_FIELDS = 30;
const FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9_]{1,63}$/;

const DEFAULT_COM_FIELDS = [
  { key: "businessName", label: "Shopping Center Name", type: "text", section: "Property Details", required: true, locked: true },
  { key: "propertyAddress", label: "Property Address", type: "text", section: "Property Details", required: true, locked: true },
  { key: "parkingLotLights", label: "Are parking lot lights out?", reportLabel: "Parking Lot Lights", type: "yes_no_issue", allowPhotos: true },
  { key: "securityLights", label: "Are rear security lights out?", reportLabel: "Rear Security Lights", type: "yes_no_issue", allowPhotos: true },
  { key: "underCanopyLights", label: "Are any under canopy lights out?", reportLabel: "Under-Canopy Lights", type: "yes_no_issue", allowPhotos: true },
  { key: "tenantSigns", label: "Are any tenant signs out?", reportLabel: "Tenant Signs", type: "yes_no_issue", allowPhotos: true },
  { key: "graffiti", label: "Is there graffiti on or around the property?", reportLabel: "Graffiti", type: "yes_no_issue", allowPhotos: true },
  { key: "dumpsters", label: "Is there trash overflowing from the dumpsters?", reportLabel: "Dumpsters", type: "yes_no_issue", allowPhotos: true },
  { key: "trashCans", label: "Is there trash overflowing from the trashcans on sidewalks?", reportLabel: "Sidewalk Trash Cans", type: "yes_no_issue", allowPhotos: true },
  { key: "waterLeaks", label: "Are there any visible water leaks in the parking lot, such as an irrigation leak?", reportLabel: "Parking Lot / Irrigation Leaks", type: "yes_no_issue", allowPhotos: true },
  { key: "waterLeaksTenant", label: "Are there any visible water leaks from a specific tenant, such as a swamp-cooler leak?", reportLabel: "Tenant-Specific Water Leaks", type: "yes_no_issue", allowPhotos: true },
  { key: "dangerousTrees", label: "Are there any obviously dangerous trees or branches?", reportLabel: "Trees & Branches", type: "yes_no_issue", allowPhotos: true },
  { key: "brokenCurbs", label: "Is there any broken parking lot curbing?", reportLabel: "Parking Lot Curbing", type: "yes_no_issue", allowPhotos: true },
  { key: "potholes", label: "Are there any major potholes?", reportLabel: "Potholes", type: "yes_no_issue", allowPhotos: true },
  { key: "homelessActivity", label: "Is there any homeless activity of note?", type: "textarea", section: "Additional Observations" },
  { key: "additionalComments", label: "Additional Comments", type: "textarea", section: "Additional Observations" },
].map((field, order) => ({
  section: "Property Condition",
  required: false,
  allowPhotos: false,
  descriptionLabel: "Describe the issue",
  locked: false,
  ...field,
  order,
}));

function defaultInspectionTemplate(organizationId) {
  return {
    organizationId,
    name: "Standard Commercial Property Inspection",
    orgType: "COM",
    version: 1,
    active: true,
    title: "Commercial Property Inspection Checklist",
    fields: DEFAULT_COM_FIELDS,
  };
}

function normalizeField(field, index, { propertyOverride = false } = {}) {
  const key = String(field.key || "").trim();
  const label = String(field.label || "").trim();
  if (!FIELD_KEY_PATTERN.test(key)) throw new Error(`Invalid field key: ${key || "(blank)"}`);
  if (!label || label.length > 180) throw new Error(`Enter a label for ${key}.`);
  if (!FIELD_TYPES.includes(field.type)) throw new Error(`Unsupported field type for ${label}.`);
  return {
    key,
    label,
    reportLabel: String(field.reportLabel || label).trim(),
    type: field.type,
    section: String(field.section || (propertyOverride ? "Property-Specific Checks" : "Property Condition")).trim(),
    required: Boolean(field.required),
    allowPhotos: field.type === "yes_no_issue" && Boolean(field.allowPhotos),
    descriptionLabel: String(field.descriptionLabel || "Describe the issue").trim(),
    locked: propertyOverride ? false : Boolean(field.locked),
    order: index,
  };
}

function validateFields(fields, options) {
  if (!Array.isArray(fields) || fields.length > MAX_TEMPLATE_FIELDS) {
    throw new Error(`Inspection templates support up to ${MAX_TEMPLATE_FIELDS} fields.`);
  }
  const normalized = fields.map((field, index) => normalizeField(field, index, options));
  if (new Set(normalized.map((field) => field.key)).size !== normalized.length) {
    throw new Error("Inspection field keys must be unique.");
  }
  if (normalized.filter((field) => field.type === "yes_no_issue").length > 18) {
    throw new Error("Inspection templates support up to 18 condition-check fields.");
  }
  return normalized;
}

function plainField(field) {
  return field?.toObject ? field.toObject() : { ...field };
}

function lockedFieldState(field) {
  const { order: _order, ...state } = field;
  return state;
}

function validateOrganizationFields(fields, currentFields = []) {
  const normalized = validateFields(fields);
  const current = currentFields.map((field, index) => normalizeField(plainField(field), index));
  const currentByKey = new Map(current.map((field) => [field.key, field]));
  const lockedKeys = current.filter((field) => field.locked).map((field) => field.key);
  const submittedLockedKeys = normalized.filter((field) => field.locked).map((field) => field.key);
  if (lockedKeys.some((key) => !submittedLockedKeys.includes(key))) {
    throw new Error("Locked inspection fields cannot be removed.");
  }
  if (submittedLockedKeys.length !== lockedKeys.length
    || submittedLockedKeys.some((key, index) => key !== lockedKeys[index])) {
    throw new Error("Locked inspection fields cannot be moved or added.");
  }
  const currentSegments = new Map();
  let currentSegment = 0;

  current.forEach((field) => {
    if (field.locked) {
      currentSegment += 1;
    } else {
      currentSegments.set(field.key, currentSegment);
    }
  });

  let submittedSegment = 0;
  normalized.forEach((field) => {
    const previous = currentByKey.get(field.key);
    if (field.locked) {
      if (lockedKeys[submittedSegment] !== field.key) {
        throw new Error("Locked inspection fields cannot be moved or added.");
      }
      if (!previous || JSON.stringify(lockedFieldState(field)) !== JSON.stringify(lockedFieldState(previous))) {
        throw new Error(`${previous?.label || field.label} is locked and cannot be changed.`);
      }
      submittedSegment += 1;
      return;
    }

    if (previous?.locked) {
      throw new Error(`${previous.label} is locked and cannot be changed.`);
    }
    if (!previous && submittedSegment < lockedKeys.length) {
      throw new Error("New fields cannot be inserted before a locked inspection field.");
    }
    if (previous && currentSegments.get(field.key) !== submittedSegment) {
      throw new Error("Fields cannot be moved across a locked inspection field.");
    }
  });

  if (submittedSegment !== lockedKeys.length) {
    throw new Error("Locked inspection fields cannot be removed.");
  }
  return normalized;
}

function orderFieldsByLockedAnchors(fields, requestedOrder, { strict = false } = {}) {
  const canonical = fields.map(plainField);
  const canonicalKeys = canonical.map((field) => field.key);
  const knownKeys = new Set(canonicalKeys);
  const suppliedOrder = Array.isArray(requestedOrder) ? requestedOrder.map(String) : [];
  const suppliedUnique = [...new Set(suppliedOrder.filter((key) => knownKeys.has(key)))];

  if (strict && (
    suppliedOrder.length !== canonical.length
    || suppliedUnique.length !== canonical.length
    || suppliedOrder.some((key) => !knownKeys.has(key))
  )) {
    throw new Error("The property field order must include every visible field exactly once.");
  }

  const requestedKeys = [...suppliedUnique, ...canonicalKeys.filter((key) => !suppliedUnique.includes(key))];
  const requestedIndex = new Map(requestedKeys.map((key, index) => [key, index]));
  const lockedFields = canonical.filter((field) => field.locked);
  const segments = Array.from({ length: lockedFields.length + 1 }, () => []);
  let segment = 0;

  canonical.forEach((field, canonicalIndex) => {
    if (field.locked) {
      segment += 1;
      return;
    }
    segments[segment].push({ field, canonicalIndex });
  });

  segments.forEach((items) => items.sort((left, right) => (
    requestedIndex.get(left.field.key) - requestedIndex.get(right.field.key)
    || left.canonicalIndex - right.canonicalIndex
  )));

  const ordered = [];
  segments.forEach((items, index) => {
    ordered.push(...items.map((item) => item.field));
    if (lockedFields[index]) ordered.push(lockedFields[index]);
  });

  if (strict && ordered.some((field, index) => field.key !== suppliedOrder[index])) {
    throw new Error("Fields cannot be moved across a locked inspection field.");
  }
  return ordered.map((field, order) => ({ ...field, order }));
}

async function ensureOrganizationInspectionTemplate(organizationId) {
  const organization = await Organization.findById(organizationId);
  if (!organization) throw new Error("Organization not found.");
  if (organization.orgType !== "COM") throw new Error("Inspection templates are currently available for commercial organizations.");

  if (organization.inspectionTemplateId) {
    const assigned = await InspectionTemplate.findOne({
      _id: organization.inspectionTemplateId,
      organizationId,
      active: true,
    });
    if (assigned) return { organization, template: assigned };
  }

  const existingActive = await InspectionTemplate.findOne({
    organizationId,
    active: true,
  }).sort({ version: -1 });
  if (existingActive) {
    organization.inspectionTemplateId = existingActive._id;
    await organization.save();
    return { organization, template: existingActive };
  }

  const template = await InspectionTemplate.findOneAndUpdate(
    { organizationId, version: 1 },
    { $setOnInsert: defaultInspectionTemplate(organizationId) },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  organization.inspectionTemplateId = template._id;
  await organization.save();
  return { organization, template };
}

function mergeTemplateWithOverride(template, override = {}) {
  const omitted = new Set(override.omittedFieldKeys || []);
  const baseFields = template.fields
    .map((field) => field.toObject ? field.toObject() : field)
    .filter((field) => field.locked || !omitted.has(field.key));
  const additionalFields = (override.additionalFields || [])
    .map((field) => field.toObject ? field.toObject() : field);
  const fields = orderFieldsByLockedAnchors(
    [...baseFields, ...additionalFields],
    override.fieldOrder
  );
  return {
    templateId: template._id,
    version: template.version,
    name: template.name,
    title: template.title,
    organizationFields: template.fields.map((field) => field.toObject ? field.toObject() : field),
    override: {
      omittedFieldKeys: [...omitted],
      additionalFields,
      fieldOrder: fields.map((field) => field.key),
    },
    fields,
  };
}

async function resolvePropertyInspectionTemplate({ organizationId, propertyId, propertyName, user }) {
  const { organization, template } = await ensureOrganizationInspectionTemplate(organizationId);
  const property = propertyId
    ? organization.properties.id(propertyId)
    : organization.properties.find((item) => item.name === propertyName);
  if (!property) throw new Error("Property not found.");
  if (!canAccessProperty(property, user)) {
    const error = new Error("You do not manage this property.");
    error.status = 403;
    throw error;
  }
  return {
    organization,
    template,
    property,
    effectiveTemplate: mergeTemplateWithOverride(template, property.inspectionTemplateOverride),
  };
}

function normalizePropertyOverride(template, override) {
  const organizationFields = template.fields.map((field) => field.toObject ? field.toObject() : field);
  const knownKeys = new Set(organizationFields.map((field) => field.key));
  const lockedKeys = new Set(organizationFields.filter((field) => field.locked).map((field) => field.key));
  const omittedFieldKeys = [...new Set((override.omittedFieldKeys || []).map(String))]
    .filter((key) => knownKeys.has(key) && !lockedKeys.has(key));
  const additionalFields = validateFields(override.additionalFields || [], { propertyOverride: true });
  if (additionalFields.some((field) => knownKeys.has(field.key))) {
    throw new Error("Property-specific field keys cannot replace organization fields.");
  }
  if (organizationFields.length - omittedFieldKeys.length + additionalFields.length > MAX_TEMPLATE_FIELDS) {
    throw new Error(`The effective inspection form can have up to ${MAX_TEMPLATE_FIELDS} fields.`);
  }
  const omitted = new Set(omittedFieldKeys);
  const visibleFields = [
    ...organizationFields.filter((field) => field.locked || !omitted.has(field.key)),
    ...additionalFields,
  ];
  const orderedFields = orderFieldsByLockedAnchors(visibleFields, override.fieldOrder, {
    strict: Array.isArray(override.fieldOrder),
  });
  return {
    omittedFieldKeys,
    additionalFields,
    fieldOrder: orderedFields.map((field) => field.key),
  };
}

function createTemplateSnapshot(effectiveTemplate) {
  return {
    templateId: effectiveTemplate.templateId,
    version: effectiveTemplate.version,
    name: effectiveTemplate.name,
    title: effectiveTemplate.title,
    fields: effectiveTemplate.fields,
  };
}

module.exports = {
  DEFAULT_COM_FIELDS,
  MAX_TEMPLATE_FIELDS,
  defaultInspectionTemplate,
  validateFields,
  validateOrganizationFields,
  orderFieldsByLockedAnchors,
  ensureOrganizationInspectionTemplate,
  mergeTemplateWithOverride,
  resolvePropertyInspectionTemplate,
  normalizePropertyOverride,
  createTemplateSnapshot,
};
