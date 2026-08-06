# Request a service plan change

Use this process when your organization wants to move between Full-stack SaaS, Managed service, or Hybrid delivery, or when a SaaS or Hybrid organization needs a higher license tier. These are contracted settings, so organization administrators submit a request instead of changing them directly.

## Before you begin

You must be signed in as an organization administrator. Gather the business reason, desired timing, and any operational or portfolio-growth context that will help Afterlight review the request.

Only one active service-plan request can exist for an organization at a time.

## Request a service model change

1. From the organization dashboard, open **Service Delivery**.
2. Review the current plan in the **Service plan** section.
3. Under **Change service model**, select the requested model.
4. If the requested model is Full-stack SaaS or Hybrid, select its requested license tier.
5. Optionally choose a requested effective date. This is a planning request, not a guaranteed activation date.
6. Enter the business reason and operational context.
7. Select **Request service model change**.

Afterlight records the request and alerts active platform administrators. The service model, license, and fulfillment policy do not change while the request is under review.

## Request a higher license tier

The **Increase license tier** section appears only for Full-stack SaaS and Hybrid organizations.

1. Review the current tier and its administrator, user, and property capacity.
2. Select one of the higher available tiers.
3. Optionally choose a requested effective date.
4. Enter the expected growth, current capacity need, and requested timing.
5. Select **Request tier increase**.

Tier 1 organizations can request Tier 2 or Tier 3. Tier 2 organizations can request Tier 3. For Hybrid organizations, the tier choices also show the contracted monthly portfolio minimum assigned to Afterlight: 15% for Tier 1, 12% for Tier 2, and 10% for Tier 3. Managed-service organizations do not see tier controls.

## Request custom Tier 3 administrator capacity

When all Tier 3 administrator seats are allocated:

1. Open **Users** from the organization dashboard.
2. In **Administrator seats**, select **Request Additional License**.
3. Enter the requested administrator-seat capacity.
4. Optionally choose a requested effective date.
5. Enter the business reason and capacity context.
6. Select **Submit request**.

The request appears in the same Service Plan Requests queue. It does not change capacity until Afterlight approves it.

## Follow the request status

- **Pending platform review:** Afterlight has the request and will review its contract, pricing, and operational effects.
- **More information requested:** Read the Afterlight response, enter the requested details, and select **Send information**. The request returns to the platform queue.
- **Approved:** Afterlight applies the requested model and tier, standard tier increase, or custom administrator capacity, then alerts the requester.
- **Denied:** Nothing changes. Read the platform response for the reason or next step.

Previous decisions remain available under **Previous service plan requests**.

## What approval changes

A service-model approval takes effect immediately, establishes an explicit tier when the destination is SaaS or Hybrid, selects the standard fulfillment default, and removes property-level fulfillment overrides. Existing assignments, inspection submissions, invoices, and saved billing routes do not change.

A tier-increase approval takes effect immediately and increases licensed administrator, user, and property capacity. It does not change the service model, fulfillment policy, property overrides, assignments, or invoices.

A custom-capacity approval changes only the Tier 3 administrator-seat limit. It retains the service model, Tier 3 designation, user and property limits, fulfillment policy, property overrides, assignments, and invoices.

## Notification behavior

The in-app Service Delivery record is the system of record. Email and push are supplemental and may be unavailable in a lower environment or on a device that has not enabled notifications. If external delivery fails, the request and status remain available in Afterlight.

For help with device permission prompts, see [Enable and troubleshoot notifications](enable-notifications.md).

[Back to the knowledge base](README.md)
