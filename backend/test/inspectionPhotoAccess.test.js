const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedTemplatePhotoField } = require("../services/inspectionPhotoAccess");

test("allows configured issue photos and optional additional-comment photos", () => {
  const fields = [
    { key: "graffiti", allowPhotos: true },
    { key: "additionalComments", allowPhotos: false },
    { key: "internalNotes", allowPhotos: false },
  ];
  assert.equal(isAllowedTemplatePhotoField(fields, "graffiti"), true);
  assert.equal(isAllowedTemplatePhotoField(fields, "additionalComments"), true);
  assert.equal(isAllowedTemplatePhotoField(fields, "internalNotes"), false);
  assert.equal(isAllowedTemplatePhotoField(fields, "unknown"), false);
});
