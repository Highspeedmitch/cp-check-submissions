// Routes/profits.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const Profit = require("../models/profit");
const authenticateToken = require("../middleware/authenticateToken");
const Organization = require("../models/organization");
const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

// AWS S3 Configuration
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDFs are allowed."));
    }
    cb(null, true);
  },
});

// ✅ Admin uploads profit statement (Restricted to AzRoots Admins)
router.post("/:propertyName", authenticateToken, upload.single("profitPdf"), async (req, res) => {
  try {
    let { propertyName } = req.params;
    const { monthlyProfit } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "PDF file is required." });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can upload profit statements." });
    }

    const organization = await Organization.findById(req.user.organizationId);
    if (!organization || organization.name !== "AzRoots") {
      return res.status(403).json({ error: "Only AzRoots admins can upload profit statements." });
    }

    // ✅ Decode and normalize `propertyName`
    propertyName = decodeURIComponent(propertyName).trim().toLowerCase();

    console.log("🔹 Received propertyName:", propertyName);
    console.log("🔹 Available properties:", organization.properties.map(p => encodeURIComponent(p.name)));

    // ✅ Ensure `properties` exists before searching
    const propertyList = organization.properties || [];

    // ✅ Find property by case-insensitive matching
    const property = propertyList.find(
      p => p.name.trim().toLowerCase() === propertyName
    );

    if (!property) {
      console.log("❌ Property not found:", propertyName);
      return res.status(404).json({ error: "Property not found in your organization." });
    }

    // ✅ Use `_id` as propertyId internally
    const propertyId = property._id.toString();

    // ✅ Upload PDF to S3
    const fileName = `profits/${uuidv4()}-${req.file.originalname}`;
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: "application/pdf",
      ACL: "private",
    };

    const uploadResult = await s3.upload(params).promise();

    // ✅ Calculate running YTD total
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const existingProfits = await Profit.find({
      organizationId: req.user.organizationId,
      propertyId: propertyId,
      uploadedAt: { $gte: startOfYear },
    });

    const previousYTD = existingProfits.reduce((acc, record) => acc + record.monthlyProfit, 0);
    const newMonthlyProfit = Number(monthlyProfit);
    const newYTDTotal = previousYTD + newMonthlyProfit;

    // ✅ Save profit record in DB
    const profit = new Profit({
      propertyId,
      organizationId: req.user.organizationId,
      monthlyProfit: newMonthlyProfit,
      ytdProfit: newYTDTotal,
      pdfUrl: uploadResult.Location,
    });

    await profit.save();
    res.status(201).json({ message: `Profit data uploaded for ${property.name}`, profit });
  } catch (error) {
    console.error("❌ Server error in profits.js:", error);
    return res.status(500).json({ error: "Server error uploading profit data" });
  }
});

// ✅ Clients retrieve profit data (Restricted to AzRoots Clients)
router.get("/:propertyId", authenticateToken, async (req, res) => {
  try {
    const { propertyId } = req.params;

    if (req.user.role !== "client") {
      return res.status(403).json({ error: "Only clients can view profit statements." });
    }

    // ✅ Fetch the organization
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization || organization.name !== "AzRoots") {
      return res.status(403).json({ error: "Only AzRoots clients can view profit statements." });
    }

    const profit = await Profit.findOne({ propertyId });
    if (!profit) {
      return res.status(404).json({ error: "No profit data found for this property." });
    }

    res.json(profit);
  } catch (error) {
    console.error("Error fetching profit data:", error);
    res.status(500).json({ error: "Server error fetching profit data" });
  }
});

module.exports = router;
