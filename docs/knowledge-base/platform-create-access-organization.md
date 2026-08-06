# Create and securely access an organization

**Audience:** Afterlight platform administrators

Use Platform Administration to launch a customer workspace, assign its contracted service and license settings, send its first administrator invitation, and open a temporary audited Admin View when support or configuration work is required.

## Create an organization

Before creating the workspace, confirm the customer's legal operating name, organization type, contracted service model, license tier when applicable, initial fulfillment plan, reporting timezone, and designated administrator email.

1. From Platform Administration, select **New Organization**.
2. Under **Organization profile**, enter the unique **Organization name**, select the organization type and reporting timezone, and select **Continue**.
3. Under **Service delivery**, choose the contracted service model:
   - **Full-stack SaaS:** Customer-operated fulfillment by default.
   - **Managed service:** Afterlight staff fulfillment by default.
   - **Hybrid:** Customer-operated default with property-level or assignment-level Afterlight coverage when configured.
4. For Full-stack SaaS or Hybrid, select the contracted **License tier**:

   | Tier | Administrators | Users | Properties |
   | --- | ---: | ---: | ---: |
   | Tier 1 | 2 | 5 | 10 |
   | Tier 2 | 3 | 20 | 50 |
   | Tier 3 | 5 | 50 | 250 |

   Managed service administrator seats are not metered and no license-tier selection appears.
5. Confirm the **Default fulfillment** selection. Change the model-derived default only when the approved operating plan requires it, then select **Continue**.
6. Enter the designated **Administrator email** and select **Continue**.
7. Under **Review and launch**, verify every value. Use the corresponding **Edit** control if anything is incorrect.
8. Select **Launch Organization** once.

The wizard saves an unfinished draft in the current browser. Select **Save and close** when you need to continue later, or **Start over** to discard the draft. No organization or invitation is created before **Launch Organization**.

Afterlight creates the workspace and a secure, single-use invitation for its first organization administrator. For a metered agreement, that pending invitation reserves the first administrator seat. If delivery fails, the organization remains created and the invitation remains pending. Find the organization card and select **Resend invitation** instead of creating the organization again.

After accepting the invitation, the customer administrator uses **Setup Guide** to confirm service delivery, establish an organization-owned administrative passkey, and add the first property. Inviting the team and validating the first inspection are recommended readiness items.

## Open an audited Admin View

1. Find the organization under **Organization Overview**.
2. Select **Open Admin View**.
3. Replace the suggested text with a specific support, configuration, or investigation reason.
4. If **Confirm your identity** appears, enter a new six-digit code from your authenticator app and select **Verify and continue**.

Afterlight opens a temporary organization administrator session and records the platform administrator, organization, reason, network information, and access time. Use this session only for the stated purpose.

Identity confirmation is required when your most recent multi-factor verification is more than 15 minutes old. A successful confirmation refreshes that window. If the configured provider redirects you through an identity service, complete the prompt and Afterlight will resume the pending Admin View request.

## Leave the organization workspace

Use the platform return control to end the assumed organization session as soon as the work is complete. Confirm that Platform Administration is visible again before opening another organization.

Do not share an assumed session, leave it open on an unattended device, or use a customer administrator's credentials for support work.

## If something goes wrong

- **The organization name already exists:** Find the existing organization. Do not create a spelling variation or duplicate tenant.
- **The administrator email already belongs to an Afterlight account:** Resolve the existing identity and intended organization access before creating the workspace.
- **The invitation was not delivered:** Use **Resend invitation** on the organization card. The current pending link is replaced according to the invitation workflow.
- **The wrong tier was selected:** Stop before launch and use **Edit**. After launch, treat a tier change as a contract and licensing correction rather than creating a replacement organization.
- **A draft contains old information:** Select **Start over** to clear the browser-saved onboarding draft.
- **The authenticator code is refused:** Wait for a new code and try once more. A code already used during that time step cannot be replayed.
- **Identity confirmation is unavailable:** Sign out, sign in again to refresh MFA, and retry. Escalate the deployment configuration if the error remains.
- **The pending Admin View request expired:** Return to Platform Administration, select **Open Admin View**, and enter the reason again.

[Back to the knowledge base](README.md)
