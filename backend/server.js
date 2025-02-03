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
const multer = require('multer');

// Initialize Express App
const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.JWT_SECRET || "supersecuresecret";

// ✅ Increase size limits for JSON and URL-encoded data
app.use(bodyParser.json({ limit: '50mb' }));  // 50mb limit for JSON payloads
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));  // 50mb limit for URL-encoded data

// ✅ CORS configuration
app.use(cors({
    origin: ["https://cp-check-submissions-dev.onrender.com"], // Explicitly allow frontend
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
}));

// ✅ Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,           // From .env
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,   // From .env
  region: process.env.AWS_REGION,                       // From .env
});

// Create S3 Instance
const s3 = new AWS.S3();

// Use multer for handling multipart/form-data file uploads
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

/**
 * 🔹 Submit Form, Generate PDF, Upload to S3, Send Email, and Return Success Message
 */
app.post('/api/submit-form', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    // Get the form data from the request body
    const data = req.body;
    console.log('Form Data Received:', data);

    // MST Timestamp (for logging and email)
    const dateMST = moment().tz('America/Denver').format('YYYY-MM-DD hh:mm A');

    // Handle photo if available
    let photoUrl = '';
    if (req.file) {
      const photoContent = req.file.buffer;
      const photoFileName = req.file.originalname;
      const uploadResult = await uploadToS3(photoContent, photoFileName, data.selectedProperty);
      photoUrl = uploadResult.Location;
    }

    // Generate PDF from the submitted form data
    const { pdfStream, filePath, fileName } = await generateChecklistPDF(data);
    if (!pdfStream || typeof pdfStream.pipe !== 'function') {
      throw new Error('PDF generation failed - no valid stream received');
    }

    // (Optional) Wait a few seconds to ensure the PDF file is fully written and closed
    await new Promise(resolve => setTimeout(resolve, 200));

    // Read the generated PDF file from disk into a buffer
    const pdfBuffer = fs.readFileSync(filePath);

    // Upload the PDF to AWS S3 using the buffer
    const organizationId = req.user.organizationId;
    const propertyName = data.selectedProperty;
    const uploadResult = await uploadToS3(pdfBuffer, fileName, organizationId, propertyName);

    // Create a new Submission record in your database
    const newSubmission = await Submission.create({
      organizationId: organizationId,
      property: propertyName,
      pdfUrl: uploadResult.Location,
      photoUrl: photoUrl, // Add the photo URL if available
      submittedAt: new Date(),
    });

    // Fetch the email recipients for the selected property from the Organization record
    const org = await Organization.findById(organizationId);
    const property = org.properties.find(p => p.name === propertyName);
    if (!property) {
      return res.status(404).json({ message: 'Property not found.' });
    }
    const recipientEmails = property.emails.length > 0 ? property.emails.join(",") : 'highspeedmitch@gmail.com';

    // Set up Nodemailer to send the email with the PDF attached
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'highspeedmitch@gmail.com',
        pass: process.env.EMAIL_PASS,
      },
    });

    // Compose the email; attach the PDF using the pdfBuffer
    const mailOptions = {
      from: 'highspeedmitch@gmail.com',
      to: recipientEmails,
      subject: `Checklist PDF for ${propertyName} - Submitted on ${dateMST} MST`,
      text: `Hello!\n\nAttached is the checklist PDF for ${propertyName}, submitted on ${dateMST} MST.`,
      attachments: [{ filename: fileName, content: pdfBuffer }],
    };

    // Send the email
    await transporter.sendMail(mailOptions)
      .then(() => console.log(`✅ Email sent to ${recipientEmails}`))
      .catch((err) => console.error('❌ Error sending email:', err));

    // Now that the email has been sent, delete the local PDF file
    fs.unlinkSync(filePath);

    // Respond to the client with a success message (and optionally the S3 URL)
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