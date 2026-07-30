// Routes/profits.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const Profit = require("../models/profit");
const authenticateToken = require("../middleware/authenticateToken");
const Organization = require("../models/organization");
const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const { getLatestProfitStatuses } = require("../services/profitStatuses");
const { uploadLimiter } = require("../middleware/rateLimits");
const { hasValidFileSignature } = require("../utils/uploadSecurity");
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
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDFs are allowed."));
    }
    cb(null, true);
  },
});

// ✅ Admin uploads profit statement (Restricted to AzRoots Admins)
// Return the latest profit upload for every property in the authenticated
// user's organization. This replaces one request per property on the dashboard.
router.get("/latest-statuses", authenticateToken, async (req, res) => {
  try {
    const statuses = await getLatestProfitStatuses({
      organizationId: req.user.organizationId,
      Organization,
      Profit,
    });

    if (!statuses) {
      return res.status(404).json({ error: "Organization not found." });
    }

    return res.json({ statuses });
  } catch (error) {
    console.error("Error fetching latest profit statuses:", error);
    return res.status(500).json({ error: "Server error fetching profit statuses." });
  }
});

router.post("/:propertyName/upload", authenticateToken, uploadLimiter, upload.single("profitPdf"), async (req, res) => {
  try {
    let { propertyName } = req.params;
    const { monthlyProfit } = req.body;
    
    
    if (!req.file) {
      return res.status(400).json({ error: "PDF file is required." });
    }
    if (!hasValidFileSignature(req.file)) {
      return res.status(400).json({ error: "The uploaded PDF is invalid." });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can upload profit statements." });
    }

    const organization = await Organization.findById(req.user.organizationId);
    if (!organization || organization.name !== "AzRoots") {
      return res.status(403).json({ error: "Only AzRoots admins can upload profit statements." });
    }

    // Decode and normalize the property name
    propertyName = decodeURIComponent(propertyName).trim();

    const property = organization.properties.find(
      (p) => p.name.trim().toLowerCase() === propertyName.toLowerCase()
    );
    if (!property) {
      return res.status(404).json({ error: "Property not found in your organization." });
    }

    const propertyId = property._id.toString();

    // Upload PDF to S3
    const fileName = `profits/${uuidv4()}-${req.file.originalname}`;
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: "application/pdf",
      ACL: "private",
    };

    const uploadResult = await s3.upload(params).promise();

    // Calculate YTD total
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const existingProfits = await Profit.find({
      organizationId: req.user.organizationId,
      propertyId: propertyId,
      uploadedAt: { $gte: startOfYear },
    });

    const previousYTD = existingProfits.reduce((acc, record) => acc + record.monthlyProfit, 0);
    
    // Convert profit amount to a number
    const newMonthlyProfit = Number(monthlyProfit);
    if (isNaN(newMonthlyProfit)) {
      return res.status(400).json({ error: "Invalid profit amount." });
    } 
    const newYTDTotal = previousYTD + newMonthlyProfit;

    // Save profit record
    const profit = new Profit({
      propertyId,
      organizationId: req.user.organizationId,
      monthlyProfit: newMonthlyProfit,
      ytdProfit: newYTDTotal,
      pdfUrl: uploadResult.Location,
      uploadedAt: new Date()
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

    // Fetch the organization and check that it’s AzRoots
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization || organization.name !== "AzRoots") {
      return res.status(403).json({ error: "Only AzRoots clients can view profit statements." });
    }

    // Ensure propertyId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      console.error("❌ Invalid ObjectId format:", propertyId);
      return res.status(400).json({ error: "Invalid property ID format." });
    }

    // Convert to ObjectId before querying
    const propId = new mongoose.Types.ObjectId(propertyId);

    const property = organization.properties.id(propId);
    if (!property?.clientOwners?.some(
      (ownerId) => ownerId.toString() === req.user.userId.toString()
    )) {
      return res.status(403).json({ error: "You are not assigned to this property." });
    }

    const profit = await Profit.findOne({
      propertyId: propId,
      organizationId: req.user.organizationId,
    });

    if (!profit) {
      console.error("❌ No profit data found for property:", propId);
      return res.status(404).json({ error: "No profit data found for this property." });
    }

    res.json(profit);
  } catch (error) {
    console.error("🔥 Server error fetching profit data:", error);
    res.status(500).json({ error: "Server error fetching profit data" });
  }
});


router.get("/:propertyId/latest", authenticateToken, async (req, res) => {
  try {
    const { propertyId } = req.params;
    
    // 1) Validate and convert
    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({ error: "Invalid property ID format." });
    }
    const propId = new mongoose.Types.ObjectId(propertyId);

    if (!["admin", "client"].includes(req.user.role)) {
      return res.status(403).json({ error: "Profit statement access denied." });
    }
    const organization = await Organization.findById(req.user.organizationId);
    const property = organization?.properties.id(propId);
    if (!property) {
      return res.status(404).json({ error: "Property not found in your organization." });
    }
    if (req.user.role === "client" && !property.clientOwners?.some(
      (ownerId) => ownerId.toString() === req.user.userId.toString()
    )) {
      return res.status(403).json({ error: "You are not assigned to this property." });
    }

    // 2) Query for the tenant-scoped Profit doc
    const latestProfit = await Profit.findOne({
      propertyId: propId,
      organizationId: req.user.organizationId,
    }).sort({ uploadedAt: -1 });

    if (!latestProfit) {
      return res.status(404).json({ error: "No profit statement found for this property." });
    }

    res.json(latestProfit);
  } catch (error) {
    console.error("Error fetching latest profit statement:", error);
    res.status(500).json({ error: "Server error fetching profit statement." });
  }
});

router.get("/:propertyName/history", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can view profit history." });
    }
    const { propertyName } = req.params;
    const decodedName = decodeURIComponent(propertyName).trim().toLowerCase();
    const org = await Organization.findById(req.user.organizationId);
    if (!org) return res.status(404).json({ error: "Organization not found" });
    
    // Find property by name (case-insensitive)
    const property = org.properties.find(p => p.name.trim().toLowerCase() === decodedName);
    if (!property) return res.status(404).json({ error: "Property not found" });
    
    // Now query profit statements by property._id for the last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    const profits = await Profit.find({
      organizationId: req.user.organizationId,
      propertyId: property._id,
      uploadedAt: { $gte: twelveMonthsAgo }
    }).sort({ uploadedAt: -1 });
    
    res.json(profits);
  } catch (error) {
    console.error("Error fetching profit history:", error);
    res.status(500).json({ error: "Server error fetching profit history" });
  }
});


module.exports = router;
