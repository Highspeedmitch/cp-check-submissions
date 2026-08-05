# SES AP invoice delivery events

Afterlight records Amazon SES acceptance as `accepted`, then uses signed SES
delivery events to move the invoice to `delivered` or `failed`. SES delivery
means that the recipient mail server accepted the message; it does not prove
that a person opened it or that it avoided a spam folder.

## Architecture

1. AP invoice email is sent with `SES_AP_CONFIGURATION_SET` and non-sensitive
   `message_type` and `invoice_id` tags.
2. SES publishes delivery, delay, bounce, complaint, reject, and rendering
   failure events to an encrypted SNS topic.
3. SNS signs the HTTPS notification with signature version 2 and sends it to
   `/api/integrations/ses-events`.
4. The API validates the exact topic ARN, regional certificate URL, certificate
   validity, and RSA-SHA256 signature before processing the event.
5. The API correlates `mail.messageId` to the stored SES provider message ID and
   performs an idempotent, timestamp-ordered invoice update.
6. Undeliverable webhook events are retained in a customer-key-encrypted SQS
   dead-letter queue for 14 days. CloudWatch alarms publish webhook failures
   and non-empty DLQ state to a separate encrypted operations topic.

The CloudFormation template is
`infra/ses-ap-delivery-events.yaml`. Deploy one stack per application
environment in the same AWS Region as `SES_REGION`.

## DEV deployment order

The two-stage subscription avoids a bootstrap race where SNS sends its
confirmation before the API knows which topic to trust.

1. Deploy the backend containing the signed webhook while leaving
   `SES_AP_CONFIGURATION_SET` unset.
2. Create the DEV CloudFormation stack with
   `EnableWebhookSubscription=false`.
3. Copy stack output `SnsTopicArn` to Render as `SES_EVENT_TOPIC_ARN` and output
   `SesConfigurationSetName` as `SES_AP_CONFIGURATION_SET`, then redeploy the
   DEV API.
4. Update the stack with `EnableWebhookSubscription=true`. The API validates
   and confirms the SNS subscription automatically.
5. Subscribe the desired DEV operations destination to stack output
   `OperationalAlarmTopicArn`. An email subscription sends an AWS confirmation
   message and remains pending until its recipient confirms it.
6. Do not assign this configuration set as the SES identity default. It is
   passed only for AP invoice email so unrelated system messages cannot update
   invoice delivery state.

## DEV verification

Use the SES mailbox simulator so the test does not affect SES bounce or
complaint reputation metrics:

- `success@simulator.amazonses.com` should progress from **AP Email Queued** to
  **Delivered**.
- `bounce@simulator.amazonses.com` should progress to **AP Delivery Failed** and
  store the SMTP diagnostic.
- `complaint@simulator.amazonses.com` should progress to **AP Delivery Failed**
  with error code `SES_COMPLAINT`.

For each test, confirm the application structured log
`invoice_ap_delivery_event`, the invoice provider message ID, the SNS failed
notification metric, and an empty dead-letter queue.

## Render environment values

- `SES_AP_CONFIGURATION_SET`: stack output `SesConfigurationSetName`.
- `SES_EVENT_TOPIC_ARN`: stack output `SnsTopicArn`.

These values identify AWS resources and are not credentials. The existing SES
sender credentials remain unchanged.
