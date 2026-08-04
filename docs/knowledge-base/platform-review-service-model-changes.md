# Review service model change requests

Platform administrators review organization requests to move between Full-stack SaaS, Managed service, and Hybrid delivery. Organization administrators cannot apply these contract changes themselves.

## Open the review queue

1. Sign in to **Platform Administration**.
2. Select **Service Model Requests**.
3. Open an active request and review:
   - the organization and requesting administrator;
   - current and requested service models;
   - requested effective date;
   - business reason and conversation history;
   - property count, existing property overrides, current fulfillment default, and policy version.

The request email links back to Platform Administration, but the in-app queue is the system of record.

## Choose a review action

### Approve and apply

Use **Approve and apply** only after the contract, pricing, operational capacity, and requested timing are confirmed. A response note is optional but recommended.

Approval takes effect immediately for future assignments. Afterlight:

- changes the organization's service model;
- selects that model's standard fulfillment default;
- clears all property-level fulfillment overrides;
- increments the fulfillment policy version;
- records platform and fulfillment audit events; and
- emails the requesting administrator.

Existing assignments and invoices keep their saved fulfillment and billing routing.

### Request more information

Enter a specific question in **Platform response**, then select **Request more information**. The requester receives an email and can respond from the organization's **Service Delivery** page. When they respond, the request returns to pending review and active platform administrators receive another email containing the latest update.

### Deny

Enter the reason in **Platform response**, then select **Deny**. No organization policy is changed. The requester receives the decision and response by email.

## Notification behavior

In DEV, system email is sent from `dev@afterlightinspections.com`. New and updated organization requests are sent to every active Afterlight user whose platform role is **platform administrator**. Decisions are sent to the organization administrator who opened the request.

If delivery fails, the error is recorded on the request without discarding the in-app workflow. Review the Platform Administration queue rather than relying on email alone.

## Review safeguards

- A request cannot be approved if the organization's service model changed after the request was submitted.
- Only one active request is allowed per organization.
- Denial and information requests require a written platform response.
- Direct organization-admin service model updates are rejected by the API even if the administrator has a valid organization passkey.
