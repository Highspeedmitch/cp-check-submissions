const express = require("express");
const mongoose = require("mongoose");
const Organization = require("../models/organization");
const Submission = require("../models/submission");
const User = require("../models/user");
const {
  MIN_SUBMISSION_MONTHS,
  MAX_SUBMISSION_MONTHS,
  parseSubmissionMonths,
  getSubmissionCutoff,
} = require("../utils/submissionRange");
const {
  reportingProperties,
  buildReportingSummary,
} = require("../services/reporting");

const router = express.Router();

router.get("/summary", async (req, res) => {
  try {
    if (!["admin", "property_manager"].includes(req.user.role)) {
      return res.status(403).json({ error: "Reporting is available to administrators and property managers." });
    }
    const months = parseSubmissionMonths(req.query.months);
    if (months === null) {
      return res.status(400).json({
        error: `Reporting range must be between ${MIN_SUBMISSION_MONTHS} and ${MAX_SUBMISSION_MONTHS} months.`,
      });
    }
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) return res.status(404).json({ error: "Organization not found." });

    const properties = reportingProperties(organization, req.user);
    const propertyId = req.query.propertyId || "";
    const selectedProperty = propertyId
      ? properties.find((property) => String(property._id) === String(propertyId))
      : null;
    if (propertyId && !selectedProperty) {
      return res.status(403).json({ error: "This property is outside your reporting scope." });
    }

    const selectedUserId = req.query.userId || "";
    if (selectedUserId && !mongoose.Types.ObjectId.isValid(selectedUserId)) {
      return res.status(400).json({ error: "Invalid submitter filter." });
    }

    const cutoff = getSubmissionCutoff(months);
    const submissions = await Submission.find({
      organizationId: req.user.organizationId,
      property: { $in: properties.map((property) => property.name) },
      submittedAt: { $gte: cutoff },
    }).select("userId property submittedAt responses templateSnapshot").lean();

    const userIds = [...new Set(submissions.map((submission) => String(submission.userId)))];
    if (selectedUserId && !userIds.includes(String(selectedUserId))) {
      return res.status(404).json({ error: "Submitter not found in this reporting scope." });
    }
    const users = await User.find({
      _id: { $in: userIds },
      organizationId: req.user.organizationId,
    }).select("username email").lean();

    return res.json(buildReportingSummary({
      submissions,
      users,
      properties,
      months,
      timezone: organization.reportingTimezone,
      selectedPropertyName: selectedProperty?.name || "",
      selectedUserId,
    }));
  } catch (error) {
    if (/whole number|between/i.test(error.message || "")) {
      return res.status(400).json({
        error: `Reporting range must be between ${MIN_SUBMISSION_MONTHS} and ${MAX_SUBMISSION_MONTHS} months.`,
      });
    }
    console.error("Reporting summary error:", error);
    return res.status(500).json({ error: "Unable to load reporting data." });
  }
});

module.exports = router;
