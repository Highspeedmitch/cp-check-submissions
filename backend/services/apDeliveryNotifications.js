const Organization = require("../models/organization");
const User = require("../models/user");
const { invoiceApDeliveryChanged } = require("./notificationEvents");
const {
  notifyPlatformAdministrators,
  sendUserNotification,
} = require("./notifications");
const { isAfterlightServiceInvoice } = require("./serviceBilling");

async function assignedPropertyManagers(
  invoice,
  organizationId,
  { OrganizationModel = Organization, UserModel = User } = {}
) {
  const organization = await OrganizationModel.findById(organizationId)
    .select("properties._id properties.propertyManagers")
    .lean();
  const property = (organization?.properties || []).find(
    (item) => item._id.toString() === invoice.propertyId.toString()
  );
  const assignedIds = [...new Set(
    (property?.propertyManagers || []).map((id) => id.toString())
  )];
  if (!assignedIds.length) return [];

  return UserModel.find({
    _id: { $in: assignedIds },
    organizationId,
    role: "property_manager",
    accountStatus: { $ne: "inactive" },
    organizationArchivedAt: null,
  }).select("_id username email").lean();
}

async function notifyApDeliveryState(invoice, status, {
  findManagers = assignedPropertyManagers,
  notifyPlatform = notifyPlatformAdministrators,
  notifyUser = sendUserNotification,
} = {}) {
  const organizationId = invoice.organizationId;
  const event = invoiceApDeliveryChanged(invoice, status);
  if (isAfterlightServiceInvoice(invoice)) {
    return notifyPlatform({
      event,
      contextOrganizationId: organizationId,
    });
  }
  const managers = await findManagers(invoice, organizationId);
  const recipientIds = new Set(managers.map((manager) => String(manager._id)));
  if (invoice.submitterId) recipientIds.add(String(invoice.submitterId));
  return Promise.allSettled([...recipientIds].map((userId) =>
    notifyUser({
      organizationId,
      userId,
      ...event,
    })
  ));
}

module.exports = {
  assignedPropertyManagers,
  notifyApDeliveryState,
};
