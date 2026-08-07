# Bulk onboard users and properties with CSV

Bulk onboarding lets an organization administrator validate and add many user invitations or properties at once. The import follows the same licensed user and property limits as individual actions.

## Before you begin

You need:

- organization administrator access;
- the organization's administrative action passkey;
- a CSV file no larger than 512 KB with no more than 250 data rows.

Afterlight resource accounts are managed separately and should not appear in a customer user CSV.

## Download a template

For users:

1. Open **Admin tools > Users**.
2. Select **Import Users**.

For properties:

1. Open **Admin tools > Add Properties**.
2. Select **Bulk load**.

The bulk onboarding page opens with the relevant import type selected. You can switch between **Users** and **Properties**, then select the matching template download.

Keep the template header names unchanged.

## Prepare a user CSV

Each row needs an email address and role. Use these role values in new files:

- field_operator;
- property_manager;
- client;
- cleaner.

Use the `engagement_type` column to control scheduling eligibility:

- `customer_employee` for customer employees;
- `customer_contractor` for customer-managed contractors; or
- blank for a property manager or property owner who should not be scheduled.

Field Operators and cleaners require an assignment type. Older CSV values of `user` and `contractor` remain accepted for backward compatibility and infer Customer Employee and Customer Contractor respectively, but new templates use `field_operator` plus an explicit `engagement_type`.

To assign a property manager or property owner during invitation, enter exact property names in the property_names column. Separate multiple names with a vertical bar.

Do not include administrators. Use **Users > Invite Administrator** so administrator capacity and passkey verification remain visible.

## Prepare a property CSV

Every property needs a unique name. Commercial organizations also require a property code, physical address, and billing address.

Latitude and longitude are optional, but must be supplied together. Separate multiple inspection recipient email addresses with a vertical bar.

## Preview and complete the import

1. Upload the CSV.
2. Select **Preview import**.
3. Review every row and the licensed capacity summary.
4. Correct the source CSV and upload it again if any row has an error.
5. Select **Continue to verification** when all rows are ready.
6. Enter the administrative action passkey.
7. Select **Complete import**.

User imports create invitation emails rather than immediate accounts. Pending invitations reserve licensed user seats until accepted, revoked, or expired.

The import is all-or-nothing. If a row, directory record, or available capacity changes after preview, Afterlight stops the import without creating a partial batch.

## Request onboarding assistance

Select **Request Onboarding Assistance** when you need help preparing a file or coordinating a larger portfolio event. Enter an approximate record count and operational context, but do not include passwords or personal data.

The request sends its summary and a current capacity snapshot to Afterlight platform administration. It does not attach the CSV, reserve capacity, change the license, or create records. Any eventual import still requires adequate licensed capacity and final organization-passkey verification.

## Common validation messages

**Not enough licensed capacity**

The requested rows would exceed the current user or property limit. Reduce the file size or select **Review license options** before importing. An assistance request does not expand capacity.

**Email already belongs to an account or invitation**

Remove the row. If the person is archived, restore their retained user record instead.

**Property not found**

Use the exact existing property name in property_names, including punctuation and spacing.

**Property name or code already exists**

Remove the duplicate or correct the row before uploading again.

**Preview changed**

Someone changed the organization after your preview. Upload and review the CSV again so the final import uses current data and capacity.
