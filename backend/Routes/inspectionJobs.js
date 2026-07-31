const express = require("express");
const InspectionJob = require("../models/inspectionJob");
const { uploadLimiter } = require("../middleware/rateLimits");
const { isManagementRole } = require("../services/submissionAccess");
const {
  createInspectionJob,
  finalizeInspectionJob,
} = require("../services/inspectionJobs");

const router = express.Router();

function canViewJob(job, user) {
  return String(job.organizationId) === String(user.organizationId)
    && (String(job.userId) === String(user.userId) || isManagementRole(user));
}

function publicJob(job) {
  return {
    jobId: job._id,
    status: job.status,
    property: job.propertyName,
    attempts: job.attempts,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    submissionId: job.submissionId,
    pdfUrl: job.status === "completed" ? job.pdfUrl : "",
    error: job.status === "failed" ? job.lastError : "",
  };
}

router.post("/", uploadLimiter, async (req, res) => {
  try {
    const result = await createInspectionJob({ user: req.user, body: req.body });
    res.status(result.status === "uploading" ? 201 : 200).json(result);
  } catch (error) {
    console.error("Unable to create inspection job:", error.message);
    res.status(error.status || 500).json({
      message: error.status ? error.message : "Unable to prepare the inspection upload.",
    });
  }
});

router.post("/:jobId/complete-uploads", uploadLimiter, async (req, res) => {
  try {
    const job = await InspectionJob.findById(req.params.jobId);
    if (!job || !canViewJob(job, req.user) || String(job.userId) !== String(req.user.userId)) {
      return res.status(404).json({ message: "Inspection job not found." });
    }
    const updated = await finalizeInspectionJob({ job });
    return res.status(updated.status === "queued" ? 202 : 200).json(publicJob(updated));
  } catch (error) {
    const missingUpload = ["NotFound", "NoSuchKey"].includes(error?.code);
    console.error("Unable to finalize inspection uploads:", error.message);
    return res.status(missingUpload ? 409 : error.status || 500).json({
      message: missingUpload
        ? "One or more photos have not finished uploading. Please try again."
        : error.status ? error.message : "Unable to queue the inspection.",
    });
  }
});

router.get("/:jobId", async (req, res) => {
  try {
    const job = await InspectionJob.findById(req.params.jobId);
    if (!job || !canViewJob(job, req.user)) {
      return res.status(404).json({ message: "Inspection job not found." });
    }
    return res.json(publicJob(job));
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(404).json({ message: "Inspection job not found." });
    }
    console.error("Unable to load inspection job:", error.message);
    return res.status(500).json({ message: "Unable to load inspection status." });
  }
});

module.exports = router;
