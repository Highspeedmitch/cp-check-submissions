import {
  propertySuggestedAmount,
  schedulerAssigneeLabel,
} from "./schedulerPresentation";

test("Afterlight contractor labels never expose internal compensation", () => {
  const label = schedulerAssigneeLabel({
    displayName: "AL 1099 resource",
    accountScope: "afterlight_resource",
    resourceType: "contractor",
    rateCents: 9000,
    currency: "USD",
  });

  expect(label).toBe("AL 1099 resource (Afterlight contractor)");
  expect(label).not.toMatch(/90|\$|rate/i);
});

test("property suggested amounts use the client billing setting", () => {
  expect(propertySuggestedAmount({ defaultInspectionAmountCents: 15000 })).toBe("$150.00");
  expect(propertySuggestedAmount({ defaultInspectionAmountCents: null })).toBe("Not configured");
});
