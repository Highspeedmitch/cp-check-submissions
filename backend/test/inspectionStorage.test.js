const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inlinePdfContentDisposition,
  uploadInspectionPdf,
} = require("../services/inspectionStorage");

test("stores an inspection PDF with the customer-facing filename as the final S3 key segment", async () => {
  const previousBucket = process.env.S3_BUCKET_NAME;
  process.env.S3_BUCKET_NAME = "test-inspection-bucket";
  const uploads = [];
  const s3 = {
    upload(params) {
      uploads.push(params);
      return { promise: async () => ({ Location: "https://example.test/report.pdf" }) };
    },
  };
  const fileName = "Black Crown - 2026-08-04_09-05-06-AZMT.pdf";

  try {
    const result = await uploadInspectionPdf({
      pdfBuffer: Buffer.from("%PDF-test"),
      fileName,
      organizationId: "organization-1",
      propertyName: "Black Crown / Tucson",
    }, s3);

    assert.equal(uploads.length, 1);
    assert.match(
      uploads[0].Key,
      /^organization-1\/Black-Crown-Tucson\/\d+\/Black Crown - 2026-08-04_09-05-06-AZMT\.pdf$/
    );
    assert.equal(uploads[0].ContentType, "application/pdf");
    assert.equal(uploads[0].ContentDisposition, `inline; filename="${fileName}"`);
    assert.equal(result.key, uploads[0].Key);
  } finally {
    if (previousBucket === undefined) delete process.env.S3_BUCKET_NAME;
    else process.env.S3_BUCKET_NAME = previousBucket;
  }
});

test("removes header-breaking characters from an inline PDF filename", () => {
  assert.equal(
    inlinePdfContentDisposition('Black Crown\r\n"report".pdf'),
    'inline; filename="Black Crown report .pdf"'
  );
});
