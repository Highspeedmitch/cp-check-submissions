const express = require("express");
const router = express.Router();
const Organization = require("../models/organization");
const User = require("../models/user");
const Submission = require("../models/submission");
const Assignment = require("../models/assignment");
const Invoice = require("../models/invoice");
const Notification = require("../models/notification");
const { managedProperties, canAccessProperty } = require("../services/propertyAccess");
const {
  normalizePropertyEmails,
  withoutAutomaticPropertyEmails,
} = require("../services/propertyEmails");
const { normalizePropertyDetails } = require("../services/propertyDetails");
const { propertyDefaultSource } = require("../services/fulfillmentPolicy");
const { assignedResourceContext } = require("../services/resourceAccess");
const requireCurrentOrganizationPresence = require("../middleware/requireCurrentOrganizationPresence");

async function propertyManagerEmailMap(organization, properties) {
  const managerIds = [...new Set(properties.flatMap((property) =>
    (property.propertyManagers || []).map(String)
  ))];
  if (!managerIds.length) return new Map();
  const managers = await User.find({
    _id: { $in: managerIds },
    organizationId: organization._id,
    role: "property_manager",
    accountStatus: { $ne: "inactive" },
    organizationArchivedAt: null,
  }).select("_id email").lean();
  return new Map(managers.map((manager) => [String(manager._id), manager.email]));
}

function automaticRecipientEmails(property, managerEmails) {
  return [...new Set((property.propertyManagers || [])
    .map((id) => managerEmails.get(String(id)))
    .filter(Boolean))];
}

router.get("/", requireCurrentOrganizationPresence, async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }
    const visibleProperties = managedProperties(organization, req.user);
    const managerEmails = req.user.role === "admin"
      ? await propertyManagerEmailMap(organization, visibleProperties)
      : new Map();
    const properties = visibleProperties.map((property) => {
      const automaticEmails = automaticRecipientEmails(property, managerEmails);
      return {
        _id: property._id,
        name: property.name,
        lat: property.lat,
        lng: property.lng,
        emails: withoutAutomaticPropertyEmails(property.emails, automaticEmails),
        propertyManagers: property.propertyManagers || [],
        ...(["admin", "property_manager"].includes(req.user.role) && {
          defaultInspectionAmountCents: property.defaultInspectionAmountCents ?? null,
        }),
        ...(req.user.role === "admin" && {
          automaticRecipientEmails: automaticEmails,
        }),
        orgType: organization.orgType,
        fulfillment: {
          defaultSource: property.fulfillmentPolicy?.defaultSource || null,
          resolvedSource: propertyDefaultSource(organization, property),
        },
      };
    });
    return res.json(properties);
  } catch (error) {
    console.error("Error fetching properties:", error);
    return res.status(500).json({ error: "Server error retrieving properties" });
  }
});

// ✅ Global Search for Properties (Admins Only)
router.get("/search", requireCurrentOrganizationPresence, async (req, res) => {
  try {
    if (!["admin", "property_manager"].includes(req.user.role)) {
      return res.status(403).json({ error: "Management access required." });
    }

    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: "Missing search query" });
    }

    // Fetch properties within the admin's organization that match the query
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found." });
    }

    // Case-insensitive search on properties
    const matchingProperties = managedProperties(organization, req.user).filter(property =>
      property.name.toLowerCase().includes(q.toLowerCase())
    );

    res.json(matchingProperties);
  } catch (error) {
    console.error("Error searching properties:", error);
    res.status(500).json({ error: "Server error searching properties." });
  }
});

// ✅ Get Properties by Region (Admins Only)
router.get("/region/:region", requireCurrentOrganizationPresence, async (req, res) => {
  try {
    const { region } = req.params;

    // Fetch properties within the user's organization
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found." });
    }

    // If the user is not an admin, return an empty array (instead of a 403 error)
    if (!["admin", "property_manager"].includes(req.user.role)) {
      return res.json([]);
    }

    // For admins, filter properties by region (case-insensitive)
    const propertiesByRegion = managedProperties(organization, req.user).filter(property =>
      property.region.toLowerCase() === region.toLowerCase()
    );

    res.json(propertiesByRegion);
  } catch (error) {
    console.error("Error fetching properties by region:", error);
    res.status(500).json({ error: "Server error fetching properties by region." });
  }
});

// ✅ Update Property Region (Admins Only)
router.put("/:propertyId/region", requireCurrentOrganizationPresence, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can update property regions." });
    }

    const { propertyId } = req.params;
    const { region } = req.body;

    // Find the organization
    const organization = await Organization.findOne({
      _id: req.user.organizationId,
      "properties._id": propertyId,
    });
    if (!organization) {
      return res.status(404).json({ error: "Property not found." });
    }

    const property = organization.properties.id(propertyId);
    if (!property) {
      return res.status(404).json({ error: "Property not found within organization." });
    }

    property.region = region;
    await organization.save();

    res.json({ message: "Property region updated successfully!", property });
  } catch (error) {
    console.error("Error updating property region:", error);
    res.status(500).json({ error: "Server error updating property region." });
  }
});

router.put("/:propertyId/emails", requireCurrentOrganizationPresence, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only organization administrators can update inspection recipients." });
    }

    const organization = await Organization.findOne({
      _id: req.user.organizationId,
      "properties._id": req.params.propertyId,
    });
    if (!organization) {
      return res.status(404).json({ error: "Property not found in your organization." });
    }

    const property = organization.properties.id(req.params.propertyId);
    const managerEmails = await propertyManagerEmailMap(organization, [property]);
    const automaticEmails = automaticRecipientEmails(property, managerEmails);
    property.emails = normalizePropertyEmails(req.body.emails, {
      automaticEmails,
    });
    await organization.save();

    res.json({
      message: "Inspection recipients updated.",
      property: {
        _id: property._id,
        name: property.name,
        emails: property.emails,
        automaticRecipientEmails: automaticEmails,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      error: status === 500 ? "Unable to update inspection recipients." : error.message,
    });
  }
});

router.get("/:propertyId/details", requireCurrentOrganizationPresence, async (req, res) => {
  try {
    if (!["admin", "property_manager"].includes(req.user.role)) {
      return res.status(403).json({ error: "Management access required." });
    }
    const organization = await Organization.findById(req.user.organizationId);
    const property = organization?.properties.id(req.params.propertyId);
    if (!property) return res.status(404).json({ error: "Property not found." });
    if (!canAccessProperty(property, req.user)) {
      return res.status(403).json({ error: "You do not manage this property." });
    }
    res.json({
      _id: property._id,
      name: property.name,
      propertyCode: property.propertyCode,
      physicalAddress: property.physicalAddress,
      lat: property.lat,
      lng: property.lng,
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to load property details." });
  }
});

router.put("/:propertyId/details", requireCurrentOrganizationPresence, async (req, res) => {
  try {
    if (!["admin", "property_manager"].includes(req.user.role)) {
      return res.status(403).json({ error: "Management access required." });
    }
    const organization = await Organization.findById(req.user.organizationId);
    const property = organization?.properties.id(req.params.propertyId);
    if (!property) return res.status(404).json({ error: "Property not found." });
    if (!canAccessProperty(property, req.user)) {
      return res.status(403).json({ error: "You do not manage this property." });
    }

    const details = normalizePropertyDetails(req.body, organization.orgType);
    const duplicate = organization.properties.some((candidate) =>
      candidate._id.toString() !== property._id.toString()
      && candidate.name.trim().toLowerCase() === details.name.toLowerCase()
    );
    if (duplicate) {
      return res.status(409).json({ error: "Another property in this organization already uses that name." });
    }

    const previousName = property.name;
    property.name = details.name;
    property.propertyCode = details.propertyCode;
    property.physicalAddress = details.physicalAddress;
    property.lat = details.lat;
    property.lng = details.lng;
    await organization.save();

    const propagation = [];
    if (previousName !== details.name) {
      propagation.push(
        Submission.updateMany(
          { organizationId: organization._id, property: previousName },
          { $set: { property: details.name, "responses.selectedProperty": details.name } }
        ),
        Assignment.updateMany(
          { organizationId: organization._id, propertyName: previousName },
          { $set: { propertyName: details.name } }
        ),
        Notification.updateMany(
          {
            organizationId: organization._id,
            route: `/admin/submissions/${encodeURIComponent(previousName)}`,
          },
          { $set: { route: `/admin/submissions/${encodeURIComponent(details.name)}` } }
        )
      );
    }
    propagation.push(Invoice.updateMany(
      { organizationId: organization._id, propertyId: property._id, status: "unbilled" },
      {
        $set: {
          "propertySnapshot.name": details.name,
          "propertySnapshot.propertyCode": details.propertyCode,
        },
      }
    ));
    await Promise.all(propagation);

    res.json({
      message: "Property details updated.",
      property: {
        _id: property._id,
        name: property.name,
        propertyCode: property.propertyCode,
        physicalAddress: property.physicalAddress,
        lat: property.lat,
        lng: property.lng,
      },
    });
  } catch (error) {
    const validationError = /required|valid|characters/i.test(error.message || "");
    res.status(validationError ? 400 : 500).json({
      error: validationError ? error.message : "Unable to update property details.",
    });
  }
});

// GET /api/properties/regions
router.get(
  "/regions",
  requireCurrentOrganizationPresence,
  async (req, res) => {
    try {
      // 2) check role
      if (!["admin", "property_manager"].includes(req.user.role)) {
        return res
          .status(403)
          .json({ error: "Only admins can view regions." });
      }

      // 3) find the org
      const org = await Organization.findById(req.user.organizationId);
      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }

      // 4) extract unique regions
      const uniqueRegions = [
        ...new Set(managedProperties(org, req.user).map((p) => p.region).filter(Boolean))
      ];

      res.json(uniqueRegions);
    } catch (error) {
      console.error("Error fetching regions:", error);
      res.status(500).json({ error: "Server error fetching regions" });
    }
  }
);

router.get("/:propertyName", async (req, res) => {
  try {
    const propertyName = decodeURIComponent(req.params.propertyName);
    const context = await assignedResourceContext({
      user: req.user,
      assignmentId: req.query.assignmentId,
      propertyName,
    });
    const organization = context?.organization
      || await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }
    const property = context?.property
      || organization.properties.find((item) => item.name === propertyName);
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }
    return res.json({
      ...property.toObject(),
      orgType: organization.orgType,
      orgName: organization.name,
    });
  } catch (error) {
    console.error("Error fetching property details:", error);
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Server error retrieving property details",
    });
  }
});

module.exports = router;

