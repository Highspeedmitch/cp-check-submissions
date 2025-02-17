// routes/ClientAuth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/user");

router.post("/register-client", async (req, res) => {
  try {
    const { firstName, lastName, email, adminEmail, password } = req.body;
    
    // Normalize the admin email to avoid capitalization issues
    const normalizedAdminEmail = adminEmail.trim().toLowerCase();

    // 1) Find the admin by adminEmail with role "admin"
    const adminUser = await User.findOne({ email: normalizedAdminEmail, role: "admin" });
    if (!adminUser) {
      return res.status(400).json({ message: "Invalid admin email." });
    }

    // 2) Use the admin’s organization
    const orgId = adminUser.organizationId;
    if (!orgId) {
      return res.status(400).json({ message: "Admin user has no organization." });
    }

    // Normalize the client’s email as well
    const normalizedClientEmail = email.trim().toLowerCase();

    // 3) Hash the password
    const hashedPassword = bcrypt.hashSync(password, 10);

    // 4) Create a new user with role=client
    const newClient = new User({
      username: `${firstName} ${lastName}`, // Alternatively, store firstName and lastName separately
      email: normalizedClientEmail,
      password: hashedPassword,
      organizationId: orgId,
      role: "client"
    });

    await newClient.save();
    res.status(201).json({ message: "Client registered successfully." });
  } catch (error) {
    console.error("Error registering client:", error);
    res.status(500).json({ message: "Server error registering client." });
  }
});

module.exports = router;
