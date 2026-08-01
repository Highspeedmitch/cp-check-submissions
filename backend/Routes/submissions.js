const express = require("express");
const AWS = require("aws-sdk");
const Organization = require("../models/organization");
const Submission = require("../models/submission");
const { canAccessProperty } = require("../services/propertyAccess");
const { isManagementRole, buildSubmissionQuery } = require("../services/submissionAccess");
const {
  MIN_SUBMISSION_MONTHS,
  MAX_SUBMISSION_MONTHS,
  parseSubmissionMonths,
  getSubmissionCutoff,
} = require("../utils/submissionRange");

const router = express.Router();
const s3 = new AWS.S3({ region: process.env.AWS_REGION });

function signedPdfUrl(pdfUrl, { replacePlus = false } = {}) {
  const url = new URL(pdfUrl);
  let encodedKey = url.pathname.substring(1);
  if (replacePlus) encodedKey = encodedKey.replace(/\+/g, " ");
  return s3.getSignedUrl("getObject", {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: decodeURIComponent(encodedKey),
    Expires: 60 * 60,
  });
}

function withSignedPdfUrl(submission, options) {
  return {
    ...submission.toObject(),
    signedPdfUrl: signedPdfUrl(submission.pdfUrl, options),
  };
}

router.get("/recent-submissions", async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const query = await buildSubmissionQuery({
      user: req.user,
      submittedAfter: thirtyDaysAgo,
    });
    const submissions = await Submission.find(query)
      .select("property submittedAt")
      .lean()
      .sort({ submittedAt: -1 });
    return res.json(submissions);
  } catch (error) {
    console.error("Error fetching recent submissions:", error);
    return res.status(500).json({ message: "Failed to retrieve submissions." });
  }
});

router.get("/submissions", async (req, res) => {
  try {
    const query = await buildSubmissionQuery({ user: req.user });
    const submissions = await Submission.find(query).sort({ submittedAt: -1 });
    return res.json(submissions.map((submission) => withSignedPdfUrl(submission)));
  } catch (error) {
    console.error("Error fetching submissions:", error);
    return res.status(500).json({ message: "Failed to retrieve submissions." });
  }
});

router.get("/admin/submissions/:property", async (req, res) => {
  try {
    if (!isManagementRole(req.user)) {
      return res.status(403).json({ error: "Management access required." });
    }
    const months = parseSubmissionMonths(req.query.months);
    if (months === null) {
      return res.status(400).json({
        error: `months must be a whole number between ${MIN_SUBMISSION_MONTHS} and ${MAX_SUBMISSION_MONTHS}.`,
      });
    }
    const organization = await Organization.findById(req.user.organizationId);
    const property = organization?.properties.find((item) => item.name === req.params.property);
    if (!property) return res.status(404).json({ error: "Property not found." });
    if (!canAccessProperty(property, req.user)) {
      return res.status(403).json({ error: "You do not manage this property." });
    }
    const submissions = await Submission.find({
      organizationId: req.user.organizationId,
      property: req.params.property,
      submittedAt: { $gte: getSubmissionCutoff(months) },
    }).sort({ submittedAt: -1 });
    return res.json(submissions.map((submission) => withSignedPdfUrl(
      submission,
      { replacePlus: true }
    )));
  } catch (error) {
    console.error("Error fetching admin submissions:", error);
    return res.status(500).json({ message: "Failed to retrieve submissions." });
  }
});

module.exports = router;
module.exports.signedPdfUrl = signedPdfUrl;
