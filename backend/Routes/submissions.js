const express = require("express");
const AWS = require("aws-sdk");
const mongoose = require("mongoose");
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
const SUBMISSION_HISTORY_PAGE_SIZE = 10;
const SUBMISSION_HISTORY_FULFILLMENT_VALUES = [
  "direct_submission",
  "customer_employee",
  "customer_contractor",
  "afterlight_staff",
  "afterlight_contractor",
  "legacy",
];
const SUBMISSION_HISTORY_FULFILLMENTS = new Set(SUBMISSION_HISTORY_FULFILLMENT_VALUES);

function historyRequestError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function historyObjectId(value, label) {
  if (value === undefined || value === "") return "";
  const normalized = String(value).trim();
  if (!/^[a-f\d]{24}$/i.test(normalized)) {
    throw historyRequestError(`${label} must be a valid user ID.`);
  }
  return normalized;
}

function parseSubmissionHistoryQuery(query = {}) {
  const months = parseSubmissionMonths(query.months);
  if (months === null) {
    throw historyRequestError(
      `months must be a whole number between ${MIN_SUBMISSION_MONTHS} and ${MAX_SUBMISSION_MONTHS}.`
    );
  }
  const pageValue = query.page === undefined || query.page === "" ? "1" : String(query.page);
  if (!/^[1-9]\d*$/.test(pageValue) || !Number.isSafeInteger(Number(pageValue))) {
    throw historyRequestError("page must be a positive whole number.");
  }
  const fulfillment = query.fulfillment ? String(query.fulfillment).trim() : "";
  if (fulfillment && !SUBMISSION_HISTORY_FULFILLMENTS.has(fulfillment)) {
    throw historyRequestError("fulfillment is not a supported filter.");
  }
  const assignerValue = query.assigner ? String(query.assigner).trim() : "";
  const assigner = assignerValue === "unassigned"
    ? assignerValue
    : historyObjectId(assignerValue, "assigner");

  return {
    months,
    page: Number(pageValue),
    submitter: historyObjectId(query.submitter, "submitter"),
    assigner,
    fulfillment,
  };
}

function mongoObjectId(value) {
  return value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(String(value));
}

function buildSubmissionHistoryPipeline({
  organizationId,
  property,
  cutoff,
  page,
  submitter,
  assigner,
  fulfillment,
  assignmentCollection = Assignment.collection.name,
}) {
  const resultMatch = {};
  if (submitter) resultMatch.userId = mongoObjectId(submitter);
  if (assigner === "unassigned") {
    resultMatch.historyAssignerId = null;
  } else if (assigner) {
    resultMatch.historyAssignerId = mongoObjectId(assigner);
  }
  if (fulfillment) resultMatch.historyFulfillment = fulfillment;

  return [
    {
      $match: {
        organizationId: mongoObjectId(organizationId),
        property,
        submittedAt: { $gte: cutoff },
      },
    },
    {
      $project: {
        _id: 1,
        organizationId: 1,
        userId: 1,
        assignmentId: 1,
        pdfUrl: 1,
        submittedAt: 1,
      },
    },
    {
      $lookup: {
        from: assignmentCollection,
        let: {
          assignmentId: "$assignmentId",
          organizationId: "$organizationId",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$assignmentId"] },
                  { $eq: ["$organizationId", "$$organizationId"] },
                ],
              },
            },
          },
          {
            $project: {
              startDate: 1,
              createdAt: 1,
              assignedBy: 1,
              "fulfillment.source": 1,
              "fulfillment.resolvedBy": 1,
            },
          },
        ],
        as: "historyAssignmentMatches",
      },
    },
    {
      $set: {
        historyAssignment: {
          $ifNull: [{ $arrayElemAt: ["$historyAssignmentMatches", 0] }, null],
        },
      },
    },
    {
      $set: {
        historyAssignerId: {
          $ifNull: [
            "$historyAssignment.assignedBy",
            "$historyAssignment.fulfillment.resolvedBy",
          ],
        },
        historyFulfillment: {
          $cond: [
            { $eq: ["$historyAssignment", null] },
            "direct_submission",
            { $ifNull: ["$historyAssignment.fulfillment.source", "legacy"] },
          ],
        },
      },
    },
    {
      $facet: {
        rows: [
          { $match: resultMatch },
          { $sort: { submittedAt: -1, _id: -1 } },
          { $skip: (page - 1) * SUBMISSION_HISTORY_PAGE_SIZE },
          { $limit: SUBMISSION_HISTORY_PAGE_SIZE },
          {
            $project: {
              _id: 1,
              userId: 1,
              assignmentId: 1,
              pdfUrl: 1,
              submittedAt: 1,
              historyAssignment: 1,
            },
          },
        ],
        total: [
          { $match: resultMatch },
          { $count: "count" },
        ],
        submitters: [{ $group: { _id: "$userId" } }],
        assigners: [{ $group: { _id: "$historyAssignerId" } }],
        fulfillmentTypes: [{ $group: { _id: "$historyFulfillment" } }],
      },
    },
  ];
}

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
    const historyQuery = parseSubmissionHistoryQuery(req.query);
    const organization = await Organization.findById(req.user.organizationId);
    const property = organization?.properties.find((item) => item.name === req.params.property);
    if (!property) return res.status(404).json({ error: "Property not found." });
    if (!canAccessProperty(property, req.user)) {
      return res.status(403).json({ error: "You do not manage this property." });
    }
    const [history = {}] = await Submission.aggregate(buildSubmissionHistoryPipeline({
      organizationId: req.user.organizationId,
      property: req.params.property,
      cutoff: getSubmissionCutoff(historyQuery.months),
      ...historyQuery,
    }));
    const rows = history.rows || [];
    const submitterIds = (history.submitters || []).map((entry) => entry._id).filter(Boolean);
    const assignerIds = (history.assigners || []).map((entry) => entry._id).filter(Boolean);
    const userIds = [...new Set([...submitterIds, ...assignerIds].map(String))];
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } })
          .select("_id username email")
          .lean()
      : [];
    const usersById = new Map(users.map((user) => [String(user._id), user]));
    const userOption = (id) => activityUser(usersById.get(String(id))) || {
      _id: id,
      name: "Unknown user",
      email: "",
    };
    const sortUsers = (left, right) => left.name.localeCompare(right.name);
    const total = history.total?.[0]?.count || 0;
    return res.json({
      items: rows.map((row) => {
        const { historyAssignment, ...submission } = row;
        return withSubmissionActivity(
          submission,
          historyAssignment,
          usersById,
          { replacePlus: true }
        );
      }),
      pagination: {
        page: historyQuery.page,
        pageSize: SUBMISSION_HISTORY_PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / SUBMISSION_HISTORY_PAGE_SIZE)),
      },
      filters: {
        submitters: submitterIds.map(userOption).sort(sortUsers),
        assigners: assignerIds.map(userOption).sort(sortUsers),
        includeUnassignedAssigner: (history.assigners || []).some((entry) => entry._id == null),
        fulfillmentTypes: (history.fulfillmentTypes || [])
          .map((entry) => entry._id)
          .filter(Boolean)
          .sort((left, right) => (
            SUBMISSION_HISTORY_FULFILLMENT_VALUES.indexOf(left)
            - SUBMISSION_HISTORY_FULFILLMENT_VALUES.indexOf(right)
          )),
      },
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error("Error fetching admin submissions:", error);
    return res.status(500).json({ message: "Failed to retrieve submissions." });
  }
});

module.exports = router;
module.exports.signedPdfUrl = signedPdfUrl;
module.exports.withSubmissionActivity = withSubmissionActivity;
module.exports.SUBMISSION_HISTORY_PAGE_SIZE = SUBMISSION_HISTORY_PAGE_SIZE;
module.exports.parseSubmissionHistoryQuery = parseSubmissionHistoryQuery;
module.exports.buildSubmissionHistoryPipeline = buildSubmissionHistoryPipeline;
