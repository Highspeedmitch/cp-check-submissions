const {
  DEFAULT_COM_FIELDS,
  validateFields,
} = require("./inspectionTemplates");

const GENERAL_OBSERVATIONS_FIELD = {
  key: "generalObservations",
  label: "General Observations",
  reportLabel: "General Observations",
  type: "textarea",
  section: "Additional Observations",
  required: false,
  allowPhotos: true,
  descriptionLabel: "Add general observations about the property",
  locked: true,
};

function plainField(field) {
  return field?.toObject ? field.toObject() : { ...field };
}

function withGeneralObservations(fields = []) {
  const normalized = fields.map(plainField);
  const existingGeneral = normalized.find((field) => field.key === GENERAL_OBSERVATIONS_FIELD.key);
  const withoutGeneral = normalized.filter((field) => field.key !== GENERAL_OBSERVATIONS_FIELD.key);
  const additionalCommentsIndex = withoutGeneral.findIndex((field) => field.key === "additionalComments");
  const insertAt = additionalCommentsIndex >= 0 ? additionalCommentsIndex : withoutGeneral.length;
  withoutGeneral.splice(insertAt, 0, {
    ...GENERAL_OBSERVATIONS_FIELD,
    ...existingGeneral,
    key: GENERAL_OBSERVATIONS_FIELD.key,
    label: GENERAL_OBSERVATIONS_FIELD.label,
    reportLabel: GENERAL_OBSERVATIONS_FIELD.reportLabel,
    type: GENERAL_OBSERVATIONS_FIELD.type,
    section: GENERAL_OBSERVATIONS_FIELD.section,
    allowPhotos: true,
    locked: true,
  });
  return withoutGeneral.map((field, order) => ({ ...field, order }));
}

function defaultProspectFields() {
  return withGeneralObservations(DEFAULT_COM_FIELDS);
}

function validateProspectFields(fields) {
  return withGeneralObservations(validateFields(fields));
}

module.exports = {
  GENERAL_OBSERVATIONS_FIELD,
  withGeneralObservations,
  defaultProspectFields,
  validateProspectFields,
};
