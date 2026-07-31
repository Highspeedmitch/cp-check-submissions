export const INVALID_LOGIN_MESSAGE = "The email or password you entered is incorrect.";
export const LOGIN_UNAVAILABLE_MESSAGE = "Unable to sign in right now. Please try again.";
export const PASSWORD_RESET_REQUEST_MESSAGE = "If the email matches an account, password reset instructions will be sent.";

export function loginFailureMessage(status) {
  if (status === 401) return INVALID_LOGIN_MESSAGE;
  if (status === 403) {
    return "This account is currently unavailable. Contact your organization administrator.";
  }
  if (status === 429) return "Too many sign-in attempts. Please wait and try again.";
  return LOGIN_UNAVAILABLE_MESSAGE;
}

export function passwordResetFailureMessage(status) {
  if (status === 429) return "Too many password reset attempts. Please wait and try again.";
  return "Unable to process the request right now. Please try again.";
}
