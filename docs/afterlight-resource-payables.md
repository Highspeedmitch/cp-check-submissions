# Afterlight Resources and Gusto Payables

Afterlight contractors use the same authentication system as every other user, but their identity is not copied into customer organizations. A hidden `afterlight_workforce` organization acts only as the authentication home for these accounts. Tenant access is granted through explicit resource deployments.

## Implemented data boundaries

- `User` is the shared login identity. `accountScope: afterlight_resource` routes a contractor to the resource workspace.
- `ResourceProfile` is the Afterlight-owned worker record, including status, availability, skills, regions, rate, and non-sensitive Gusto references.
- `ResourceDeployment` makes one resource eligible for a managed or hybrid customer organization. It may cover all properties or a selected property list and may override the resource's default rate.
- `Assignment` references the selected resource and deployment. It snapshots the agreed per-assignment compensation so later profile or deployment rate changes cannot rewrite historical pay.
- `ContractorEarning` is created idempotently when a contractor inspection is completed. It starts in `pending_approval` and is separate from any customer invoice generated from the same submission.
- `ContractorPayoutBatch` groups approved earnings by Gusto contractor UUID and tracks the check date, Gusto payment-group UUID, and reconciliation state.

Afterlight does not store bank accounts, tax identification numbers, W-9 data, or direct-deposit details.

## Operational workflow

1. A platform administrator invites a resource from **Platform > Resources & Payables**.
2. The contractor accepts the normal Afterlight invitation. Their login remains attached to the Afterlight workforce scope, not to a customer tenant.
3. The platform administrator onboards the contractor in Gusto. The Gusto contractor UUID and onboarding state are recorded on the resource profile.
4. The resource can be activated only after the Afterlight account exists and Gusto onboarding is marked complete.
5. The platform administrator deploys the resource to an eligible managed or hybrid organization and optionally limits the deployment to selected properties.
6. An organization administrator or property manager sees the resource in the scheduler only when the selected fulfillment source is **Afterlight contractor**, the deployment is active, and the selected property is in scope.
7. Creating an assignment snapshots the effective default or deployment-specific rate.
8. The contractor signs into the resource workspace and submits the inspection through that exact assignment. Cross-tenant property access is authorized by the assignment, not by changing the user's organization.
9. Completed work creates a pending contractor earning. A platform administrator approves it independently of customer invoicing.
10. Approved earnings are grouped into a Gusto payout batch. After creating the matching contractor payment group in Gusto, the administrator records its UUID in Afterlight and marks it paid only after Gusto confirms funding.

## Current Gusto boundary

This first version implements the payable ledger and a controlled Gusto handoff. It does not yet make authenticated Gusto API calls. The platform stores only Gusto contractor and payment-group UUIDs; submission and funding confirmation happen in Gusto and are reconciled in Afterlight.

Gusto's embedded payroll API uses company-level OAuth authorization with rotating refresh tokens. Those credentials must be configured through the approved runtime secret mechanism before automating the handoff. Once partner credentials and a company connection are available, the `ready -> submitted` transition can call Gusto's contractor payment-group API and persist the returned group UUID. The existing batch and earning state model does not need to change.

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
