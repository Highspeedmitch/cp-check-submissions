function isAllowedTemplatePhotoField(fields = [], fieldName = "") {
  return fields.some((field) =>
    field.key === fieldName
      && (field.allowPhotos || field.key === "additionalComments")
  );
}

module.exports = { isAllowedTemplatePhotoField };
