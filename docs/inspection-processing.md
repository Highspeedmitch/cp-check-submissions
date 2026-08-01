# Inspection photo processing

Inspection forms use a durable two-stage submission flow:

1. The API creates an `InspectionJob` and returns short-lived signed S3 form uploads.
2. The browser optimizes and uploads each photo directly to S3.
3. The browser finalizes the upload session and the API marks the job as queued.
4. A single-concurrency worker generates the PDF, creates the submission and invoice, sends notifications and email, and removes the temporary photos.

The retired multipart `/api/submit-form` route is no longer available. All inspection clients must use the durable job flow above so photos bypass API memory and PDF work remains retryable.

## S3 CORS

The inspection bucket must permit browser POSTs from every deployed frontend origin. Replace or extend the origins when production receives its final domain.

```json
[
  {
    "AllowedOrigins": [
      "https://afterlightinspections-dev.onrender.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["POST"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

The backend AWS identity needs `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` for the inspection bucket. Add an S3 lifecycle rule that expires incomplete objects under `inspection-uploads/` after two days as a final safeguard against abandoned browser uploads.

## Render deployment

The web service runs the worker by default, which makes this change backward-compatible with the current deployment. To isolate PDF work from API traffic:

1. Add a Render Background Worker using the same repository and backend environment variables.
2. Use `backend` as its root directory and `npm run worker:inspections` as its start command.
3. Set `RUN_INSPECTION_WORKER=false` on the web service after the background worker is healthy.

Only the web service should receive public traffic. Multiple workers are safe because jobs are claimed with an atomic MongoDB lease, but one worker is the recommended starting configuration.
