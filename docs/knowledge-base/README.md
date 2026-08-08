# Afterlight knowledge base

These articles cover the most common inspection, billing, and scheduling workflows in Afterlight. Choose the article that matches your role and task.

The screenshots are source-verified UI illustrations built from the current application. They use fictional names, dates, addresses, and amounts. Your organization may use different property names and checklist questions.

## Afterlight platform administrators

| Task | Article | Typical time |
| --- | --- | --- |
| Launch a licensed customer workspace and open its audited Admin View | [Create and securely access an organization](platform-create-access-organization.md) | 4-8 minutes |
| Review and decide organization service plan requests | [Review service plan change requests](platform-review-service-model-changes.md) | 3-8 minutes |
| Prepare and reconcile customer invoices for Afterlight-delivered work | [Process Afterlight service invoices](platform-process-service-invoices.md) | 3-5 minutes |
| Onboard, deploy, and pay Resource Network contractors | [Manage Afterlight resources and contractor payables](platform-manage-resources-payables.md) | 8-15 minutes |
| Configure and operate the Gusto contractor-payment workflow | [Configure Gusto for Afterlight contractor payments](platform-configure-gusto.md) | 12-20 minutes |
| Calculate preliminary pricing for a prospect conversation | [Calculate preliminary service pricing](platform-use-pricing-estimator.md) | 1-2 minutes |

## Field Operators

| Task | Article | Typical time |
| --- | --- | --- |
| Complete assigned property work | [Complete and submit an inspection](submitter-submit-inspection.md) | 5-15 minutes |
| Subscribe to assigned work in an external calendar | [Connect My Calendar](connect-my-calendar.md) | 3-5 minutes |
| Enable or troubleshoot workflow alerts | [Enable and troubleshoot notifications](enable-notifications.md) | 2-4 minutes |
| Set up or recover authenticator verification | [Set up and recover authenticator verification](authenticator-verification.md) | 3-6 minutes |
| Create an invoice after a commercial inspection | [Prepare and send an invoice for approval](submitter-submit-invoice.md) | 2-3 minutes |
| Respond to property-manager feedback | [Revise and resubmit a declined invoice](submitter-revise-invoice.md) | 2-3 minutes |

## Afterlight Resource Network contractors

| Task | Article | Typical time |
| --- | --- | --- |
| Accept an invitation and activate an account | [Set up your Afterlight contractor account](resource-account-setup.md) | 3-5 minutes |
| Find assignments and use the contractor workspace | [Use the Afterlight Resource Portal](resource-portal-overview.md) | 2-3 minutes |
| Subscribe to assigned work in an external calendar | [Connect My Calendar](connect-my-calendar.md) | 3-5 minutes |
| Enable or troubleshoot workflow alerts | [Enable and troubleshoot notifications](enable-notifications.md) | 2-4 minutes |
| Set up or recover authenticator verification | [Set up and recover authenticator verification](authenticator-verification.md) | 3-6 minutes |
| Complete assigned work | [Complete an assigned contractor inspection](resource-complete-assignment.md) | 5-15 minutes |
| Understand earnings and Gusto status | [Understand your contractor earnings](resource-understand-earnings.md) | 2-3 minutes |

## Property managers

| Task | Article | Typical time |
| --- | --- | --- |
| Approve or return an invoice | [Review, approve, or decline an invoice](property-manager-review-invoice.md) | 2-5 minutes |
| Open completed inspection reports | [Review inspection submissions for a property](property-manager-review-submissions.md) | 1-2 minutes |
| Schedule work and review assignment history | [Create and manage a scheduler assignment](admin-create-assignment.md) | 2-3 minutes |
| Enable or troubleshoot workflow alerts | [Enable and troubleshoot notifications](enable-notifications.md) | 2-4 minutes |
| Set up or recover authenticator verification | [Set up and recover authenticator verification](authenticator-verification.md) | 3-6 minutes |

## Organization administrators

| Task | Article | Typical time |
| --- | --- | --- |
| Complete required workspace setup and readiness checks | [Complete the organization Setup Guide](organization-complete-setup-guide.md) | 5-10 minutes |
| Invite another administrator and manage licensed seats | [Invite organization administrators and manage licensed seats](manage-administrator-seats.md) | 3-5 minutes |
| Invite, edit, archive, or restore non-administrator users | [Manage organization users and access](manage-organization-users.md) | 4-8 minutes |
| Onboard a customer employee or customer contractor | [Onboard customer employees and contractors as Field Operators](onboard-customer-field-operators.md) | 3-5 minutes |
| Configure property fulfillment, billing, AP, and inspection recipients | [Configure property delivery and inspection recipients](configure-property-delivery.md) | 5-10 minutes |
| Request a service-model or license-tier change | [Request a service plan change](organization-request-service-model-change.md) | 3-5 minutes |
| Schedule work for a Field Operator or deployed resource | [Create and manage a scheduler assignment](admin-create-assignment.md) | 2-3 minutes |
| Enable or troubleshoot workflow alerts | [Enable and troubleshoot notifications](enable-notifications.md) | 2-4 minutes |
| Set up or recover authenticator verification | [Set up and recover authenticator verification](authenticator-verification.md) | 3-6 minutes |

> **Role note:** Organization administrators can manage Scheduler assignments across the organization. Property managers can manage assignments only for properties assigned to them.

> **Contractor billing note:** Afterlight Resource Network contractors do not prepare customer invoices. Their earnings appear in the Resource Portal and are paid separately through Gusto.

## Invoice status quick reference

| Status | Meaning | Who acts next |
| --- | --- | --- |
| Draft | The inspection created an invoice that has not been sent for review. | Field Operator, or Afterlight platform billing for Afterlight-delivered work |
| Awaiting PM Review | The invoice was sent to an assigned property manager. | Property manager |
| Needs Revision | The property manager returned the invoice with a reason. | Field Operator, or Afterlight platform billing for Afterlight-delivered work |
| Sending to AP | Approval and delivery are in progress. | No action unless an error appears |
| AP delivery submitted | The property manager approved the invoice. Email delivery may still be queued with the provider. | Platform billing marks Afterlight service invoices paid only after customer payment is received; customer oversight handles customer-contractor invoices |
| AP Delivery Failed | Approval succeeded, but AP delivery failed. | Property manager retries delivery |
| Paid | Payment was recorded. | Property manager or administrator may archive it |

## Publishing notes

- Preserve the wording of buttons and status labels when moving these articles into another help-center system.
- Keep the illustrations with the article files; their numbered callouts correspond to the numbered explanations below each image.
- Replace an illustration only with a sanitized screenshot. Do not publish customer names, addresses, email addresses, invoice numbers, access instructions, or inspection photos.
