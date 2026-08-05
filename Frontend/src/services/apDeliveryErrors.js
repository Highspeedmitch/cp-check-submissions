export const SAFE_AP_DELIVERY_ERROR =
  "Delivery to AP could not be completed. Retry from Billing or contact Afterlight support.";

export function displayedApDeliveryError(invoice) {
  return invoice?.delivery?.error ? SAFE_AP_DELIVERY_ERROR : "";
}
