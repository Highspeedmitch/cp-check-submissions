const crypto = require("crypto");
const mongoose = require("mongoose");
const InspectionJob = require("../models/inspectionJob");
const Organization = require("../models/organization");
const Assignment = require("../models/assignment");
const { canAccessProperty } = require("./propertyAccess");
const {
  resolvePropertyInspectionTemplate,
  createTemplateSnapshot,
} = require("./inspectionTemplates");
const { isAllowedTemplatePhotoField } = require("./inspectionPhotoAccess");
const {
  createPhotoUploadPost,
  inspectUploadedPhoto,
} = require("./inspectionStorage");
const { assignedResourceContext } = require("./resourceAccess");

const MAX_PHOTOS = 15;
const MAX_PHOTOS_PER_FIELD = 6;
const LEGACY_PHOTO_FIELDS = new Set([
  "toiletriesStocked",
  "furnitureCorrect",
  "checkoutProcedure",
  "propertyDamage",
  "lawnCondition",
  "plumbingLeaks",
  "electricalIssues",
  "HVACWorking",
  "additionalComments",
]);

function cleanSubmissionData(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    const error = new Error("Inspection responses must be an object.");
    error.status = 400;
    throw error;
  }
  const entries = Object.entries(input);
  if (entries.length > 100) {
    const error = new Error("The inspection contains too many response fields.");
    error.status = 400;
    throw error;
  }
  return Object.fromEntries(entries.map(([key, value]) => {
    const cleanKey = String(key).trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_ -]{0,127}$/.test(cleanKey)) {
      const error = new Error("The inspection contains an invalid response field.");
      error.status = 400;
      throw error;
    }
    const cleanValue = value == null ? "" : String(value).trim();
    if (cleanValue.length > 10000) {
      const error = new Error(`The response for ${cleanKey} is too long.`);
      error.status = 400;
      throw error;
    }
    return [cleanKey, cleanValue];
  }));
}

function validateIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) {
    const error = new Error("A valid idempotency key is required.");
    error.status = 400;
    throw error;
  }
  return key;
}

function normalizePhotoRequests(requests, isAllowed) {
  if (!Array.isArray(requests) || requests.length > MAX_PHOTOS) {
    const error = new Error(`Inspections support up to ${MAX_PHOTOS} photos.`);
    error.status = 400;
    throw error;
  }
  const counts = new Map();
  return requests.map((request) => {
    const fieldName = String(request?.fieldName || "").trim();
    if (!fieldName || fieldName.length > 128 || !isAllowed(fieldName)) {
      const error = new Error(`Photos are not allowed for ${fieldName || "that field"}.`);
      error.status = 400;
      throw error;
    }
    const count = (counts.get(fieldName) || 0) + 1;
    counts.set(fieldName, count);
    if (count > MAX_PHOTOS_PER_FIELD) {
      const error = new Error(`Up to ${MAX_PHOTOS_PER_FIELD} photos are allowed per field.`);
      error.status = 400;
      throw error;
    }
    return {
      uploadId: crypto.randomUUID(),
      fieldName,
      originalName: String(request?.fileName || "photo").slice(0, 180),
    };
  });
}

function resolveCustomerContractorInvoiceSettings({
  assignment,
  property,
  requestedPreference = "",
}) {
  const preference = String(requestedPreference || "").trim();
  if (preference && !["auto_submit", "review_first"].includes(preference)) {
    const error = new Error("Select a valid contractor invoice preference.");
    error.status = 400;
    throw error;
  }
  if (assignment?.fulfillment?.source !== "customer_contractor") {
    return { preference: "not_applicable", amountCents: null };
  }
  const amountCents = Number.isInteger(property?.defaultInspectionAmountCents)
    ? property.defaultInspectionAmountCents
    : null;
  const autoSubmitConfigured = Boolean(property?.autoSubmitCustomerContractorInvoices)
    && amountCents > 0;
  return {
    preference: preference === "review_first"
      ? "review_first"
      : autoSubmitConfigured ? "auto_submit" : "review_first",
    amountCents,
  };
}

async function resolveSubmissionAssignment({
  requestedAssignmentId,
  organizationId,
  userId,
  propertyName,
  AssignmentModel = Assignment,
}) {
  const query = {
    organizationId,
    userId,
    propertyName,
    status: "scheduled",
  };
  if (requestedAssignmentId) {
    if (!mongoose.Types.ObjectId.isValid(requestedAssignmentId)) {
      const error = new Error("Assigned work item is invalid.");
      error.status = 400;
      throw error;
    }
    const assignment = await AssignmentModel.findOne({
      ...query,
      _id: requestedAssignmentId,
    });
    if (!assignment) {
      const error = new Error("Assigned work item not found.");
      error.status = 404;
      throw error;
    }
    return assignment;
  }

  let candidatesQuery = AssignmentModel.find(query);
  if (typeof candidatesQuery.sort === "function") {
    candidatesQuery = candidatesQuery.sort({ startDate: 1, createdAt: 1 });
  }
  if (typeof candidatesQuery.limit === "function") {
    candidatesQuery = candidatesQuery.limit(2);
  }
  const candidates = await candidatesQuery;
  return Array.isArray(candidates) && candidates.length === 1 ? candidates[0] : null;
}

function jobResponse(job, uploads = []) {
  return {
    jobId: job._id,
    status: job.status,
    message: job.status === "uploading"
      ? "Inspection created. Upload the photos to continue."
      : "Inspection is already being processed.",
    uploads,
  };
}

async function createInspectionJob({
  user,
  body,
  JobModel = InspectionJob,
  OrganizationModel = Organization,
  AssignmentModel = Assignment,
}) {
  const propertyName = String(body.property || body.selectedProperty || "").trim();
  if (!propertyName) {
    const error = new Error("Property name is required.");
    error.status = 400;
    throw error;
  }
  const idempotencyKey = validateIdempotencyKey(body.idempotencyKey);
  let submissionData = cleanSubmissionData(body.responses || {});
  let organizationId = user.organizationId;
  let resourceAssignment = null;
  let submissionAssignment = null;
  let organization;
  let property;
  if (user.accountScope === "afterlight_resource") {
    const context = await assignedResourceContext({
      user,
      assignmentId: body.assignmentId,
      propertyName,
      AssignmentModel,
      OrganizationModel,
    });
    resourceAssignment = context.assignment;
    submissionAssignment = context.assignment;
    organization = context.organization;
    property = context.property;
    organizationId = organization._id;
  } else {
    organization = await OrganizationModel.findById(organizationId);
  }
  if (!organization) {
    const error = new Error("Organization not found.");
    error.status = 404;
    throw error;
  }
  let templateSnapshot = null;
  if (organization.orgType === "COM") {
    const result = await resolvePropertyInspectionTemplate({
      organizationId,
      propertyName,
      user: resourceAssignment ? { ...user, role: "admin", organizationId } : user,
    });
    organization = result.organization;
    property = result.property;
    if (!submissionAssignment) {
      submissionAssignment = await resolveSubmissionAssignment({
        requestedAssignmentId: body.assignmentId,
        organizationId,
        userId: user.userId,
        propertyName: property.name,
        AssignmentModel,
      });
    }
    templateSnapshot = createTemplateSnapshot(result.effectiveTemplate);
    const invalidChoice = templateSnapshot.fields.find((field) => (
      field.type === "yes_no_issue"
      && submissionData[field.key]
      && !["yes", "no"].includes(submissionData[field.key].toLowerCase())
    ));
    if (invalidChoice) {
      const error = new Error(`Invalid response for ${invalidChoice.label}.`);
      error.status = 400;
      throw error;
    }
    const missing = templateSnapshot.fields.find((field) => field.required && !submissionData[field.key]);
    if (missing) {
      const error = new Error(`${missing.label} is required.`);
      error.status = 400;
      throw error;
    }
    submissionData = Object.fromEntries(templateSnapshot.fields.flatMap((field) => {
      const values = [[field.key, submissionData[field.key] || ""]];
      if (field.type === "yes_no_issue") {
        values.push([`${field.key}Description`, submissionData[`${field.key}Description`] || ""]);
      }
      return values;
    }));
  } else {
    property = property || organization.properties.find((item) => item.name === propertyName);
    if (!property) {
      const error = new Error("Property not found.");
      error.status = 404;
      throw error;
    }
    if (!resourceAssignment && !canAccessProperty(property, user)) {
      const error = new Error("You do not manage this property.");
      error.status = 403;
      throw error;
    }
  }

  const orgType = organization.orgType;
  const customerContractorInvoiceSettings = resolveCustomerContractorInvoiceSettings({
    assignment: submissionAssignment,
    property,
    requestedPreference: body.customerContractorInvoicePreference,
  });
  submissionData.selectedProperty = property.name;
  submissionData.orgType = orgType;
  const customPhotoFields = new Set((property.customFields || []).map((field) => String(field.name)));
  const photoRequests = normalizePhotoRequests(body.photos || [], (fieldName) => (
    templateSnapshot
      ? isAllowedTemplatePhotoField(templateSnapshot.fields, fieldName)
      : LEGACY_PHOTO_FIELDS.has(fieldName) || customPhotoFields.has(fieldName)
  ));

  const jobId = new mongoose.Types.ObjectId();
  const photoUploads = photoRequests.map((photo) => ({
    ...photo,
    key: `inspection-uploads/${organizationId}/${jobId}/${photo.uploadId}`,
  }));

  let job;
  try {
    job = await JobModel.create({
      _id: jobId,
      organizationId,
      userId: user.userId,
      propertyId: property._id,
      assignmentId: submissionAssignment?._id || null,
      propertyName: property.name,
      orgType,
      idempotencyKey,
      submissionData,
      templateSnapshot,
      customerContractorInvoicePreference: customerContractorInvoiceSettings.preference,
      customerContractorInvoiceAmountCents: customerContractorInvoiceSettings.amountCents,
      photoUploads,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    job = await JobModel.findOne({ organizationId, userId: user.userId, idempotencyKey });
  }

  const uploads = job.status === "uploading"
    ? await Promise.all(job.photoUploads.map((photo) => createPhotoUploadPost(photo)))
    : [];
  return jobResponse(job, uploads);
}

async function finalizeInspectionJob({ job, JobModel = InspectionJob }) {
  if (job.status !== "uploading") return job;
  if (job.uploadExpiresAt <= new Date()) {
    const error = new Error("The photo upload session expired. Please submit the inspection again.");
    error.status = 410;
    throw error;
  }
  const inspected = [];
  for (const photo of job.photoUploads) {
    inspected.push(await inspectUploadedPhoto(photo));
  }
  const detailsById = new Map(inspected.map((details, index) => [job.photoUploads[index].uploadId, details]));
  const updated = await JobModel.findOneAndUpdate(
    { _id: job._id, status: "uploading" },
    {
      $set: {
        status: "queued",
        availableAt: new Date(),
        photoUploads: job.photoUploads.map((photo) => ({
          ...photo.toObject(),
          ...detailsById.get(photo.uploadId),
        })),
      },
    },
    { new: true }
  );
  return updated || JobModel.findById(job._id);
}

module.exports = {
  MAX_PHOTOS,
  MAX_PHOTOS_PER_FIELD,
  cleanSubmissionData,
  normalizePhotoRequests,
  resolveCustomerContractorInvoiceSettings,
  resolveSubmissionAssignment,
  createInspectionJob,
  finalizeInspectionJob,
  jobResponse,
};
