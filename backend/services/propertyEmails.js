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

function normalizedEmailSet(value) {
  return new Set((Array.isArray(value) ? value : [])
    .map((email) => String(email).trim().toLowerCase())
    .filter((email) => EMAIL_PATTERN.test(email)));
}

function normalizePropertyEmails(value, { automaticEmails = [] } = {}) {
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

  const automatic = normalizedEmailSet(automaticEmails);
  const duplicateAutomaticEmail = emails.find((email) => automatic.has(email));
  if (duplicateAutomaticEmail) {
    const error = new Error(
      `${duplicateAutomaticEmail} is already included automatically as an assigned property manager.`
    );
    error.status = 409;
    throw error;
  }

  return emails;
}

function withoutAutomaticPropertyEmails(propertyEmails, automaticEmails) {
  const automatic = normalizedEmailSet(automaticEmails);
  return (Array.isArray(propertyEmails) ? propertyEmails : [])
    .map((email) => String(email).trim().toLowerCase())
    .filter((email, index, values) =>
      EMAIL_PATTERN.test(email)
      && !automatic.has(email)
      && values.indexOf(email) === index
    );
}

function mergePropertyInspectionRecipients(propertyEmails, propertyManagerEmails) {
  return [...normalizedEmailSet([
    ...(Array.isArray(propertyEmails) ? propertyEmails : []),
    ...(Array.isArray(propertyManagerEmails) ? propertyManagerEmails : []),
  ])];
}

module.exports = {
  MAX_PROPERTY_RECIPIENTS,
  normalizeEmailAddress,
  mergePropertyInspectionRecipients,
  normalizePropertyEmails,
  withoutAutomaticPropertyEmails,
};
