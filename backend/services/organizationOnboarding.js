const REQUIRED_STEP_IDS = new Set(["workspace", "security", "property"]);

function step(id, title, description, complete, action, optional = false) {
  return { id, title, description, complete: Boolean(complete), action, optional };
}

function serializeOrganizationOnboardingStatus(organization) {
  const guided = Boolean(organization?.onboarding);
  return {
    guided,
    status: guided
      ? organization.onboarding.status || "invited"
      : "established",
    completedAt: organization?.onboarding?.completedAt || null,
  };
}

function serializeOrganizationOnboarding({
  organization,
  activeUserCount = 0,
  pendingInvitationCount = 0,
  completedSubmissionCount = 0,
} = {}) {
  const onboardingStatus = serializeOrganizationOnboardingStatus(organization);
  const { guided, status } = onboardingStatus;
  const properties = organization?.properties || [];
  const securityConfigured = Boolean(organization?.security?.adminActionPasskeyHash);
  const teamConfigured = activeUserCount > 1 || pendingInvitationCount > 0;
  const steps = [
    step(
      "workspace",
      "Confirm workspace settings",
      "Review the service model, default fulfillment route, and reporting timezone selected by Afterlight.",
      Boolean(organization?.serviceModel && organization?.fulfillmentPolicy?.defaultSource),
      { label: "Review service delivery", path: "/service-delivery" }
    ),
    step(
      "security",
      "Secure administrator actions",
      "Replace temporary platform passkeys with an organization-owned administrative passkey.",
      securityConfigured,
      { label: securityConfigured ? "Review security" : "Configure security", path: "/organization-security" }
    ),
    step(
      "property",
      "Add the first property",
      "Create a property, establish its billing details, and select its inspection delivery method.",
      properties.length > 0,
      { label: properties.length ? "View properties" : "Add a property", path: properties.length ? "/dashboard" : "/dashboard?onboarding=add-property" }
    ),
    step(
      "team",
      "Invite the operating team",
      "Invite property managers, submitters, and owners, then assign the appropriate property access.",
      teamConfigured,
      { label: "Manage users", path: "/admin/users" },
      true
    ),
    step(
      "first_report",
      "Validate the first inspection",
      "Schedule and complete a controlled inspection to confirm the operational workflow end to end.",
      completedSubmissionCount > 0,
      { label: completedSubmissionCount ? "View dashboard" : "Open scheduler", path: completedSubmissionCount ? "/dashboard" : "/scheduler" },
      true
    ),
  ];
  const requiredSteps = steps.filter((item) => REQUIRED_STEP_IDS.has(item.id));
  const requiredComplete = requiredSteps.filter((item) => item.complete).length;
  return {
    guided,
    status,
    organization: {
      id: organization?._id,
      name: organization?.name,
      orgType: organization?.orgType,
      reportingTimezone: organization?.reportingTimezone,
      serviceModel: organization?.serviceModel,
      defaultFulfillmentSource: organization?.fulfillmentPolicy?.defaultSource,
    },
    progress: {
      requiredComplete,
      requiredTotal: requiredSteps.length,
      percent: Math.round((requiredComplete / requiredSteps.length) * 100),
    },
    canComplete: guided
      && status !== "completed"
      && requiredComplete === requiredSteps.length,
    steps,
    initiatedAt: organization?.onboarding?.initiatedAt || null,
    administratorAcceptedAt: organization?.onboarding?.administratorAcceptedAt || null,
    completedAt: organization?.onboarding?.completedAt || null,
  };
}

module.exports = {
  REQUIRED_STEP_IDS,
  serializeOrganizationOnboarding,
  serializeOrganizationOnboardingStatus,
};
