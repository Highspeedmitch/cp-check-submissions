function extractPhotoFieldName(originalName = "") {
  const name = String(originalName);
  const encodedField = name.includes("--") ? name.split("--")[0] : name.split("-")[0];
  try {
    return decodeURIComponent(encodedField);
  } catch {
    return encodedField;
  }
}

module.exports = { extractPhotoFieldName };
