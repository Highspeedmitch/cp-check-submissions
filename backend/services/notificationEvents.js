function inspectionSubmitted(propertyName, submissionId) {
  return {
    type: "inspection_submitted",
    title: "Property inspection submitted",
    body: `A new inspection was submitted for ${propertyName}.`,
    route: `/admin/submissions/${encodeURIComponent(propertyName)}`,
    entityId: submissionId,
  };
}

function assignmentCompleted(propertyName, submissionId) {
  return {
    type: "assignment_completed",
    title: "Scheduled inspection completed",
    body: `The scheduled inspection for ${propertyName} was completed.`,
    route: `/admin/submissions/${encodeURIComponent(propertyName)}`,
    entityId: submissionId,
  };
}

function invoiceSubmitted(invoice) {
  return {
    type: "invoice_submitted",
    title: "Invoice submitted",
    body: `Your invoice for ${invoice.propertySnapshot.name} was submitted successfully.`,
    route: "/billing",
    entityId: invoice._id,
  };
}

function invoiceStatusChanged(invoice) {
  return {
    type: "invoice_status_changed",
    title: "Invoice status updated",
    body: `Your invoice for ${invoice.propertySnapshot.name} is now ${invoice.status}.`,
    route: "/billing",
    entityId: invoice._id,
  };
}

function bidRequestSubmitted(request) {
  return {
    type: "bid_request_submitted",
    title: "Bid request sent",
    body: `Your bid request for ${request.address} was sent successfully.`,
    route: "/bid-requests",
    entityId: request._id,
  };
}

function bidRequestReceived(request) {
  return {
    type: "bid_request_received",
    title: "New bid request received",
    body: `A new bid request was received for ${request.address}.`,
    route: "/bid-requests",
    entityId: request._id,
  };
}

function bidRequestStatusChanged(request) {
  return {
    type: "bid_request_status_changed",
    title: "Bid request updated",
    body: `Your bid for ${request.address} has a new status.`,
    route: "/bid-requests",
    entityId: request._id,
  };
}

module.exports = {
  inspectionSubmitted,
  assignmentCompleted,
  invoiceSubmitted,
  invoiceStatusChanged,
  bidRequestSubmitted,
  bidRequestReceived,
  bidRequestStatusChanged,
};
