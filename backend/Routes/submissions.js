const express = require("express");
const AWS = require("aws-sdk");
const Organization = require("../models/organization");
const Submission = require("../models/submission");
const Assignment = require("../models/assignment");
const User = require("../models/user");
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

function withSignedPdfUrl(submission, options, createSignedPdfUrl = signedPdfUrl) {
  const value = typeof submission.toObject === "function"
    ? submission.toObject()
    : { ...submission };
  return {
    ...value,
    signedPdfUrl: createSignedPdfUrl(submission.pdfUrl, options),
  };
}

function activityUser(user) {
  if (!user) return null;
  return {
    _id: user._id,
    name: user.username || user.email || "Unknown user",
    email: user.email || "",
  };
}

function withSubmissionActivity(
  submission,
  assignment,
  usersById,
  options,
  createSignedPdfUrl = signedPdfUrl
) {
  const assignerId = assignment?.assignedBy || assignment?.fulfillment?.resolvedBy;
  return {
    ...withSignedPdfUrl(submission, options, createSignedPdfUrl),
    submittedBy: activityUser(usersById.get(String(submission.userId))),
    assignment: assignment ? {
      _id: assignment._id,
      scheduledAt: assignment.startDate,
      assignedAt: assignment.createdAt,
      assignedBy: activityUser(usersById.get(String(assignerId))),
      fulfillmentType: assignment.fulfillment?.source || "legacy",
    } : null,
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
    }).sort({ submittedAt: -1 }).lean();
    const assignmentIds = [...new Set(submissions
      .map((submission) => submission.assignmentId)
      .filter(Boolean)
      .map(String))];
    const assignments = assignmentIds.length
      ? await Assignment.find({
          _id: { $in: assignmentIds },
          organizationId: req.user.organizationId,
        })
          .select("startDate createdAt assignedBy fulfillment.source fulfillment.resolvedBy")
          .lean()
      : [];
    const assignmentById = new Map(assignments.map((assignment) => [
      String(assignment._id),
      assignment,
    ]));
    const userIds = [...new Set([
      ...submissions.map((submission) => submission.userId),
      ...assignments.map((assignment) =>
        assignment.assignedBy || assignment.fulfillment?.resolvedBy
      ),
    ].filter(Boolean).map(String))];
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } })
          .select("_id username email")
          .lean()
      : [];
    const usersById = new Map(users.map((user) => [String(user._id), user]));
    return res.json(submissions.map((submission) => withSubmissionActivity(
      submission,
      assignmentById.get(String(submission.assignmentId)),
      usersById,
      { replacePlus: true }
    )));
  } catch (error) {
    console.error("Error fetching admin submissions:", error);
    return res.status(500).json({ message: "Failed to retrieve submissions." });
  }
});

module.exports = router;
module.exports.signedPdfUrl = signedPdfUrl;
module.exports.withSubmissionActivity = withSubmissionActivity;
