import {
  SAFE_AP_DELIVERY_ERROR,
  displayedApDeliveryError,
} from "./apDeliveryErrors";

test("masks legacy provider details returned on an invoice", () => {
  const invoice = {
    delivery: {
      error: "User arn:aws:iam::123456789012:user/sender is not authorized",
    },
  };

  expect(displayedApDeliveryError(invoice)).toBe(SAFE_AP_DELIVERY_ERROR);
  expect(displayedApDeliveryError(invoice)).not.toMatch(/arn:aws|123456789012|sender/);
});

test("does not show a delivery error when the invoice has none", () => {
  expect(displayedApDeliveryError({ delivery: {} })).toBe("");
});
