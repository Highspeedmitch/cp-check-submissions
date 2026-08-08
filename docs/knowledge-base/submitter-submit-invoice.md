# Prepare and send an invoice for approval

**Audience:** Customer Contractor Field Operators

**Applies to:** Commercial property inspections

After a commercial inspection report finishes processing, Afterlight creates an invoice in Billing. Depending on the property settings and your submission choice, it is either sent automatically for property-manager review or retained as a **Draft** for you to verify and submit.

If an organization administrator enabled automatic Customer Contractor invoices for the property, the inspection form shows the admin-defined amount before submission. Leave the automatic option selected to generate the contractor invoice and send it to the assigned property manager with the inspection report. Select **Review or change this invoice before sending** when a one-off amount adjustment is needed; the invoice will remain a **Draft** and follow the steps below.

## Before you begin

- Complete and submit the commercial inspection.
- Wait for its report to finish processing.
- Ask an administrator for help if the property has no billing code or no active property manager; both are required before the invoice can be sent for approval.

## Prepare the invoice

![Illustrated Field Operator Billing page showing a draft invoice and its action buttons](images/billing-submit-invoice.svg)

1. Open **Billing** from the workspace navigation.
2. In the **All** view, find the invoice with a **Draft** status. Use the **Status** filter if the list is long.
3. Verify the property and inspection date. Enter or confirm the **Amount**, then select **Save Amount**.
4. Select **Review PDF**. Afterlight generates the invoice PDF and opens it for review.
5. Check the property name, property code, inspection date, amount, and billing address in the PDF. Close the preview to return to Billing.
6. Select **Send for Approval**. This button appears only after the PDF has been generated.

The invoice identifies the contractor or contractor company as the issuer and notes that it was delivered via Afterlight.

## What happens next

The invoice status changes to **Awaiting PM Review**. Afterlight notifies the active property manager assigned to that property and attempts to email the review request.

You cannot change the invoice while it is awaiting review. If the property manager approves an email delivery, the status changes to **AP Email Queued** after the email provider accepts it; this does not yet confirm mailbox delivery. Manual and portal submissions show **Sent to AP**. A returned invoice changes to **Needs Revision**.

## If something goes wrong

- **Review PDF is available, but Send for Approval is missing:** Finish generating the PDF and wait for the Billing row to refresh.
- **“Set an amount before generating the invoice”:** Enter a positive amount and select **Save Amount** first.
- **“An admin must configure the property's billing code first”:** Ask an organization administrator to update the property’s Billing settings.
- **“An active property manager must be assigned”:** Ask an organization administrator to assign an active property manager to the property.
- **The invoice is not listed:** Confirm that you are viewing **All**, clear the Status filter, and make sure the inspection report completed.

[Back to the knowledge base](README.md)
