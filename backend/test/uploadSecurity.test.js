const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hasValidFileSignature,
  rejectInvalidSignatures,
} = require("../utils/uploadSecurity");

test("accepts JPEG, PNG, and PDF files only when signatures match", () => {
  assert.equal(hasValidFileSignature({
    mimetype: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  }), true);
  assert.equal(hasValidFileSignature({
    mimetype: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a00", "hex"),
  }), true);
  assert.equal(hasValidFileSignature({
    mimetype: "application/pdf",
    buffer: Buffer.from("%PDF-1.7"),
  }), true);
});

test("rejects files whose claimed type does not match their contents", () => {
  const disguised = {
    mimetype: "image/jpeg",
    buffer: Buffer.from("<script>alert(1)</script>"),
  };
  assert.equal(hasValidFileSignature(disguised), false);
  assert.throws(
    () => rejectInvalidSignatures([disguised]),
    /uploaded files are invalid/
  );
});
