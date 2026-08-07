const Organization = require("../models/organization");
const OrganizationInvitation = require("../models/organizationInvitation");
const PlatformAudit = require("../models/platformAudit");
const User = require("../models/user");
const { assertLicenseCapacity, currentLicenseCapacity, withSession } = require("./licenseCapacity");
const { reserveLicensedCapacity } = require("./licensedCapacityOperations");
const {
  createInvitation,
  deliverInvitation,
  normalizeInvitationEmail,
  ORGANIZATION_INVITE_ROLES,
} = require("./organizationInvitations");
const { consumeGrant } = require("./organizationPasskeys");
const { normalizePropertyEmails } = require("./propertyEmails");
const { sendSystemEmail } = require("./systemEmail");
const { normalizeOrganizationUserClassification } = require("./organizationUserClassification");

const MAX_CSV_BYTES = 512 * 1024;
const MAX_IMPORT_ROWS = 250;
const IMPORT_TYPES = new Set(["users", "properties"]);
const INVITATION_DELIVERY_CONCURRENCY = 5;

function bulkError(message, status = 400, code = "BULK_ONBOARDING_INVALID") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function parseCsv(value) {
  const csv = String(value || "").replace(/^\uFEFF/, "");
  if (!csv.trim()) throw bulkError("Choose a non-empty CSV file.");
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) {
    throw bulkError("CSV files must be 512 KB or smaller.", 413, "BULK_ONBOARDING_FILE_TOO_LARGE");
  }

  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw bulkError("The CSV contains an unterminated quoted value.");
  record.push(field.replace(/\r$/, ""));
  records.push(record);

  const nonEmptyRecords = records.filter((row) => row.some((cell) => String(cell).trim()));
  if (nonEmptyRecords.length < 2) throw bulkError("The CSV must include a header and at least one data row.");
  if (nonEmptyRecords.length - 1 > MAX_IMPORT_ROWS) {
    throw bulkError(`Import no more than ${MAX_IMPORT_ROWS} rows at a time.`, 413, "BULK_ONBOARDING_TOO_MANY_ROWS");
  }
  const headers = nonEmptyRecords[0].map((header) => String(header).trim().toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, ""));
  if (headers.some((header) => !header)) throw bulkError("Every CSV column needs a header.");
  if (new Set(headers).size !== headers.length) throw bulkError("CSV headers must be unique.");

  return nonEmptyRecords.slice(1).map((cells, index) => {
    const values = {};
    headers.forEach((header, columnIndex) => {
      values[header] = String(cells[columnIndex] || "").trim();
    });
    return {
      rowNumber: index + 2,
      values,
      structuralErrors: cells.length > headers.length
        ? ["This row has more values than the header defines."]
        : [],
    };
  });
}

function splitPipeList(value) {
  return [...new Set(String(value || "").split("|").map((entry) => entry.trim()).filter(Boolean))];
}

function normalizeCoordinate(value, minimum, maximum, label, errors) {
  if (String(value || "").trim() === "") return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    errors.push(`${label} must be between ${minimum} and ${maximum}.`);
    return undefined;
  }
  return number;
}

async function leanQuery(query, session) {
  const scoped = withSession(query, session);
  return typeof scoped.lean === "function" ? scoped.lean() : scoped;
}

function propertyPreviewRows({ organization, parsedRows }) {
  const existingNames = new Set((organization.properties || []).map((property) =>
    String(property.name || "").trim().toLowerCase()));
  const existingCodes = new Set((organization.properties || []).map((property) =>
    String(property.propertyCode || "").trim().toLowerCase()).filter(Boolean));
  const importNames = new Set();
  const importCodes = new Set();
  const isCommercial = organization.orgType === "COM";

  return parsedRows.map(({ rowNumber, values, structuralErrors }) => {
    const errors = [...structuralErrors];
    const name = String(values.name || "").replace(/\s+/g, " ").trim();
    const nameKey = name.toLowerCase();
    const propertyCode = String(values.property_code || "").trim();
    const propertyCodeKey = propertyCode.toLowerCase();
    if (!name) errors.push("Property name is required.");
    if (name && (existingNames.has(nameKey) || importNames.has(nameKey))) {
      errors.push("Property name already exists in this organization or file.");
    }
    if (name) importNames.add(nameKey);
    if (isCommercial && !propertyCode) errors.push("Property code is required for commercial properties.");
    if (isCommercial && !String(values.physical_address || "").trim()) {
      errors.push("Physical address is required for commercial properties.");
    }
    if (isCommercial && !String(values.billing_address || "").trim()) {
      errors.push("Billing address is required for commercial properties.");
    }
    if (propertyCode && (existingCodes.has(propertyCodeKey) || importCodes.has(propertyCodeKey))) {
      errors.push("Property code already exists in this organization or file.");
    }
    if (propertyCode) importCodes.add(propertyCodeKey);
    const latitude = normalizeCoordinate(values.latitude, -90, 90, "Latitude", errors);
    const longitude = normalizeCoordinate(values.longitude, -180, 180, "Longitude", errors);
    if ((latitude === undefined) !== (longitude === undefined)
      && (String(values.latitude || "").trim() || String(values.longitude || "").trim())) {
      errors.push("Latitude and longitude must be supplied together.");
    }
    let emails = [];
    try {
      emails = normalizePropertyEmails(splitPipeList(values.inspection_recipient_emails));
    } catch (error) {
      errors.push(error.message);
    }
    return {
      rowNumber,
      errors,
      data: {
        name,
        propertyCode,
        physicalAddress: String(values.physical_address || "").trim(),
        billingAddress: String(values.billing_address || "").trim(),
        region: String(values.region || "Uncategorized").trim() || "Uncategorized",
        lat: latitude,
        lng: longitude,
        emails,
      },
    };
  });
}

async function userPreviewRows({ organization, parsedRows, UserModel, InvitationModel, session, now }) {
  const baseRows = parsedRows.map(({ rowNumber, values, structuralErrors }) => {
    const errors = [...structuralErrors];
    let email = "";
    try {
      email = normalizeInvitationEmail(values.email);
    } catch (error) {
      errors.push(error.message);
    }
    const requestedRole = String(values.role || "").trim().toLowerCase();
    let classification = { role: requestedRole, engagementType: null };
    if (requestedRole === "admin") {
      errors.push("Administrator invitations must use the dedicated administrator workflow.");
    } else if (!ORGANIZATION_INVITE_ROLES.has(requestedRole)) {
      errors.push("Select a supported user role.");
    } else {
      try {
        classification = normalizeOrganizationUserClassification({
          role: requestedRole,
          engagementType: values.engagement_type,
        });
      } catch (error) {
        errors.push(error.message);
      }
    }
    const requestedProperties = splitPipeList(values.property_names);
    const propertyByName = new Map((organization.properties || []).map((property) => [
      String(property.name || "").trim().toLowerCase(),
      property,
    ]));
    const propertyIds = [];
    if (["property_manager", "client"].includes(classification.role)) {
      for (const propertyName of requestedProperties) {
        const property = propertyByName.get(propertyName.toLowerCase());
        if (!property) errors.push(`Property not found: ${propertyName}.`);
        else propertyIds.push(property._id);
      }
    } else if (requestedProperties.length) {
      errors.push("Property assignments are only available for property managers and property owners.");
    }
    return {
      rowNumber,
      errors,
      data: {
        email,
        role: classification.role,
        engagementType: classification.engagementType,
        propertyIds,
        propertyNames: requestedProperties,
      },
    };
  });

  const seenEmails = new Set();
  for (const row of baseRows) {
    if (!row.data.email) continue;
    if (seenEmails.has(row.data.email)) row.errors.push("Email appears more than once in this file.");
    seenEmails.add(row.data.email);
  }
  const emails = [...seenEmails];
  if (emails.length) {
    const [existingUsers, pendingInvitations] = await Promise.all([
      leanQuery(UserModel.find({ email: { $in: emails } }).select("email"), session),
      leanQuery(InvitationModel.find({
        email: { $in: emails },
        status: "pending",
        expiresAt: { $gt: now },
      }).select("email organizationId"), session),
    ]);
    const existingUserEmails = new Set(existingUsers.map((entry) => String(entry.email).toLowerCase()));
    const pendingEmails = new Set(pendingInvitations.map((entry) => String(entry.email).toLowerCase()));
    for (const row of baseRows) {
      if (existingUserEmails.has(row.data.email)) row.errors.push("Email already belongs to an Afterlight account.");
      if (pendingEmails.has(row.data.email)) row.errors.push("A pending invitation already exists for this email.");
    }
  }
  return baseRows;
}

async function previewBulkOnboarding({
  organization,
  type,
  csv,
  now = new Date(),
  session,
  UserModel = User,
  InvitationModel = OrganizationInvitation,
}) {
  if (!organization?._id) throw bulkError("Organization not found.", 404, "ORGANIZATION_NOT_FOUND");
  if (!IMPORT_TYPES.has(type)) throw bulkError("Choose users or properties for this import.");
  const parsedRows = parseCsv(csv);
  const rows = type === "properties"
    ? propertyPreviewRows({ organization, parsedRows })
    : await userPreviewRows({ organization, parsedRows, UserModel, InvitationModel, session, now });
  const dimension = type === "properties" ? "properties" : "users";
  const capacity = await currentLicenseCapacity({ organization, UserModel, InvitationModel, session, now });
  let capacityError = null;
  try {
    assertLicenseCapacity({ summary: capacity, dimension, additional: rows.length });
  } catch (error) {
    capacityError = {
      code: error.code,
      error: error.message,
      remaining: error.remaining,
      requested: error.requested,
    };
  }
  return {
    type,
    rowCount: rows.length,
    validRowCount: rows.filter((row) => !row.errors.length).length,
    rows,
    capacity,
    capacityError,
    canCommit: rows.every((row) => !row.errors.length) && !capacityError,
  };
}

async function deliverPreparedInvitations({
  prepared,
  organization,
  deliverInvitationEmail,
  sendEmail,
  concurrency = INVITATION_DELIVERY_CONCURRENCY,
}) {
  const deliveries = new Array(prepared.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < prepared.length) {
      const index = nextIndex;
      nextIndex += 1;
      const entry = prepared[index];
      let delivered = true;
      try {
        await deliverInvitationEmail({
          invitation: entry.invitation,
          organization,
          token: entry.token,
          sendEmail,
        });
      } catch (error) {
        delivered = false;
        console.error("Bulk invitation email delivery error:", error.message);
      }
      deliveries[index] = { email: entry.invitation.email, delivered };
    }
  }
  const workerCount = Math.min(Math.max(1, concurrency), prepared.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return deliveries;
}

async function commitBulkOnboarding({
  organizationId,
  type,
  csv,
  actorUserId,
  adminActionGrant,
  ipAddress = "",
  userAgent = "",
  now = new Date(),
  OrganizationModel = Organization,
  UserModel = User,
  InvitationModel = OrganizationInvitation,
  PlatformAuditModel = PlatformAudit,
  consumeAdminGrant = consumeGrant,
  createInvitationRecord = createInvitation,
  deliverInvitationEmail = deliverInvitation,
  sendEmail = sendSystemEmail,
  reserveCapacity = reserveLicensedCapacity,
}) {
  const organization = await OrganizationModel.findById(organizationId);
  if (!organization) throw bulkError("Organization not found.", 404, "ORGANIZATION_NOT_FOUND");
  const initialPreview = await previewBulkOnboarding({ organization, type, csv, now, UserModel, InvitationModel });
  if (!initialPreview.canCommit) {
    const error = bulkError("Resolve the import validation issues before continuing.", 422, "BULK_VALIDATION_FAILED");
    error.preview = initialPreview;
    throw error;
  }

  const dimension = type === "properties" ? "properties" : "users";
  const transactionResult = await reserveCapacity({
    organizationId,
    dimension,
    additional: initialPreview.rowCount,
    actorUserId,
    now,
    OrganizationModel,
    capacityOptions: { UserModel, InvitationModel },
    work: async ({ organization: currentOrganization, session }) => {
      const grantAccepted = await consumeAdminGrant({
        organization: currentOrganization,
        userId: actorUserId,
        purpose: "bulk_onboarding",
        token: adminActionGrant,
        session,
      });
      if (!grantAccepted) {
        throw bulkError("Administrative verification expired or was already used.", 403, "ADMIN_GRANT_INVALID");
      }
      const preview = await previewBulkOnboarding({
        organization: currentOrganization,
        type,
        csv,
        now,
        session,
        UserModel,
        InvitationModel,
      });
      if (!preview.canCommit) {
        const error = bulkError("The organization changed after preview. Review the CSV again.", 409, "BULK_PREVIEW_STALE");
        error.preview = preview;
        throw error;
      }

      const prepared = [];
      if (type === "properties") {
        for (const row of preview.rows) {
          currentOrganization.properties.push({
            ...row.data,
            propertyManagers: [],
            clientOwners: [],
          });
        }
      } else {
        for (const row of preview.rows) {
          prepared.push(await createInvitationRecord({
            organization: currentOrganization,
            email: row.data.email,
            role: row.data.role,
            engagementType: row.data.engagementType,
            propertyIds: row.data.propertyIds,
            invitedBy: actorUserId,
            inviterScope: "organization",
            deliver: false,
            session,
            InvitationModel,
            UserModel,
            now,
          }));
        }
      }
      await PlatformAuditModel.create([{
        actorUserId,
        action: type === "properties" ? "organization_properties_bulk_imported" : "organization_users_bulk_invited",
        targetOrganizationId: currentOrganization._id,
        metadata: { rowCount: preview.rowCount },
        ipAddress,
        userAgent,
      }], { session });
      return { preview, prepared };
    },
  });

  const deliveries = await deliverPreparedInvitations({
    prepared: transactionResult.value.prepared,
    organization: transactionResult.organization,
    deliverInvitationEmail,
    sendEmail,
  });
  return {
    type,
    imported: transactionResult.value.preview.rowCount,
    deliveries,
    capacity: await currentLicenseCapacity({
      organization: transactionResult.organization,
      UserModel,
      InvitationModel,
      now,
    }),
  };
}

module.exports = {
  IMPORT_TYPES,
  MAX_CSV_BYTES,
  MAX_IMPORT_ROWS,
  bulkError,
  commitBulkOnboarding,
  deliverPreparedInvitations,
  parseCsv,
  previewBulkOnboarding,
  propertyPreviewRows,
  splitPipeList,
};
