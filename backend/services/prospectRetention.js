const ProspectAssessment = require("../models/prospectAssessment");
const s3 = require("../awsConfig");

async function purgeExpiredProspectAssessments(
  now = new Date(),
  { AssessmentModel = ProspectAssessment, s3Client = s3 } = {}
) {
  const expired = await AssessmentModel.find({ expiresAt: { $lte: now } }).select("_id pdfKey").lean();
  if (!expired.length) return 0;
  const deletions = await Promise.allSettled(expired.map((assessment) =>
    s3Client.deleteObject({ Bucket: process.env.S3_BUCKET_NAME, Key: assessment.pdfKey }).promise()
  ));
  const removedIds = expired
    .filter((_assessment, index) => deletions[index].status === "fulfilled")
    .map((item) => item._id);
  if (removedIds.length) {
    await AssessmentModel.deleteMany({ _id: { $in: removedIds } });
  }
  return removedIds.length;
}

module.exports = { purgeExpiredProspectAssessments };
