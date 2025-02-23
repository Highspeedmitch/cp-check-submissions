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
router.post("/:propertyName/upload", authenticateToken, upload.single("profitPdf"), async (req, res) => {
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

    // ✅ Decode propertyName & normalize for comparison
    propertyName = decodeURIComponent(propertyName).trim(); // ✅ Preserve case

    console.log("🔹 Backend received propertyName:", propertyName);
    console.log("🔹 Available properties:", organization.properties.map(p => `"${p.name}"`));

    // ✅ Ensure `properties` exists before searching
    const propertyList = organization.properties || [];

    // ✅ Use case-insensitive matching
    const property = propertyList.find(p => p.name.trim().toLowerCase() === propertyName.toLowerCase());

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
    console.log("🔍 Received propertyId from request:", propertyId);

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
    console.log("✅ Converted to ObjectId:", propId);

    const profit = await Profit.findOne({ propertyId: propId });

    if (!profit) {
      console.error("❌ No profit data found for property:", propId);
      return res.status(404).json({ error: "No profit data found for this property." });
    }

    console.log("✅ Profit data found:", profit);
    res.json(profit);
  } catch (error) {
    console.error("🔥 Server error fetching profit data:", error);
    res.status(500).json({ error: "Server error fetching profit data" });
  }
});

console.log("🔹 Registered API Routes:");
router.stack.forEach(layer => {
  if (layer.route) {
    console.log(layer.route.path);
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

    // 2) Query for the Profit doc
    const latestProfit = await Profit.findOne({ propertyId: propId }).sort({ uploadedAt: -1 });

    if (!latestProfit) {
      return res.status(404).json({ error: "No profit statement found for this property." });
    }

    res.json(latestProfit);
  } catch (error) {
    console.error("Error fetching latest profit statement:", error);
    res.status(500).json({ error: "Server error fetching profit statement." });
  }
});



module.exports = router;
