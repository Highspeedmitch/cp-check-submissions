const Organization = require("../models/organization");
const User = require("../models/user");
const Submission = require("../models/submission");
const BidRequest = require("../models/bidRequest");
const Invoice = require("../models/invoice");
const OrganizationInvitation = require("../models/organizationInvitation");

function countMap(rows) {
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

async function getPlatformOrganizationMetrics({
  OrganizationModel = Organization,
  UserModel = User,
  SubmissionModel = Submission,
  BidRequestModel = BidRequest,
  InvoiceModel = Invoice,
  InvitationModel = OrganizationInvitation,
  now = new Date(),
} = {}) {
  const recentCutoff = new Date(now);
  recentCutoff.setDate(recentCutoff.getDate() - 30);

  const [organizations, users, recentSubmissions, pendingBids, pendingInvoices, pendingAdminInvitations] = await Promise.all([
    OrganizationModel.aggregate([{ $match: { workspaceType: { $ne: "afterlight_workforce" } } }, {
      $project: {
        name: 1,
        orgType: 1,
        propertyCount: { $size: { $ifNull: ["$properties", []] } },
      },
    }, { $sort: { name: 1 } }]),
    UserModel.aggregate([{ $match: { accountStatus: { $ne: "inactive" }, organizationArchivedAt: null } }, {
      $group: { _id: "$organizationId", count: { $sum: 1 } },
    }]),
    SubmissionModel.aggregate([{ $match: { submittedAt: { $gte: recentCutoff } } }, {
      $group: { _id: "$organizationId", count: { $sum: 1 } },
    }]),
    BidRequestModel.aggregate([{ $match: { status: "pending", archivedAt: null } }, {
      $group: { _id: "$organizationId", count: { $sum: 1 } },
    }]),
    InvoiceModel.aggregate([{ $match: {
      status: { $in: ["pending_review", "approving", "failed"] },
      archivedAt: null,
    } }, {
      $group: { _id: "$organizationId", count: { $sum: 1 } },
    }]),
    InvitationModel.aggregate([{ $match: {
      role: "admin",
      status: { $in: ["pending", "expired"] },
    } }, { $sort: { createdAt: -1 } }, { $group: {
      _id: "$organizationId",
      invitationId: { $first: "$_id" },
      email: { $first: "$email" },
      expiresAt: { $first: "$expiresAt" },
      status: { $first: "$status" },
    } }]),
  ]);

  const userCounts = countMap(users);
  const submissionCounts = countMap(recentSubmissions);
  const bidCounts = countMap(pendingBids);
  const invoiceCounts = countMap(pendingInvoices);
  const adminInvitations = new Map(pendingAdminInvitations.map((row) => [String(row._id), {
    invitationId: String(row.invitationId),
    email: row.email,
    expiresAt: row.expiresAt,
    status: row.status === "expired" || new Date(row.expiresAt) <= now ? "expired" : "pending",
  }]));
  const rows = organizations.map((organization) => {
    const id = String(organization._id);
    return {
      organizationId: id,
      name: organization.name,
      orgType: organization.orgType,
      propertyCount: organization.propertyCount || 0,
      activeUserCount: userCounts.get(id) || 0,
      recentSubmissionCount: submissionCounts.get(id) || 0,
      pendingBidCount: bidCounts.get(id) || 0,
      pendingInvoiceCount: invoiceCounts.get(id) || 0,
      pendingAdminInvitation: adminInvitations.get(id) || null,
    };
  });

  return {
    summary: rows.reduce((summary, row) => ({
      organizationCount: summary.organizationCount + 1,
      activeUserCount: summary.activeUserCount + row.activeUserCount,
      propertyCount: summary.propertyCount + row.propertyCount,
      recentSubmissionCount: summary.recentSubmissionCount + row.recentSubmissionCount,
      pendingBidCount: summary.pendingBidCount + row.pendingBidCount,
      pendingInvoiceCount: summary.pendingInvoiceCount + row.pendingInvoiceCount,
      pendingAdminInviteCount: summary.pendingAdminInviteCount + (row.pendingAdminInvitation ? 1 : 0),
    }), {
      organizationCount: 0,
      activeUserCount: 0,
      propertyCount: 0,
      recentSubmissionCount: 0,
      pendingBidCount: 0,
      pendingInvoiceCount: 0,
      pendingAdminInviteCount: 0,
    }),
    organizations: rows,
  };
}

module.exports = { getPlatformOrganizationMetrics };
