# Error monitoring and production health alerts

## What is included

The application now supports two complementary monitoring layers:

- Sentry captures unhandled backend and frontend errors when a DSN is configured.
- CloudWatch Synthetics checks the public API health endpoint every five minutes and publishes availability and latency alarms to an encrypted SNS topic.

Both Sentry integrations are disabled when their DSN is absent. No monitoring credential is stored in the repository.

## Render configuration

Configure these backend environment variables separately in Development and Production:

| Variable | Required | Recommended value |
| --- | --- | --- |
| SENTRY_DSN | To enable backend capture | Environment-specific Sentry DSN |
| SENTRY_ENVIRONMENT | Yes when enabled | development or production |
| SENTRY_RELEASE | Recommended | Git commit SHA or release identifier |
| SENTRY_TRACES_SAMPLE_RATE | Optional | 0.05 initially |

Configure these frontend build variables:

| Variable | Required | Recommended value |
| --- | --- | --- |
| REACT_APP_SENTRY_DSN | To enable frontend capture | Environment-specific Sentry DSN |
| REACT_APP_SENTRY_ENVIRONMENT | Yes when enabled | development or production |
| REACT_APP_SENTRY_RELEASE | Recommended | Same release identifier as the backend |
| REACT_APP_SENTRY_TRACES_SAMPLE_RATE | Optional | 0.05 initially |

The browser DSN is intentionally public. Treat project administration tokens and source-map upload tokens as secrets and do not expose them through REACT_APP variables.

Default privacy settings disable automatic personally identifiable information. Replays are not enabled.

## AWS health stack

Template: infra/production-health-monitoring.yaml

The stack creates:

- a retained, encrypted, private S3 bucket for canary artifacts;
- a least-privilege canary execution role;
- a five-minute API health canary;
- availability and p90 latency alarms;
- an encrypted SNS alert topic with an optional email subscription;
- a CloudWatch dashboard.

Deploy the stack through a reviewed CloudFormation change set. Supply the production API origin and the operations alert address. The email recipient must confirm the SNS subscription before alerts can be delivered.

Example parameter values:

    EnvironmentName=production
    ApiBaseUrl=https://api.afterlightinspections.com
    CanaryName=afterlight-prod-api
    AlertEmail=<operations distribution address>
    LatencyThresholdMilliseconds=5000

Use CAPABILITY_NAMED_IAM or CAPABILITY_IAM as required by the deployment tool because the template creates an IAM role. The artifacts bucket is retained if the stack is deleted.

## Verification

1. Deploy Sentry configuration to Development and intentionally exercise a controlled test exception.
2. Confirm the issue is tagged with development and does not contain authentication tokens, passwords, or request bodies.
3. Deploy the CloudFormation stack against the Development API first.
4. Confirm three successful canary runs and inspect the dashboard.
5. Temporarily use a known failing health URL in a Development change set, confirm the availability alarm and SNS delivery, then restore the correct URL.
6. Repeat for Production after Development verification.

Do not deliberately break the Production health endpoint to test an alarm. Use the alarm action test facility or a separate Development stack.
