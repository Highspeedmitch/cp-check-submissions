const test = require("node:test");
const assert = require("node:assert/strict");
const { extractPhotoFieldName } = require("../utils/photoFieldName");

test("extracts current encoded and legacy photo field names", () => {
  assert.equal(extractPhotoFieldName("graffiti--IMG-100.jpg"), "graffiti");
  assert.equal(extractPhotoFieldName("loading-dock--photo.jpg"), "loading-dock");
  assert.equal(extractPhotoFieldName("refuse%2Fdebris--photo.jpg"), "refuse/debris");
  assert.equal(extractPhotoFieldName("graffiti-photo.jpg"), "graffiti");
});
