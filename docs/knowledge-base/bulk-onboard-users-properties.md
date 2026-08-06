# Bulk onboard users and properties with CSV

Bulk onboarding lets an organization administrator validate and add many user invitations or properties at once. The import follows the same licensed user and property limits as individual actions.

## Before you begin

You need:

- organization administrator access;
- the organization's administrative action passkey;
- a CSV file no larger than 512 KB with no more than 250 data rows.

Afterlight resource accounts are managed separately and should not appear in a customer user CSV.

## Download a template

1. Open **Admin tools** in the dashboard navigation.
2. Select **Bulk Onboarding**.
3. Choose **Users** or **Properties**.
4. Select **Download users template** or **Download properties template**.

Keep the template header names unchanged.

## Prepare a user CSV

Each row needs an email address and role. Supported roles are:

- user;
- property_manager;
- client;
- contractor;
- cleaner.

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

## Common validation messages

**Not enough licensed capacity**

The requested rows would exceed the current user or property limit. Reduce the file size or request a license increase before importing.

**Email already belongs to an account or invitation**

Remove the row. If the person is archived, restore their retained user record instead.

**Property not found**

Use the exact existing property name in property_names, including punctuation and spacing.

**Property name or code already exists**

Remove the duplicate or correct the row before uploading again.

**Preview changed**

Someone changed the organization after your preview. Upload and review the CSV again so the final import uses current data and capacity.
