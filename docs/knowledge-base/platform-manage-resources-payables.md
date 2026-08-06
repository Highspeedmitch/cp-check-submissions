# Manage Afterlight resources and contractor payables

**Audience:** Afterlight platform administrators

**Applies to:** Resource onboarding, deployment, earnings approval, and Gusto reconciliation

Use **Platform > Resources & Payables** to control who can enter the Resource Portal, where each resource may be scheduled, and which contractor earnings are ready for Gusto. Resource access never gives the resource general access to a customer organization.

## Add or link a resource

1. Open **Resources & Payables** from the platform navigation.
2. Under **Add a Resource**, enter the person's name and email, then select their relationship:
   - **1099 contractor:** Paid by Afterlight per assignment through the contractor payable ledger and Gusto.
   - **Afterlight employee:** Scheduled as Afterlight staff without a contractor payable.
   - **Afterlight owner:** Scheduled as Afterlight staff without a contractor payable.
3. Enter skills and regions. For a 1099 contractor, also enter the default contractor pay rate.
4. Select **Add Resource**.

Afterlight checks the email before deciding what happens next:

- **Existing submitter:** Afterlight links a `ResourceProfile` to the existing identity. No second account or invitation is created. The user signs out and back in, then uses **Resource Portal** or **Organization Workspace** to switch contexts.
- **New identity:** Afterlight emails a one-time invitation. The person creates an Afterlight account and initially receives only the Resource Portal workspace.
- **Existing resource:** Afterlight refuses the duplicate. Find and update the existing resource profile instead.
- **Ineligible account:** Inactive accounts and organization administrators or property managers cannot be linked as field resources without first resolving their access role.

Do not create a duplicate email merely to work around an existing submitter account.

## Complete onboarding and activation

The Afterlight account and Gusto onboarding are separate controls for 1099 contractors. Afterlight employees and owners do not require Gusto onboarding in this workflow.

1. For a 1099 contractor, complete or confirm self-onboarding in Gusto.
2. Confirm that the Gusto email exactly matches the resource profile. Leave the optional contractor UUID blank when using Gusto's normal web interface.
3. For a contractor, set **Gusto onboarding** to **Completed**.
4. Review the relationship, contractor rate when applicable, skills, regions, and availability.
5. Set **Afterlight status** to **Active** and select **Save Resource**.

Activation is blocked until the resource has a linked Afterlight user. Contractors must also complete Gusto onboarding. Never enter banking, tax ID, W-9, or direct-deposit information in Afterlight. For contractor setup and payment procedures, read [Configure Gusto for Afterlight contractor payments](platform-configure-gusto.md).

## Deploy the resource

1. Under **Deploy a Resource**, select an active resource.
2. Select an eligible managed or hybrid organization.
3. For a contractor, optionally enter a deployment-specific pay-rate override. Employee and owner deployments have no per-assignment payable rate.
4. Select eligible properties. Leave the property selection empty only when the resource should be eligible across the entire organization.
5. Select **Save Deployment**.

An active deployment makes the resource selectable; it does not create an assignment. An organization administrator or property manager chooses **Afterlight contractor** for a 1099 resource or **Afterlight staff** for an employee or owner, then assigns the person to a date and property within the deployment scope.

## Edit a deployment

Use deployment editing to change where a resource can be scheduled in the future:

1. Find the deployment in the table below **Deploy a Resource**.
2. Select **Edit**.
3. In **Edit Resource Deployment**, review the organization, eligible properties, and contractor pay override when applicable.
4. Select a different managed or hybrid organization when the resource must move, or change the property scope within the current organization.
5. Select **Save Changes**.

Changing deployment scope affects future scheduling only. Existing assignments, completed inspections, earnings, and audit history remain linked to the original deployment context. Moving a resource to another organization does not move those historical records.

Use **Pause** for a temporary stop and **Reactivate** when the same deployment should become eligible again. An empty eligible-property selection means all properties in that organization; it does not mean no properties.

## Approve completed earnings

Only completed **Afterlight contractor** work creates a **Pending approval** earning in Afterlight. Employee and owner work never creates a contractor earning or Gusto payment.

1. Compare the earning with the completed assignment and saved compensation.
2. Select **Approve** when the work and amount are correct.
3. Select **Void** only when the payable must not be paid, and record a specific reason.

Customer invoices and contractor earnings are separate ledgers. Never approve or change a contractor earning merely to make it match a customer invoice.

For commercial work fulfilled by Afterlight, the related customer invoice is prepared separately under **Platform > Service Billing**. The resource remains the inspection performer and never prepares or submits that customer invoice. See [Process Afterlight service invoices](platform-process-service-invoices.md).

## Reconcile a Gusto payout

1. Select the approved earnings to pay.
2. Enter the intended Gusto check date.
3. Select **Create Gusto Batch**.
4. Enter the batch in Gusto, using the Afterlight batch number as the invoice number for each contractor payment.
5. Return to Afterlight and select **Record Gusto Submission**. Enter a Gusto confirmation reference if displayed; otherwise use the Afterlight batch number.
6. Select **Mark Paid** only after Gusto shows the payment as processed or paid.

If Gusto rejects or changes a payment, leave the Afterlight batch unmarked and resolve the discrepancy before reconciliation.

## Pause or suspend access

- Pause or end a deployment to stop future scheduling for that organization or property scope.
- Set availability to **Unavailable** for a temporary worker-level scheduling pause.
- Set the resource status to **Suspended** to remove Resource Portal entitlement at the next authenticated request.

These controls do not erase completed assignments, earnings, payout history, or audit records.

## Archive and restore a resource

Archive a resource only when the person should leave the current Resource Network directory:

1. Reassign or cancel every scheduled assignment for that resource. Afterlight refuses archival while scheduled work remains.
2. Find the resource under **Current resources** and select **Edit details**.
3. Select **Archive Resource**, enter a specific reason, and confirm.

Archiving sets the profile to suspended and unavailable, pauses its active deployments, revokes current Resource Portal sessions, and moves the profile to the archived directory. Historical assignments, completed inspections, contractor earnings, payout batches, and deployment records remain intact.

To restore a record, select **Find archived resource**, open **View details**, review its archive reason and retained history, then select **Restore Resource**. A linked resource returns as **Suspended** and **Unavailable**. Review the profile, Gusto state, and deployment scope before deliberately reactivating it. Former deployments are not automatically reactivated.

## Troubleshooting

- **The workspace switcher is missing:** Confirm that the email matches the existing user exactly, the resource profile is linked to that user, and the profile is not suspended. Ask the user to sign out and back in.
- **The resource is missing from the Scheduler:** Confirm that the profile and deployment are active, the selected date is within the deployment period, and the selected property is in scope.
- **A deployment update affects the wrong organization:** Cancel the edit before saving, reopen the intended deployment, and confirm the organization and property scope. Historical assignments will not move with a corrected deployment.
- **Activation is refused:** Link the Afterlight identity. For contractors, also complete Gusto onboarding before setting the Afterlight status to Active.
- **Archiving is refused:** Reassign or cancel every scheduled assignment for the resource, then try again.
- **A restored resource is still unavailable:** This is the safe default. Review and activate the resource, then reactivate or replace the appropriate deployment.
- **An earning is missing:** Confirm that the inspection was opened from the assigned Resource Portal card and successfully completed.
- **A payout cannot be batched:** Every selected earning must be approved, and each contractor must have completed Gusto onboarding and a matching email.
