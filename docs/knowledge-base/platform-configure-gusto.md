# Configure Gusto for Afterlight contractor payments

**Audience:** Afterlight platform administrators and the person responsible for contractor payments

**Applies to:** Initial Gusto setup, contractor self-onboarding, payment runs, and Afterlight reconciliation

Afterlight and Gusto have separate responsibilities:

- **Afterlight** authorizes assignments, snapshots the agreed compensation, approves earnings, and creates payout batches.
- **Gusto** collects W-9, taxpayer, address, and payment-method information; moves the money; and handles supported year-end contractor reporting.

This guide describes the initial **manual Gusto web workflow**. Do not enter bank accounts, SSNs, ITINs, EINs, W-9 data, API secrets, or OAuth tokens into Afterlight.

## 1. Choose the correct Gusto account path

Before creating another Gusto company, identify which situation applies:

| Situation | Recommended action |
| --- | --- |
| Afterlight already runs payroll in Gusto | Add contractors to that existing Afterlight company. |
| Afterlight pays contractors only and does not use another payroll provider | Consider Gusto's Contractor Only plan. |
| Afterlight uses another payroll provider or accountant for payroll filings | Stop and confirm the arrangement with Gusto and the company's tax professional before signing forms or opening a contractor-only account. |

Gusto says its contractor-only account supports self-onboarding, domestic contractor payments, and 1099-NEC generation. Gusto also warns that this account is not appropriate when the company already uses another payroll service. Form 8655 authorizes Gusto to file returns, and Gusto states that only one active Form 8655 can be in place at a time. See Gusto's [employer onboarding and contractor-only account guide](https://support.gusto.com/article/100758300100000/gusto-onboarding-guide-for-employers).

This is an operational guide, not worker-classification, tax, or legal advice. Confirm that each worker is properly classified before paying them as a contractor.

## 2. Complete the Afterlight company setup in Gusto

Use Afterlight's legal business information, not a customer organization's information.

1. Create or open the Gusto company under the Afterlight legal entity.
2. Complete the requested company identity, federal tax ID, address, signer, and filing details.
3. Review Form 8655 and the filing arrangement with the person responsible for Afterlight's taxes before signing.
4. Add the Afterlight funding account in Gusto.
5. Verify the account through Plaid or Gusto's manual test-transaction process.
6. Wait until Gusto shows the company setup and funding account as approved before scheduling a live payment.

Gusto requires a US checking account for company funding. Manual verification normally uses two test transactions and may take multiple business days. Follow Gusto's current [company bank-account instructions](https://support.gusto.com/article/106622315100000/manage-company-bank-account-details-for-admins).

Recommended administrative controls:

- Give payment permissions only to named Afterlight administrators who need them.
- Require individual Gusto accounts and multi-factor authentication; do not share an administrator login.
- Have one person prepare the batch and another review it when practical.
- Reconcile the Gusto debit account against Afterlight payout batches after every pay date.

## 3. Add an Afterlight resource to Gusto

Create the Afterlight `ResourceProfile` first so the identity and agreed default rate already exist.

In Gusto:

1. Go to **People**.
2. Select **Add person**.
3. Choose **Individual contractor** or **Business contractor** based on the worker's actual contracting entity and tax documentation.
4. Choose the contractor's correct country. This first Afterlight workflow assumes a US contractor.
5. Enter the same personal email used on the Afterlight resource profile. If the contractor already has a Gusto profile, use that same email.
6. For assignment-based inspection work, choose **Fixed amount** as the payment type unless the written agreement genuinely requires hourly payment.
7. Enter the contract start date, job title, department, and any other required work information.
8. Send the Gusto self-onboarding invitation. Let the contractor enter their own taxpayer, W-9, address, and payment-method information.
9. Optionally send a contractor agreement only after Afterlight's approved agreement has been reviewed for the applicable worker and jurisdiction.

Gusto's current sequence and eligibility requirements are documented in [Add and pay US contractors](https://support.gusto.com/article/100739998100000/add-and-pay-us-contractors-in-gusto-for-admins). Gusto explains that self-onboarding collects the contractor's sensitive information and can generate an electronic W-9.

## 4. Confirm onboarding in Afterlight

Wait until the contractor no longer appears as incomplete in Gusto's onboarding list and the intended payment method is ready.

Then open **Platform > Resources & Payables** in Afterlight:

1. Find the matching resource by email.
2. Leave **Gusto contractor UUID (API integrations only)** blank for the manual workflow.
3. Set **Gusto onboarding** to **Completed**.
4. Confirm the Afterlight account is linked, the default rate is correct, and availability is correct.
5. Set **Afterlight status** to **Active**.
6. Select **Save Resource**.

The Gusto email and Afterlight resource email are the manual matching key. Correct an email mismatch before making a payment.

## 5. Understand the payment-field mapping

When Afterlight creates a payout batch, use these exact mappings:

| Afterlight payout data | Gusto payment field |
| --- | --- |
| Resource email | Match the contractor in **People/Pay** |
| Gross approved earnings | **Fixed amount** |
| Approved expense reimbursement | **Reimbursements** |
| Afterlight batch number, such as `GUSTO-20260802-ABC123` | **Invoice number** |
| Optional assignment or reconciliation note | **Memo** |
| Afterlight check date | Gusto pay date |

Do not combine reimbursements into the fixed compensation field. Do not add tips, bonuses, hours, or another payment category unless the underlying approved record and contractor agreement support it.

## 6. Submit an Afterlight payout batch in Gusto

In Afterlight:

1. Review each **Pending approval** earning against the completed assignment and compensation snapshot.
2. Approve only correct earnings.
3. Select the approved earnings for the intended pay run.
4. Enter the planned Gusto check date.
5. Select **Create Gusto Batch**.
6. Keep the batch open while entering the payment in Gusto.

In Gusto:

1. Open **Pay**.
2. Under **More options**, select **Pay a US contractor**.
3. Find each contractor using the email recorded on the Afterlight payout line.
4. Enter the line's gross earnings as **Fixed amount**.
5. Enter its reimbursement separately under **Reimbursements**.
6. Enter the Afterlight batch number under **Invoice number** for every contractor in that batch.
7. Optionally enter a short memo that will be visible to the contractor.
8. Confirm the payment method, funding account, and pay date.
9. Select **Review summary**.
10. Compare every contractor amount and the total against Afterlight.
11. Select **Submit** only when the totals match exactly.

Gusto documents these payment fields and the review/submit flow in [Add and pay US contractors](https://support.gusto.com/article/100739998100000/add-and-pay-us-contractors-in-gusto-for-admins).

Back in Afterlight:

1. Select **Record Gusto Submission**.
2. Enter Gusto's confirmation reference if one is displayed. Otherwise retain the prefilled Afterlight batch number used in Gusto's invoice field.
3. Do not select **Mark Paid** merely because the payment was submitted.
4. After Gusto's payment history shows the payment as processed or paid, return to Afterlight and select **Mark Paid**.

## 7. Handle historical or out-of-band payments

If Afterlight already paid a contractor outside Gusto, do not send the money again. Use Gusto's **Record a non-Gusto payment** workflow only when the payment has already occurred and needs to be included in Gusto's records.

Before recording historical payments, confirm the applicable tax year and filing consequences with the tax professional. Gusto notes that historical payments have special activity, Form 8655, deadline, and corrected-1099 rules. See the historical-payment section of [Add and pay US contractors](https://support.gusto.com/article/100739998100000/add-and-pay-us-contractors-in-gusto-for-admins).

## 8. Month-end and year-end checks

At least monthly:

- Compare Afterlight paid batches with Gusto contractor payment history.
- Compare the combined Gusto debits with the funding bank account.
- Investigate every cancelled, returned, or failed payment before changing Afterlight's status.
- Confirm new resources completed Gusto onboarding before their first batch.

Before Gusto's year-end deadline:

- Review every contractor's legal name, entity type, mailing address, taxpayer details, and W-9 status inside Gusto.
- Record any legitimate payments made outside Gusto exactly once.
- Review Gusto's 1099 preview and resolve exceptions.
- Confirm filing responsibility and deadlines with the company's tax professional.

## 9. API and UUID boundary

Do not search the normal Gusto employer interface for a contractor UUID. Gusto says it does not currently support direct API access for customers connecting their own internal systems to their Gusto company. See [Gusto API integrations](https://support.gusto.com/article/106622056100000/gusto-api-integrations).

The optional UUID field is reserved for a future approved Gusto Embedded or partner integration. Such an integration requires separate commercial approval, OAuth setup, company-scoped authorization, secure rotating-token storage, and additional implementation review. Never paste API credentials into a resource profile.

## Troubleshooting

- **The contractor remains in Onboarding:** Open the contractor's Gusto checklist and identify the missing contractor or company step. Resend the invitation if Gusto offers that action.
- **Direct deposit is unavailable:** Confirm both the company funding account and contractor payment method are verified. Gusto can also pay eligible contractors by check.
- **The Gusto contractor cannot be matched:** Correct the email mismatch; do not create another Afterlight identity.
- **Afterlight and Gusto totals differ:** Stop before submission. Recheck fixed compensation, reimbursements, duplicate earnings, and excluded contractors.
- **A Gusto payment was cancelled or returned:** Do not mark the Afterlight batch paid. Resolve the Gusto payment and accounting treatment first.
- **The company already uses another payroll provider:** Do not sign Form 8655 or proceed with contractor-only setup until Gusto and the company's tax professional confirm the correct configuration.

[Back to the knowledge base](README.md)
