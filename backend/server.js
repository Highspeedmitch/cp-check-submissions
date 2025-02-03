// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { generateChecklistPDF } = require('./pdfservice');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const moment = require('moment-timezone');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto'); // For password reset if needed
const rateLimit = require('express-rate-limit'); // For security

// ✅ Import your models
const Organization = require('./models/organization');
const User = require('./models/user');
const Submission = require('./models/submission'); // New Model for Submissions

// ✅ Import your orgPropertyMap
const orgPropertyMap = require('./models/orgPropertyMap');

// AWS S3 and UUID Integration
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const bodyParser = require('body-parser');

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,           // From .env
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,   // From .env
  region: process.env.AWS_REGION,                       // From .env
});

// Create S3 Instance
const s3 = new AWS.S3();

// Example: Upload a File to S3
const uploadToS3 = (fileContent, fileName, organizationId, propertyName) => {
  const uniqueFileName = `${uuidv4()}-${fileName}`;
  const key = `${organizationId}/${propertyName}/${uniqueFileName}`; // Organized by Organization and Property

  const params = {
    Bucket: process.env.S3_BUCKET_NAME, // From .env
    Key: key,                            // Organized key
    Body: fileContent,
    ContentType: 'application/pdf',      // Adjust based on file type
    ACL: 'private',                     // Ensure the file is not publicly accessible
  };

  return s3.upload(params).promise();
};

// Initialize Express App
const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.JWT_SECRET || "supersecuresecret";

// Increase size limits for JSON and URL-encoded data
app.use(bodyParser.json({ limit: '50mb' }));  // 50mb limit for JSON payloads
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));  // 50mb limit for URL-encoded data

// ✅ CORS configuration
app.use(cors({
    origin: ["https://cp-check-submissions-dev.onrender.com"], // Explicitly allow frontend
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
}));

app.use(express.json());

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

/**
 * 🔹 JWT Auth Middleware
 */
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "Access denied. No token provided." });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
};

/**
 * 🔹 Rate Limiting Middleware (Optional but Recommended)
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes."
});

app.use(limiter);

/**
 * 🔹 Register a New Organization & Admin User & Check admin passkey
 */
app.post('/api/register', async (req, res) => {
  try {
    const { organizationName, username, email, password, properties, adminPasskey } = req.body;

    // Hash the password
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Look for an existing organization by its name (ticker)
    const org = await Organization.findOne({ name: organizationName });
    if (!org) {
      return res.status(400).json({
        message: "Organization name not recognized. Please check the spelling of your Organization and register again."
      });
    }

    // If the adminPasskey field is present, verify it
    let role = "user";
    if (adminPasskey) {
      if (adminPasskey === process.env.ADMIN_PASSKEY) {
        role = "admin";
      } else {
        return res.status(400).json({
          message: "Invalid admin passkey."
        });
      }
    }

    // Create the new user associated with the found organization
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      organizationId: org._id,
      role: role
    });

    res.status(201).json({ message: "User registered under organization successfully!" });
  } catch (error) {
    console.error("❌ Error registering organization/user:", error);
    res.status(500).json({ message: "Error registering organization/user." });
  }
});


/**
 * 🔹 User Login (Returns JWT)
 */
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists and populate the organization
    const user = await User.findOne({ email }).populate('organizationId');
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials (user not found)" });
    }

    // Ensure password matches
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ message: "Invalid credentials (incorrect password)" });
    }

    // Ensure organization exists
    if (!user.organizationId) {
      return res.status(500).json({ message: "Organization not found for user" });
    }

    // Generate JWT, including the role in the payload
    const token = jwt.sign(
      { email: user.email, organizationId: user.organizationId._id, role: user.role },
      SECRET_KEY,
      { expiresIn: '2h' }
    );

    // Return the token along with organization ID, name, and role
    res.json({ 
      message: "Login successful", 
      token, 
      organizationId: user.organizationId._id,
      orgName: user.organizationId.name,
      role: user.role
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ message: "Server error during login." });
  }
});


/**
 * 🔹 Single /properties Route
 */
app.get('/api/properties', authenticateToken, async (req, res) => {
    try {
      const org = await Organization.findById(req.user.organizationId);
      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }
      // Extract property names as strings
      const propertyNames = org.properties.map(p => p.name);
      
      console.log('Property Names:', propertyNames); // Debugging line
  
      res.json(propertyNames);
    } catch (error) {
      console.error("❌ Error fetching properties:", error);
      res.status(500).json({ error: "Server error retrieving properties" });
    }
  });

/**
 * 🔹 Submit Form (Requires Authentication)
 */
let lastSubmission = null;

// Multer Configuration for Storing Images in Memory
const multer = require('multer');
const storage = multer.memoryStorage(); // Store files in memory before processing
const upload = multer({ storage: storage }); // Initialize Multer

// Update the /submit-form route to accept multiple files
app.post('/api/submit-form', authenticateToken, upload.array('photos', 10), async (req, res) => {
  try {
    const data = req.body;
    
    console.log('Form Data Received:', data); // Debugging Line
    console.log('Selected Property:', data.selectedProperty); // Debugging Line

    // Ensure property name is correctly extracted
    const propertyName = data.selectedProperty || data.property;
    if (!propertyName) {
      return res.status(400).json({ message: "Property name is missing in submission." });
    }

    const organizationId = req.user.organizationId;
    
    // Process photos if available
    let photoBuffers = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        const photoBase64 = file.buffer.toString('base64'); // Convert Buffer to Base64
        photoBuffers.push(photoBase64);
      });
    }

    // Generate PDF with embedded images
    const { pdfStream, filePath, fileName } = await generateChecklistPDF(data, photoBuffers);

    if (!pdfStream || typeof pdfStream.pipe !== 'function') {
      throw new Error('PDF generation failed - no valid stream received');
    }

    // Read the generated PDF file from disk into a buffer
    const pdfBuffer = fs.readFileSync(filePath);

    // **Ensure the correct property name is used for the S3 path**
    const uploadResult = await uploadToS3(pdfBuffer, fileName, organizationId, propertyName);
    console.log('✅ PDF uploaded to S3:', uploadResult.Location);

    // Save submission record in DB
    await Submission.create({
      organizationId: organizationId,
      property: propertyName, // ✅ Ensure this is correct
      pdfUrl: uploadResult.Location,
      submittedAt: new Date(),
    });

    res.json({ message: 'Form successfully submitted!', pdfUrl: uploadResult.Location });

  } catch (error) {
    console.error('❌ Error processing form submission:', error);
    res.status(500).json({ message: 'Error processing form submission' });
  }
});


/**
 * 🔹 List Recent Submissions (Last 30 Days)
 */
app.get('/api/recent-submissions', authenticateToken, async (req, res) => {
  try {
    const submissions = await Submission.find({ organizationId: req.user.organizationId })
      .sort({ submittedAt: -1 });

    res.json(submissions);
  } catch (error) {
    console.error("❌ Error fetching recent submissions:", error);
    res.status(500).json({ message: "Failed to retrieve submissions." });
  }
});

/**
 * 🔹 Admin: View All Submissions (With Pre-Signed URLs)
 */
app.get('/api/submissions', authenticateToken, async (req, res) => {
  try {
    const submissions = await Submission.find({ organizationId: req.user.organizationId })
      .sort({ submittedAt: -1 });

    // Generate pre-signed URLs for secure access
    const signedSubmissions = submissions.map(sub => {
      // Create a URL object from the stored pdfUrl.
      const urlObj = new URL(sub.pdfUrl);
      // Get the pathname without the leading '/' (this is URL-encoded)
      const encodedKey = urlObj.pathname.substring(1);
      // Decode the entire pathname to get the raw key (with literal spaces)
      const rawKey = decodeURIComponent(encodedKey);
      
      console.log("Raw key:", rawKey); // For debugging – should match the key in S3 exactly

      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: rawKey,
        Expires: 60 * 60, // URL valid for 1 hour
      };

      const signedUrl = s3.getSignedUrl('getObject', params);
      return {
        ...sub.toObject(),
        signedPdfUrl: signedUrl,
      };
    });

    res.json(signedSubmissions);
  } catch (error) {
    console.error("❌ Error fetching submissions:", error);
    res.status(500).json({ message: "Failed to retrieve submissions." });
  }
});


/**
 * 🔹 Admin: Get Submissions for a Property (Last 3 Months)
 */
app.get('/api/admin/submissions/:property', authenticateToken, async (req, res) => {
  try {
    const { property } = req.params;

    // Calculate the date 3 months ago
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Find submissions for the current organization, for the given property, within the last 3 months
    const submissions = await Submission.find({
      organizationId: req.user.organizationId,
      property: property,
      submittedAt: { $gte: threeMonthsAgo }
    }).sort({ submittedAt: -1 });

    // For each submission, generate a pre-signed URL
    const signedSubmissions = submissions.map((sub) => {
      const urlObj = new URL(sub.pdfUrl);
      // Get the pathname (removing the leading '/')
      let encodedKey = urlObj.pathname.substring(1);
      // Replace plus signs with spaces (because sometimes S3 URL encodes spaces as '+')
      encodedKey = encodedKey.replace(/\+/g, ' ');
      // Decode the entire key to get the raw key (with literal spaces)
      const rawKey = decodeURIComponent(encodedKey);

      console.log("Extracted key:", rawKey); // Debug: should match what you see in S3

      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: rawKey,
        Expires: 60 * 60, // URL valid for 1 hour
      };

      const signedUrl = s3.getSignedUrl('getObject', params);
      return {
        ...sub.toObject(),
        signedPdfUrl: signedUrl,
      };
    });

    res.json(signedSubmissions);
  } catch (error) {
    console.error("❌ Error fetching admin submissions:", error);
    res.status(500).json({ message: "Failed to retrieve submissions." });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));