const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

function imageFileFilter(_req, file, callback) {
  const allowed = ALLOWED_IMAGE_TYPES.has(file.mimetype);
  callback(allowed ? null : new Error("Only JPEG and PNG images are supported."), allowed);
}

function hasValidFileSignature(file) {
  const bytes = file?.buffer;
  if (!Buffer.isBuffer(bytes)) return false;
  if (file.mimetype === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (file.mimetype === "image/png") {
    const signature = "89504e470d0a1a0a";
    return bytes.length >= 8 && bytes.subarray(0, 8).toString("hex") === signature;
  }
  if (file.mimetype === "application/pdf") {
    return bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  }
  return false;
}

function rejectInvalidSignatures(files) {
  if (!(files || []).every(hasValidFileSignature)) {
    const error = new Error("One or more uploaded files are invalid.");
    error.status = 400;
    throw error;
  }
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  imageFileFilter,
  hasValidFileSignature,
  rejectInvalidSignatures,
};
