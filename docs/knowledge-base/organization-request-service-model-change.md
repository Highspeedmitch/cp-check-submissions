# Request a service model change

Use this process when your organization wants to move between Full-stack SaaS, Managed service, or Hybrid delivery. A service model is a contracted setting, so organization administrators submit a request instead of changing it directly.

## Before you begin

You must be signed in as an organization administrator. Gather the business reason, desired timing, and any operational context that will help Afterlight review the request.

## Submit a request

1. From the organization dashboard, open **Service Delivery**.
2. Review the current model in the **Service model** section.
3. Under **Requested service model**, select the model your organization wants.
4. Optionally choose a **Proposed effective date**. This is a requested date, not a guaranteed activation date.
5. Enter the **Business reason and operational context**. Include affected properties, staffing needs, timing constraints, and the outcome you expect.
6. Select **Request service model change**.

Afterlight records the request and emails active platform administrators. The service model does not change while the request is under review.

## Follow the request status

- **Pending platform review:** Afterlight has the request and will review its contract and operational effects.
- **More information requested:** Read the Afterlight response, enter the requested details, and select **Send information**. The request returns to the review queue and platform administrators are notified again.
- **Approved:** Afterlight applied the new model. The approval applies to future assignments only.
- **Denied:** Afterlight did not apply the requested change. Read the platform response for the reason or next step.

Only one active request can exist for an organization at a time. Previous decisions remain available under **Previous service model requests**.

## What approval changes

Approval immediately selects the standard fulfillment default for the approved service model and removes property-level fulfillment overrides so the organization starts from a consistent policy. Existing assignments, inspection submissions, invoices, and saved billing routes do not change.

If individual properties require different fulfillment after approval, update those property defaults separately in **Service Delivery**.

## Email note

In the DEV environment, request notifications are sent by `dev@afterlightinspections.com` to the active platform administrator accounts configured in Afterlight. The in-app request remains available even if email delivery fails.
