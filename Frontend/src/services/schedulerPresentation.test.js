import {
  propertySuggestedAmount,
  schedulerAssigneeLabel,
  schedulerFulfillmentSources,
  shouldShowSuggestedClientAmount,
  showAfterlightQueue,
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

test("the scheduler uses server-provided service-model fulfillment choices", () => {
  expect(schedulerFulfillmentSources({
    options: { fulfillmentSources: ["customer_employee", "customer_contractor"] },
  })).toEqual(["customer_employee", "customer_contractor"]);
  expect(schedulerFulfillmentSources(null)).toEqual([
    "customer_employee",
    "customer_contractor",
  ]);
});

test("suggested client amount is shown only for invoice-producing assignments", () => {
  expect(shouldShowSuggestedClientAmount({ invoiceRequired: false })).toBe(false);
  expect(shouldShowSuggestedClientAmount({ invoiceRequired: true })).toBe(true);
  expect(shouldShowSuggestedClientAmount(null)).toBe(false);
});

test("SaaS hides an empty Afterlight queue but retains existing Afterlight work", () => {
  expect(showAfterlightQueue("platform", 0)).toBe(false);
  expect(showAfterlightQueue(undefined, 0)).toBe(false);
  expect(showAfterlightQueue("platform", 1)).toBe(true);
  expect(showAfterlightQueue("hybrid", 0)).toBe(true);
});
