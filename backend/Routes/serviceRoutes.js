const express = require("express");
const Organization = require("../models/organization");
const PlatformAudit = require("../models/platformAudit");
const { createMapboxPricingClient } = require("../services/mapboxPricing");
const { managedProperties } = require("../services/propertyAccess");
const {
  MAX_ROUTE_PROPERTIES,
  MIN_ROUTE_PROPERTIES,
  findRoute,
  normalizeRegion,
  routePropertyIds,
  routeResult,
  validateRouteDefinition,
} = require("../services/routeScopes");
const { exactOpenRoute, modeledMatrix } = require("../services/routeOptimization");

function routeError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function createServiceRouteHandlers({
  OrganizationModel = Organization,
  PlatformAuditModel = PlatformAudit,
  routingClientResolver = () => createMapboxPricingClient(),
  now = () => new Date(),
} = {}) {
  async function loadOrganization(req) {
    const organization = await OrganizationModel.findById(req.user.organizationId);
    if (!organization) throw routeError("Organization not found.", 404);
    return organization;
  }

  async function audit(req, action, route, metadata = {}) {
    await PlatformAuditModel.create({
      actorUserId: req.user.userId,
      action,
      targetOrganizationId: req.user.organizationId,
      metadata: {
        routeId: route?._id,
        routeName: route?.name,
        ...metadata,
      },
      ipAddress: req.ip || "",
      userAgent: typeof req.get === "function" ? req.get("user-agent") || "" : "",
    });
  }

  async function listRoutes(req, res) {
    try {
      if (!["admin", "property_manager"].includes(req.user.role)) {
        return res.status(403).json({ error: "Management access required." });
      }
      const organization = await loadOrganization(req);
      const includeArchived = req.user.role === "admin" && req.query.includeArchived === "true";
      const visiblePropertyIds = new Set(
        managedProperties(organization, req.user).map((property) => String(property._id))
      );
      const routes = (organization.routes || [])
        .filter((route) => includeArchived || route.status !== "archived")
        .filter((route) => req.user.role === "admin"
          || routePropertyIds(route).every((propertyId) => visiblePropertyIds.has(propertyId)))
        .map((route) => routeResult(organization, route));
      const regions = [...new Set((organization.properties || [])
        .map((property) => normalizeRegion(property.region))
        .filter(Boolean))].sort((first, second) => first.localeCompare(second));
      return res.json({
        routes,
        regions,
        maxPropertiesPerRoute: MAX_ROUTE_PROPERTIES,
      });
    } catch (error) {
      console.error("Route list error:", error);
      return res.status(error.status || 500).json({
        error: error.status ? error.message : "Unable to load routes.",
      });
    }
  }

  async function createRoute(req, res) {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Only organization administrators can create routes." });
      }
      const organization = await loadOrganization(req);
      const definition = validateRouteDefinition(organization, req.body);
      organization.routes.push({
        name: definition.name,
        region: definition.region,
        propertyIds: definition.propertyIds,
        assignedUserIds: [],
        status: "active",
        version: 1,
        createdBy: req.user.userId,
        updatedBy: req.user.userId,
      });
      await organization.save();
      const route = organization.routes[organization.routes.length - 1];
      await audit(req, "organization_route_created", route, {
        region: route.region,
        propertyIds: routePropertyIds(route),
      });
      return res.status(201).json({
        message: "Route created.",
        route: routeResult(organization, route),
      });
    } catch (error) {
      const validation = /route|region|property/i.test(error.message || "");
      console.error("Route creation error:", error);
      return res.status(error.status || (validation ? 400 : 500)).json({
        error: error.status || validation ? error.message : "Unable to create the route.",
      });
    }
  }

  async function suggestRouteOrder(req, res) {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Only organization administrators can optimize routes." });
      }
      const organization = await loadOrganization(req);
      const propertyIds = [...new Set((Array.isArray(req.body.propertyIds) ? req.body.propertyIds : [])
        .map(String).filter(Boolean))];
      if (propertyIds.length < MIN_ROUTE_PROPERTIES || propertyIds.length > MAX_ROUTE_PROPERTIES) {
        throw routeError(
          `Select between ${MIN_ROUTE_PROPERTIES} and ${MAX_ROUTE_PROPERTIES} properties to suggest an order.`
        );
      }
      const points = propertyIds.map((propertyId) => {
        const property = (organization.properties || []).find(
          (candidate) => String(candidate._id) === propertyId
        );
        if (!property) throw routeError("One or more properties are outside this organization.");
        const lat = Number(property.lat);
        const lng = Number(property.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw routeError(`${property.name} needs valid coordinates before its route order can be suggested.`);
        }
        return { id: propertyId, name: property.name, lat, lng };
      });

      let matrix;
      let method = "road_matrix";
      try {
        matrix = await routingClientResolver().getDrivingMatrix(points);
      } catch (routingError) {
        console.warn("Road route suggestion unavailable; using modeled coordinates:", routingError.message);
        matrix = modeledMatrix(points);
        method = "modeled_coordinates";
      }
      const suggestion = exactOpenRoute(points, matrix);
      return res.json({
        ...suggestion,
        method,
        provider: matrix.provider,
        message: method === "road_matrix"
          ? "Suggested from current driving-time estimates. You can still adjust the order."
          : "Suggested from approximate coordinates because live road routing was unavailable. Review before saving.",
      });
    } catch (error) {
      console.error("Route ordering suggestion error:", error);
      return res.status(error.status || 500).json({
        error: error.status ? error.message : "Unable to suggest a route order.",
      });
    }
  }

  async function updateRoute(req, res) {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Only organization administrators can update routes." });
      }
      const organization = await loadOrganization(req);
      const route = findRoute(organization, req.params.routeId, { includeArchived: true });
      if (!route) throw routeError("Route not found.", 404);
      if (route.status === "archived") throw routeError("Restore this route before editing it.", 409);
      const definition = validateRouteDefinition(organization, req.body, { routeId: route._id });
      const previous = {
        name: route.name,
        region: route.region,
        propertyIds: routePropertyIds(route),
        version: route.version || 1,
      };
      route.name = definition.name;
      route.region = definition.region;
      route.propertyIds = definition.propertyIds;
      route.version = (route.version || 1) + 1;
      route.updatedBy = req.user.userId;
      await organization.save();
      await audit(req, "organization_route_updated", route, {
        previous,
        next: {
          name: route.name,
          region: route.region,
          propertyIds: routePropertyIds(route),
          version: route.version,
        },
        futureScopeChanged: true,
      });
      return res.json({
        message: "Route updated. Future user and resource eligibility now reflects its current stops.",
        route: routeResult(organization, route),
      });
    } catch (error) {
      const validation = /route|region|property/i.test(error.message || "");
      console.error("Route update error:", error);
      return res.status(error.status || (validation ? 400 : 500)).json({
        error: error.status || validation ? error.message : "Unable to update the route.",
      });
    }
  }

  async function changeRouteStatus(req, res) {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Only organization administrators can change route status." });
      }
      const status = String(req.body.status || "");
      if (!["active", "archived"].includes(status)) throw routeError("Select a valid route status.");
      const organization = await loadOrganization(req);
      const route = findRoute(organization, req.params.routeId, { includeArchived: true });
      if (!route) throw routeError("Route not found.", 404);
      if (status === "active") {
        validateRouteDefinition(organization, {
          name: route.name,
          region: route.region,
          propertyIds: route.propertyIds,
        }, { routeId: route._id });
      }
      route.status = status;
      route.archivedAt = status === "archived" ? now() : null;
      route.updatedBy = req.user.userId;
      route.version = (route.version || 1) + 1;
      await organization.save();
      await audit(req, status === "archived"
        ? "organization_route_archived"
        : "organization_route_restored", route, {
        futureScopeChanged: true,
        assignedUserIds: (route.assignedUserIds || []).map(String),
      });
      return res.json({
        message: status === "archived"
          ? "Route archived. Existing assignments are unchanged."
          : "Route restored.",
        route: routeResult(organization, route),
      });
    } catch (error) {
      console.error("Route status error:", error);
      return res.status(error.status || 500).json({
        error: error.status ? error.message : "Unable to update route status.",
      });
    }
  }

  return { listRoutes, createRoute, suggestRouteOrder, updateRoute, changeRouteStatus };
}

function createServiceRouteRouter(dependencies) {
  const router = express.Router();
  const handlers = createServiceRouteHandlers(dependencies);
  router.get("/", handlers.listRoutes);
  router.post("/", handlers.createRoute);
  router.post("/suggest-order", handlers.suggestRouteOrder);
  router.put("/:routeId", handlers.updateRoute);
  router.put("/:routeId/status", handlers.changeRouteStatus);
  return router;
}

module.exports = createServiceRouteRouter();
module.exports.createServiceRouteHandlers = createServiceRouteHandlers;
module.exports.createServiceRouteRouter = createServiceRouteRouter;
