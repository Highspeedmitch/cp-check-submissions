const express = require("express");
const InspectionTemplate = require("../models/inspectionTemplate");
const {
  ensureOrganizationInspectionTemplate,
  resolvePropertyInspectionTemplate,
  normalizePropertyOverride,
  validateFields,
} = require("../services/inspectionTemplates");

const router = express.Router();

function sendError(res, error) {
  const status = error.status || (/not found/i.test(error.message) ? 404 : 400);
  return res.status(status).json({ error: error.message || "Unable to process inspection template." });
}

router.get("/organization", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only organization administrators can manage the organization template." });
    }
    const { template } = await ensureOrganizationInspectionTemplate(req.user.organizationId);
    res.json(template);
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/organization", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only organization administrators can manage the organization template." });
    }
    const { organization, template } = await ensureOrganizationInspectionTemplate(req.user.organizationId);
    const fields = validateFields(req.body.fields || []);
    const nextVersion = template.version + 1;
    const replacement = await InspectionTemplate.create({
      organizationId: organization._id,
      name: String(req.body.name || template.name).trim(),
      orgType: "COM",
      version: nextVersion,
      active: true,
      title: String(req.body.title || template.title).trim(),
      fields,
    });
    organization.inspectionTemplateId = replacement._id;
    await organization.save();
    template.active = false;
    await template.save();
    res.json(replacement);
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/properties/:propertyName/effective", async (req, res) => {
  try {
    const result = await resolvePropertyInspectionTemplate({
      organizationId: req.user.organizationId,
      propertyName: decodeURIComponent(req.params.propertyName),
      user: req.user,
    });
    res.json({
      property: { _id: result.property._id, name: result.property.name },
      ...result.effectiveTemplate,
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/properties/:propertyId/override", async (req, res) => {
  try {
    if (!["admin", "property_manager"].includes(req.user.role)) {
      return res.status(403).json({ error: "Management access required." });
    }
    const result = await resolvePropertyInspectionTemplate({
      organizationId: req.user.organizationId,
      propertyId: req.params.propertyId,
      user: req.user,
    });
    const normalized = normalizePropertyOverride(result.template, req.body);
    result.property.inspectionTemplateOverride = {
      ...normalized,
      updatedBy: req.user.userId,
      updatedAt: new Date(),
    };
    await result.organization.save();
    const refreshed = await resolvePropertyInspectionTemplate({
      organizationId: req.user.organizationId,
      propertyId: req.params.propertyId,
      user: req.user,
    });
    res.json({
      property: { _id: refreshed.property._id, name: refreshed.property.name },
      ...refreshed.effectiveTemplate,
    });
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
