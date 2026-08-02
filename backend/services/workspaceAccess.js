const ResourceProfile = require("../models/resourceProfile");

const ORGANIZATION_WORKSPACE = "organization";
const RESOURCE_WORKSPACE = "afterlight_resource";
const WORKSPACES = new Set([ORGANIZATION_WORKSPACE, RESOURCE_WORKSPACE]);

function defaultWorkspace(user) {
  return user?.accountScope === RESOURCE_WORKSPACE
    ? RESOURCE_WORKSPACE
    : ORGANIZATION_WORKSPACE;
}

async function availableWorkspaces(user, ResourceProfileModel = ResourceProfile) {
  const available = [];
  if (defaultWorkspace(user) !== RESOURCE_WORKSPACE) {
    available.push(ORGANIZATION_WORKSPACE);
  }

  const resourceProfile = user?._id && await ResourceProfileModel.findOne({
    userId: user._id,
    status: { $ne: "suspended" },
  }).select("_id").lean();
  if (resourceProfile) available.push(RESOURCE_WORKSPACE);

  return available;
}

async function workspaceAuthentication(
  user,
  requestedWorkspace,
  ResourceProfileModel = ResourceProfile
) {
  const available = await availableWorkspaces(user, ResourceProfileModel);
  const requested = WORKSPACES.has(requestedWorkspace)
    ? requestedWorkspace
    : defaultWorkspace(user);
  const accountScope = available.includes(requested) ? requested : available[0];
  if (!accountScope) {
    const error = new Error("This account does not have an available workspace.");
    error.status = 403;
    throw error;
  }
  if (requestedWorkspace && !available.includes(requestedWorkspace)) {
    const error = new Error("That workspace is not available for this account.");
    error.status = 403;
    throw error;
  }
  return { accountScope, availableWorkspaces: available };
}

module.exports = {
  ORGANIZATION_WORKSPACE,
  RESOURCE_WORKSPACE,
  availableWorkspaces,
  defaultWorkspace,
  workspaceAuthentication,
};
