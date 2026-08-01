const os = require("os");
const InspectionJob = require("../models/inspectionJob");
const Submission = require("../models/submission");
const Organization = require("../models/organization");
const User = require("../models/user");
const Assignment = require("../models/assignment");
const Invoice = require("../models/invoice");
const { generateChecklistPDF } = require("../pdfservice");
const {
  downloadAndValidatePhoto,
  uploadInspectionPdf,
  downloadInspectionPdf,
  deleteInspectionPhotos,
} = require("./inspectionStorage");
const {
  ensureOrganizationBillingPolicy,
  createPolicySnapshot,
} = require("./billingPolicy");
const { resolveBillingAddress } = require("./propertyAddresses");
const { sendSystemEmail } = require("./systemEmail");
const { sendUserNotification } = require("./notifications");
const { inspectionSubmitted, assignmentCompleted } = require("./notificationEvents");
const { legacyFulfillmentSnapshot } = require("./fulfillmentPolicy");

const DEFAULT_POLL_MS = 2000;
const LEASE_MS = 15 * 60 * 1000;

function workerId() {
  return `${os.hostname()}:${process.pid}`;
}

async function claimInspectionJob({ JobModel = InspectionJob, now = new Date(), id = workerId() } = {}) {
  const staleLease = new Date(now.getTime() - LEASE_MS);
  return JobModel.findOneAndUpdate({
    $or: [
      { status: "queued", availableAt: { $lte: now } },
      { status: "processing", lockedAt: { $lte: staleLease } },
    ],
  }, {
    $set: { status: "processing", lockedAt: now, lockedBy: id, lastError: "" },
    $inc: { attempts: 1 },
  }, {
    new: true,
    sort: { availableAt: 1, createdAt: 1 },
  });
}

async function loadPhotoBuffers(job) {
  const buffers = [];
  // Sequential reads keep peak memory and S3 connection pressure predictable.
  for (const photo of job.photoUploads) {
    buffers.push(await downloadAndValidatePhoto(photo));
  }
  return buffers;
}

async function ensurePdf(job) {
  if (job.pdfKey && job.pdfUrl && job.pdfFileName) {
    return {
      pdfBuffer: await downloadInspectionPdf(job.pdfKey),
      fileName: job.pdfFileName,
    };
  }
  const photoBuffers = await loadPhotoBuffers(job);
  const generated = await generateChecklistPDF(
    job.submissionData,
    photoBuffers,
    job.templateSnapshot
  );
  if (!generated.pdfBuffer?.length) throw new Error("PDF generation returned no content.");
  const uploaded = await uploadInspectionPdf({
    pdfBuffer: generated.pdfBuffer,
    fileName: generated.fileName,
    organizationId: job.organizationId,
    propertyName: job.propertyName,
  });
  job.pdfKey = uploaded.key;
  job.pdfUrl = uploaded.location;
  job.pdfFileName = generated.fileName;
  await job.save();
  return generated;
}

function assignmentFulfillmentSnapshot(assignment) {
  if (!assignment?.fulfillment?.source) return legacyFulfillmentSnapshot();
  const stored = typeof assignment.fulfillment.toObject === "function"
    ? assignment.fulfillment.toObject()
    : assignment.fulfillment;
  return { ...stored };
}

async function ensureSubmission(job, organization, property, assignment) {
  const initialFulfillment = assignmentFulfillmentSnapshot(assignment);
  let submission = job.submissionId
    ? await Submission.findById(job.submissionId)
    : await Submission.findOne({ processingJobId: job._id });
  if (!submission) {
    submission = await Submission.findOneAndUpdate(
      { processingJobId: job._id },
      {
        $setOnInsert: {
          organizationId: job.organizationId,
          userId: job.userId,
          property: job.propertyName,
          pdfUrl: job.pdfUrl,
          submittedAt: job.createdAt,
          responses: job.submissionData,
          templateSnapshot: job.templateSnapshot,
          assignmentId: assignment?._id || null,
          fulfillmentSnapshot: initialFulfillment,
          processingJobId: job._id,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }
  if (!submission.fulfillmentSnapshot) {
    submission.fulfillmentSnapshot = initialFulfillment;
    submission.assignmentId = assignment?._id || null;
    await submission.save();
  }
  const fulfillmentSnapshot = submission.fulfillmentSnapshot || initialFulfillment;
  if (job.orgType === "COM" && fulfillmentSnapshot.invoiceRequired !== false) {
    const { policy } = await ensureOrganizationBillingPolicy(job.organizationId);
    await Invoice.findOneAndUpdate(
      { submissionId: submission._id },
      {
        $setOnInsert: {
          organizationId: job.organizationId,
          propertyId: property._id,
          submissionId: submission._id,
          submitterId: job.userId,
          inspectionDate: submission.submittedAt,
          amountCents: property.defaultInspectionAmountCents || null,
          policySnapshot: createPolicySnapshot(policy),
          fulfillmentSnapshot,
          propertySnapshot: {
            name: property.name,
            propertyCode: property.propertyCode,
            address: resolveBillingAddress(property),
            brokerageName: organization.name,
            apMethod: property.apMethod,
            apEmail: property.apEmail,
            apPortal: property.apPortal,
            billingInstructions: property.billingInstructions,
            purchaseOrder: property.purchaseOrder,
          },
          statusHistory: [{ status: "unbilled", changedBy: job.userId }],
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }
  if (!job.submissionId) {
    job.submissionId = submission._id;
    await job.save();
  }
  return submission;
}

async function deliverNotifications(job, property, submission, assignment) {
  if (job.notificationsSentAt) return;
  const propertyManagerIds = [...new Set(
    (property.propertyManagers || []).map((id) => id.toString())
  )];
  let recipientIds = propertyManagerIds;
  let event = inspectionSubmitted(job.propertyName, submission._id);
  if (assignment) {
    const admins = await User.find({
      organizationId: job.organizationId,
      role: "admin",
      accountStatus: { $ne: "inactive" },
    }).select("_id").lean();
    recipientIds = [...new Set([
      ...propertyManagerIds,
      ...admins.map(({ _id }) => _id.toString()),
    ])];
    event = assignmentCompleted(job.propertyName, submission._id);
  }
  for (const recipientUserId of recipientIds) {
    await sendUserNotification({
      organizationId: job.organizationId,
      userId: recipientUserId,
      ...event,
    });
  }
  if (assignment) await Assignment.deleteOne({ _id: assignment._id });
  job.notificationsSentAt = new Date();
  await job.save();
}

function inspectionEmail(job, recipientEmails, pdfBuffer) {
  const labels = {
    COM: "Commercial Property",
    LTR: "Long-Term Rental",
    RES: "Residential Property",
    STR: "Short-Term Rental",
  };
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(job.createdAt);
  return {
    to: recipientEmails.join(","),
    subject: `${labels[job.orgType] || "Property"} Submission - ${job.propertyName} submitted on ${date}`,
    text: `A new ${String(labels[job.orgType] || "property").toLowerCase()} inspection was submitted for ${job.propertyName}.`,
    attachments: [{ filename: job.pdfFileName, content: pdfBuffer }],
  };
}

async function processInspectionJob(job) {
  const organization = await Organization.findById(job.organizationId);
  if (!organization) {
    const error = new Error("The organization no longer exists.");
    error.permanent = true;
    throw error;
  }
  const property = organization.properties.id(job.propertyId);
  if (!property) {
    const error = new Error("The property no longer exists.");
    error.permanent = true;
    throw error;
  }
  const assignment = await Assignment.findOne({
    organizationId: job.organizationId,
    propertyName: job.propertyName,
    userId: job.userId,
  });
  const generated = await ensurePdf(job);
  const submission = await ensureSubmission(job, organization, property, assignment);
  await deliverNotifications(job, property, submission, assignment);

  if (!job.emailSentAt) {
    const fallback = process.env.INSPECTION_FALLBACK_EMAIL || process.env.SYSTEM_EMAIL_ADDRESS;
    const recipients = property.emails?.length ? property.emails : fallback ? [fallback] : [];
    if (!recipients.length) throw new Error("No inspection email recipient is configured.");
    await sendSystemEmail(inspectionEmail(job, recipients, generated.pdfBuffer));
    job.emailSentAt = new Date();
    job.emailError = "";
  }

  job.status = "completed";
  job.completedAt = new Date();
  job.lockedAt = null;
  job.lockedBy = "";
  job.lastError = "";
  await job.save();
  deleteInspectionPhotos(job.photoUploads).catch((error) => {
    console.error(`Unable to remove temporary photos for inspection job ${job._id}:`, error.message);
  });
  return job;
}

async function recordJobFailure(job, error) {
  const message = String(error?.message || "Inspection processing failed.").slice(0, 500);
  const exhausted = error?.permanent || job.attempts >= job.maxAttempts;
  if (exhausted && job.submissionId) {
    job.status = "completed";
    job.completedAt = new Date();
    job.emailError = message;
  } else if (exhausted) {
    job.status = "failed";
    job.failedAt = new Date();
  } else {
    job.status = "queued";
    job.availableAt = new Date(Date.now() + Math.min(5 * 60 * 1000, 30000 * (2 ** (job.attempts - 1))));
  }
  job.lastError = message;
  job.lockedAt = null;
  job.lockedBy = "";
  await job.save();
  if (exhausted) {
    deleteInspectionPhotos(job.photoUploads).catch(() => {});
  }
  return job;
}

async function processNextInspectionJob(options = {}) {
  const job = await claimInspectionJob(options);
  if (!job) return null;
  try {
    return await processInspectionJob(job);
  } catch (error) {
    console.error(`Inspection job ${job._id} failed on attempt ${job.attempts}:`, error.message);
    return recordJobFailure(job, error);
  }
}

async function cleanupExpiredInspectionUploads({ JobModel = InspectionJob, now = new Date() } = {}) {
  const expired = await JobModel.find({
    status: "uploading",
    uploadExpiresAt: { $lte: now },
  }).sort({ uploadExpiresAt: 1 }).limit(25);
  for (const job of expired) {
    const claimed = await JobModel.findOneAndUpdate(
      { _id: job._id, status: "uploading", uploadExpiresAt: { $lte: now } },
      {
        $set: {
          status: "failed",
          failedAt: now,
          lastError: "Photo upload session expired before processing began.",
        },
      },
      { new: true }
    );
    if (claimed) {
      await deleteInspectionPhotos(claimed.photoUploads).catch((error) => {
        console.error(`Unable to clean expired inspection upload ${claimed._id}:`, error.message);
      });
    }
  }
  return expired.length;
}

function startInspectionWorker({ pollMs = DEFAULT_POLL_MS } = {}) {
  let stopped = false;
  let timer = null;
  let lastCleanupAt = 0;
  async function poll() {
    if (stopped) return;
    try {
      if (Date.now() - lastCleanupAt >= 60 * 60 * 1000) {
        await cleanupExpiredInspectionUploads();
        lastCleanupAt = Date.now();
      }
      const processed = await processNextInspectionJob();
      timer = setTimeout(poll, processed ? 0 : pollMs);
    } catch (error) {
      console.error("Inspection worker polling error:", error.message);
      timer = setTimeout(poll, pollMs);
    }
    timer.unref?.();
  }
  poll();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

module.exports = {
  LEASE_MS,
  claimInspectionJob,
  processInspectionJob,
  recordJobFailure,
  processNextInspectionJob,
  cleanupExpiredInspectionUploads,
  startInspectionWorker,
};
