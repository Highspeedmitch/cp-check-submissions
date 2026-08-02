const express = require("express");
const Assignment = require("../models/assignment");
const Organization = require("../models/organization");
const ResourceProfile = require("../models/resourceProfile");
const ContractorEarning = require("../models/contractorEarning");

const router = express.Router();

router.use((req, res, next) => {
  if (req.user.accountScope !== "afterlight_resource") {
    return res.status(403).json({ error: "Afterlight resource access required." });
  }
  next();
});

router.get("/dashboard", async (req, res) => {
  try {
    const profile = await ResourceProfile.findOne({ userId: req.user.userId }).lean();
    if (!profile) return res.status(404).json({ error: "Resource profile not found." });
    const [assignments, earnings] = await Promise.all([
      Assignment.find({
        userId: req.user.userId,
        resourceProfileId: profile._id,
        status: { $in: ["scheduled", "completed"] },
      }).sort({ startDate: 1 }).lean(),
      profile.resourceType === "contractor"
        ? ContractorEarning.find({ resourceProfileId: profile._id })
          .populate("organizationId", "name")
          .sort({ earnedAt: -1 }).limit(100).lean()
        : Promise.resolve([]),
    ]);
    const organizationIds = [...new Set(assignments.map((assignment) => String(assignment.organizationId)))];
    const organizations = await Organization.find({ _id: { $in: organizationIds } })
      .select("name orgType properties._id properties.name properties.lat properties.lng properties.physicalAddress")
      .lean();
    const organizationsById = new Map(organizations.map((organization) => [String(organization._id), organization]));
    const work = assignments.map((assignment) => {
      const organization = organizationsById.get(String(assignment.organizationId));
      const property = organization?.properties?.find((item) => item.name === assignment.propertyName);
      return {
        ...assignment,
        organizationName: organization?.name || "Organization",
        orgType: organization?.orgType || "",
        property: property ? {
          _id: property._id,
          name: property.name,
          lat: property.lat,
          lng: property.lng,
          physicalAddress: property.physicalAddress,
        } : null,
      };
    });
    return res.json({ profile, assignments: work, earnings });
  } catch (error) {
    console.error("Resource workspace error:", error.message);
    return res.status(500).json({ error: "Unable to load your Afterlight work." });
  }
});

module.exports = router;
