const SAFE_AP_DELIVERY_ERROR =
  "Delivery to AP could not be completed. Retry from Billing or contact Afterlight support.";

function normalizedErrorCode(error) {
  const value = String(error?.code || error?.name || "UNKNOWN_DELIVERY_ERROR");
  return value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 100);
}

function safeProviderDiagnostics(error) {
  const statusCode = Number(error?.statusCode || error?.$metadata?.httpStatusCode);
  return {
    errorCode: normalizedErrorCode(error),
    providerRequestId: String(error?.requestId || error?.$metadata?.requestId || "").slice(0, 100),
    httpStatusCode: Number.isInteger(statusCode) ? statusCode : null,
    retryable: Boolean(error?.retryable),
  };
}

function apDeliveryFailure(error) {
  const providerMessage = String(error?.message || "");
  const configurationError = /no AP email configured|valid AP email address|approving property manager/i.test(providerMessage);
  return {
    status: configurationError ? 400 : 502,
    userMessage: configurationError ? providerMessage : SAFE_AP_DELIVERY_ERROR,
    ...safeProviderDiagnostics(error),
  };
}

module.exports = {
  SAFE_AP_DELIVERY_ERROR,
  apDeliveryFailure,
  normalizedErrorCode,
  safeProviderDiagnostics,
};
