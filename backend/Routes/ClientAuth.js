// routes/ClientAuth.js
router.post("/register-client", async (req, res) => {
    try {
      const { firstName, lastName, email, adminEmail, password } = req.body;
      // 1) Find the admin by adminEmail
      const adminUser = await User.findOne({ email: adminEmail.trim().toLowerCase(), role: "admin" });
      if (!adminUser) {
        return res.status(400).json({ message: "Invalid admin email." });
      }
  
      // 2) Use the admin’s organization
      const orgId = adminUser.organizationId;
      if (!orgId) {
        return res.status(400).json({ message: "Admin user has no organization." });
      }
  
      // 3) Hash the password
      const hashedPassword = bcrypt.hashSync(password, 10);
  
      // 4) Create a new user with role=client
      const newClient = new User({
        username: `${firstName} ${lastName}`, // or store separately if you prefer
        email,
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
  