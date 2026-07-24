const jwt = require('jsonwebtoken');
const User = require("../models/user");
const SECRET_KEY = process.env.JWT_SECRET || "supersecuresecret";

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extract the token from "Bearer <token>"
  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }
  
  jwt.verify(token, SECRET_KEY, async (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }
    try {
      const currentUser = await User.findById(user.userId)
        .select("accountStatus tokenVersion role organizationId")
        .lean();
      if (!currentUser || currentUser.accountStatus === "inactive") {
        return res.status(403).json({ message: "Account is inactive." });
      }
      if ((user.tokenVersion || 0) !== (currentUser.tokenVersion || 0)) {
        return res.status(403).json({ message: "Session expired. Please sign in again." });
      }
      req.user = {
        ...user,
        role: currentUser.role,
        organizationId: currentUser.organizationId.toString(),
      };
      next();
    } catch (error) {
      return res.status(500).json({ message: "Unable to verify account." });
    }
  });
};

module.exports = authenticateToken;
