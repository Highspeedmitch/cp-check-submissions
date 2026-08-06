# Review service plan change requests

Platform administrators review organization requests to change a service model, increase a SaaS or Hybrid license tier, or add custom Tier 3 administrator capacity. Organization administrators cannot apply these contract changes themselves.

## Open the review queue

1. Sign in to **Platform Administration**.
2. Select **Service Plan Requests**.
3. Open an active request and review:
   - whether it is a service-model, tier-increase, or custom-capacity request;
   - the organization and requesting administrator;
   - current and requested plan;
   - requested effective date and business reason;
   - administrator, user, and property capacity before and after approval;
   - current allocated users and administrators; and
   - conversation history and notification warnings.

The request email links back to Platform Administration, but the in-app queue is the system of record.

## Approve a service-model request

Use **Approve and apply** only after confirming the contract, pricing, operational capacity, requested tier, and timing.

Approval takes effect immediately. Afterlight:

- changes the organization's service model;
- applies the explicitly requested tier for SaaS or Hybrid, or clears tier limits for Managed service;
- selects the service model's standard fulfillment default;
- clears property-level fulfillment overrides;
- increments the fulfillment policy version;
- records platform and fulfillment audit events; and
- alerts the requesting administrator.

Existing assignments and invoices keep their saved fulfillment and billing routing.

## Approve a tier-increase request

Confirm that the organization is still on the service model and tier recorded when the request was submitted. Approval immediately applies the requested standard tier and its administrator, user, and property limits.

A tier approval does not change fulfillment policy, property overrides, existing assignments, or invoices. Existing organization-specific capacity overrides that exceed the new tier standard are retained so an upgrade cannot reduce capacity. The approval records the previous and applied tier and capacity in the platform audit trail and alerts the requester.

## Approve a custom administrator-capacity request

Confirm that the organization is still on Tier 3 and that the requested administrator-seat limit remains greater than its current limit. Approval changes only the administrator-seat limit. It retains the service model, Tier 3 designation, user and property limits, fulfillment policy, property overrides, assignments, and invoices.

The approval and applied capacity are recorded in the platform audit trail, and the requesting administrator is alerted.

## Request more information

Enter a specific question in **Platform response**, then select **Request more information**. The requester responds from the organization's **Service Delivery** page. Their response returns the request to pending review and alerts active platform administrators.

## Deny

Enter the reason in **Platform response**, then select **Deny**. No organization policy or license is changed. The requester receives the decision and response in Afterlight and by push or email when available.

## Review safeguards

- Only one active service-plan request is allowed per organization.
- A request cannot be approved if the organization's service model or source tier changed after submission.
- Tier increases are accepted only for SaaS and Hybrid and must target a higher standard tier.
- Custom administrator capacity is accepted only for Tier 3 SaaS and Hybrid organizations and must be greater than the current administrator limit.
- Service-model changes into SaaS or Hybrid require an explicit tier.
- Denial and information requests require a written platform response.
- Direct organization-admin service-model, tier, and custom-capacity changes remain rejected by the API.
- Proposed effective dates are planning requests; approval currently applies immediately.

## Notification behavior

New requests and information supplied by an organization alert active platform administrators. Information requests, approvals, and denials alert the organization administrator who opened the request. If push or email delivery fails, the error does not discard the in-app workflow.

[Back to the knowledge base](README.md)
