# Organization recurring billing design

## Current boundary

Afterlight currently generates customer invoices from inspection submissions. The `Invoice` model requires a unique `submissionId`, property, submitter, and inspection date, so it is intentionally unsuitable for a monthly corporate license fee. Service-plan pricing is now visible and auditable as a contract term, but recurring organization invoices are not generated or collected.

## Recommended billing boundary

Keep visit billing and corporate subscription billing as separate internal ledgers:

- `OrganizationBillingAccount` identifies the legal customer, accounts-payable contacts, billing address, tax references, purchase-order requirements, payment terms, and billing-provider customer ID.
- `OrganizationSubscription` records service model, tier, currency, immutable price snapshot, effective dates, billing anchor, collection method, provider subscription and price IDs, and lifecycle status.
- `OrganizationBillingInvoice` mirrors corporate invoice totals, dates, provider IDs, and payment status. It must not require a property or inspection submission.
- Existing `Invoice` records continue to represent individual property visits.

Create distinct provider products and immutable recurring prices for Boutique service, Full-stack SaaS Tier 1/2/3, Hybrid Tier 1/2/3, and the Managed service base, even where two plans currently share the same dollar amount. This preserves model-level reporting and allows the prices to diverge later without rewriting history.

## Collection recommendation

For corporate customers, start with invoice-based collection using Net 15 or Net 30 terms and ACH, with a hosted invoice page and automatic reminders. Store the provider customer, subscription, price, and invoice identifiers in Afterlight, while retaining Afterlight's own billing status and audit trail. Plan prices must come from server-controlled configuration, never a browser-supplied amount.

Process provider webhooks idempotently to mirror subscription changes, invoice finalization, payment, failure, voiding, and cancellation. Keep plan changes contract-controlled in Afterlight and reconcile an approved effective date to the billing-provider subscription rather than allowing unrestricted customer self-service plan changes.

For Managed service, bill the $500 corporate base as the recurring subscription and keep visit invoices separate initially. If a customer later wants one monthly statement, add only completed and approved visits as usage or invoice items. Route estimates and assigned-but-incomplete work must never become billable usage.

For Boutique service, bill one $75 organization subscription and keep every completed property visit separate. Boutique is available only to Commercial organizations, and the recurring amount does not increase from one to three properties. Adding a fourth property or a property at or above 5,000 square feet requires an approved move to another service model before the ineligible property becomes active.

The Hybrid 15%, 12%, and 10% figures remain portfolio-service commitments. They should not be calculated as a percentage surcharge unless the commercial agreement is deliberately changed to revenue-share pricing.
