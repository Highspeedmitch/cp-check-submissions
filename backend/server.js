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
app.set("trust proxy", 1);
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

    // Generate JWT, including the role and userId in the payload
    const token = jwt.sign(
      {
        email: user.email,
        organizationId: user.organizationId._id,
        role: user.role,
        userId: user._id  // Added userId here
      },
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

    // Instead of just returning the name,
    // return the entire property objects (with name, lat, lng, etc.)
    // Example: if your schema has { name, lat, lng, emails: [...], ... }
    // you can map them or just return org.properties directly.
    // Here's a small transform:
    const properties = org.properties.map((p) => ({
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      emails: p.emails,
      // Add anything else you need from p...
    }));

    console.log("Properties:", properties);
    res.json(properties);
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

    console.log('Form Data Received:', data);
    console.log('Selected Property:', data.selectedProperty);

    const propertyName = data.selectedProperty || data.property;
    if (!propertyName) {
      return res.status(400).json({ message: "Property name is missing in submission." });
    }

    const organizationId = req.user.organizationId;

    // **Ensure photos are correctly linked to fields**
    let photoBuffers = [];
    if (req.files && req.files.length > 0) {
       req.files.forEach(file => {
           const extractedFieldName = file.originalname.split('-')[0]; // Extracts the field name
            photoBuffers.push({
               fieldName: extractedFieldName, // Now properly labeled
              imageBuffer: file.buffer
    });
  });
}
    console.log("Processed Photo Buffers:", photoBuffers);

    // Generate PDF
    const { pdfStream, filePath, fileName } = await generateChecklistPDF(data, photoBuffers);

    if (!pdfStream || typeof pdfStream.pipe !== 'function') {
      throw new Error('PDF generation failed - no valid stream received');
    }

    // Read the generated PDF file from disk
    const pdfBuffer = fs.readFileSync(filePath);

    // Upload the PDF to AWS S3
    const uploadResult = await uploadToS3(pdfBuffer, fileName, organizationId, propertyName);
    console.log('✅ PDF uploaded to S3:', uploadResult.Location);

    // Save submission record in DB
    await Submission.create({
      organizationId: organizationId,
      property: propertyName,
      pdfUrl: uploadResult.Location,
      submittedAt: new Date(),
    });

    // Email the PDF
    const org = await Organization.findById(organizationId);
    const property = org.properties.find(p => p.name === propertyName);
    const recipientEmails = property.emails.length > 0 ? property.emails.join(",") : 'highspeedmitch@gmail.com';

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'highspeedmitch@gmail.com',
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: 'highspeedmitch@gmail.com',
      to: recipientEmails,
      subject: `Checklist PDF for ${propertyName}`,
      text: `Attached is the checklist PDF for ${propertyName}.`,
      attachments: [{ filename: fileName, content: pdfBuffer }],
    };

    await transporter.sendMail(mailOptions)
      .then(() => console.log(`✅ Email sent to ${recipientEmails}`))
      .catch(err => console.error('❌ Error sending email:', err));

    fs.unlinkSync(filePath);

// After the PDF is generated, uploaded, emailed, etc.
// Check if an assignment exists for this user and property
// After sending the email and unlinking the file:
      const assignmentToRemove = await Assignment.findOne({
      propertyName: propertyName,  // Use propertyName instead of property
      userId: req.user.userId
      });
      if (assignmentToRemove) {
      await Assignment.findByIdAndDelete(assignmentToRemove._id);
      console.log(`✅ Removed assignment for property ${propertyName}`);
    }

    res.json({ message: 'Form successfully submitted!', pdfUrl: uploadResult.Location });

  } catch (error) {
    console.error('❌ Error processing form submission:', error);
    res.status(500).json({ message: 'Error processing form submission' });
  }

});

// Step 1: Forgot Password Route
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'No account found with that email.' });
        }

        // Generate a reset token (valid for 1 hour)
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour expiration
        await user.save();

        // Email the reset link
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: 'highspeedmitch@gmail.com', pass: process.env.EMAIL_PASS }
        });

        const mailOptions = {
            from: 'highspeedmitch@gmail.com',
            to: user.email,
            subject: 'Password Reset Request',
            text: `Click the link to reset your password: https://cp-check-submissions-dev.onrender.com/reset-password?token=${resetToken}`
        };

        await transporter.sendMail(mailOptions);
        res.json({ message: 'Password reset link sent to your email.' });

    } catch (error) {
        console.error('Error in forgot password:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// Step 2: Reset Password Route
app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  try {
      // Find user with this token
      const user = await User.findOne({ 
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() } });

      if (!user) {
          return res.status(400).json({ message: "Invalid or expired reset link." });
      }

      // Hash the new password
      user.password = bcrypt.hashSync(newPassword, 10);
      user.resetPasswordToken = null; // Clear the token
      user.resetPasswordExpires = null;
      await user.save();

      res.json({ message: "Password reset successful. You can now log in." });
  } catch (error) {
      console.error("❌ Reset Password Error:", error);
      res.status(500).json({ message: "Error processing password reset." });
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
// Create a new assignment (scheduling an inspection)
app.post('/api/assignments', authenticateToken, async (req, res) => {
  try {
    // Ensure only admins can create assignments
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { propertyName, userId, startDate, endDate } = req.body;

    // Check for overlapping assignments on the same property
    const overlapping = await Assignment.findOne({
      propertyName,
      $or: [
        { startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } }
      ]
    });

    if (overlapping) {
      return res.status(400).json({ error: "Overlapping assignment exists for this property." });
    }

    // Create the new assignment
    const assignment = new Assignment({
      propertyName,
      userId,
      startDate,
      endDate
    });

    await assignment.save();

    res.json({ success: true, message: "Assignment created successfully", assignment });
  } catch (error) {
    console.error("❌ Error creating assignment:", error);
    res.status(500).json({ error: "Server error creating assignment" });
  }
});

app.get('/api/assignments', authenticateToken, async (req, res) => {
  try {
    // For example, fetch all assignments for the admin's organization
    // (You might need to adjust this if you store organization info on assignments)
    const assignments = await Assignment.find({ /* possibly filter by orgId */ }).sort({ startDate: 1 });
    res.json(assignments);
  } catch (error) {
    console.error("❌ Error fetching assignments:", error);
    res.status(500).json({ error: "Server error fetching assignments" });
  }
});
// ====== NEW ROUTES FOR PASSKEY AND ADD PROPERTY ======
// Verify passkey route for adding properties
app.post("/api/verify-passkey", (req, res) => {
  try {
    const { passkey } = req.body;
    if (passkey === process.env.ADD_PROPERTY_PASSKEY) {
      return res.json({ valid: true });
    } else {
      return res.json({ valid: false });
    }
  } catch (error) {
    console.error("❌ Error verifying passkey:", error);
    res.status(500).json({ message: "Server error verifying passkey" });
  }
});
// ***** New: Verify removal passkey route *****
app.post("/api/verify-remove-passkey", (req, res) => {
  try {
    // rename this to match the front-end
    const { removePasskey } = req.body;
    if (removePasskey === process.env.REMOVE_PROPERTY_PASSKEY) {
      return res.json({ valid: true });
    } else {
      return res.json({ valid: false });
    }
  } catch (error) {
    console.error("❌ Error verifying removal passkey:", error);
    res.status(500).json({ message: "Server error verifying removal passkey" });
  }
});
// Admin add-property route
app.post("/api/admin/add-property", authenticateToken, async (req, res) => {
  try {
    // 1) Check the user is an admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    // 2) Validate the passkey
    if (req.body.passkey !== process.env.ADD_PROPERTY_PASSKEY) {
      return res.status(403).json({ error: "Invalid passkey" });
    }

    // 3) Get the organization for the admin user
    const orgId = req.user.organizationId;
    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // 4) Extract incoming data
    const { name, lat, lng, emails } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Property name is required" });
    }

    // 5) Add the new property
    org.properties.push({
      name,
      lat,
      lng,
      emails: emails || [],
    });

    // 6) Save
    await org.save();

    return res.json({ success: true, message: "Property added successfully" });
  } catch (error) {
    console.error("❌ Error adding property:", error);
    return res.status(500).json({ error: "Server error adding property" });
  }
});
app.delete("/api/admin/property/:propertyName", authenticateToken, async (req, res) => {
  try {
    // Must be admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden - Admin only" });
    }

    const orgId = req.user.organizationId;
    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const { propertyName } = req.params;

    // Find the index of the property
    const propIndex = org.properties.findIndex((p) => p.name === propertyName);
    if (propIndex === -1) {
      return res.status(404).json({ error: "Property not found" });
    }

    // Remove it
    org.properties.splice(propIndex, 1);

    // Save
    await org.save();

    res.json({ success: true, message: `Property "${propertyName}" removed.` });
  } catch (error) {
    console.error("❌ Error removing property:", error);
    res.status(500).json({ error: "Server error removing property" });
  }
});
const Assignment = require('./models/assignment');
app.post('/api/assignments', authenticateToken, async (req, res) => {
  try {
    // Ensure only admins can create assignments
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { propertyName, userId, startDate, endDate } = req.body;

    // Check for overlapping assignments on the same property
    const overlapping = await Assignment.findOne({
      propertyName,
      $or: [
        { startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } }
      ]
    });

    if (overlapping) {
      return res.status(400).json({ error: "Overlapping assignment exists for this property." });
    }

    // Create the new assignment
    const assignment = new Assignment({
      propertyName,
      userId,
      startDate,
      endDate
    });

    await assignment.save();

    res.json({ success: true, message: "Assignment created successfully", assignment });
  } catch (error) {
    console.error("❌ Error creating assignment:", error);
    res.status(500).json({ error: "Server error creating assignment" });
  }
});

// Get all assignments (optionally, you could filter by organization here)
app.get('/api/assignments', authenticateToken, async (req, res) => {
  try {
    // Fetch assignments—if needed, filter by organization or other criteria.
    const assignments = await Assignment.find({}).sort({ startDate: 1 });
    res.json(assignments);
  } catch (error) {
    console.error("❌ Error fetching assignments:", error);
    res.status(500).json({ error: "Server error fetching assignments" });
  }
});
/**
 * 🔹 Get All Users (Admin Only)
 */
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    // Ensure only admins can fetch users
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden - Admin only" });
    }
    // Fetch only users with role "user"
    const users = await User.find({ organizationId: req.user.organizationId, role: "user" }).select("_id email");
    res.json(users);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ error: "Server error fetching users" });
  }
});
app.delete("/api/assignments/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedAssignment = await Assignment.findByIdAndDelete(id);

    if (!deletedAssignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    res.json({ success: true, message: "Assignment deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting assignment:", error);
    res.status(500).json({ error: "Server error deleting assignment" });
  }
});
app.put("/api/assignments/:id", authenticateToken, async (req, res) => {
  try {
    const assignment = await Assignment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!assignment) return res.status(404).json({ success: false, error: "Assignment not found" });
    res.json({ success: true, assignment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));