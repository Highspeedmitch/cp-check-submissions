# Afterlight Resources and Gusto Payables

Afterlight contractors use the same authentication system as every other user, but their identity is not copied into customer organizations. A hidden `afterlight_workforce` organization acts only as the authentication home for these accounts. Tenant access is granted through explicit resource deployments.

## Implemented data boundaries

- `User` is the shared login identity. The active session `accountScope` routes the user, while a linked `ResourceProfile` grants Resource Portal entitlement. A user with both organization membership and a resource profile can switch workspaces without a second account.
- `ResourceProfile` is the Afterlight-owned worker record, including status, availability, skills, regions, rate, and non-sensitive Gusto references.
- `ResourceDeployment` makes one resource eligible for a managed or hybrid customer organization. It may cover all properties or a selected property list and may override the resource's default rate.
- `Assignment` references the selected resource and deployment. It snapshots the agreed per-assignment compensation so later profile or deployment rate changes cannot rewrite historical pay.
- `ContractorEarning` is created idempotently when a contractor inspection is completed. It starts in `pending_approval` and is separate from any customer invoice generated from the same submission.
- `ContractorPayoutBatch` groups approved earnings by resource, snapshots the Gusto matching email, and tracks the check date, submission reference, and reconciliation state. An optional contractor UUID remains available for a future approved API integration.

Afterlight does not store bank accounts, tax identification numbers, W-9 data, or direct-deposit details.

## Operational workflow

1. A platform administrator adds a resource from **Platform > Resources & Payables**.
2. If the email already belongs to an eligible submitter, Afterlight links the resource profile to that identity. Otherwise, the contractor accepts a normal invitation and their login uses the hidden Afterlight workforce organization as its authentication home.
3. The platform administrator onboards the contractor in Gusto. The matching email and onboarding state drive the manual workflow; the optional UUID is reserved for a future approved API connection.
4. The resource can be activated only after the Afterlight account exists and Gusto onboarding is marked complete.
5. The platform administrator deploys the resource to an eligible managed or hybrid organization and optionally limits the deployment to selected properties.
6. An organization administrator or property manager sees the resource in the scheduler only when the selected fulfillment source is **Afterlight contractor**, the deployment is active, and the selected property is in scope.
7. Creating an assignment snapshots the effective default or deployment-specific rate.
8. The contractor opens or switches into the Resource Portal and submits the inspection through that exact assignment. Cross-tenant property access is authorized by the assignment, not by changing the user's organization membership.
9. Completed work creates a pending contractor earning. A platform administrator approves it independently of customer invoicing.
10. Approved earnings are grouped into a Gusto payout batch. After creating the matching contractor payment group in Gusto, the administrator records its UUID in Afterlight and marks it paid only after Gusto confirms funding.

## Current Gusto boundary

This first version implements the payable ledger and a controlled manual Gusto handoff. It does not make authenticated Gusto API calls. The platform matches contractors by email, uses the Afterlight batch number in Gusto's invoice field, and records a non-secret submission reference for reconciliation. Submission and payment confirmation happen in Gusto.

Gusto's normal employer product does not currently support customers directly connecting their own internal systems through the API. A future Embedded or partner integration would require Gusto approval, company-level OAuth authorization, rotating refresh tokens, and the approved runtime secret mechanism. Once that relationship and secure connection exist, the optional UUID fields can support automated contractor and payment matching without changing the earning ledger.

Official references:

- [Gusto contractor onboarding](https://docs.gusto.com/embedded-payroll/docs/onboard-a-contractor)
- [Gusto contractor management](https://docs.gusto.com/embedded-payroll/docs/manage-contractors)
- [Gusto contractor payment groups](https://docs.gusto.com/embedded-payroll/docs/process-contractor-payments)
- [Gusto authentication and authorization](https://docs.gusto.com/embedded-payroll/docs/authentication-and-authorization)

## State transitions

Resource profile:

`invited -> onboarding -> active -> suspended`

Deployment:

`active <-> paused -> ended`

Contractor earning:

`pending_approval -> approved -> payout_pending -> paid`

An earning may move from `pending_approval` or `approved` to `void`. Once it is in a payout batch, it cannot be voided through the platform workflow.

Payout batch:

`ready -> submitted -> paid`

Each transition is restricted to platform administrators and recorded in the platform audit collection.
