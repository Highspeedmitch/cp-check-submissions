# Configure property delivery and inspection recipients

**Audience:** Organization administrators

Use property setup, Service Delivery, and commercial Billing settings to control who performs future work, what the customer is billed, how approved invoices reach AP, and who receives completed inspection reports.

## Add a property

1. From the Dashboard navigation, select **Add Property**.
2. Enter the organization administrative action passkey when prompted.
3. Enter the property name and physical address, then use **Geocode Address** to confirm its coordinates.
4. Optionally assign a property manager.
5. Choose **Organization Default** for Service Delivery Method unless this property needs a deliberate fulfillment override.
6. Enter any additional inspection recipients. Assigned property managers are handled automatically after the property is created.
7. For a commercial property, enter its billing address and property code, then review the suggested amount and AP delivery method.
8. Select **Create Property**.

The organization default keeps the property aligned with future organization-policy changes. A property override applies only to assignments created afterward; existing assignments keep their saved fulfillment and billing route.

## Manage fulfillment for future assignments

Open **Service Delivery** to review the organization's contracted service model, organization default, and property overrides.

- **Customer employee** and **Customer contractor** route work through the customer-assigned queue.
- **Afterlight staff** and **Afterlight contractor** route work through Afterlight Coverage and Afterlight service billing when applicable.
- Saving a new organization default requires the organization administrative action passkey.
- A property can remain on **Use organization default** or select a different default for future assignments.

The service model and license tier are contract controlled. Use [Request a service plan change](organization-request-service-model-change.md) when the organization needs to move between Full-stack SaaS, Managed service, or Hybrid delivery or request a higher tier.

## Configure commercial billing

Open **Billing**, expand **Commercial property billing settings**, and review each property:

- **Property code:** The customer's accounting or brokerage code.
- **Billing address:** The address printed on customer-facing invoices.
- **Suggested amount:** The default amount the customer will be billed for an inspection.
- **Automatically submit Customer Contractor invoices at this amount:** Uses the suggested amount to generate and send contractor invoices for property-manager approval as soon as the inspection is submitted. Contractors can select **Review or change this invoice before sending** on the inspection form for a one-off adjustment.
- **AP method:** Manual download, email, or AP portal.
- **AP email or portal:** The destination used after invoice approval.

Select **Save settings** for the property after making a change.

When an assignment's fulfillment route creates an invoice, the Scheduler's **Suggested client amount** comes from this property billing setting. Customer-employee work does not display an amount because it creates no invoice. The value is customer pricing and never exposes an Afterlight contractor's default or deployment-specific compensation. Contractor pay remains restricted to Afterlight platform management.

Invoices save a snapshot of the property billing route. Correcting a property setting prepares future invoices and retries, but does not silently rewrite completed historical records.

## Manage inspection report recipients

1. On the Dashboard, find the property and select **Manage Emails**.
2. Review **Automatic property manager recipients**. These addresses come from the active property-manager assignments and cannot be removed from this dialog.
3. Enter one additional recipient per line, or separate addresses with commas or semicolons.
4. Select **Save Emails**.

Afterlight rejects an additional address that duplicates an automatic property-manager recipient, including a duplicate that differs only by letter case. Leaving the additional list empty removes optional recipients; assigned property managers continue receiving reports automatically.

## If something goes wrong

- **An expected manager is not an automatic recipient:** Open **Users**, confirm the person is an active property manager, and assign the property to them.
- **An email is rejected as a duplicate:** Remove it from the additional list because the assigned property manager is already included automatically.
- **The Scheduler says the suggested amount is not configured:** Enter and save a Suggested amount in commercial Billing settings.
- **An AP email fails:** Verify the property's AP method and destination, save the correction, and retry from the invoice review workflow.
- **A fulfillment option has no eligible user:** Confirm the user or Afterlight resource is active and eligible for that property and date.

[Back to the knowledge base](README.md)
