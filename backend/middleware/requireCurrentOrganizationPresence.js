function requireCurrentOrganizationPresence(req, res, next) {
  if (req.user?.organizationArchivedAt) {
    return res.status(403).json({
      error: "This organization user has been archived.",
    });
  }
  return next();
}

module.exports = requireCurrentOrganizationPresence;
