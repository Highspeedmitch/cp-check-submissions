# Manage organization users and access

**Audience:** Commercial organization administrators

Use **User Management** to invite people, assign roles and properties, suspend access, and retain former-user history without deleting operational records.

Administrator access is managed separately in the **Administrator seats** section at the top of the page. See [Invite organization administrators and manage licensed seats](manage-administrator-seats.md) when the new person needs full organization access.

## Invite a non-administrator user

1. From the Dashboard navigation, open **Users**.
2. Under **Invitations**, select **Invite User**.
3. Enter the person's email address and choose the role that matches their work.
4. Choose an **Assignment type** when the person performs field work:
   - **Customer Employee** for an organization employee whose work does not create an invoice;
   - **Customer Contractor** for an organization-managed contractor whose work can route an invoice to customer accounts payable; or
   - **Not scheduled** for a property manager or property owner who should not appear as an assignee.
5. For a property manager or property owner, select the properties they may access.
6. Select **Send Invitation**.

Use **Field Operator** as the role for a customer employee or customer contractor whose primary responsibility is completing inspections. The assignment type is deliberately separate from access. See [Onboard customer employees and contractors as Field Operators](onboard-customer-field-operators.md).

The invitation is single-use and expires. A pending or expired invitation can be resent. Revoking an invitation immediately invalidates its current link.

The roles in this standard invitation form do not include organization administrator. Use **Invite Administrator** in the licensed seat panel for that role.

If email delivery fails, the invitation remains in the pending list so you can resend it. Do not send a second invitation to another spelling of the same person's email to work around a delivery or account problem.

## Edit a current user

1. Keep **Current users** selected and search by name, email, or role when needed.
2. Select the user.
3. Review their name, email, role, assignment type, account status, and property assignments.
4. Make the required changes and select **Save Changes**.

Changing account details or access invalidates the user's existing sessions. Ask the user to sign in again after a role, status, or property-access change.

Use **Inactive** for an account that should remain in the current directory but must not sign in. Use **Send Password Reset** when the person still owns the account but cannot access it.

## Archive a user

Archiving is appropriate when a non-administrator has left the organization and should no longer appear in the active directory.

1. Reassign or cancel every scheduled assignment belonging to the user. Afterlight refuses the archive while scheduled work remains.
2. Select the user under **Current users**.
3. Select **Archive User**.
4. Enter a specific archive reason and select **Confirm Archive**.
5. Confirm the action.

Afterlight removes the user's organization access and current property-manager or property-owner assignments, revokes their sessions, and moves the record to **Archived Users**. Completed assignments, submissions, and audit history remain available.

Organization administrators cannot be archived from this directory. Resolve administrator succession through the administrator-seat workflow before changing that access.

## Restore a user

1. Select **Archived users** and search for the retained record.
2. Open **View details** and review the former role, archive reason, assignments, and submissions.
3. Select **Restore User** and confirm.
4. Return to **Current users** and review the restored account.
5. Reassign any required property access manually.

Restoration preserves the previous active or inactive account status. An inactive account remains unable to sign in until you deliberately activate it. Property assignments removed during archival are not restored automatically.

## If something goes wrong

- **An invitation already exists:** Resend or revoke the pending invitation instead of creating another one.
- **The email belongs to an existing or archived account:** Update or restore that record rather than creating a duplicate identity.
- **Archiving is refused:** Reassign or cancel the user's scheduled assignments, then try again.
- **A restored user cannot sign in:** Check whether the preserved account status is inactive, then send a password reset if needed.
- **A property is missing after restoration:** Reassign it from the user's current profile. Restoration does not recreate former property access.
- **You need to add another administrator:** Use **Administrator seats**, not the standard user invitation form.

[Back to the knowledge base](README.md)
