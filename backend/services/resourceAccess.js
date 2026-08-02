const Assignment = require("../models/assignment");
const Organization = require("../models/organization");

async function assignedResourceContext({
  user,
  assignmentId,
  propertyName = "",
  AssignmentModel = Assignment,
  OrganizationModel = Organization,
}) {
  if (user.accountScope !== "afterlight_resource") return null;
  if (!assignmentId) {
    const error = new Error("An assigned work item is required.");
    error.status = 400;
    throw error;
  }
  const assignment = await AssignmentModel.findOne({
    _id: assignmentId,
    userId: user.userId,
    status: "scheduled",
    resourceProfileId: { $ne: null },
    "fulfillment.source": { $in: ["afterlight_staff", "afterlight_contractor"] },
  });
  if (!assignment) {
    const error = new Error("Assigned work item not found.");
    error.status = 404;
    throw error;
  }
  if (propertyName && assignment.propertyName !== propertyName) {
    const error = new Error("The assigned property does not match this work item.");
    error.status = 403;
    throw error;
  }
  const organization = await OrganizationModel.findById(assignment.organizationId);
  const property = organization?.properties?.find(
    (item) => item.name === assignment.propertyName
  );
  if (!organization || !property) {
    const error = new Error("The assigned property is unavailable.");
    error.status = 404;
    throw error;
  }
  return { assignment, organization, property };
}

module.exports = { assignedResourceContext };
