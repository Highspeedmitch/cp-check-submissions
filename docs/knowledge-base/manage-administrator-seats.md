# Invite organization administrators and manage licensed seats

**Audience:** Organization administrators

Use the **Administrator seats** section of **User Management** to review administrator access, invite another administrator, manage pending invitations, and request more licensed capacity.

Administrators have full organization access. Use the standard **Invitations** section below it for Field Operators, property managers, owners, and cleaners.

## Understand the administrator seat meter

The meter separates active administrators from pending administrator invitations. Each active administrator and each unexpired pending invitation consumes one administrator seat.

| Service agreement | Administrator seats |
| --- | ---: |
| Full Stack SaaS or Hybrid Tier 1 | 2 |
| Full Stack SaaS or Hybrid Tier 2 | 3 |
| Full Stack SaaS or Hybrid Tier 3 | 5 |
| Managed service | Not metered |

An expired or revoked invitation does not consume a seat. The plan name above the meter identifies the agreement currently applied to the organization.

## Invite an administrator

Before starting, confirm that the person should receive full organization access and that you have the organization's **Administrative action passkey**.

1. From the Dashboard navigation, open **Users**.
2. In **Administrator seats**, select **Invite Administrator**.
3. Enter one or more administrator email addresses. Put one address on each line or separate addresses with commas.
4. Enter the organization's **Administrative action passkey**.
5. Select **Send administrator invitation**.

You cannot invite more administrators than the number of available seats. Pending invitations reserve their seats immediately, even when the email provider cannot complete delivery.

The administrative action passkey is not the same as your account password or authenticator code. If the organization has not configured its own passkey, open **Security** and establish it before inviting another administrator.

## Manage a pending invitation

- Select **Resend** to replace the current link and send the pending invitation again.
- Select **Revoke**, review the in-app confirmation, and select **Revoke invitation** to invalidate the current link and release its reserved seat.
- If an administrator invitation has expired, revoke it and create a new passkey-authorized invitation. Expired administrator invitations cannot simply be reactivated.

If delivery fails, do not create a spelling variation of the email address. Keep the pending invitation and use **Resend** after the delivery issue is corrected.

## Request additional licensing

When every metered administrator seat is allocated, **Invite Administrator** is replaced by **Request Additional License**.

1. Select **Request Additional License**.
2. For a Tier 1 or Tier 2 organization, select a higher standard tier. For Tier 3, enter the requested custom administrator-seat capacity.
3. Optionally choose a requested effective date.
4. Enter the business reason and capacity context.
5. Select **Submit request**.

Afterlight adds the request to **Service Plan Requests** and notifies platform administration. The request does not immediately change the contract or seat limit. Only one active service-plan request can exist for the organization at a time.

Approval of a Tier 1 or Tier 2 request applies the selected tier's administrator, user, and property limits. Approval of a Tier 3 custom-capacity request changes only the administrator-seat limit. It does not change the organization's tier, user limit, property limit, fulfillment policy, assignments, or invoices.

Managed-service organizations do not display a seat limit and can continue using **Invite Administrator**.

## Security and access restrictions

- Administrator invitations require an organization-owned administrative action passkey.
- A platform administrator using temporary **Admin View** cannot issue administrator invitations or submit a license request for the customer.
- An email address already attached to an Afterlight account cannot be invited as a new administrator.
- An archived identity must be resolved or restored instead of being duplicated.
- Administrator records are intentionally separate from the editable non-administrator user directory.

## If something goes wrong

- **Administrative verification failed:** Re-enter the organization passkey. If its value is uncertain, an authorized administrator can rotate it from **Security**.
- **All administrator seats are used:** Revoke an unnecessary pending invitation or select **Request Additional License**.
- **An active invitation already exists:** Resend or revoke the existing invitation instead of creating another one.
- **The invitation expired:** Revoke it, select **Invite Administrator**, and authorize a new invitation with the organization passkey.
- **The invitation email was not delivered:** The seat remains reserved. Correct the delivery issue and select **Resend**.
- **A service-plan request already exists:** Open **Service Delivery** to review its status or respond to an Afterlight information request before submitting another.

[Back to the knowledge base](README.md)
