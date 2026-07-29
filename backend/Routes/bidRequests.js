const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const BidRequest = require("../models/bidRequest");
const User = require("../models/user");
const s3 = require("../awsConfig");
const { sendUserNotification } = require("../services/notifications");
const { estimateBidPricing } = require("../services/bidPricing");
const {
  bidRequestSubmitted,
  bidRequestReceived,
  bidRequestStatusChanged,
} = require("../services/notificationEvents");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    callback(allowed.includes(file.mimetype) ? null : new Error("Only PDF, JPG, and PNG files are allowed."), allowed.includes(file.mimetype));
  },
});

router.get("/", async (req, res) => {
  const query = { organizationId: req.user.organizationId };
  if (req.user.role === "admin") {
    query.archivedAt = req.query.archive === "archived" ? { $ne: null } : null;
  } else {
    query.requestedBy = req.user.userId;
  }
  let requestQuery = BidRequest.find(query);
  if (req.user.role === "admin") requestQuery = requestQuery.select("+pricingEstimate");
  const requests = await requestQuery
    .populate("requestedBy", "username email")
    .populate("archivedBy", "username email")
    .sort({ createdAt: -1 })
    .lean();
  res.json(requests.map((request) => ({
    ...request,
    attachmentUrl: s3.getSignedUrl("getObject", {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: request.attachmentKey,
      Expires: 3600,
    }),
  })));
});

router.post("/", upload.single("attachment"), async (req, res) => {
  try {
    if (req.user.role !== "property_manager") {
      return res.status(403).json({ error: "Property managers only." });
    }
    if (!req.file) return res.status(400).json({ error: "A lot-dimensions attachment is required." });
    const pricingEstimate = estimateBidPricing({
      grossSquareFeet: req.body.grossSquareFeet,
      propertyType: req.body.propertyType,
      serviceFrequency: req.body.serviceFrequency,
      hasKnownIssues: Boolean(String(req.body.knownIssues || "").trim()),
    });
    const key = `${req.user.organizationId}/bid-requests/${uuidv4()}-${req.file.originalname}`;
    await s3.upload({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: "private",
    }).promise();
    const request = await BidRequest.create({
      organizationId: req.user.organizationId,
      requestedBy: req.user.userId,
      grossSquareFeet: Number(req.body.grossSquareFeet),
      propertyType: req.body.propertyType,
      address: req.body.address,
      serviceFrequency: req.body.serviceFrequency,
      knownIssues: req.body.knownIssues,
      pricingEstimate,
      attachmentKey: key,
      attachmentName: req.file.originalname,
      activity: [{ action: "created", changedBy: req.user.userId }],
    });
    sendUserNotification({
      organizationId: req.user.organizationId,
      userId: req.user.userId,
      ...bidRequestSubmitted(request),
    }).catch((notificationError) => {
      console.error("Bid requester notification error:", notificationError);
    });
    User.find({
      organizationId: req.user.organizationId,
      role: "admin",
      accountStatus: { $ne: "inactive" },
    }).select("_id").lean().then((admins) => {
      admins.forEach((admin) => {
        sendUserNotification({
          organizationId: req.user.organizationId,
          userId: admin._id,
          ...bidRequestReceived(request),
        }).catch((notificationError) => {
          console.error("Bid admin notification error:", notificationError);
        });
      });
    }).catch((notificationError) => {
      console.error("Unable to resolve bid request administrators:", notificationError);
    });
    res.status(201).json({
      _id: request._id,
      status: request.status,
      address: request.address,
      createdAt: request.createdAt,
    });
  } catch (error) {
    console.error("Bid request error:", error);
    res.status(400).json({ error: error.message || "Unable to submit bid request." });
  }
});

router.put("/:id/review", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only." });
  const { status, adminNotes } = req.body;
  if (!["approved", "declined"].includes(status)) {
    return res.status(400).json({ error: "Invalid review status." });
  }
  const request = await BidRequest.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
    archivedAt: null,
  });
  if (!request) return res.status(404).json({ error: "Bid request not found." });
  const statusChanged = request.status !== status;
  request.status = status;
  request.adminNotes = adminNotes || "";
  request.reviewedBy = req.user.userId;
  request.reviewedAt = new Date();
  request.activity.push({ action: status, changedBy: req.user.userId });
  await request.save();
  if (statusChanged) {
    sendUserNotification({
      organizationId: req.user.organizationId,
      userId: request.requestedBy,
      ...bidRequestStatusChanged(request),
    }).catch((notificationError) => {
      console.error("Bid status notification error:", notificationError);
    });
  }
  res.json(request);
});

router.put("/:id/archive", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only." });
  const request = await BidRequest.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId, archivedAt: null },
    {
      archivedAt: new Date(),
      archivedBy: req.user.userId,
      $push: { activity: { action: "archived", changedBy: req.user.userId } },
    },
    { new: true }
  );
  if (!request) return res.status(404).json({ error: "Active bid request not found." });
  res.json(request);
});

router.put("/:id/restore", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only." });
  const request = await BidRequest.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId, archivedAt: { $ne: null } },
    {
      archivedAt: null,
      archivedBy: null,
      $push: { activity: { action: "restored", changedBy: req.user.userId } },
    },
    { new: true }
  );
  if (!request) return res.status(404).json({ error: "Archived bid request not found." });
  res.json(request);
});

module.exports = router;
