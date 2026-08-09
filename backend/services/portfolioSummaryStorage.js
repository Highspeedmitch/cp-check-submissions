const {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");
const { inlinePdfContentDisposition } = require("./inspectionStorage");

let sharedClient;
let sharedRegion;

function portfolioSummaryS3() {
  const region = String(process.env.AWS_REGION || "us-east-2").trim();
  if (!sharedClient || sharedRegion !== region) {
    sharedClient = new S3Client({ region, maxAttempts: 5, retryMode: "adaptive" });
    sharedRegion = region;
  }
  return sharedClient;
}

function bucketName() {
  const bucket = String(process.env.S3_BUCKET_NAME || "").trim();
  if (!bucket) throw new Error("S3_BUCKET_NAME is required for monthly portfolio summaries.");
  return bucket;
}

function safeKeySegment(value, fallback) {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || fallback;
}

async function uploadPortfolioSummaryPdf({
  pdfBuffer,
  fileName,
  organizationId,
  recipientUserId,
  periodKey,
}, s3 = portfolioSummaryS3()) {
  const key = [
    "portfolio-summaries",
    safeKeySegment(organizationId, "organization"),
    safeKeySegment(recipientUserId, "recipient"),
    safeKeySegment(periodKey, "period"),
    fileName,
  ].join("/");
  await s3.send(new PutObjectCommand({
    Bucket: bucketName(),
    Key: key,
    Body: pdfBuffer,
    ContentType: "application/pdf",
    ContentDisposition: inlinePdfContentDisposition(fileName),
    ServerSideEncryption: "AES256",
  }));
  return { key, location: "" };
}

async function downloadPortfolioSummaryPdf(key, s3 = portfolioSummaryS3()) {
  const result = await s3.send(new GetObjectCommand({ Bucket: bucketName(), Key: key }));
  if (!result.Body) throw new Error("Monthly portfolio PDF storage returned an empty response.");
  if (Buffer.isBuffer(result.Body)) return result.Body;
  return Buffer.from(await result.Body.transformToByteArray());
}

module.exports = {
  uploadPortfolioSummaryPdf,
  downloadPortfolioSummaryPdf,
};
