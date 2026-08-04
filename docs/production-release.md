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
Production frontend origin. See [inspection-processing.md](inspection-processing.md).

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

## 5. Promotion order

1. Record the tested SHA and open a release PR from `develop` to `main`.
   Require passing backend tests, frontend tests, and frontend build.
2. Tag the approved merge so every deployed service can be traced to one SHA.
3. Take or verify the MongoDB backup and record the rollback release SHA.
4. Deploy the API web service and inspection worker from the same release SHA.
   Keep the in-web worker enabled until a separate background worker is healthy;
   then set `RUN_INSPECTION_WORKER=false` on the web service.
5. Confirm `/health`, startup index work, worker polling, S3 access, and SES
   configuration before continuing.
6. Run the Production organization configurator in dry-run mode. Apply only
   after the Picor plan is reviewed.
7. Deploy the frontend from the same release SHA.
8. Complete the smoke tests below before announcing the release.

Deploying the backend first is intentional. Its submission-history endpoint
continues returning the original unpaginated array to cached PWA clients that do
not send a `page` parameter, while the new frontend receives the paginated
response.

## 6. Production smoke tests

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
  failed delivery is recorded without losing the invoice or inspection.
- Enable notifications on one Production test device and confirm an assignment
  lifecycle push and an in-app notification.
- Confirm Picor reports `managed` / `afterlight_staff` before creating its first
  new Production assignment.
- Confirm public registration remains disabled.

## 7. Rollback

If frontend smoke tests fail, restore the previous frontend release while
leaving the backward-compatible API in place. If the API or worker fails,
stop new traffic and worker processing, capture logs and queue state, then
redeploy the recorded prior SHA. Restore MongoDB only for a confirmed destructive
data migration or corruption; ordinary application rollback should not overwrite
valid Production activity created after release.

Do not reverse Picor's configured service model automatically during an
application rollback. It is audited Production data and should be changed only
through a separately reviewed configuration action.
