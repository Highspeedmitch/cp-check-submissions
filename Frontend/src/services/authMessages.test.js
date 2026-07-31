import {
  INVALID_LOGIN_MESSAGE,
  LOGIN_UNAVAILABLE_MESSAGE,
  PASSWORD_RESET_REQUEST_MESSAGE,
  loginFailureMessage,
  passwordResetFailureMessage,
} from "./authMessages";

test("login failures never identify whether the email or password was wrong", () => {
  expect(loginFailureMessage(401)).toBe(INVALID_LOGIN_MESSAGE);
  expect(loginFailureMessage(401)).not.toMatch(/user not found|incorrect password/i);
  expect(loginFailureMessage(500)).toBe(LOGIN_UNAVAILABLE_MESSAGE);
});

test("password recovery uses an account-neutral confirmation", () => {
  expect(PASSWORD_RESET_REQUEST_MESSAGE).toMatch(/if the email matches an account/i);
  expect(passwordResetFailureMessage(429)).toMatch(/too many password reset attempts/i);
});
