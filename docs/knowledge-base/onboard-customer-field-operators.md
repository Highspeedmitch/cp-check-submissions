# Onboard customer employees and contractors as Field Operators

**Audience:** Commercial organization administrators

Use the **Field Operator** role for people who complete customer-owned inspection work. Their separate **Assignment type** controls which fulfillment route can schedule them and whether their work can create a customer-contractor invoice.

## Choose the assignment type

| Assignment type | Use when | Scheduler route | Invoice behavior |
| --- | --- | --- | --- |
| Customer Employee | The person is employed by your organization | Customer Employee | No invoice is created |
| Customer Contractor | The person is contracted directly by your organization | Customer Contractor | The completed work can route an invoice to your accounts-payable workflow |

Customer Contractors are not Afterlight Resource Network contractors. A SaaS customer manages its own Customer Contractors, while Afterlight resource relationships and compensation are managed separately by Afterlight.

## Invite a Field Operator

1. From the Dashboard navigation, open **Users**.
2. Under **Invitations**, select **Invite User**.
3. Enter the person's email address.
4. Set **Role** to **Field Operator**.
5. Set **Assignment type** to **Customer Employee** or **Customer Contractor**.
6. Select **Send Invitation**.

The invitation shows both the access role and assignment type. After the person accepts it, they appear in Scheduler only when the selected customer fulfillment route matches their assignment type.

## Change an existing user's assignment type

1. Open **Users** and select the person under **Current Users**.
2. Confirm that **Role** is **Field Operator**.
3. Change **Assignment type** to the correct customer relationship.
4. Select **Save Changes**.
5. Review future scheduled work and deliberately reassign any work that no longer matches.

Previously created assignments keep their saved fulfillment and invoice routing. The change controls new assignment selections and API validation; it does not rewrite historical work.

## Understand other roles

Property Managers and Property Owners can be marked **Not scheduled** when they only need management or ownership access. If they also perform field work, choose the appropriate Customer Employee or Customer Contractor assignment type. Cleaners must have an explicit customer assignment type before they can be saved or scheduled.

## If something goes wrong

- **The person is missing from Scheduler:** Select the intended fulfillment route first, then confirm that the user's account is active and its Assignment type matches that route.
- **A Customer Employee appears under Customer Contractor:** Correct the user's Assignment type in **Users**. The API rejects a mismatched new assignment even if an outdated page still displays the person.
- **An invoice appears for employee work:** Confirm that the assignment itself was saved as Customer Employee. Existing assignments keep their original fulfillment snapshot after a user profile is changed.
- **You need an Afterlight worker:** SaaS organizations cannot create new Afterlight Staff or Afterlight Contractor assignments. Those sources require a Managed Service or Hybrid agreement and an active Afterlight deployment.

[Back to the knowledge base](README.md)
