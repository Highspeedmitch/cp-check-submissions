# Process Afterlight service invoices

**Audience:** Afterlight platform administrators

**Applies to:** Customer invoicing for work fulfilled by Afterlight staff or Afterlight contractors

Use **Platform > Service Billing** to monitor the amount Afterlight charges a customer for delivered work and resolve exceptions. This customer receivable is independent from any contractor earning or Gusto payment created by the same inspection.

## Understand ownership

When an Afterlight resource completes a commercial inspection, Afterlight records the resource as the person who performed the work and assigns billing ownership to the Afterlight platform.

- The resource does not open customer Billing or prepare the customer invoice.
- The customer amount comes from the property's configured inspection amount.
- The contractor amount comes from the assignment compensation snapshot in **Resources & Payables**.
- Changing one amount never changes the other.

## Understand automatic preparation

After an assigned Afterlight resource completes a commercial inspection, Afterlight automatically:

1. Records the performing resource on the inspection.
2. Creates the platform-owned customer invoice using the property's configured customer amount.
3. Generates the invoice PDF.
4. Places the invoice in **Awaiting customer review**.
5. Notifies the assigned property manager in the app and emails the inspection report and invoice PDF when email delivery is available.

The resource cannot see Billing, change the customer amount, generate the invoice, or submit it for review.

## Resolve a preparation exception

1. Open **Service Billing** from the platform navigation.
2. Find the customer organization and property.
3. Review any preparation or delivery message. Common causes are a missing customer amount, missing property billing code, or no active assigned property manager.
4. Correct the property or manager configuration in the customer organization.
5. If the invoice still shows **Draft**, confirm or enter the approved customer-facing amount and select **Save Amount**.
6. Select **Generate PDF**, verify it with **View PDF**, and select **Send for Customer Review**.

Saving a revised amount invalidates the previous PDF. Generate a new PDF before sending it for review.

## Respond to customer review

- **Awaiting customer review:** The assigned property manager must approve or decline the invoice.
- **Needs revision:** Read the displayed customer feedback, correct the amount if appropriate, regenerate the PDF, and send it for review again. Declined invoices are not automatically resubmitted.
- **AP delivery failed:** The customer approved the invoice, but its configured AP delivery failed. Correct the property AP destination from the organization's Billing settings, then have the property manager retry delivery.
- **AP email queued:** Amazon SES accepted the approved invoice for processing. Use the stored provider reference to correlate delivery events; provider acceptance is not proof that the destination mailbox received it.
- **Sent to AP:** The customer approved a manual-download or portal route and Afterlight recorded that submission.

## Reconcile customer payment

After Afterlight confirms receipt of the customer payment, return to **Platform > Service Billing** and select **Mark Paid**. Do not mark a customer invoice paid merely because its related contractor earning was paid through Gusto.

## Important boundary

The customer invoice and contractor payable may arise from the same assignment, but they are separate ledgers:

| Record | Amount source | Owed by | Paid to |
| --- | --- | --- | --- |
| Afterlight service invoice | Customer pricing | Customer organization | Afterlight |
| Contractor earning | Assignment compensation snapshot | Afterlight | Contractor through Gusto |

[Back to the knowledge base](README.md)
