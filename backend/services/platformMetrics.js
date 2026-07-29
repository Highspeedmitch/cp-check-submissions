const Organization = require("../models/organization");
const User = require("../models/user");
const Submission = require("../models/submission");
const BidRequest = require("../models/bidRequest");
const Invoice = require("../models/invoice");

function countMap(rows) {
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

async function getPlatformOrganizationMetrics({
  OrganizationModel = Organization,
  UserModel = User,
  SubmissionModel = Submission,
  BidRequestModel = BidRequest,
  InvoiceModel = Invoice,
  now = new Date(),
} = {}) {
  const recentCutoff = new Date(now);
  recentCutoff.setDate(recentCutoff.getDate() - 30);

  const [organizations, users, recentSubmissions, pendingBids, pendingInvoices] = await Promise.all([
    OrganizationModel.aggregate([{
      $project: {
        name: 1,
        orgType: 1,
        propertyCount: { $size: { $ifNull: ["$properties", []] } },
      },
    }, { $sort: { name: 1 } }]),
    UserModel.aggregate([{ $match: { accountStatus: { $ne: "inactive" } } }, {
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
  ]);

  const userCounts = countMap(users);
  const submissionCounts = countMap(recentSubmissions);
  const bidCounts = countMap(pendingBids);
  const invoiceCounts = countMap(pendingInvoices);
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
    }), {
      organizationCount: 0,
      activeUserCount: 0,
      propertyCount: 0,
      recentSubmissionCount: 0,
      pendingBidCount: 0,
      pendingInvoiceCount: 0,
    }),
    organizations: rows,
  };
}

module.exports = { getPlatformOrganizationMetrics };
