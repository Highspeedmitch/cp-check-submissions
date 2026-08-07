# Inspection photo processing

Inspection forms use a durable two-stage submission flow:

1. The API creates an `InspectionJob` and returns short-lived signed S3 form uploads.
2. The browser optimizes and uploads each photo directly to S3.
3. The browser finalizes the upload session and the API marks the job as queued.
4. A single-concurrency worker generates the PDF, creates the submission and invoice, sends notifications and email, and removes the temporary photos.

The retired multipart `/api/submit-form` route is no longer available. All inspection clients must use the durable job flow above so photos bypass API memory and PDF work remains retryable.

## AI cover summary

Commercial inspection reports can generate a concise General Observations summary with Amazon Bedrock after photo upload finalization and before PDF generation. The browser does not wait on the model request. The worker sends only normalized structured responses and finding descriptions; it does not send inspection photos, property addresses, user emails, or AWS credentials.

The generated text is stored separately from inspector responses with its model ID, prompt version, source hash, token counts, latency, and generation status. Worker retries reuse a matching stored result. Model failure is non-blocking: the report displays a non-AI fallback and inspection persistence, invoicing, notifications, and email continue normally.

The feature is opt-in through `INSPECTION_AI_SUMMARY_MODE`:

- `off` (default): do not invoke Bedrock or change the report.
- `dev-preview`: generate and display the summary in the PDF. Use this in DEV QA.
- `shadow`: generate and store the summary without displaying it.
- `live`: generate and display the summary in a customer-facing environment.

Optional controls:

- `INSPECTION_AI_SUMMARY_MODEL_ID` defaults to `us.amazon.nova-micro-v1:0`.
- `INSPECTION_AI_SUMMARY_TIMEOUT_MS` defaults to 8,000 milliseconds and is bounded from 1,000 to 30,000 milliseconds.

The model is limited to 128 output tokens, and the application independently enforces a 300-character maximum. Successfully generated text appears in the front-page General Observations panel with: `This summary is AI generated and may contain inaccuracies.` If the invocation fails or returns unusable output, the PDF says that the automated summary is unavailable and does not show the AI disclaimer.

The backend AWS identity requires `bedrock:InvokeModel` for the selected inference profile and its routed foundation model. For the default US geographic Nova Micro profile, scope access to the profile used by the application and `arn:aws:bedrock:*::foundation-model/amazon.nova-micro-v1:0`. Do not grant `bedrock:*`. Leave Bedrock model invocation logging disabled unless its CloudWatch or S3 destination is encrypted and access-restricted, because invocation logging contains full prompts and responses.

Before enabling `dev-preview`, confirm the model profile is available from the configured `AWS_REGION`, then submit reports covering no findings, multiple findings, missing descriptions, maximum-length narrative text, and the maximum 18 condition rows. Production must remain `off` until the reviewed DEV sample meets the factuality and layout acceptance criteria.

## S3 CORS

The inspection bucket must permit browser POSTs from every deployed frontend origin. The reviewed rule is versioned in `infra/inspection-bucket-cors.json` and currently includes:

- `https://app.afterlightinspections.com`
- `https://dev.afterlightinspections.com`
- the legacy Development Render hostname
- `http://localhost:3000` for local testing.

Check a bucket without changing it:

    .\scripts\configure-inspection-bucket-cors.ps1 -Bucket <bucket-name>

After reviewing the reported drift, apply and verify the named rule:

    .\scripts\configure-inspection-bucket-cors.ps1 -Bucket <bucket-name> -ExpectedBucketOwner <aws-account-id> -Apply

The script merges the `afterlight-browser-inspection-uploads` rule into the live configuration and preserves unrelated named or unnamed rules. Do not use a bare `put-bucket-cors` command with only the inspection rule because Amazon S3 replaces the bucket's complete CORS configuration.

The backend AWS identity needs `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` for the inspection bucket. Add an S3 lifecycle rule that expires incomplete objects under `inspection-uploads/` after two days as a final safeguard against abandoned browser uploads.

## Browser draft resilience

Offline draft storage is best-effort. A browser that blocks IndexedDB or cannot persist a photo blob displays a warning, reports the `draft_storage` phase to configured frontend monitoring, and continues with the inspection API. Submission failures are classified as API preparation, photo upload, upload finalization, status refresh, or report processing so the user does not receive the browser's generic network error.

## Amazon SES delivery

Inspection email uses its own `SES_REGION`, `SES_ACCESS_KEY_ID`, and `SES_SECRET_ACCESS_KEY` configuration. Updating the `AWS_*` S3 credentials does not update these separate SES credentials.

If the SES access key is a temporary `ASIA...` credential, also configure the matching `SES_SESSION_TOKEN`. All three values must come from the same temporary credential set. Long-lived `AKIA...` credentials do not use a session token, so remove any stale `SES_SESSION_TOKEN` when switching to one.

The SES identity must be allowed to call `ses:SendRawEmail` in `SES_REGION`, and `SYSTEM_EMAIL_ADDRESS` must be a verified SES identity in that region. Email delivery is best-effort: a delivery failure is recorded on the completed job but does not retry PDF generation or delay the saved submission.

## Render deployment

The web service runs the worker by default, which makes this change backward-compatible with the current deployment. To isolate PDF work from API traffic:

1. Add a Render Background Worker using the same repository and backend environment variables.
2. Use `backend` as its root directory and `npm run worker:inspections` as its start command.
3. Set `RUN_INSPECTION_WORKER=false` on the web service after the background worker is healthy.

Only the web service should receive public traffic. Multiple workers are safe because jobs are claimed with an atomic MongoDB lease, but one worker is the recommended starting configuration.
