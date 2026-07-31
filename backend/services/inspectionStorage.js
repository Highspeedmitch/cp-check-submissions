const AWS = require("aws-sdk");
const { hasValidFileSignature, ALLOWED_IMAGE_TYPES } = require("../utils/uploadSecurity");

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const UPLOAD_URL_SECONDS = 15 * 60;

function inspectionS3() {
  return new AWS.S3({ region: process.env.AWS_REGION });
}

function bucketName() {
  const bucket = String(process.env.S3_BUCKET_NAME || "").trim();
  if (!bucket) throw new Error("S3_BUCKET_NAME is required for inspection processing.");
  return bucket;
}

function createPhotoUploadPost(photo, s3 = inspectionS3()) {
  return new Promise((resolve, reject) => {
    s3.createPresignedPost({
      Bucket: bucketName(),
      Expires: UPLOAD_URL_SECONDS,
      Fields: {
        key: photo.key,
        success_action_status: "204",
      },
      Conditions: [
        ["content-length-range", 1, MAX_PHOTO_BYTES],
        ["starts-with", "$Content-Type", "image/"],
        { key: photo.key },
        { success_action_status: "204" },
      ],
    }, (error, data) => error ? reject(error) : resolve({
      uploadId: photo.uploadId,
      fieldName: photo.fieldName,
      url: data.url,
      fields: data.fields,
      expiresInSeconds: UPLOAD_URL_SECONDS,
    }));
  });
}

async function inspectUploadedPhoto(photo, s3 = inspectionS3()) {
  const params = { Bucket: bucketName(), Key: photo.key };
  const head = await s3.headObject(params).promise();
  const size = Number(head.ContentLength || 0);
  const contentType = String(head.ContentType || "").toLowerCase();
  if (!size || size > MAX_PHOTO_BYTES || !ALLOWED_IMAGE_TYPES.has(contentType)) {
    const error = new Error("An uploaded photo has an invalid type or size.");
    error.status = 400;
    throw error;
  }
  return { size, contentType };
}

async function downloadAndValidatePhoto(photo, s3 = inspectionS3()) {
  const result = await s3.getObject({ Bucket: bucketName(), Key: photo.key }).promise();
  const file = {
    mimetype: String(result.ContentType || photo.contentType || "").toLowerCase(),
    buffer: result.Body,
  };
  if (!Buffer.isBuffer(file.buffer) || !hasValidFileSignature(file)) {
    const error = new Error("An uploaded photo failed content validation.");
    error.permanent = true;
    throw error;
  }
  return { fieldName: photo.fieldName, imageBuffer: file.buffer };
}

async function uploadInspectionPdf({ pdfBuffer, fileName, organizationId, propertyName }, s3 = inspectionS3()) {
  const safeProperty = String(propertyName || "property").replace(/[^a-zA-Z0-9._-]+/g, "-");
  const key = `${organizationId}/${safeProperty}/${Date.now()}-${fileName}`;
  const result = await s3.upload({
    Bucket: bucketName(),
    Key: key,
    Body: pdfBuffer,
    ContentType: "application/pdf",
  }).promise();
  return { key, location: result.Location };
}

async function downloadInspectionPdf(key, s3 = inspectionS3()) {
  const result = await s3.getObject({ Bucket: bucketName(), Key: key }).promise();
  return result.Body;
}

async function deleteInspectionPhotos(photoUploads, s3 = inspectionS3()) {
  if (!photoUploads?.length) return;
  await s3.deleteObjects({
    Bucket: bucketName(),
    Delete: { Objects: photoUploads.map(({ key }) => ({ Key: key })), Quiet: true },
  }).promise();
}

module.exports = {
  MAX_PHOTO_BYTES,
  createPhotoUploadPost,
  inspectUploadedPhoto,
  downloadAndValidatePhoto,
  uploadInspectionPdf,
  downloadInspectionPdf,
  deleteInspectionPhotos,
};
