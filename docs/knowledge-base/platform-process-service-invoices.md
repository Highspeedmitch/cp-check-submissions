# Process Afterlight service invoices

**Audience:** Afterlight platform administrators

**Applies to:** Customer invoicing for work fulfilled by Afterlight staff or Afterlight contractors

Use **Platform > Service Billing** to prepare the amount Afterlight charges a customer for delivered work. This customer receivable is independent from any contractor earning or Gusto payment created by the same inspection.

## Understand ownership

When an Afterlight resource completes a commercial inspection, Afterlight records the resource as the person who performed the work and assigns billing ownership to the Afterlight platform.

- The resource does not open customer Billing or prepare the customer invoice.
- The customer amount comes from the property billing suggestion or an amount entered by a platform administrator.
- The contractor amount comes from the assignment compensation snapshot in **Resources & Payables**.
- Changing one amount never changes the other.

## Prepare a service invoice

1. Open **Service Billing** from the platform navigation.
2. Find the customer organization and property.
3. Confirm the inspection date, performing resource, AP method, and AP destination.
4. Enter the customer-facing amount and select **Save Amount**.
5. Select **Generate PDF**.
6. Open **View PDF** and verify the invoice number, property code, customer, inspection date, and amount.
7. Select **Send for Customer Review**.

Saving a revised amount invalidates the previous PDF. Generate a new PDF before sending it for review.

## Respond to customer review

- **Awaiting customer review:** The assigned property manager must approve or decline the invoice.
- **Needs revision:** Read the displayed customer feedback, correct the amount if appropriate, regenerate the PDF, and send it for review again.
- **AP delivery failed:** The customer approved the invoice, but its configured AP delivery failed. Correct the property AP destination from the organization's Billing settings, then have the property manager retry delivery.
- **Sent to AP:** The customer approved the invoice and Afterlight recorded delivery to the configured AP route.

## Reconcile customer payment

After Afterlight confirms receipt of the customer payment, return to **Platform > Service Billing** and select **Mark Paid**. Do not mark a customer invoice paid merely because its related contractor earning was paid through Gusto.

## Important boundary

The customer invoice and contractor payable may arise from the same assignment, but they are separate ledgers:

| Record | Amount source | Owed by | Paid to |
| --- | --- | --- | --- |
| Afterlight service invoice | Customer pricing | Customer organization | Afterlight |
| Contractor earning | Assignment compensation snapshot | Afterlight | Contractor through Gusto |

[Back to the knowledge base](README.md)
