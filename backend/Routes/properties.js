const express = require("express");
const router = express.Router();
const Organization = require("../models/organization");
const User = require("../models/user");
const Submission = require("../models/submission");
const Assignment = require("../models/assignment");
const RouteRun = require("../models/routeRun");
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
const {
  activeRoutes,
  effectivePropertyManagerIds,
  normalizeRegion,
  routePropertyIds,
} = require("../services/routeScopes");
const requireCurrentOrganizationPresence = require("../middleware/requireCurrentOrganizationPresence");

async function propertyManagerEmailMap(organization, properties) {
  const managerIds = [...new Set(properties.flatMap((property) =>
    effectivePropertyManagerIds(organization, property)
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

function automaticRecipientEmails(organization, property, managerEmails) {
  return [...new Set(effectivePropertyManagerIds(organization, property)
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
      const automaticEmails = automaticRecipientEmails(organization, property, managerEmails);
      return {
        _id: property._id,
        name: property.name,
        lat: property.lat,
        lng: property.lng,
        region: normalizeRegion(property.region),
        physicalAddress: property.physicalAddress,
        grossSquareFeet: property.grossSquareFeet ?? null,
        propertyType: property.propertyType || null,
        emails: withoutAutomaticPropertyEmails(property.emails, automaticEmails),
        propertyManagers: property.propertyManagers || [],
        ...(["admin", "property_manager"].includes(req.user.role) && {
          defaultInspectionAmountCents: property.defaultInspectionAmountCents ?? null,
          autoSubmitCustomerContractorInvoices: Boolean(property.autoSubmitCustomerContractorInvoices),
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
      normalizeRegion(property.region).toLowerCase() === normalizeRegion(region).toLowerCase()
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

    const normalizedRegion = normalizeRegion(region);
    const containingRoute = activeRoutes(organization).find((route) =>
      routePropertyIds(route).includes(String(property._id))
    );
    if (containingRoute
      && normalizeRegion(property.region).toLowerCase() !== normalizedRegion.toLowerCase()) {
      return res.status(409).json({
        error: `Remove this property from ${containingRoute.name} before changing its region.`,
      });
    }
    property.region = normalizedRegion;
    await organization.save();

    res.json({ message: "Property region updated successfully!", property });
  } catch (error) {
    console.error("Error updating property region:", error);
    const status = error.status || 500;
    res.status(status).json({
      error: status === 500 ? "Server error updating property region." : error.message,
    });
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
    const automaticEmails = automaticRecipientEmails(organization, property, managerEmails);
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
    if (!canAccessProperty(property, req.user, organization)) {
      return res.status(403).json({ error: "You do not manage this property." });
    }
    res.json({
      _id: property._id,
      name: property.name,
      propertyCode: property.propertyCode,
      physicalAddress: property.physicalAddress,
      grossSquareFeet: property.grossSquareFeet ?? null,
      propertyType: property.propertyType || null,
      lat: property.lat,
      lng: property.lng,
      region: normalizeRegion(property.region),
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
    if (!canAccessProperty(property, req.user, organization)) {
      return res.status(403).json({ error: "You do not manage this property." });
    }

    const details = normalizePropertyDetails({
      ...req.body,
      region: req.body.region ?? property.region,
      grossSquareFeet: req.body.grossSquareFeet ?? property.grossSquareFeet,
      propertyType: req.body.propertyType ?? property.propertyType,
    }, organization.orgType, organization);
    if (req.user.role !== "admin"
      && normalizeRegion(property.region).toLowerCase() !== details.region.toLowerCase()) {
      return res.status(403).json({ error: "Only organization administrators can change property regions." });
    }
    const containingRoute = activeRoutes(organization).find((route) =>
      routePropertyIds(route).includes(String(property._id))
    );
    if (containingRoute
      && normalizeRegion(property.region).toLowerCase() !== details.region.toLowerCase()) {
      return res.status(409).json({
        error: `Remove this property from ${containingRoute.name} before changing its region.`,
      });
    }
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
    property.grossSquareFeet = details.grossSquareFeet;
    property.propertyType = details.propertyType;
    property.lat = details.lat;
    property.lng = details.lng;
    property.region = details.region;
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
        RouteRun.updateMany(
          { organizationId: organization._id, "stops.propertyId": property._id },
          { $set: { "stops.$[stop].propertyName": details.name } },
          { arrayFilters: [{ "stop.propertyId": property._id }] }
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
        grossSquareFeet: property.grossSquareFeet ?? null,
        propertyType: property.propertyType || null,
        lat: property.lat,
        lng: property.lng,
        region: normalizeRegion(property.region),
      },
    });
  } catch (error) {
    const validationError = /required|valid|characters/i.test(error.message || "");
    const status = error.status || (validationError ? 400 : 500);
    res.status(status).json({
      error: status === 500 ? "Unable to update property details." : error.message,
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
        ...new Set(managedProperties(org, req.user).map((p) => normalizeRegion(p.region)).filter(Boolean))
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

