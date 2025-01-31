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
 * 🔹 Register a New Organization & Admin User
 */
app.post('/api/register', async (req, res) => {
  try {
    const { organizationName, username, email, password, properties } = req.body;

    // 1) Hash password
    const hashedPassword = bcrypt.hashSync(password, 10);

    // 2) Assign properties with emails from orgPropertyMap if not provided
    let orgProperties = properties || [];

    if ((!orgProperties || orgProperties.length === 0) && orgPropertyMap[organizationName]) {
        orgProperties = orgPropertyMap[organizationName].properties; // Assign properties with emails
    }

    // 3) Create new organization with properties (including emails)
    const newOrg = await Organization.create({
      name: organizationName,
      properties: orgProperties, // Now includes emails per property
    });

    // 4) Create new user
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      organizationId: newOrg._id
    });

    res.status(201).json({ message: "Organization and admin user created!" });
  } catch (error) {
    console.error("❌ Error registering organization:", error);
    res.status(500).json({ message: "Error registering organization." });
  }
});

/**
 * 🔹 User Login (Returns JWT)
 */
app.post('/api/login', async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // ✅ Check if user exists
      const user = await User.findOne({ email }).populate('organizationId');
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials (user not found)" });
      }
  
      // ✅ Ensure password matches
      if (!bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ message: "Invalid credentials (incorrect password)" });
      }
  
      // ✅ Ensure organization exists
      if (!user.organizationId) {
        return res.status(500).json({ message: "Organization not found for user" });
      }
  
      // ✅ Generate JWT
      const token = jwt.sign(
        { email, organizationId: user.organizationId._id },
        SECRET_KEY,
        { expiresIn: '2h' }
      );
  
      res.json({ message: "Login successful", token, organizationId: user.organizationId._id });
  
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
app.post('/api/submit-form', authenticateToken, async (req, res) => {
  try {
    const data = req.body;
    console.log('Form Data Received:', data);
    lastSubmission = data;
    res.status(200).json({ message: 'Checklist submitted successfully! Please click "Download PDF".' });
  } catch (error) {
    console.error('❌ Error processing form submission:', error);
    res.status(500).json({ message: 'An error occurred while processing your submission.' });
  }
});

/**
 * 🔹 Generate PDF & Upload to S3 (Requires Authentication)
 */
app.get('/api/download-pdf', authenticateToken, async (req, res) => {
  try {
    if (!lastSubmission) {
      return res.status(400).json({ message: 'No form submission found. Please submit the form first.' });
    }

    // MST Timestamp
    const dateMST = moment().tz('America/Denver').format('YYYY-MM-DD hh:mm A');

    // Generate PDF
    const { pdfStream, filePath, fileName } = await generateChecklistPDF(lastSubmission);
    if (!pdfStream || typeof pdfStream.pipe !== 'function') {
      throw new Error('PDF generation failed - no valid stream received');
    }

    // Read the generated PDF file
    const pdfBuffer = fs.readFileSync(filePath);

    // Upload PDF to S3
    const organizationId = req.user.organizationId;
    const propertyName = lastSubmission.selectedProperty;
    const uploadResult = await uploadToS3(pdfBuffer, fileName, organizationId, propertyName);
    console.log('✅ PDF uploaded to S3:', uploadResult.Location);

    // Create a Submission record in the database
    const newSubmission = await Submission.create({
      organizationId: organizationId,
      property: propertyName,
      pdfUrl: uploadResult.Location,
      submittedAt: new Date(),
    });

    // Optionally, delete the local PDF file after upload
    fs.unlinkSync(filePath);

    // Send response to frontend
    res.json({ message: 'Checklist submitted and PDF uploaded successfully!', pdfUrl: uploadResult.Location });

    // Fetch email recipients for the selected property
    const org = await Organization.findById(req.user.organizationId);
    const property = org.properties.find(p => p.name === lastSubmission.selectedProperty);

    if (!property) {
      return res.status(404).json({ message: 'Property not found.' });
    }

    const recipientEmails = property.emails.length > 0 ? property.emails.join(",") : 'highspeedmitch@gmail.com';

    // Nodemailer config
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'highspeedmitch@gmail.com',
        pass: process.env.EMAIL_PASS, // Use environment variable for security
      },
    });

    // Compose mail
    const mailOptions = {
      from: 'highspeedmitch@gmail.com',
      to: recipientEmails,
      subject: `Checklist PDF for ${lastSubmission.selectedProperty} - Submitted on ${dateMST} MST`,
      text: `Hello! Attached is the checklist PDF for ${lastSubmission.selectedProperty}, submitted on ${dateMST} MST.`,
      attachments: [{ filename: fileName, path: filePath }],
    };

    // Since the PDF is now uploaded to S3, you might want to attach it via a pre-signed URL or keep emailing from the local file
    // Here, we attach from the local file before it's deleted
    transporter.sendMail(mailOptions)
      .then(() => console.log(`✅ Email sent to ${recipientEmails}`))
      .catch((err) => console.error('❌ Error sending email:', err));

  } catch (error) {
    console.error('❌ PDF generation or upload error:', error);
    res.status(500).json({ message: 'Error generating or uploading PDF' });
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
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: sub.pdfUrl.split('/').slice(-2).join('/'), // Assuming the key is stored as 'organizationId/propertyName/filename.pdf'
        Expires: 60 * 60, // 1 hour
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

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
