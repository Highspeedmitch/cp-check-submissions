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

Afterlight records the request and alerts active platform administrators through the platform workflow, in-app notification, optional push, and email when delivery is available. The service model does not change while the request is under review.

## Follow the request status

- **Pending platform review:** Afterlight has the request and will review its contract and operational effects.
- **More information requested:** Afterlight alerts the requesting administrator. Read the response, enter the requested details, and select **Send information**. The request returns to the review queue and platform administrators are notified again.
- **Approved:** Afterlight alerts the requester and applies the new model. The approval applies to future assignments only.
- **Denied:** Afterlight alerts the requester without changing the model. Read the platform response for the reason or next step.

Only one active request can exist for an organization at a time. Previous decisions remain available under **Previous service model requests**.

## What approval changes

Approval immediately selects the standard fulfillment default for the approved service model and removes property-level fulfillment overrides so the organization starts from a consistent policy. Existing assignments, inspection submissions, invoices, and saved billing routes do not change.

If individual properties require different fulfillment after approval, update those property defaults separately in **Service Delivery**.

## Notification behavior

The in-app Service Delivery record is the system of record. Email and push are supplemental and may be unavailable in a lower environment or on a device that has not enabled notifications. If email or push delivery fails, the request and its current status remain available in Afterlight.

For help with device permission prompts, see [Enable and troubleshoot notifications](enable-notifications.md).

[Back to the knowledge base](README.md)
