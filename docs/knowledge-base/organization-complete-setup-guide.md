# Complete the organization Setup Guide

**Audience:** Organization administrators completing a new Afterlight workspace

Use **Setup Guide** to finish the required security and operating configuration for a newly created organization. Progress comes from the workspace's live settings; the guide does not use manual checkboxes.

## Open the Setup Guide

1. Accept the secure administrator invitation and finish creating your account.
2. Sign in to the organization workspace.
3. Open **Setup Guide** from the Dashboard navigation while guided onboarding is still in progress.

The progress panel shows how many required items are complete. Return to the guide after making a change and it will recalculate progress from the current workspace.

## Complete the required items

### Confirm workspace settings

Select **Review service delivery** and confirm the contracted service model, default fulfillment route, and reporting behavior.

The service model and tier are contract controlled. If either needs to change, use the service-plan request workflow instead of trying to change it directly. See [Request a service plan change](organization-request-service-model-change.md).

### Secure administrator actions

Select **Configure security** and establish an organization-owned **Administrative action passkey**:

1. Enter your current account password.
2. Enter a new administrative passkey containing at least 12 characters.
3. Confirm the new passkey and select **Rotate passkey**.

This passkey is separate from your account password and authenticator code. It protects sensitive organization actions, including property changes, fulfillment-policy changes, and additional administrator invitations. Store it in an approved password manager and provide it only to authorized organization administrators.

Administrator sign-in also requires authenticator verification. See [Set up and recover authenticator verification](authenticator-verification.md).

### Add the first property

Select **Add a property**, choose **Single property**, enter the organization passkey when prompted, and complete the property configuration. Confirm the property name, physical location, billing details, fulfillment method, and inspection recipients before saving. You can instead choose **Bulk load** when the first portfolio is ready in the supported CSV format.

The property item becomes complete when at least one property exists in the workspace.

## Complete the recommended readiness items

The following items are recommended but do not prevent onboarding completion:

- **Invite the operating team:** Add submitters, property managers, owners, or another administrator and assign the required access. See [Manage organization users and access](manage-organization-users.md) and [Invite organization administrators and manage licensed seats](manage-administrator-seats.md).
- **Validate the first inspection:** Schedule and complete a controlled inspection to confirm assignment access, the checklist, photo uploads, report generation, and delivery.

Recommended items remain visible after onboarding so the Setup Guide can continue serving as a readiness review.

## Complete onboarding

When all required items show **Complete**, select **Complete Onboarding**. Afterlight records the completion, removes **Setup Guide** from the Admin tools navigation, and makes **Review Setup Guide** available from the Help Center header for future readiness reviews.

Existing organizations that were established before guided onboarding see **Workspace Readiness** instead. They can review the same live checks but do not receive a new onboarding-completion action.

## If something goes wrong

- **Complete Onboarding is disabled:** At least one required item is incomplete. Open each required item and finish its live configuration.
- **The security item remains incomplete:** Confirm that **Administrative action passkey** shows **Configured** after the passkey rotation.
- **A platform administrator is using Admin View:** Admin View can inspect progress, but the customer administrator must establish or rotate organization security credentials.
- **The first property cannot be added:** Confirm the administrative action passkey and complete every required property field.
- **Progress does not update immediately:** Return to **Setup Guide** or reload it once after the related change finishes saving.

[Back to the knowledge base](README.md)
