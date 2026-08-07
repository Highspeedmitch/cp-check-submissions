import {
  customerEngagementMatchesFulfillment,
  normalizeOrganizationUserForEditing,
  organizationRoleLabel,
} from "./organizationUsers";

test("uses Field Operator language for current and legacy operator roles", () => {
  expect(organizationRoleLabel("user")).toBe("Field Operator");
  expect(organizationRoleLabel("contractor")).toBe("Field Operator");
});

test("normalizes a legacy contractor for editing without changing assignment meaning", () => {
  expect(normalizeOrganizationUserForEditing({ role: "contractor" })).toEqual({
    role: "user",
    engagementType: "customer_contractor",
  });
});

test("matches organization users only to their saved customer fulfillment type", () => {
  const employee = { role: "user", engagementType: "customer_employee" };
  expect(customerEngagementMatchesFulfillment(employee, "customer_employee")).toBe(true);
  expect(customerEngagementMatchesFulfillment(employee, "customer_contractor")).toBe(false);
});
