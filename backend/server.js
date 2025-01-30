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

// ✅ Import your models
const Organization = require('./models/organization');
const User = require('./models/user');

// ✅ Import your orgPropertyMap
const orgPropertyMap = require('./models/orgPropertyMap');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.JWT_SECRET || "supersecuresecret";

// ✅ CORS configuration
app.use(cors({
    origin: '*', // Allows all domains (or use an array of approved domains)
    credentials: true
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
 * 🔹 Register a New Organization & Admin User
 */
app.post('/register', async (req, res) => {
  try {
    const { organizationName, username, email, password, properties, emails } = req.body;

    // 1) Hash password
    const hashedPassword = bcrypt.hashSync(password, 10);

    // 2) Decide which property array to use
    let orgProperties = properties || [];

    // 3) If orgProperties is empty AND orgPropertyMap has an entry, auto-assign
    if ((!orgProperties || orgProperties.length === 0) && orgPropertyMap[organizationName]) {
        orgProperties = orgPropertyMap[organizationName].properties; // ✅ Now assigning correctly
      }      

    // 4) Create new organization
    const newOrg = await Organization.create({
      name: organizationName,
      properties: orgProperties,
      emails
    });

    // 5) Create new user
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
app.post('api/login', async (req, res) => {
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
app.get('/properties', authenticateToken, async (req, res) => {
  try {
    const org = await Organization.findById(req.user.organizationId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }
    res.json(org.properties);
  } catch (error) {
    console.error("❌ Error fetching properties:", error);
    res.status(500).json({ error: "Server error retrieving properties" });
  }
});

/**
 * 🔹 Submit Form (Requires Authentication)
 */
let lastSubmission = null;
app.post('/submit-form', authenticateToken, async (req, res) => {
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
 * 🔹 Generate PDF & Email (Requires Authentication)
 */
app.get('/download-pdf', authenticateToken, async (req, res) => {
  try {
    if (!lastSubmission) {
      return res.status(400).json({ message: 'No form submission found. Please submit the form first.' });
    }

    // MST Timestamp
    const dateMST = moment().tz('America/Denver').format('YYYY-MM-DD hh:mm A');

    // Ensure PDF storage directory
    const pdfStorageDir = path.join(__dirname, 'pdfstore');
    if (!fs.existsSync(pdfStorageDir)) {
      fs.mkdirSync(pdfStorageDir, { recursive: true });
    }

    // Generate PDF
    const { pdfStream, filePath, fileName } = await generateChecklistPDF(lastSubmission, dateMST);
    if (!pdfStream || typeof pdfStream.pipe !== 'function') {
      throw new Error('PDF generation failed - no valid stream received');
    }

    // Pipe PDF to response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    pdfStream.pipe(res);

    // Fetch email recipients from org
    const org = await Organization.findById(req.user.organizationId);
    const recipientEmails = org ? org.emails.join(",") : 'highspeedmitch@gmail.com';

    // Nodemailer config
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'highspeedmitch@gmail.com',
        pass: process.env.EMAIL_PASS
      },
    });

    // Compose mail
    const mailOptions = {
      from: 'highspeedmitch@gmail.com',
      to: recipientEmails,
      subject: `Checklist PDF for ${lastSubmission.selectedProperty} - Submitted on ${dateMST} MST`,
      text: `Hello! Attached is the checklist PDF for ${lastSubmission.selectedProperty}, submitted on ${dateMST} MST.`,
      attachments: [{ filename: fileName, path: filePath }]
    };

    // Send email
    transporter.sendMail(mailOptions)
      .then(() => console.log(`✅ Email sent to ${recipientEmails}`))
      .catch((err) => console.error('❌ Error sending email:', err));

  } catch (error) {
    console.error('❌ PDF generation error:', error);
    res.status(500).json({ message: 'Error generating PDF' });
  }
});

/**
 * 🔹 List Recent Submissions (Last 30 Days)
 */
app.get('/recent-submissions', authenticateToken, async (req, res) => {
  try {
    const files = fs
      .readdirSync(path.join(__dirname, 'pdfstore'))
      .filter((file) => {
        const filePath = path.join(__dirname, 'pdfstore', file);
        const stats = fs.statSync(filePath);
        const fileDate = moment(stats.mtime);
        return fileDate.isAfter(moment().subtract(30, 'days'));
      });

    res.json(files);
  } catch (error) {
    console.error("❌ Error fetching recent submissions:", error);
    res.status(500).json({ message: "Failed to retrieve submissions." });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
