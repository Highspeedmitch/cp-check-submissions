const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const BidRequest = require("../models/bidRequest");
const s3 = require("../awsConfig");

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
  if (req.user.role !== "admin") query.requestedBy = req.user.userId;
  const requests = await BidRequest.find(query)
    .populate("requestedBy", "username email")
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
      attachmentKey: key,
      attachmentName: req.file.originalname,
    });
    res.status(201).json(request);
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
  const request = await BidRequest.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { status, adminNotes: adminNotes || "", reviewedBy: req.user.userId, reviewedAt: new Date() },
    { new: true }
  );
  if (!request) return res.status(404).json({ error: "Bid request not found." });
  res.json(request);
});

module.exports = router;
