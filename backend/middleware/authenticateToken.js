const jwt = require('jsonwebtoken');
const User = require("../models/user");
const PlatformSession = require("../models/platformSession");
const { getJwtSecret } = require("../config/security");

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extract the token from "Bearer <token>"
  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }
  
  let secretKey;
  try {
    secretKey = getJwtSecret();
  } catch (error) {
    console.error("Authentication configuration error:", error.message);
    return res.status(500).json({ message: "Authentication is unavailable." });
  }

  jwt.verify(token, secretKey, async (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }
    try {
      const currentUser = await User.findById(user.userId)
        .select("accountStatus tokenVersion role organizationId platformRole")
        .lean();
      if (!currentUser || currentUser.accountStatus === "inactive") {
        return res.status(403).json({ message: "Account is inactive." });
      }
      if ((user.tokenVersion || 0) !== (currentUser.tokenVersion || 0)) {
        return res.status(403).json({ message: "Session expired. Please sign in again." });
      }
      const isAssumedAccess = Boolean(
        user.assumedOrganization
        && user.platformSessionId
        && currentUser.platformRole === "platform_admin"
      );
      if (isAssumedAccess) {
        const platformSession = await PlatformSession.findOne({
          _id: user.platformSessionId,
          platformAdminId: currentUser._id,
          organizationId: user.organizationId,
          endedAt: null,
          expiresAt: { $gt: new Date() },
        }).select("_id").lean();
        if (!platformSession) {
          return res.status(403).json({ message: "Organization access session expired." });
        }
        if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
          res.on("finish", () => {
            PlatformSession.updateOne(
              { _id: platformSession._id },
              { $push: {
                mutations: {
                  method: req.method,
                  path: req.originalUrl,
                  statusCode: res.statusCode,
                  occurredAt: new Date(),
                },
              } }
            ).catch((auditError) => {
              console.error("Platform mutation audit error:", auditError);
            });
          });
        }
      }
      req.user = {
        ...user,
        role: isAssumedAccess ? "admin" : currentUser.role,
        platformRole: currentUser.platformRole || null,
        organizationId: isAssumedAccess
          ? String(user.organizationId)
          : currentUser.organizationId.toString(),
        assumedOrganization: isAssumedAccess,
      };
      next();
    } catch (error) {
      return res.status(500).json({ message: "Unable to verify account." });
    }
  });
};

module.exports = authenticateToken;
