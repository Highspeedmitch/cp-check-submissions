# Legacy Payments Workflow Retirement

**Status:** Retired  
**Retirement date:** August 5, 2026

## Historical purpose

Afterlight previously included an organization-admin **Payments** page at
`/payments`. It was an early, manually operated compensation ledger for
organization users. The page counted submissions and assignments since a
user's `lastPaidDate`, accepted per-submission and per-mile rates, calculated a
payment, and recorded it in the legacy `Payment` collection. Its mileage amount
came from Afterlight's former built-in PWA mileage tracker.

The backend exposed the workflow through:

- `GET /admin/users`
- `GET /admin/payment-summary/:userId`
- `POST /admin/process-payment`

Processing a payment updated `User.lastPaidDate`, wrote a `Payment` record, and
sent the user a payment notification. Earlier versions also reset the user's
built-in mileage counter after payment.

## Why it was retired

The workflow was isolated from Afterlight's current financial controls. It did
not participate in invoice ownership, review, accounts-payable delivery,
contractor earning approval, Gusto payout batches, or customer-payment
reconciliation. The PWA mileage source was also unreliable when navigation or
iOS background behavior moved the user away from Afterlight.

Continuing to expose the page would create a second, ambiguous payment ledger
beside the systems of record that now govern each payment type.

## Replacement workflows

- Customer-organization contractor invoices use the Billing invoice and AP
  review workflow.
- Afterlight service customer receivables use **Platform > Service Billing**.
- Afterlight contractor compensation uses `ContractorEarning` approval and
  Gusto payout batches in **Platform > Resources & Payables**.
- Organization employee compensation remains the responsibility of the
  organization's payroll system.

These flows are intentionally separate because a customer invoice, an
Afterlight receivable, and a contractor payable can arise from the same work
without representing the same financial obligation.

## Retained historical data

The retirement removes the application route, UI, API handlers, Mongoose model,
and active schema fields. It does not drop or rewrite production or development
database data. Existing documents in the legacy `payments` collection and
existing `lastPaidDate` or `paymentStatus` values on user documents remain in
MongoDB unless a separately reviewed data-retention operation removes them.

The source implementation remains available through Git history. Any future
migration or audit should treat the legacy records as historical only and must
not merge them into invoices, contractor earnings, or Gusto payout batches
without an explicit reconciliation plan.
