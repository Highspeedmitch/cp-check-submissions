# Manage Afterlight resources and contractor payables

**Audience:** Afterlight platform administrators

**Applies to:** Resource onboarding, deployment, earnings approval, and Gusto reconciliation

Use **Platform > Resources & Payables** to control who can enter the Resource Portal, where each resource may be scheduled, and which approved earnings are ready for Gusto. Resource access never gives the contractor general access to a customer organization.

## Add or link a resource

1. Open **Resources & Payables** from the platform navigation.
2. Under **Add a Resource**, enter the contractor's name, email, skills, regions, and default per-assignment rate.
3. Select **Add Resource**.

Afterlight checks the email before deciding what happens next:

- **Existing submitter:** Afterlight links a `ResourceProfile` to the existing identity. No second account or invitation is created. The user signs out and back in, then uses **Resource Portal** or **Organization Workspace** to switch contexts.
- **New identity:** Afterlight emails a one-time invitation. The contractor creates an Afterlight account and initially receives only the Resource Portal workspace.
- **Existing resource:** Afterlight refuses the duplicate. Find and update the existing resource profile instead.
- **Ineligible account:** Inactive accounts and organization administrators or property managers cannot be linked as field resources without first resolving their access role.

Do not create a duplicate email merely to work around an existing submitter account.

## Complete onboarding and activation

The Afterlight account and Gusto onboarding are separate controls.

1. Complete or confirm the contractor's self-onboarding in Gusto.
2. Copy only the Gusto contractor UUID into Afterlight. Never enter banking, tax ID, W-9, or direct-deposit information.
3. Set **Gusto onboarding** to **Completed**.
4. Review the default rate, skills, regions, and availability.
5. Set **Afterlight status** to **Active** and select **Save Resource**.

Activation is blocked until the resource has a linked Afterlight user, a Gusto contractor UUID, and completed Gusto onboarding.

## Deploy the resource

1. Under **Deploy a Resource**, select an active resource.
2. Select an eligible managed or hybrid organization.
3. Optionally enter a deployment-specific rate override.
4. Select eligible properties. Leave the property selection empty only when the resource should be eligible across the entire organization.
5. Select **Save Deployment**.

An active deployment makes the resource selectable; it does not create an assignment. An organization administrator or property manager must still choose **Afterlight contractor** in the Scheduler and assign the resource to a date and property within the deployment scope.

## Approve completed earnings

Completed assigned work creates a **Pending approval** earning in Afterlight. It does not automatically create a Gusto payment.

1. Compare the earning with the completed assignment and saved compensation.
2. Select **Approve** when the work and amount are correct.
3. Select **Void** only when the payable must not be paid, and record a specific reason.

Customer invoices and contractor earnings are separate ledgers. Never approve or change a contractor earning merely to make it match a customer invoice.

## Reconcile a Gusto payout

1. Select the approved earnings to pay.
2. Enter the intended Gusto check date.
3. Select **Create Gusto Batch**.
4. Create the corresponding contractor payment group in Gusto.
5. Return to Afterlight and select **Record Gusto Submission**. Enter Gusto's payment-group UUID.
6. Select **Mark Paid** only after Gusto confirms that the payment group is funded.

If Gusto rejects or changes a payment, leave the Afterlight batch unmarked and resolve the discrepancy before reconciliation.

## Pause or remove access

- Pause or end a deployment to stop future scheduling for that organization or property scope.
- Set availability to **Unavailable** for a temporary worker-level scheduling pause.
- Set the resource status to **Suspended** to remove Resource Portal entitlement at the next authenticated request.

These controls do not erase completed assignments, earnings, payout history, or audit records.

## Troubleshooting

- **The workspace switcher is missing:** Confirm that the email matches the existing user exactly, the resource profile is linked to that user, and the profile is not suspended. Ask the user to sign out and back in.
- **The resource is missing from the Scheduler:** Confirm that the profile and deployment are active, the selected date is within the deployment period, and the selected property is in scope.
- **Activation is refused:** Complete Gusto onboarding and enter the Gusto contractor UUID before setting the Afterlight status to Active.
- **An earning is missing:** Confirm that the inspection was opened from the assigned Resource Portal card and successfully completed.
- **A payout cannot be batched:** Every selected earning must be approved, and each contractor must have completed Gusto onboarding with a stored contractor UUID.
