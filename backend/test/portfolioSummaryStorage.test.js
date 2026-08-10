const test = require("node:test");
const assert = require("node:assert/strict");
const {
  downloadPortfolioSummaryPdf,
  uploadPortfolioSummaryPdf,
} = require("../services/portfolioSummaryStorage");

test("portfolio PDFs use the encrypted private monthly S3 prefix", async () => {
  const previousBucket = process.env.S3_BUCKET_NAME;
  process.env.S3_BUCKET_NAME = "afterlight-test";
  let input;
  const client = {
    async send(command) {
      input = command.input;
      return {};
    },
  };
  try {
    const stored = await uploadPortfolioSummaryPdf({
      pdfBuffer: Buffer.from("pdf"),
      fileName: "July Portfolio Summary.pdf",
      organizationId: "org-1",
      recipientUserId: "pm-1",
      periodKey: "2026-07",
    }, client);
    assert.equal(stored.key, "portfolio-summaries/org-1/pm-1/2026-07/July Portfolio Summary.pdf");
    assert.equal(input.Bucket, "afterlight-test");
    assert.equal(input.ServerSideEncryption, "AES256");
    assert.equal(input.ContentType, "application/pdf");
    assert.equal(input.ACL, undefined);
  } finally {
    if (previousBucket === undefined) delete process.env.S3_BUCKET_NAME;
    else process.env.S3_BUCKET_NAME = previousBucket;
  }
});

test("portfolio PDF downloads consume the SDK v3 response body", async () => {
  const previousBucket = process.env.S3_BUCKET_NAME;
  process.env.S3_BUCKET_NAME = "afterlight-test";
  let input;
  const client = {
    async send(command) {
      input = command.input;
      return {
        Body: {
          async transformToByteArray() { return new Uint8Array([37, 80, 68, 70]); },
        },
      };
    },
  };
  try {
    const body = await downloadPortfolioSummaryPdf("portfolio-summaries/report.pdf", client);
    assert.equal(body.toString(), "%PDF");
    assert.deepEqual(input, {
      Bucket: "afterlight-test",
      Key: "portfolio-summaries/report.pdf",
    });
  } finally {
    if (previousBucket === undefined) delete process.env.S3_BUCKET_NAME;
    else process.env.S3_BUCKET_NAME = previousBucket;
  }
});
