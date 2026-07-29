function requirePlatformAdmin(req, res, next) {
  if (req.user?.platformRole !== "platform_admin" || req.user?.assumedOrganization) {
    return res.status(403).json({ error: "Platform administrator access required." });
  }
  next();
}

module.exports = requirePlatformAdmin;
