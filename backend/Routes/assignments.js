const express = require("express");
const Assignment = require("../models/assignment");
const Organization = require("../models/organization");
const User = require("../models/user");
const Submission = require("../models/submission");
const FulfillmentAudit = require("../models/fulfillmentAudit");
const { managedProperties } = require("../services/propertyAccess");
const { sendUserNotification } = require("../services/notifications");
const { assignmentChanged } = require("../services/notificationEvents");
const {
  resolveAssignmentFulfillment,
  serviceModelAllowsAfterlightResources,
} = require("../services/fulfillmentPolicy");
const {
  resolveAssignmentAssignee,
  deployedSchedulerResources,
} = require("../services/resourceScheduling");
const authenticateToken = require("../middleware/authenticateToken");

function assignmentDate(value, label) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    const error = new Error(`Select a valid ${label}.`);
    error.status = 400;
    throw error;
  }
  return date;
}

function resolveAssignmentDates(startDate, endDate) {
  const normalizedStartDate = assignmentDate(startDate, "start date");
  const normalizedEndDate = assignmentDate(endDate || startDate, "end date");
  if (normalizedEndDate < normalizedStartDate) {
    const error = new Error("End date cannot be before the start date.");
    error.status = 400;
    throw error;
  }
  return { startDate: normalizedStartDate, endDate: normalizedEndDate };
}

function tenantAssignmentResult(assignment) {
  const value = typeof assignment?.toObject === "function"
    ? assignment.toObject()
    : { ...assignment };
  const populatedAssignee = value.userId && typeof value.userId === "object"
    && (value.userId.email || value.userId.username || value.userId.displayName)
    ? value.userId
    : null;
  if (populatedAssignee) {
    value.assignee = publicUser(populatedAssignee);
    value.userId = populatedAssignee._id;
  }
  delete value.compensationSnapshot;
  return value;
}

function publicUser(user) {
  if (!user) return null;
  return {
    _id: user._id,
    name: user.username || user.displayName || user.email || "Unknown user",
    email: user.email || "",
  };
}

function createAssignmentHandlers({
  AssignmentModel = Assignment,
  OrganizationModel = Organization,
  UserModel = User,
  SubmissionModel = Submission,
  FulfillmentAuditModel = FulfillmentAudit,
  notifyUser = sendUserNotification,
  managedPropertiesForUser = managedProperties,
  resolveAssignee = resolveAssignmentAssignee,
  schedulerResources = deployedSchedulerResources,
} = {}) {
  const isManagement = (user) => ["admin", "property_manager"].includes(user.role);

  async function createAssignment(req, res) {
    try {
      if (!isManagement(req.user)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const {
        propertyName,
        userId,
        eventType,
        startDate,
        endDate,
        oneTimeCheckRequest,
        fulfillmentSource,
        fulfillmentOverrideReason,
      } = req.body;
      const organizationId = req.user.organizationId;
      if (!organizationId) {
        console.error("Missing organizationId in assignment request.");
        return res.status(400).json({ error: "Missing organization ID" });
      }
      const validEventTypes = ["QA Check", "Maintenance", "Cleaning"];
      if (eventType && !validEventTypes.includes(eventType)) {
        return res.status(400).json({ error: "Invalid assignment event type." });
      }
      const assignmentDates = resolveAssignmentDates(startDate, endDate);

      const organization = await OrganizationModel.findById(organizationId);
      if (!organization) return res.status(404).json({ error: "Organization not found." });
      const property = (organization.properties || []).find((item) => item.name === propertyName);
      if (!property) return res.status(400).json({ error: "Select a property in your organization." });
      if (req.user.role === "property_manager" && !managedPropertiesForUser(organization, req.user)
        .some((managed) => String(managed._id) === String(property._id))) {
        return res.status(403).json({ error: "You do not manage this property." });
      }
      const fulfillment = resolveAssignmentFulfillment({
        organization,
        property,
        requestedSource: fulfillmentSource,
        actorUserId: req.user.userId,
      });

      const assignee = await resolveAssignee({
        fulfillment,
        userId,
        organizationId,
        property,
        startDate: assignmentDates.startDate,
        UserModel,
      });

      const overlapping = await AssignmentModel.findOne({
        organizationId,
        propertyName,
        status: "scheduled",
        $or: [{
          startDate: { $lte: assignmentDates.endDate },
          endDate: { $gte: assignmentDates.startDate },
        }],
      });
      if (overlapping) {
        return res.status(400).json({
          error: "Overlapping assignment exists for this property.",
        });
      }

      const assignment = new AssignmentModel({
        organizationId,
        propertyName,
        userId: assignee.userId,
        eventType,
        startDate: assignmentDates.startDate,
        endDate: assignmentDates.endDate,
        oneTimeCheckRequest: oneTimeCheckRequest || "",
        fulfillment,
        resourceProfileId: assignee.resourceProfileId,
        resourceDeploymentId: assignee.resourceDeploymentId,
        compensationSnapshot: assignee.compensationSnapshot,
        assignedBy: req.user.userId,
      });
      await assignment.save();

      if (fulfillment.sourceOrigin === "assignment_override") {
        await FulfillmentAuditModel.create({
          organizationId,
          actorUserId: req.user.userId,
          entityType: "assignment",
          entityId: assignment._id.toString(),
          action: "assignment_fulfillment_overridden",
          previousValue: { source: fulfillment.inheritedSource },
          nextValue: {
            source: fulfillment.source,
            queue: fulfillment.queue,
            invoiceRouting: fulfillment.invoiceRouting,
            invoiceVisibility: fulfillment.invoiceVisibility,
            invoiceRequired: fulfillment.invoiceRequired,
          },
          reason: String(fulfillmentOverrideReason || "").trim(),
          metadata: { propertyName, policyVersion: fulfillment.policyVersion },
          ipAddress: req.ip || "",
          userAgent: typeof req.get === "function" ? req.get("user-agent") || "" : "",
        });
      }

      notifyUser({
        organizationId,
        userId: assignee.userId,
        type: "assignment_created",
        title: "New property inspection",
        body: `${propertyName} was assigned to you.`,
        route: assignee.resourceProfileId ? "/resource" : "/dashboard",
        entityId: assignment._id,
        recipientScope: assignee.resourceProfileId ? "afterlight_resource" : "organization",
      }).catch((error) => {
        console.error("Assignment notification error:", error);
      });

      return res.json({
        success: true,
        message: "Assignment created successfully",
        assignment: tenantAssignmentResult(assignment),
      });
    } catch (error) {
      console.error("Error creating assignment:", error);
      return res.status(error.status || 500).json({
        error: error.status ? error.message : "Server error creating assignment",
      });
    }
  }

  async function listAssignments(req, res) {
    try {
      if (req.user.accountScope === "afterlight_resource") {
        const assignments = await AssignmentModel.find({
          userId: req.user.userId,
          resourceProfileId: { $ne: null },
          status: "scheduled",
        }).sort({ startDate: 1 });
        return res.json(assignments);
      }
      const query = { organizationId: req.user.organizationId, status: "scheduled" };
      if (req.user.role === "property_manager") {
        const organization = await OrganizationModel.findById(req.user.organizationId);
        query.propertyName = {
          $in: managedPropertiesForUser(organization, req.user)
            .map((property) => property.name),
        };
      } else if (req.user.role !== "admin") {
        query.userId = req.user.userId;
      }

      let assignmentsQuery = AssignmentModel.find(query).sort({ startDate: 1 });
      if (typeof assignmentsQuery.populate === "function") {
        assignmentsQuery = assignmentsQuery.populate("userId", "email username displayName");
      }
      const assignments = await assignmentsQuery;
      if (!assignments.length) {
        console.warn(
          "No assignments found for organization:",
          req.user.organizationId
        );
      }
      return res.json(assignments.map(tenantAssignmentResult));
    } catch (error) {
      console.error("Error fetching assignments:", error);
      return res.status(500).json({ error: "Server error fetching assignments" });
    }
  }

  async function listSchedulerUsers(req, res) {
    try {
      if (!isManagement(req.user)) {
        return res.status(403).json({ error: "Management access required." });
      }

      const roleFilter = req.query.roles === "all"
        ? ["user", "contractor", "cleaner"]
        : ["user"];
      const [users, organization] = await Promise.all([
        UserModel.find({
          organizationId: req.user.organizationId,
          role: { $in: roleFilter },
          accountStatus: { $ne: "inactive" },
          organizationArchivedAt: null,
        }).select("_id email role"),
        OrganizationModel.findById(req.user.organizationId),
      ]);
      if (!organization) return res.status(404).json({ error: "Organization not found." });
      const resources = req.query.roles === "all"
        && serviceModelAllowsAfterlightResources(organization)
        ? await schedulerResources({
            organizationId: req.user.organizationId,
            serviceModel: organization.serviceModel,
          })
        : [];

      return res.json([...users, ...resources]);
    } catch (error) {
      console.error("Error fetching users:", error);
      return res.status(500).json({ error: "Server error fetching users" });
    }
  }

  async function listAssignmentHistory(req, res) {
    try {
      if (!isManagement(req.user)) {
        return res.status(403).json({ error: "Management access required." });
      }
      const query = {
        organizationId: req.user.organizationId,
        status: { $in: ["completed", "canceled"] },
      };
      if (req.user.role === "property_manager") {
        const organization = await OrganizationModel.findById(req.user.organizationId);
        query.propertyName = {
          $in: managedPropertiesForUser(organization, req.user)
            .map((property) => property.name),
        };
      }
      const assignments = await AssignmentModel.find(query)
        .select("propertyName userId assignedBy startDate endDate createdAt updatedAt completedAt canceledAt status eventType fulfillment.source fulfillment.resolvedBy")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      const assignmentIds = assignments.map((assignment) => assignment._id);
      const submissions = assignmentIds.length
        ? await SubmissionModel.find({ assignmentId: { $in: assignmentIds } })
            .select("assignmentId submittedAt")
            .lean()
        : [];
      const completionByAssignment = new Map(submissions.map((submission) => [
        String(submission.assignmentId),
        submission.submittedAt,
      ]));
      const userIds = [...new Set(assignments.flatMap((assignment) => [
        assignment.userId,
        assignment.assignedBy || assignment.fulfillment?.resolvedBy,
      ]).filter(Boolean).map(String))];
      const users = userIds.length
        ? await UserModel.find({ _id: { $in: userIds } })
            .select("_id username email")
            .lean()
        : [];
      const userById = new Map(users.map((user) => [String(user._id), user]));
      return res.json(assignments.map((assignment) => {
        const assignerId = assignment.assignedBy || assignment.fulfillment?.resolvedBy;
        return {
          _id: assignment._id,
          propertyName: assignment.propertyName,
          status: assignment.status,
          fulfillmentType: assignment.fulfillment?.source || "legacy",
          eventType: assignment.eventType || "",
          assignedTo: publicUser(userById.get(String(assignment.userId))),
          assignedBy: publicUser(userById.get(String(assignerId))),
          scheduledAt: assignment.startDate,
          scheduledThrough: assignment.endDate,
          assignedAt: assignment.createdAt,
          completedAt: assignment.completedAt
            || completionByAssignment.get(String(assignment._id))
            || (assignment.status === "completed" ? assignment.updatedAt : null)
            || null,
          canceledAt: assignment.canceledAt || null,
        };
      }));
    } catch (error) {
      console.error("Error fetching assignment history:", error);
      return res.status(500).json({ error: "Unable to load assignment history." });
    }
  }

  async function deleteAssignment(req, res) {
    try {
      if (!isManagement(req.user)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const query = {
        _id: req.params.id,
        organizationId: req.user.organizationId,
        status: "scheduled",
      };
      if (req.user.role === "property_manager") {
        const organization = await OrganizationModel.findById(req.user.organizationId);
        query.propertyName = {
          $in: managedPropertiesForUser(organization, req.user).map((property) => property.name),
        };
      }
      const canceledAssignment = await AssignmentModel.findOneAndUpdate(
        query,
        {
          $set: {
            status: "canceled",
            canceledAt: new Date(),
            canceledBy: req.user.userId,
          },
          $inc: { calendarSequence: 1 },
        },
        { new: true }
      );
      if (!canceledAssignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      notifyUser({
        organizationId: canceledAssignment.organizationId,
        userId: canceledAssignment.userId,
        recipientScope: canceledAssignment.resourceProfileId
          ? "afterlight_resource"
          : "organization",
        ...assignmentChanged(canceledAssignment, "canceled"),
      }).catch((error) => {
        console.error("Assignment cancellation notification error:", error);
      });

      return res.json({
        success: true,
        message: "Assignment canceled successfully",
      });
    } catch (error) {
      console.error("Error deleting assignment:", error);
      return res.status(500).json({ error: "Server error deleting assignment" });
    }
  }

  async function updateAssignment(req, res) {
    try {
      if (!isManagement(req.user)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const allowedFields = [
        "propertyName",
        "userId",
        "eventType",
        "startDate",
        "endDate",
        "oneTimeCheckRequest",
        "notes",
      ];
      const changes = Object.fromEntries(
        allowedFields
          .filter((field) => Object.prototype.hasOwnProperty.call(req.body, field))
          .map((field) => [field, req.body[field]])
      );
      const hasStartDate = Object.prototype.hasOwnProperty.call(req.body, "startDate");
      const hasEndDate = Object.prototype.hasOwnProperty.call(req.body, "endDate");
      if (hasStartDate) {
        Object.assign(
          changes,
          resolveAssignmentDates(req.body.startDate, hasEndDate ? req.body.endDate : req.body.startDate)
        );
      } else if (hasEndDate) {
        if (req.body.endDate) changes.endDate = assignmentDate(req.body.endDate, "end date");
        else delete changes.endDate;
      }
      const needsAssigneeResolution = ["fulfillmentSource", "userId", "propertyName", "startDate"]
        .some((field) => Object.prototype.hasOwnProperty.call(req.body, field));
      const needsChangeNotification = ["userId", "startDate", "endDate"]
        .some((field) => Object.prototype.hasOwnProperty.call(req.body, field));
      let existing;
      if (needsAssigneeResolution || needsChangeNotification || req.user.role === "property_manager") {
        const existingQuery = {
          _id: req.params.id,
          organizationId: req.user.organizationId,
          status: "scheduled",
        };
        if (req.user.role === "property_manager") {
          const organization = await OrganizationModel.findById(req.user.organizationId);
          existingQuery.propertyName = {
            $in: managedPropertiesForUser(organization, req.user).map((property) => property.name),
          };
        }
        existing = await AssignmentModel.findOne(existingQuery);
        if (!existing) return res.status(404).json({ success: false, error: "Assignment not found" });
      }
      if (needsAssigneeResolution) {
        const organization = await OrganizationModel.findById(req.user.organizationId);
        const propertyName = changes.propertyName || existing.propertyName;
        const property = (organization?.properties || []).find((item) => item.name === propertyName);
        if (!property) return res.status(400).json({ error: "Select a property in your organization." });
        if (req.user.role === "property_manager" && !managedPropertiesForUser(organization, req.user)
          .some((managed) => String(managed._id) === String(property._id))) {
          return res.status(403).json({ error: "You do not manage this property." });
        }
        const hasFulfillmentOverride = Object.prototype.hasOwnProperty.call(req.body, "fulfillmentSource");
        const fulfillment = hasFulfillmentOverride
          ? resolveAssignmentFulfillment({
              organization,
              property,
              requestedSource: req.body.fulfillmentSource,
              actorUserId: req.user.userId,
            })
          : existing.fulfillment;
        changes.fulfillment = fulfillment;
        const existingAfterlightAssignment = ["afterlight_staff", "afterlight_contractor"]
          .includes(existing.fulfillment?.source);
        const sameAssignee = String(changes.userId || existing.userId) === String(existing.userId);
        const sameProperty = propertyName === existing.propertyName;
        const preservesExistingSaasAssignment = existingAfterlightAssignment
          && !serviceModelAllowsAfterlightResources(organization)
          && !hasFulfillmentOverride
          && sameAssignee
          && sameProperty;
        if (preservesExistingSaasAssignment) {
          changes.userId = existing.userId;
          changes.resourceProfileId = existing.resourceProfileId;
          changes.resourceDeploymentId = existing.resourceDeploymentId;
          changes.compensationSnapshot = existing.compensationSnapshot;
        } else {
          if (existingAfterlightAssignment
            && !serviceModelAllowsAfterlightResources(organization)
            && !hasFulfillmentOverride) {
            const error = new Error(
              "Select customer fulfillment before changing the assignee or property on this retained Afterlight assignment."
            );
            error.status = 400;
            throw error;
          }
          const assignee = await resolveAssignee({
            fulfillment,
            userId: changes.userId || existing.userId,
            organizationId: req.user.organizationId,
            property,
            startDate: changes.startDate || existing.startDate,
            UserModel,
          });
          changes.userId = assignee.userId;
          changes.resourceProfileId = assignee.resourceProfileId;
          changes.resourceDeploymentId = assignee.resourceDeploymentId;
          const retainsAgreedRate = existing.resourceProfileId
            && String(existing.resourceProfileId) === String(assignee.resourceProfileId)
            && !Object.prototype.hasOwnProperty.call(req.body, "userId")
            && !hasFulfillmentOverride;
          changes.compensationSnapshot = retainsAgreedRate
            ? existing.compensationSnapshot
            : assignee.compensationSnapshot;
        }
        if (hasFulfillmentOverride) {
          await FulfillmentAuditModel.create({
            organizationId: req.user.organizationId,
            actorUserId: req.user.userId,
            entityType: "assignment",
            entityId: existing._id.toString(),
            action: "assignment_fulfillment_overridden",
            previousValue: existing.fulfillment || null,
            nextValue: fulfillment,
            reason: String(req.body.fulfillmentOverrideReason || "").trim(),
            metadata: { propertyName, policyVersion: fulfillment.policyVersion },
            ipAddress: req.ip || "",
            userAgent: typeof req.get === "function" ? req.get("user-agent") || "" : "",
          });
        }
      }
      const updateQuery = {
          _id: req.params.id,
          organizationId: req.user.organizationId,
          status: "scheduled",
      };
      if (req.user.role === "property_manager") {
        updateQuery.propertyName = existing.propertyName;
      }
      const assignment = await AssignmentModel.findOneAndUpdate(
        updateQuery,
        { $set: changes, $inc: { calendarSequence: 1 } },
        { new: true }
      );
      if (!assignment) {
        return res.status(404).json({
          success: false,
          error: "Assignment not found",
        });
      }


      if (needsChangeNotification && existing) {
        const previousUserId = String(existing.userId || "");
        const nextUserId = String(assignment.userId || "");
        if (previousUserId && previousUserId !== nextUserId) {
          notifyUser({
            organizationId: existing.organizationId,
            userId: existing.userId,
            recipientScope: existing.resourceProfileId ? "afterlight_resource" : "organization",
            ...assignmentChanged(existing, "reassigned", { previousRecipient: true }),
          }).catch((error) => {
            console.error("Previous assignee notification error:", error);
          });
          notifyUser({
            organizationId: assignment.organizationId,
            userId: assignment.userId,
            recipientScope: assignment.resourceProfileId ? "afterlight_resource" : "organization",
            ...assignmentChanged(assignment, "reassigned"),
          }).catch((error) => {
            console.error("New assignee notification error:", error);
          });
        } else {
          const previousStart = new Date(existing.startDate).getTime();
          const previousEnd = new Date(existing.endDate).getTime();
          const nextStart = new Date(assignment.startDate).getTime();
          const nextEnd = new Date(assignment.endDate).getTime();
          if (previousStart !== nextStart || previousEnd !== nextEnd) {
            notifyUser({
              organizationId: assignment.organizationId,
              userId: assignment.userId,
              recipientScope: assignment.resourceProfileId ? "afterlight_resource" : "organization",
              ...assignmentChanged(assignment, "rescheduled"),
            }).catch((error) => {
              console.error("Assignment reschedule notification error:", error);
            });
          }
        }
      }

      return res.json({ success: true, assignment: tenantAssignmentResult(assignment) });
    } catch (error) {
      console.error("Error updating assignment:", error);
      return res.status(error.status || 500).json({ success: false, error: error.message });
    }
  }

  return {
    createAssignment,
    listAssignments,
    listAssignmentHistory,
    listSchedulerUsers,
    deleteAssignment,
    updateAssignment,
  };
}

function createAssignmentRouter(
  dependencies,
  routeAuthentication = authenticateToken
) {
  const router = express.Router();
  const handlers = createAssignmentHandlers(dependencies);
  router.post("/assignments", routeAuthentication, handlers.createAssignment);
  router.get("/assignments", routeAuthentication, handlers.listAssignments);
  router.get("/assignments/history", routeAuthentication, handlers.listAssignmentHistory);
  router.get("/users", routeAuthentication, handlers.listSchedulerUsers);
  router.delete(
    "/assignments/:id",
    routeAuthentication,
    handlers.deleteAssignment
  );
  router.put(
    "/assignments/:id",
    routeAuthentication,
    handlers.updateAssignment
  );
  return router;
}

module.exports = createAssignmentRouter();
module.exports.createAssignmentHandlers = createAssignmentHandlers;
module.exports.createAssignmentRouter = createAssignmentRouter;
