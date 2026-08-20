const Assignment = require("../models/assignment");
const Communication = require("../models/Communication");
const ContractorEarning = require("../models/contractorEarning");
const InspectionJob = require("../models/inspectionJob");
const Invoice = require("../models/invoice");
const MonthlyPortfolioSummary = require("../models/monthlyPortfolioSummary");
const Organization = require("../models/organization");
const OrganizationInvitation = require("../models/organizationInvitation");
const PlatformAudit = require("../models/platformAudit");
const Profit = require("../models/profit");
const ResourceDeployment = require("../models/resourceDeployment");
const RouteRun = require("../models/routeRun");
const Submission = require("../models/submission");
const { consumeGrant } = require("./organizationPasskeys");
const { defaultTransactionRunner } = require("./licensedCapacityOperations");
const { activeRoutes, routePropertyIds } = require("./routeScopes");

const DEFAULT_REFERENCE_MODELS = {
  assignments: Assignment,
  communications: Communication,
  contractorEarnings: ContractorEarning,
  inspectionJobs: InspectionJob,
  invoices: Invoice,
  monthlySummaries: MonthlyPortfolioSummary,
  pendingInvitations: OrganizationInvitation,
  profits: Profit,
  resourceDeployments: ResourceDeployment,
  routeRuns: RouteRun,
  submissions: Submission,
};

const REFERENCE_DEFINITIONS = [
  {
    key: "activeRoutes",
    label: "active routes",
    message: "Remove the property from its active route before removing the property.",
  },
  {
    key: "assignments",
    label: "assignments",
    message: "Assignments preserve scheduling and completion history for this property.",
  },
  {
    key: "inspectionJobs",
    label: "inspection jobs",
    message: "Inspection processing records still reference this property.",
  },
  {
    key: "invoices",
    label: "invoices",
    message: "Billing records still reference this property.",
  },
  {
    key: "submissions",
    label: "inspection submissions",
    message: "Completed inspection history still references this property.",
  },
  {
    key: "routeRuns",
    label: "scheduled route runs",
    message: "Scheduled or historical route runs still reference this property.",
  },
  {
    key: "resourceDeployments",
    label: "resource deployments",
    message: "Resource access is still scoped to this property.",
  },
  {
    key: "pendingInvitations",
    label: "pending invitations",
    message: "A pending user invitation still grants access to this property.",
  },
  {
    key: "contractorEarnings",
    label: "contractor earnings",
    message: "Contractor compensation records still reference this property.",
  },
  {
    key: "profits",
    label: "profit statements",
    message: "Uploaded profit records still reference this property.",
  },
  {
    key: "communications",
    label: "client communications",
    message: "Client communication history still references this property.",
  },
  {
    key: "monthlySummaries",
    label: "monthly portfolio summaries",
    message: "Archived portfolio reporting still references this property.",
  },
];

function propertyRemovalError(message, status, code, details = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  Object.assign(error, details);
  return error;
}

function withSession(query, session) {
  if (session && typeof query?.session === "function") return query.session(session);
  return query;
}

function findProperty(organization, propertyIdentifier) {
  const identifier = String(propertyIdentifier || "").trim();
  if (!identifier) return null;
  if (typeof organization?.properties?.id === "function") {
    const byId = organization.properties.id(identifier);
    if (byId) return byId;
  }
  return (organization?.properties || []).find((property) =>
    String(property._id) === identifier || property.name === identifier
  ) || null;
}

function referenceFilters({ organizationId, property }) {
  const propertyId = property._id;
  const propertyName = property.name;
  return {
    assignments: {
      organizationId,
      $or: [{ propertyId }, { propertyName }],
    },
    communications: { organizationId, propertyId },
    contractorEarnings: { organizationId, propertyId },
    inspectionJobs: {
      organizationId,
      $or: [{ propertyId }, { propertyName }],
    },
    invoices: { organizationId, propertyId },
    monthlySummaries: { organizationId, "propertySnapshots.propertyId": propertyId },
    pendingInvitations: {
      organizationId,
      propertyIds: propertyId,
      status: { $in: ["pending", "accepting"] },
    },
    profits: { organizationId, propertyId },
    resourceDeployments: { organizationId, propertyIds: propertyId, status: { $ne: "ended" } },
    routeRuns: { organizationId, "stops.propertyId": propertyId },
    submissions: { organizationId, property: propertyName },
  };
}

async function countReferences({ organization, property, referenceModels = DEFAULT_REFERENCE_MODELS, session }) {
  const filters = referenceFilters({ organizationId: organization._id, property });
  const entries = await Promise.all(Object.entries(filters).map(async ([key, filter]) => {
    const Model = referenceModels[key];
    if (!Model?.countDocuments) return [key, 0];
    const count = await withSession(Model.countDocuments(filter), session);
    return [key, Number(count) || 0];
  }));
  const routeNames = activeRoutes(organization)
    .filter((route) => routePropertyIds(route).includes(String(property._id)))
    .map((route) => route.name);
  return {
    activeRoutes: routeNames.length,
    activeRouteNames: routeNames,
    ...Object.fromEntries(entries),
  };
}

async function analyzePropertyRemoval({
  organization,
  propertyIdentifier,
  referenceModels = DEFAULT_REFERENCE_MODELS,
  session,
}) {
  const property = findProperty(organization, propertyIdentifier);
  if (!property) {
    throw propertyRemovalError(
      "Property not found in this organization.",
      404,
      "PROPERTY_NOT_FOUND"
    );
  }
  const references = await countReferences({ organization, property, referenceModels, session });
  const blockers = REFERENCE_DEFINITIONS
    .filter(({ key }) => references[key] > 0)
    .map(({ key, label, message }) => ({
      code: key,
      label,
      count: references[key],
      message,
      ...(key === "activeRoutes" ? { names: references.activeRouteNames } : {}),
    }));
  return {
    property: {
      id: String(property._id),
      name: property.name,
      propertyCode: property.propertyCode || "",
      region: property.region || "Uncategorized",
    },
    canRemove: blockers.length === 0,
    blockers,
    references,
  };
}

async function propertyRemovalImpact({
  organizationId,
  propertyIdentifier,
  OrganizationModel = Organization,
  referenceModels = DEFAULT_REFERENCE_MODELS,
}) {
  const organization = await OrganizationModel.findById(organizationId);
  if (!organization) {
    throw propertyRemovalError("Organization not found.", 404, "ORGANIZATION_NOT_FOUND");
  }
  return analyzePropertyRemoval({ organization, propertyIdentifier, referenceModels });
}

async function removeProperty({
  organizationId,
  propertyIdentifier,
  actorUserId,
  adminActionGrant,
  ipAddress = "",
  userAgent = "",
  now = new Date(),
  OrganizationModel = Organization,
  PlatformAuditModel = PlatformAudit,
  referenceModels = DEFAULT_REFERENCE_MODELS,
  consumeAdminGrant = consumeGrant,
  transactionRunner = defaultTransactionRunner,
}) {
  return transactionRunner(async (session) => {
    const organization = await withSession(OrganizationModel.findById(organizationId), session);
    if (!organization) {
      throw propertyRemovalError("Organization not found.", 404, "ORGANIZATION_NOT_FOUND");
    }
    const property = findProperty(organization, propertyIdentifier);
    if (!property) {
      throw propertyRemovalError(
        "Property not found in this organization.",
        404,
        "PROPERTY_NOT_FOUND"
      );
    }
    const grantAccepted = await consumeAdminGrant({
      organization,
      userId: actorUserId,
      purpose: "remove_property",
      token: adminActionGrant,
      session,
    });
    if (!grantAccepted) {
      throw propertyRemovalError(
        "Administrative verification expired or is invalid. Verify again and retry.",
        403,
        "ADMIN_GRANT_INVALID"
      );
    }
    const impact = await analyzePropertyRemoval({
      organization,
      propertyIdentifier: property._id,
      referenceModels,
      session,
    });
    if (!impact.canRemove) {
      throw propertyRemovalError(
        "This property still has linked records. Resolve the listed dependencies before removing it.",
        409,
        "PROPERTY_REMOVAL_BLOCKED",
        { impact }
      );
    }
    const result = await OrganizationModel.updateOne(
      { _id: organization._id, "properties._id": property._id },
      { $pull: { properties: { _id: property._id } } },
      { session }
    );
    if (result.modifiedCount !== 1) {
      throw propertyRemovalError(
        "The property changed while removal was in progress. Refresh and try again.",
        409,
        "PROPERTY_REMOVAL_CONFLICT"
      );
    }
    await PlatformAuditModel.create([{
      actorUserId,
      action: "organization_property_removed",
      targetOrganizationId: organization._id,
      metadata: {
        propertyId: String(property._id),
        propertyName: property.name,
        propertyCode: property.propertyCode || "",
        region: property.region || "Uncategorized",
        referenceCounts: impact.references,
        removedAt: now,
      },
      ipAddress,
      userAgent,
    }], { session });
    return {
      propertyId: String(property._id),
      propertyName: property.name,
      removedAt: now,
    };
  });
}

function propertyRemovalErrorBody(error, fallback = "Unable to remove the property.") {
  return {
    error: error.status ? error.message : fallback,
    ...(error.code ? { code: error.code } : {}),
    ...(error.impact ? { impact: error.impact } : {}),
  };
}

module.exports = {
  DEFAULT_REFERENCE_MODELS,
  REFERENCE_DEFINITIONS,
  analyzePropertyRemoval,
  countReferences,
  findProperty,
  propertyRemovalError,
  propertyRemovalErrorBody,
  propertyRemovalImpact,
  removeProperty,
};
