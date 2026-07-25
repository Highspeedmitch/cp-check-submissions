const VALID_ACCOUNT_STATUSES = ["active", "inactive"];

function normalizeAccountStatus(value) {
  return value === undefined || value === null || value === ""
    ? "active"
    : value;
}

function isValidAccountStatus(value) {
  return VALID_ACCOUNT_STATUSES.includes(value);
}

module.exports = {
  normalizeAccountStatus,
  isValidAccountStatus,
};
