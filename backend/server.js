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
const Assignment = require('./models/assignment');
// ✅ Import your models
const Organization = require('./models/organization');
const User = require('./models/user');
const Submission = require('./models/submission'); // New Model for Submissions
const mileageTrackingRoutes = require("./Routes/mileageTracking");
const adminRoutes = require("./Routes/admin");
// ✅ Import your orgPropertyMap
const orgPropertyMap = require('./models/orgPropertyMap');
// AWS S3 and UUID Integration
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const bodyParser = require('body-parser');
//push notifications
const router = express.Router();
const PushToken = require("./models/PushToken"); // Model to store tokens

router.post("/register-push-token", async (req, res) => {
  const { userId, token } = req.body;
  if (!userId || !token) {
    return res.status(400).json({ error: "Missing userId or token" });
  }

  try {
    await PushToken.findOneAndUpdate(
      { userId },
      { token },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error storing push token:", err);
    res.status(500).json({ error: "Failed to store push token" });
  }
});

module.exports = router;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}
// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,           // From .env
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,   // From .env
  region: process.env.AWS_REGION,                       // From .env
});

// Create S3 Instance
const s3 = new AWS.S3();

const webpush = require('web-push');

const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
};

webpush.setVapidDetails(
  'mailto:highspeedmitch@gmail.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);


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


// ✅ Middleware to ensure only admins can access
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Access denied: Admins only!" });
  }
  next();
}

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

// ✅ Admin-only payments route
app.use("/admin", authenticateToken, requireAdmin, require("./Routes/admin"));

// ✅ Middleware & Route Usage
app.use("/api/mileage", authenticateToken, mileageTrackingRoutes);
app.use("/admin", authenticateToken, adminRoutes);


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
    // ✅ Extract the orgType from the found organization
    const orgType = org.orgType;
    if (!orgType) {
      return res.status(500).json({ message: "Organization type not found for this organization." });
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

    res.status(201).json({
      message: "User registered under organization successfully!",
      organizationId: org._id,
      orgName: org.name,
      orgType: orgType, // ✅ Include orgType in response
      role: role
    });
  } catch (error) {
    console.error("❌ Error registering organization/user:", error);
    res.status(500).json({ message: "Error registering organization/user." });
  }
});

app.post('/api/save-subscription', authenticateToken, async (req, res) => {
  const subscription = req.body;
  try {
    // Assuming your User model has a "pushSubscription" field
    await User.findByIdAndUpdate(req.user.userId, { pushSubscription: subscription });
    res.status(201).json({ message: 'Subscription saved.' });
  } catch (err) {
    console.error('Error saving subscription:', err);
    res.status(500).json({ error: 'Error saving subscription.' });
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

    // ✅ Extract the `orgType` from the organization
    const orgType = user.organizationId.orgType;
    if (!orgType) {
      return res.status(500).json({ message: "Organization type not found for this organization." });
    }

    // Generate JWT, including the role, userId, and orgType in the payload
    const token = jwt.sign(
      {
        email: user.email,
        organizationId: user.organizationId._id,
        role: user.role,
        userId: user._id,
        orgType: orgType, // ✅ Inject orgType into JWT payload
      },
      SECRET_KEY,
      { expiresIn: '2h' }
    );

    // ✅ Return the token along with organization details, role, and orgType
    res.json({ 
      message: "Login successful", 
      token, 
      organizationId: user.organizationId._id,
      orgName: user.organizationId.name,
      orgType: orgType, // ✅ Include orgType in response
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

    // ✅ Include `orgType` in each property response
    const properties = org.properties.map((p) => ({
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      emails: p.emails,
      orgType: org.orgType,  // ✅ Now added!
    }));

    console.log("Properties with orgType:", properties);
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
    console.log('✅ Form Data Received:', data);

    const propertyName = data.selectedProperty || data.property;
    if (!propertyName) {
      return res.status(400).json({ message: "Property name is missing in submission." });
    }
   
    const customFields = {};
    Object.keys(req.body).forEach((key) => {
      if (key.startsWith("custom_")) {
        const fieldName = key.replace("custom_", ""); // Remove the prefix
        customFields[fieldName] = req.body[key];
      }
    });

    // (Removed the initial Submission.create that referenced uploadResult.Location)

    const organizationId = req.user.organizationId;
    const org = await Organization.findById(organizationId);
    if (!org) {
      return res.status(404).json({ message: "Organization not found." });
    }

    // Extract the organization type (COM, LTR, RES, STR)
    const orgType = org.orgType;
    console.log(`📌 Organization Type: ${orgType}`);

    // Find the property in the organization
    const property = org.properties.find(p => p.name === propertyName);
    if (!property) {
      return res.status(404).json({ message: `Property ${propertyName} not found in organization.` });
    }

    // **Determine recipients based on orgType**
    let recipientEmails = [];
    if (property.emails && property.emails.length > 0) {
      recipientEmails = property.emails;
    } else {
      recipientEmails = ["highspeedmitch@gmail.com"]; // Fallback email
    }

    console.log(`📨 Sending email to: ${recipientEmails.join(", ")}`);

    // **Ensure photos are correctly linked to fields**
    let photoBuffers = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        const extractedFieldName = file.originalname.split('-')[0]; // Extracts the field name
        photoBuffers.push({
          fieldName: extractedFieldName,
          imageBuffer: file.buffer
        });
      });
    }
    console.log("📷 Processed Photo Buffers:", photoBuffers);

    // **Generate PDF**
    let pdfStream, filePath, fileName;
    try {
      const pdfGenerationResult = await generateChecklistPDF(data, photoBuffers);
      pdfStream = pdfGenerationResult.pdfStream;
      filePath = pdfGenerationResult.filePath;
      fileName = pdfGenerationResult.fileName;

      if (!pdfStream || typeof pdfStream.pipe !== 'function') {
        throw new Error('PDF generation failed - no valid stream received');
      }
    } catch (error) {
      console.error('❌ PDF Generation Error:', error);
      return res.status(500).json({ message: 'PDF generation failed' });
    }

    // **Upload PDF to AWS S3**
    let uploadResult;
    let pdfBuffer;  // Declare pdfBuffer in the outer scope for later use
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error('File path is invalid or does not exist');
      }

      pdfBuffer = fs.readFileSync(filePath);
      uploadResult = await uploadToS3(pdfBuffer, fileName, organizationId, propertyName);
      
      if (!uploadResult || !uploadResult.Location) {
        throw new Error('S3 Upload failed');
      }
      
      console.log('✅ PDF uploaded to S3:', uploadResult.Location);
    } catch (error) {
      console.error('❌ PDF Upload Error:', error);
      return res.status(500).json({ message: 'PDF upload failed' });
    }

    // **Save submission record in DB** (now using uploadResult after it is defined)
   // Inside your /api/submit-form route in server.js
// ...
// Ensure your token middleware has already populated req.user

// Save submission record in DB (modified to include userId)
try {
  await Submission.create({
    organizationId: organizationId,           // from req.user.organizationId
    userId: req.user.userId,                  // <-- NEW: add the userId from the token
    property: propertyName,
    pdfUrl: uploadResult.Location,
    submittedAt: new Date(),
    customFields: customFields                // if you are storing custom fields
  });

  console.log('✅ Submission saved in database');
} catch (error) {
  console.error('❌ Database Submission Error:', error);
  return res.status(500).json({ message: 'Error saving submission to database' });
}
    const submissionTimestamp = moment().format("YYYY-MM-DD");
    // **Generate Email Subject Based on orgType**
    let emailSubject = `Checklist Submission for ${propertyName}`;
    let emailBody = `Attached is the checklist PDF for ${propertyName}.`;

    switch (orgType) {
      case "COM":
        emailSubject = `🔹 Commercial Property Submission – ${propertyName} submitted on ${submissionTimestamp}`;
        emailBody = `A new commercial property inspection was submitted for ${propertyName}`;
        break;
      case "LTR":
        emailSubject = `🏠 Long-Term Rental Submission – ${propertyName} submitted on ${submissionTimestamp}`;
        emailBody = `A new long-term rental inspection was submitted for ${propertyName}.`;
        break;
      case "RES":
        emailSubject = `🏡 Residential Property Submission – ${propertyName} submitted on ${submissionTimestamp}`;
        emailBody = `A new residential property inspection was submitted for ${propertyName}.`;
        break;
      case "STR":
        emailSubject = `🏨 Short-Term Rental Submission – ${propertyName} submitted on ${submissionTimestamp}`;
        emailBody = `A new short-term rental inspection was submitted for ${propertyName}.`;
        break;
      default:
        console.warn("⚠️ Unknown organization type, defaulting to generic subject.");
    }

    // **Send Email with PDF Attachment**
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'highspeedmitch@gmail.com',
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: 'highspeedmitch@gmail.com',
      to: recipientEmails.join(","),
      subject: emailSubject,
      text: emailBody,
      attachments: [{ filename: fileName, content: pdfBuffer }],
    };

    await transporter.sendMail(mailOptions)
      .then(() => console.log(`✅ Email sent to ${recipientEmails}`))
      .catch(err => console.error('❌ Error sending email:', err));

    // **Cleanup temporary file**
    fs.unlinkSync(filePath);

    // **Remove assignment if it exists**
    const assignmentToRemove = await Assignment.findOne({
      propertyName: propertyName,
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

    const { propertyName, userId, startDate, endDate, oneTimeCheckRequest } = req.body; // ✅ Destructure oneTimeCheckRequest

    // ✅ Ensure `organizationId` is included
    const organizationId = req.user.organizationId;
    if (!organizationId) {
      console.error("❌ Missing organizationId in request.");
      return res.status(400).json({ error: "Missing organization ID" });
    }

    // ✅ Prevent duplicate assignments for the same property & time frame
    const overlapping = await Assignment.findOne({
      organizationId,
      propertyName,
      $or: [
        { startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } }
      ]
    });

    if (overlapping) {
      return res.status(400).json({ error: "Overlapping assignment exists for this property." });
    }

    // ✅ Create and save assignment
    const assignment = new Assignment({
      organizationId, // ✅ Ensure this is stored in DB
      propertyName,
      userId,
      startDate,
      endDate,
      oneTimeCheckRequest: oneTimeCheckRequest || "", // ✅ Default to empty string if not provided
    });

    await assignment.save();

    console.log("✅ Assignment created successfully:", assignment);

    // ✅ Send push notification
    const admin = require("firebase-admin");

async function sendPushNotification(deviceToken, title, body) {
    const message = {
        notification: { title, body },
        token: deviceToken
    };

    try {
        const response = await admin.messaging().send(message);
        console.log("Successfully sent push notification:", response);
    } catch (error) {
        console.error("Error sending push notification:", error);
    }
}
    res.json({ success: true, message: "Assignment created successfully", assignment });

  } catch (error) {
    console.error("❌ Error creating assignment:", error);
    res.status(500).json({ error: "Server error creating assignment" });
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
    // 1) Ensure only admins can create properties
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    // 2) Validate passkey
    if (req.body.passkey !== process.env.ADD_PROPERTY_PASSKEY) {
      return res.status(403).json({ error: "Invalid passkey" });
    }

    // 3) Fetch organization details
    const orgId = req.user.organizationId;
    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // 4) Extract property details (including accessInstructions and customFields for STR)
    const { name, lat, lng, emails, accessInstructions, customFields } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Property name is required" });
    }

    // 5) Determine if this is an STR organization
    const isSTR = org.orgType === "STR";

     // 6) Create the property
     const newProperty = {
      name,
      lat,
      lng,
      emails: emails || [],
      orgType: org.orgType, // ✅ Ensure orgType is explicitly stored in each property
      ...(isSTR && { 
        accessInstructions: accessInstructions || "No instructions provided.",
        customFields: Array.isArray(customFields) ? customFields : []
      })
    };
    
    
    org.properties.push(newProperty);
    await org.save();
    
    // Find the newly added property by name
    const savedProperty = org.properties.find(p => p.name === name);
    
    return res.json({ 
      success: true, 
      message: "Property added successfully", 
      propertyName: savedProperty ? savedProperty.name : null 
    });    
  } catch (error) {
    console.error("❌ Error adding property:", error);
    return res.status(500).json({ error: "Server error adding property" });
  }
});

app.put("/api/admin/edit-property/:propertyName", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    const orgId = req.user.organizationId;
    const decodedPropertyName = decodeURIComponent(req.params.propertyName);
    console.log("🛠️ Editing Property:", decodedPropertyName);

    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const property = org.properties.find(p => p.name === decodedPropertyName);
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    if (org.orgType !== "STR") {
      return res.status(403).json({ error: "Access Instructions only allowed for STR organizations." });
    }

    property.accessInstructions = req.body.accessInstructions || property.accessInstructions;
    property.customFields = Array.isArray(req.body.customFields) ? req.body.customFields : property.customFields;

    await org.save();

    res.json({ success: true, message: "Property updated successfully" });
  } catch (error) {
    console.error("❌ Error updating property:", error);
    res.status(500).json({ error: "Server error updating property" });
  }
});

app.delete("/api/admin/property/:propertyName", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden - Admin only" });
    }

    const orgId = req.user.organizationId;
    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const decodedPropertyName = decodeURIComponent(req.params.propertyName);
    console.log("🗑️ Deleting Property:", decodedPropertyName);

    const propIndex = org.properties.findIndex(p => p.name === decodedPropertyName);
    if (propIndex === -1) {
      return res.status(404).json({ error: "Property not found" });
    }

    org.properties.splice(propIndex, 1);
    await org.save();

    res.json({ success: true, message: `Property "${decodedPropertyName}" removed.` });
  } catch (error) {
    console.error("❌ Error removing property:", error);
    res.status(500).json({ error: "Server error removing property" });
  }
});
// Get all assignments (optionally, you could filter by organization here)
app.get('/api/assignments', authenticateToken, async (req, res) => {
  try {
    // ✅ Fetch assignments **only for the admin's organization**
    const assignments = await Assignment.find({ organizationId: req.user.organizationId }).sort({ startDate: 1 });

    if (!assignments.length) {
      console.warn("⚠️ No assignments found for organization:", req.user.organizationId);
    }

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
    const deletedAssignment = await Assignment.findOneAndDelete({
      _id: id,
      organizationId: req.user.organizationId // ✅ Ensures only that org's admin can delete
    });

    if (!deletedAssignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    console.log(`✅ Assignment ${id} deleted successfully.`);
    res.json({ success: true, message: "Assignment deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting assignment:", error);
    res.status(500).json({ error: "Server error deleting assignment" });
  }
});
app.put("/api/assignments/:id", authenticateToken, async (req, res) => {
  try {
    const assignment = await Assignment.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user.organizationId },  // ✅ Ensures only that org can edit
      req.body,
      { new: true }
    );
    
    if (!assignment) return res.status(404).json({ success: false, error: "Assignment not found" });

    console.log("✅ Assignment updated:", assignment);
    res.json({ success: true, assignment });

  } catch (err) {
    console.error("❌ Error updating assignment:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/register-push-token", authenticateToken, async (req, res) => {
    try {
        const { userId, token } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        user.pushSubscription = token;
        await user.save();

        res.json({ success: true, message: "Push token stored" });
    } catch (error) {
        console.error("❌ Error storing push token:", error);
        res.status(500).json({ error: "Server error storing push token" });
    }
});

app.get('/api/properties/:propertyName', authenticateToken, async (req, res) => {
  try {
    const org = await Organization.findById(req.user.organizationId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const decodedPropertyName = decodeURIComponent(req.params.propertyName);
    console.log("🔍 Decoded Property Name:", decodedPropertyName); // Debugging log

    const property = org.properties.find(p => p.name === decodedPropertyName);
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    // Merge property details with organization-level data
    const propertyDetails = {
      ...property.toObject(),
      orgType: org.orgType,
      orgName: org.name
    };

    res.json(propertyDetails);
  } catch (error) {
    console.error("❌ Error fetching property details:", error);
    res.status(500).json({ error: "Server error retrieving property details" });
  }
});
// Access Instructions Routes
app.get('/api/access-instructions/:propertyName', authenticateToken, async (req, res) => {
  try {
    // 1) Find the organization
    const org = await Organization.findById(req.user.organizationId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // 2) Find the property
    const decodedPropName = decodeURIComponent(req.params.propertyName);
    const property = org.properties.find(p => p.name === decodedPropName);
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    // 3) If this org is not STR, maybe block or just return instructions anyway
    if (org.orgType !== "STR") {
      return res.status(403).json({ error: "Access instructions only apply to STR organizations." });
    }

    // 4) Return the instructions (or empty string if not set)
    return res.json({ instructions: property.accessInstructions || "" });
  } catch (error) {
    console.error("Error in GET access-instructions:", error);
    return res.status(500).json({ error: "Server error fetching instructions." });
  }
});

app.put('/api/access-instructions/:propertyName', authenticateToken, async (req, res) => {
  try {
    // 1) Ensure only admins can update instructions
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden. Only admins can update instructions." });
    }

    // 2) Find the organization
    const org = await Organization.findById(req.user.organizationId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // 3) Find the property
    const decodedPropName = decodeURIComponent(req.params.propertyName);
    const property = org.properties.find(p => p.name === decodedPropName);
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    // 4) If not STR, maybe block
    if (org.orgType !== "STR") {
      return res.status(403).json({ error: "Only STR orgs can have access instructions." });
    }

    // 5) Update instructions
    property.accessInstructions = req.body.instructions || property.accessInstructions;
    
    // 6) Save
    await org.save();
    return res.json({ message: "Instructions updated successfully!" });
  } catch (error) {
    console.error("Error in PUT access-instructions:", error);
    return res.status(500).json({ error: "Server error saving instructions." });
  }
});


app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));