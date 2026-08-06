export function schedulerAssigneeLabel(user) {
  const name = user.displayName || user.email;
  if (user.accountScope !== "afterlight_resource") {
    return `${name} (${user.role})`;
  }
  const relationship = user.resourceType === "contractor"
    ? "Afterlight contractor"
    : user.resourceType === "owner"
      ? "Afterlight owner"
      : "Afterlight employee";
  return `${name} (${relationship})`;
}

export function propertySuggestedAmount(property) {
  if (!Number.isInteger(property?.defaultInspectionAmountCents)) {
    return "Not configured";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(property.defaultInspectionAmountCents / 100);
}

export function schedulerFulfillmentSources(settings) {
  const configured = settings?.options?.fulfillmentSources;
  return Array.isArray(configured)
    ? configured
    : ["customer_employee", "customer_contractor"];
}

export function showAfterlightQueue(serviceModel, assignmentCount) {
  return ["managed", "hybrid"].includes(serviceModel) || Number(assignmentCount) > 0;
}
