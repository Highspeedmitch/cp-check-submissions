# Monthly executive portfolio summaries

Monthly executive portfolio summaries are durable, recipient-specific snapshots for commercial property managers. The worker prepares one report for each active property manager after a month closes. Each report contains only the properties assigned to that manager when the snapshot is created.

Organization administrators can prepare an organization-wide summary manually from **Reporting > Monthly Summaries**. Automatic monthly generation targets property managers only. Reports are never sent to property owners or property-level recipient lists automatically.

## Architecture

The feature extends Afterlight's existing durable worker architecture:

1. The monthly worker identifies enabled commercial organizations and their active property managers.
2. MongoDB upserts one `MonthlyPortfolioSummary` for each organization, recipient, and `YYYY-MM` period. A unique index makes seeding idempotent.
3. The record captures an immutable recipient and managed-property snapshot.
4. A worker claims the queued record with an atomic lease.
5. The worker aggregates current- and prior-month submissions, assignments, structured issue occurrences, property activity, and Field Operator activity.
6. Deterministic application code calculates every metric and month-over-month delta.
7. Amazon Bedrock receives only the calculated reporting source and writes the executive narrative. Bedrock does not calculate totals.
8. A Bedrock failure produces a deterministic non-AI narrative and does not block the report.
9. PDFKit renders the report, and the AWS SDK for JavaScript v3 stores the encrypted PDF under `portfolio-summaries/` in the existing inspection bucket.
10. Preview mode creates the in-app notification and downloadable PDF without sending email. Live mode also emails the PDF only to the report's property-manager recipient.

The worker seeds the most recently completed calendar month in the organization's `reportingTimezone`. It checks hourly, so a brief outage on the first of the month does not permanently miss a report. Existing unique records are reused rather than duplicated.

## Snapshot semantics

The monthly report is an immutable operational snapshot. It records what Afterlight knew when the worker prepared it.

- A scheduled inspection is an assignment with a start date inside the report month that was not canceled.
- A completed assignment is a matching assignment already marked completed at snapshot time.
- A submitted report is a submission timestamped inside the report month.
- A direct submission is a submission without an assignment ID.
- An inspection with issues is counted once when one or more structured checklist fields were marked as issues.
- Issue occurrences count each issue-marked checklist field.
- Older submissions without structured checklist responses remain in activity totals but are reported as unreportable for issue analysis.
- A repeat issue type means that the same checklist field was observed in both reporting months. It does not mean an earlier issue remained unresolved.

The report never calls an issue resolved because Afterlight does not yet have a remediation-completion workflow.

## Rollout controls

The feature fails closed. Both a mode and an exact organization allowlist match are required.

| Variable | Purpose |
| --- | --- |
| `MONTHLY_PORTFOLIO_SUMMARY_MODE` | `off` by default; `preview` generates in-app/PDF output without email; `live` also emails the recipient. |
| `MONTHLY_PORTFOLIO_SUMMARY_ORGANIZATION_ALLOWLIST` | Comma-separated exact organization names or IDs. Matching is case-insensitive; partial names and wildcards are not supported. |
| `MONTHLY_PORTFOLIO_SUMMARY_MODEL_ID` | Optional Bedrock inference profile. Falls back to `INSPECTION_AI_SUMMARY_MODEL_ID`, then `us.amazon.nova-micro-v1:0`. |
| `MONTHLY_PORTFOLIO_SUMMARY_TIMEOUT_MS` | Optional Bedrock timeout, default 15,000 milliseconds and bounded from 1,000 to 45,000. |
| `RUN_MONTHLY_PORTFOLIO_SUMMARY_WORKER` | Starts the monthly worker when not set to `false`. |

Recommended DEV configuration for the initial Picor test:

```text
MONTHLY_PORTFOLIO_SUMMARY_MODE=preview
MONTHLY_PORTFOLIO_SUMMARY_ORGANIZATION_ALLOWLIST=Picor - DEV
RUN_MONTHLY_PORTFOLIO_SUMMARY_WORKER=true
```

Do not enable `live` until the preview PDF, metrics, recipient scope, and narrative have passed QA. Changing the deployment from `live` to `preview` immediately prevents unsent reports from emailing, even when their original job snapshot was created in live mode.

## AWS access

The backend AWS identity requires:

- `bedrock:InvokeModel` for the configured inference profile and its routed foundation model;
- `s3:PutObject` and `s3:GetObject` for `<inspection-bucket>/portfolio-summaries/*`;
- the existing SES permissions used by `sendSystemEmail` when live delivery is enabled.

Use the existing attached AWS identity and default SDK credential chain. Do not add static credentials to source or introduce a second database credential for a separate Lambda.

Bedrock receives property names and aggregate inspection metrics. It does not receive property addresses, photos, user emails, billing data, access instructions, or AWS credentials. Leave model invocation logging disabled unless the log destination is encrypted and access-restricted, because invocation logs contain the full prompt and response.

## Deployment

The existing inspection background-worker process now runs both durable queues. Keep `RUN_MONTHLY_PORTFOLIO_SUMMARY_WORKER=true` there. The web service also starts the monthly worker by default for backward compatibility; after the background worker is healthy, set `RUN_MONTHLY_PORTFOLIO_SUMMARY_WORKER=false` on the web service to avoid redundant polling. Duplicate workers are safe because report creation is unique and claims use atomic leases.

No CloudFormation resource is required for the first release. The application worker, MongoDB, S3 bucket, Bedrock runtime, SES transport, and notification system already provide each required architectural component. A separate EventBridge Scheduler or Lambda would add a second deployment and secret-distribution path without improving reliability at the current scale.

## DEV QA

1. Enable `preview` for the exact DEV organization.
2. Open **Reporting > Monthly Summaries** as a property manager and select **Prepare previous month**.
3. Confirm the UI moves from Queued or Preparing to Ready.
4. Confirm the property count and property activity include only properties assigned to that manager.
5. Compare submissions, assignments, and issue occurrences against the underlying inspection records.
6. Confirm the previous-month deltas are arithmetically correct.
7. Download the PDF and inspect all pages, headers, footers, property rows, and issue labels.
8. Confirm the in-app notification opens the Monthly Summaries view.
9. Confirm no email is sent in preview mode.
10. Test a Bedrock failure and confirm the deterministic narrative still produces a usable PDF.
11. Test two property managers with different scopes and confirm neither can list or download the other's report.
12. Before live rollout, send a controlled report to a test property manager and confirm the attachment, subject, sender, and recipient.

## Operational recovery

Failed jobs retry with bounded exponential backoff up to three attempts. A completed Bedrock narrative and stored PDF are reused during delivery retries. A failed report can be requeued with **Prepare previous month**. Turning the feature mode to `off` acts as a processing kill switch; queued records remain durable until the feature is re-enabled.
