# Production release runbook

This runbook promotes the tested `develop` revision without copying DEV data into
Production. Production organizations, identities, billing settings, and secrets
remain production-owned data.

## 1. Release prerequisites

Before merging or deploying, record the exact `develop` commit and confirm:

- the QA checklist is complete or every exception has an owner and disposition;
- Production MongoDB has a current restorable backup;
- the Production platform administrator
  `mitch@afterlightinspections.com` is active and has `platformRole=platform_admin`;
- the API web service and inspection worker will use the same commit;
- Node.js 24 is selected for backend and frontend builds;
- the API health check is `GET /health` and expects HTTP 200 with
  `{"status":"ok","service":"afterlight-api"}`;
- the Production frontend and API HTTPS origins are known;
- the inspection queue has no unexpectedly stuck `processing` jobs before the
  cutover.

Do not import the DEV database. In particular, do not copy DEV users,
invitations, notification subscriptions, invoices, earnings, payout batches,
inspection jobs, or S3 object references.

## 2. Backend configuration

Required to start safely in Production:

- `NODE_ENV=production`
- `JWT_SECRET`
- `MONGO_URI`
- `S3_BUCKET_NAME`
- `AWS_REGION`
- `ADMIN_PASSKEY`
- `ADD_PROPERTY_PASSKEY`
- `REMOVE_PROPERTY_PASSKEY`
- `FRONTEND_URL` set to the exact Production frontend origin, without a path
- `INVITE_ONLY_REGISTRATION=true`

Configure `FRONTEND_ORIGINS` only when additional trusted frontend origins are
needed. It is a comma-separated list; `FRONTEND_URL` is included automatically.

Production workflow capabilities also require:

- S3 credentials or an attached AWS identity with `s3:PutObject`,
  `s3:GetObject`, and `s3:DeleteObject` on the inspection bucket;
- `SES_REGION`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`, and a verified
  `SYSTEM_EMAIL_ADDRESS`; add `SES_SESSION_TOKEN` only for temporary SES
  credentials;
- `SES_AP_CONFIGURATION_SET` and `SES_EVENT_TOPIC_ARN` from the environment's
  SES AP delivery event stack to record final delivery, delay, bounce, and
  complaint state;
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` for PWA push;
- `INSPECTION_FALLBACK_EMAIL` or `SYSTEM_EMAIL_ADDRESS` for inspection routing.

Keep the VAPID key pair stable after launch. Rotating it forces browsers and
installed PWAs to subscribe again.

Optional identity controls:

- set `TOTP_MFA_ENABLED=true` with a base64-encoded 32-byte
  `MFA_ENCRYPTION_KEY` to enable TOTP;
- set `OKTA_ISSUER`, `OKTA_CLIENT_IDS`, and `OKTA_ENFORCEMENT_ENABLED` only when
  the matching Production Okta application is ready.

Firebase credentials are not required for PWA Web Push. The current Gusto
handoff is manual and does not require a Gusto API credential.

## 3. Frontend configuration

Build the Production frontend with:

- `REACT_APP_API_ORIGIN` set to the exact Production API origin;
- `REACT_APP_DEPLOY_ENV=production`;
- `REACT_APP_ALLOW_PUBLIC_REGISTRATION=false`;
- `REACT_APP_MAPBOX_ACCESS_TOKEN` set to a Production-authorized token.

If Okta sign-in is enabled, also set `REACT_APP_OKTA_ISSUER`,
`REACT_APP_OKTA_CLIENT_ID`, and `REACT_APP_OKTA_LOGIN_ENABLED=true`. The Okta
application must allow the Production `/login/callback` redirect URI.

The S3 bucket CORS policy must allow browser `POST` requests from the exact
Production frontend origin. Verify the versioned inspection upload CORS rule for the configured S3 bucket before smoke testing photo submission. See [inspection-processing.md](inspection-processing.md).

## 4. Preconfigure Production organizations

The source-controlled manifest is
`backend/config/productionOrganizations.js`. It currently declares Picor as a
Managed Service organization with `afterlight_staff` as its default fulfillment
source. The operation only updates an existing organization; it refuses to
create a similarly named Production tenant.

From the backend service environment, preview the plan first:

```powershell
npm run configure-production-organizations
```

The dry run connects to the configured database but performs no writes. Review
the organization name, previous values, next values, policy-version increment,
and count of property-level overrides to be cleared.

To apply the reviewed plan, set both write guards in the Production service
environment and pass `--apply`:

```powershell
$env:NODE_ENV = "production"
$env:CONFIRM_PRODUCTION_ORGANIZATION_CONFIGURATION = "I_UNDERSTAND_THIS_CHANGES_PRODUCTION"
npm run configure-production-organizations -- --apply
```

The apply operation is idempotent and creates both fulfillment and platform
audit records when it changes Picor. It records that fulfillment changes affect
future assignments only. Remove the confirmation variable after use.

## 5. Retire historical organization access

AzRoots, HSLD, and Breezykeyzy are retained historical organizations in
`backend/config/productionOrganizationLicenses.js`. Their organizations,
properties, users, assignments, submissions, reports, invoices, and audit
records remain in Production, but their organization memberships must be
archived before the license manifest can be applied.

Preview the exact membership and blocker inventory:

```powershell
npm run retire-production-historical-access
```

The command is dry-run-only unless `--apply` is supplied. Current and future
scheduled assignments block the entire operation. Past-due assignments that
are still marked `scheduled` are reported separately and changed to `canceled`
inside the retirement transaction, preserving the records while correcting
their stale workflow state. Missing organizations, uploading/queued/processing
inspection jobs, pending/accepting invitations, active/paused resource
deployments, pending bid requests, and invoices requiring attention also block
the operation. Review every listed email, role, account scope, account status,
and stale-assignment count.

To apply the reviewed retirement, set all three write guards:

```powershell
$env:NODE_ENV = "production"
$env:CONFIRM_PRODUCTION_HISTORICAL_RETIREMENT = "I_UNDERSTAND_THIS_RETIRES_PRODUCTION_ORGANIZATION_ACCESS"
$env:PRODUCTION_HISTORICAL_RETIREMENT_VERSION = "2026-08-06-historical-access-retirement-v2"
npm run retire-production-historical-access -- --apply
```

The apply operation rebuilds the inventory inside a MongoDB transaction. It
archives every organization membership, including administrators, cancels only
past-due assignments that remain incorrectly marked `scheduled`, increments the
access-token version, revokes refresh sessions, and writes user and platform
audits. It preserves account status, platform role, Afterlight resource scope,
property assignments, and all historical business data. Re-running it is
idempotent. Remove both confirmation variables after use.

## 6. Configure Production licenses

The source-controlled license manifest is
`backend/config/productionOrganizationLicenses.js`. Configuration version
`2026-08-06-production-license-dispositions-v1` explicitly assigns Picor to
Managed Service with unmetered administrator, user, and property capacity. It
also records AzRoots, HSLD, and Breezykeyzy as retained historical
organizations rather than licensed customer tenants.

The configurator inventories every customer organization before writing. It
excludes the Afterlight workforce organization and Afterlight resource
accounts, counts unexpired pending invitations as allocated seats, and blocks
when:

- a manifest organization is missing;
- a customer organization is not in the manifest;
- an organization's saved service model differs from the manifest; or
- a metered organization exceeds its proposed capacity; or
- a historical organization still has an active organization user, an
  unexpired pending invitation, or an active/paused resource deployment.

Historical retention does not delete an organization, property, submission,
invoice, or other business record. It also does not automatically archive a
user or end a resource deployment. Clear those live-access blockers through a
separately reviewed retirement action, then rerun the license dry run.

Run the Production organization configurator in section 4 first so Picor's
service model is confirmed as `managed`. Complete section 5 and confirm every
historical organization is retired. Then preview the license plan:

```powershell
npm run configure-production-licenses
```

The dry run prints each organization's current administrator, user, and
property allocation and performs no writes. Review the complete output. Do not
apply if the command reports a blocked organization.

To apply the reviewed manifest, set all three write guards and pass `--apply`:

```powershell
$env:NODE_ENV = "production"
$env:CONFIRM_PRODUCTION_LICENSE_CONFIGURATION = "I_UNDERSTAND_THIS_CHANGES_PRODUCTION_LICENSES"
$env:PRODUCTION_LICENSE_CONFIGURATION_VERSION = "2026-08-06-production-license-dispositions-v1"
npm run configure-production-licenses -- --apply
```

The apply operation rebuilds the inventory inside a MongoDB transaction,
preserves the administrator-seat version, writes only changed license records,
and creates a platform audit record. Re-running it is idempotent. Remove both
confirmation variables after use.

The current release hard-enforces administrator seats. User and property
limits are stored and displayed but are not yet enforced on creation. Afterlight
resource accounts do not consume organization user capacity.

## 7. Promotion order

1. Record the tested SHA and open a release PR from `develop` to `main`.
   Require passing backend tests, frontend tests, and frontend build.
2. Tag the approved merge so every deployed service can be traced to one SHA.
3. Take or verify the MongoDB backup and record the rollback release SHA.
4. Confirm or temporarily disable automatic Production deployment from `main`
   so merging cannot start an uncoordinated release.
5. Deploy the API web service and inspection worker from the same release SHA.
   Keep the in-web worker enabled until a separate background worker is healthy;
   then set `RUN_INSPECTION_WORKER=false` on the web service.
6. Confirm `/health`, startup index work, worker polling, S3 access, and SES
   configuration before continuing.
7. Run the Production organization configurator in dry-run mode. Apply only
   after the Picor plan is reviewed.
8. Run the historical-access retirement dry run. Review the exact memberships
   and blocker counts, apply the reviewed retirement, then rerun it to confirm
   all three organizations report `already retired`.
9. Run the Production license configurator in dry-run mode and confirm all three
   historical organizations report `historical retained`. Apply the reviewed
   manifest. Picor is Managed Service and therefore remains unmetered while its
   explicit record is being established.
10. Deploy the frontend from the same release SHA.
11. Complete the smoke tests below before announcing the release.

Deploying the backend first is intentional. Its submission-history endpoint
continues returning the original unpaginated array to cached PWA clients that do
not send a `page` parameter, while the new frontend receives the paginated
response.

## 8. Production smoke tests

- Sign in as the Production platform administrator and an organization user.
- Confirm dashboard, property list, assignment calendar, assignment history,
  and ten-record submission-history pagination.
- Confirm submission-history filters query beyond the visible page.
- Create and complete one controlled inspection, including a photo; confirm the
  worker completes, the PDF opens, the new filename is used, and the email
  outcome is recorded.
- Confirm assignment completion is protected from edit/delete and appears in
  history.
- Confirm AP email acceptance says queued; use a controlled failure to confirm
  failed delivery is recorded without losing the invoice or inspection. Confirm
  a successful SES event advances the invoice to delivered and the event DLQ is
  empty.
- Enable notifications on one Production test device and confirm an assignment
  lifecycle push and an in-app notification.
- Confirm Picor reports `managed` / `afterlight_staff` before creating its first
  new Production assignment.
- Confirm Picor reports Managed Service and unmetered administrator capacity in
  User Management. Confirm Afterlight resources do not appear in its customer
  seat allocation.
- Confirm AzRoots, HSLD, and Breezykeyzy remain visible to the platform with
  their historical properties and zero active organization users. Confirm one
  retired organization identity cannot enter its organization workspace.
- Confirm public registration remains disabled.

## 9. Rollback

If frontend smoke tests fail, restore the previous frontend release while
leaving the backward-compatible API in place. If the API or worker fails,
stop new traffic and worker processing, capture logs and queue state, then
redeploy the recorded prior SHA. Restore MongoDB only for a confirmed destructive
data migration or corruption; ordinary application rollback should not overwrite
valid Production activity created after release.

Do not reverse Picor's configured service model automatically during an
application rollback. It is audited Production data and should be changed only
through a separately reviewed configuration action.

Do not delete or automatically reverse an applied Production license record
during an application rollback. It is additive, audited business data that the
prior application version safely ignores. Correct an erroneous license through
a separately reviewed manifest revision.

Do not automatically restore retired historical organization memberships during
an application rollback. The organization and business records were never
deleted. Restoring access requires a separately reviewed operation and new
authentication sessions.
