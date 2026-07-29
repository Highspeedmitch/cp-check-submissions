const express = require("express");
const Assignment = require("../models/assignment");
const Organization = require("../models/organization");
const User = require("../models/user");
const { managedProperties } = require("../services/propertyAccess");
const { sendUserNotification } = require("../services/notifications");
const authenticateToken = require("../middleware/authenticateToken");

function createAssignmentHandlers({
  AssignmentModel = Assignment,
  OrganizationModel = Organization,
  UserModel = User,
  notifyUser = sendUserNotification,
  managedPropertiesForUser = managedProperties,
} = {}) {
  async function createAssignment(req, res) {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }

      const {
        propertyName,
        userId,
        eventType,
        startDate,
        endDate,
        oneTimeCheckRequest,
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

      const assignedUser = await UserModel.findOne({
        _id: userId,
        organizationId,
        accountStatus: { $ne: "inactive" },
      }).select("_id").lean();
      if (!assignedUser) {
        return res.status(400).json({
          error: "Assigned user is not active in this organization.",
        });
      }

      const overlapping = await AssignmentModel.findOne({
        organizationId,
        propertyName,
        $or: [{
          startDate: { $lte: new Date(endDate) },
          endDate: { $gte: new Date(startDate) },
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
        userId,
        eventType,
        startDate,
        endDate,
        oneTimeCheckRequest: oneTimeCheckRequest || "",
      });
      await assignment.save();

      notifyUser({
        organizationId,
        userId,
        type: "assignment_created",
        title: "New property inspection",
        body: `${propertyName} was assigned to you.`,
        route: "/dashboard",
        entityId: assignment._id,
      }).catch((error) => {
        console.error("Assignment notification error:", error);
      });

      return res.json({
        success: true,
        message: "Assignment created successfully",
        assignment,
      });
    } catch (error) {
      console.error("Error creating assignment:", error);
      return res.status(500).json({ error: "Server error creating assignment" });
    }
  }

  async function listAssignments(req, res) {
    try {
      const query = { organizationId: req.user.organizationId };
      if (req.user.role === "property_manager") {
        const organization = await OrganizationModel.findById(req.user.organizationId);
        query.propertyName = {
          $in: managedPropertiesForUser(organization, req.user)
            .map((property) => property.name),
        };
      }

      const assignments = await AssignmentModel.find(query).sort({ startDate: 1 });
      if (!assignments.length) {
        console.warn(
          "No assignments found for organization:",
          req.user.organizationId
        );
      }
      return res.json(assignments);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      return res.status(500).json({ error: "Server error fetching assignments" });
    }
  }

  async function listSchedulerUsers(req, res) {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Forbidden - Admin only" });
      }

      const roleFilter = req.query.roles === "all"
        ? ["user", "contractor", "cleaner"]
        : ["user"];
      const users = await UserModel.find({
        organizationId: req.user.organizationId,
        role: { $in: roleFilter },
      }).select("_id email role");

      return res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      return res.status(500).json({ error: "Server error fetching users" });
    }
  }

  async function deleteAssignment(req, res) {
    try {
      const deletedAssignment = await AssignmentModel.findOneAndDelete({
        _id: req.params.id,
        organizationId: req.user.organizationId,
      });
      if (!deletedAssignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      return res.json({
        success: true,
        message: "Assignment deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting assignment:", error);
      return res.status(500).json({ error: "Server error deleting assignment" });
    }
  }

  async function updateAssignment(req, res) {
    try {
      const assignment = await AssignmentModel.findOneAndUpdate(
        {
          _id: req.params.id,
          organizationId: req.user.organizationId,
        },
        req.body,
        { new: true }
      );
      if (!assignment) {
        return res.status(404).json({
          success: false,
          error: "Assignment not found",
        });
      }

      return res.json({ success: true, assignment });
    } catch (error) {
      console.error("Error updating assignment:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  return {
    createAssignment,
    listAssignments,
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
