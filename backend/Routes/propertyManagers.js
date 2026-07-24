const express = require("express");
const Organization = require("../models/organization");
const User = require("../models/user");

const router = express.Router();

router.use((req, res, next) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only." });
  next();
});

router.get("/", async (req, res) => {
  const [organization, users] = await Promise.all([
    Organization.findById(req.user.organizationId).lean(),
    User.find({
      organizationId: req.user.organizationId,
      role: { $in: ["user", "property_manager"] },
    }).select("username email role").lean(),
  ]);
  res.json({
    users,
    properties: organization.properties.map((property) => ({
      _id: property._id,
      name: property.name,
      propertyManagers: property.propertyManagers || [],
    })),
  });
});

router.put("/:userId", async (req, res) => {
  const user = await User.findOne({
    _id: req.params.userId,
    organizationId: req.user.organizationId,
  });
  if (!user) return res.status(404).json({ error: "User not found." });
  const organization = await Organization.findById(req.user.organizationId);
  const assignedIds = new Set((req.body.propertyIds || []).map(String));
  organization.properties.forEach((property) => {
    property.propertyManagers = (property.propertyManagers || [])
      .filter((id) => id.toString() !== user._id.toString());
    if (assignedIds.has(property._id.toString())) property.propertyManagers.push(user._id);
  });
  user.role = assignedIds.size ? "property_manager" : "user";
  await Promise.all([organization.save(), user.save()]);
  res.json({ success: true, role: user.role });
});

module.exports = router;
