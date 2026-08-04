const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PROPERTY_RECIPIENTS = 25;

function normalizeEmailAddress(value, label = "email address") {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) {
    const error = new Error(`Enter a valid ${label}.`);
    error.status = 400;
    throw error;
  }
  return email;
}

function normalizePropertyEmails(value) {
  if (!Array.isArray(value)) {
    const error = new Error("Emails must be provided as a list.");
    error.status = 400;
    throw error;
  }

  const emails = [...new Set(value
    .map((email) => String(email).trim().toLowerCase())
    .filter(Boolean))];

  if (emails.length > MAX_PROPERTY_RECIPIENTS) {
    const error = new Error(`A property can have up to ${MAX_PROPERTY_RECIPIENTS} inspection recipients.`);
    error.status = 400;
    throw error;
  }

  const invalidEmail = emails.find((email) => !EMAIL_PATTERN.test(email));
  if (invalidEmail) {
    const error = new Error(`Enter a valid email address: ${invalidEmail}`);
    error.status = 400;
    throw error;
  }

  return emails;
}

module.exports = {
  MAX_PROPERTY_RECIPIENTS,
  normalizeEmailAddress,
  normalizePropertyEmails,
};
