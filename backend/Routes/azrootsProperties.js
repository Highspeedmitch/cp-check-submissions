const express = require("express");
const router = express.Router();
const multer = require("multer");
const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");

const authenticateToken = require("../middleware/authenticateToken");
const Organization = require("../models/organization"); // adjust the path as needed

// 1) Configure Multer storage (memory)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 2) Configure AWS S3
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

// 3) Helper for uploading one file to S3
async function uploadFileToS3(file, orgId) {
  const fileKey = `azroots/${orgId}/${uuidv4()}-${file.originalname}`;
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
  const uploadResult = await s3.upload(params).promise();
  return uploadResult.Location; // the S3 URL
}

/**
 * GET /api/azroots/properties/:propertyId
 * ---------------------------------------
 * Fetch extended property data (access & maintenance arrays)
 */
router.get("/:propertyName", authenticateToken, async (req, res) => {
  try {
    // 1) Find the organization by user’s org ID
    const org = await Organization.findById(req.user.organizationId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // 2) Check that the org is AzRoots
    if (org.name !== "AzRoots") {
      return res.status(403).json({ error: "Forbidden: AzRoots only" });
    }

    // 3) Find the property subdoc
    const decodedName = decodeURIComponent(req.params.propertyName);
    const property = org.properties.find((p) => p.name === decodedName);
    if (!property) {
      return res.status(404).json({ error: "Property not found in AzRoots" });
    }

    // 4) Return the advanced data so all AzRoots members can see
    return res.json({
      name: property.name,
      accessCategories: property.accessCategories || [],
      maintenanceCategories: property.maintenanceCategories || [],
    });
  } catch (error) {
    console.error("❌ Error fetching AzRoots property:", error);
    res.status(500).json({ error: "Server error fetching property." });
  }
});

/**
 * PUT /api/azroots/properties/:propertyId
 * ---------------------------------------
 * Update property with advanced fields:
 * - Access categories
 * - Maintenance categories
 * - Photos for each sub-item
 */
router.put("/:propertyName", authenticateToken, upload.any(), async (req, res) => {
  try {
    // 1) Check user is an AzRoots admin
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden: Admin only" });
    }

    const org = await Organization.findById(req.user.organizationId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // 2) Find the subdocument property by ID
    const decodedName = decodeURIComponent(req.params.propertyName);
    const property = org.properties.find(p => p.name === decodedName);
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    // 3) Parse JSON strings from FormData 
    // (the front end would have appended these as text fields)
    const accessTextData = req.body.accessTextData
      ? JSON.parse(req.body.accessTextData)
      : [];
    const maintenanceTextData = req.body.maintenanceTextData
      ? JSON.parse(req.body.maintenanceTextData)
      : [];

    // (Optional) Clear existing data or merge with existing?
    property.accessCategories = accessTextData.map((cat) => ({
      name: cat.name,
      checked: cat.checked,
      quantity: cat.quantity,
      details: cat.details || [], // array of key codes
      photoUrls: cat.photoUrls || [] // we'll fill this below
    }));

    property.maintenanceCategories = maintenanceTextData.map((cat) => ({
      name: cat.name,
      checked: cat.checked,
      quantity: cat.quantity,
      items: cat.items || [] // each item might have notes/ photos
    }));

    // 4) Now handle file uploads from `req.files`. 
    // Each file has a .fieldname that might look like "accessPhotos-catIndex-subIndex-fileIndex"
    // or "maintenancePhotos-catIndex-subIndex-fileIndex"
    for (let file of req.files) {
      const location = await uploadFileToS3(file, req.user.organizationId);
      const field = file.fieldname; 
      // e.g. "accessPhotos-0-1-0" => means catIndex=0, subIndex=1, fileIndex=0

      // parse field
      let [prefix, catIndex, subIndex, fileIndex] = field.split("-");
      catIndex = parseInt(catIndex, 10);
      subIndex = parseInt(subIndex, 10);

      // figure out if it's Access or Maintenance
      if (prefix === "accessPhotos") {
        // attach location to property.accessCategories[catIndex].photoUrls[subIndex] 
        if (!property.accessCategories[catIndex]) continue;
        if (!property.accessCategories[catIndex].photoUrls) {
          property.accessCategories[catIndex].photoUrls = [];
        }
        // we might store an array of arrays, or a single array. Example:
        if (!property.accessCategories[catIndex].photoUrls[subIndex]) {
          property.accessCategories[catIndex].photoUrls[subIndex] = [];
        }
        property.accessCategories[catIndex].photoUrls[subIndex].push(location);
      } else if (prefix === "maintenancePhotos") {
        // attach location to property.maintenanceCategories[catIndex].items[subIndex].photos
        if (!property.maintenanceCategories[catIndex]) continue;
        if (!property.maintenanceCategories[catIndex].items[subIndex]) continue;

        if (!property.maintenanceCategories[catIndex].items[subIndex].photos) {
          property.maintenanceCategories[catIndex].items[subIndex].photos = [];
        }
        property.maintenanceCategories[catIndex].items[subIndex].photos.push(location);
      }
    }

    // 5) Save changes to DB
    await org.save();

    res.json({ success: true, message: "Property updated with advanced info" });
  } catch (error) {
    console.error("❌ Error updating AzRoots property:", error);
    res.status(500).json({ error: "Server error updating property." });
  }
});

module.exports = router;
