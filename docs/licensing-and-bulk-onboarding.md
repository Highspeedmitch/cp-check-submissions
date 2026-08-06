# Licensing enforcement and bulk onboarding

## Licensed capacity

backend/services/licenseCapacity.js is the canonical source for administrator, user, and property allocation.

For licensed SaaS and Hybrid organizations:

- active, non-archived organization administrators consume administrator seats;
- pending, unexpired administrator invitations consume administrator seats;
- active, non-archived non-admin organization accounts consume user seats;
- pending, unexpired non-admin invitations consume user seats;
- organization properties consume property capacity;
- inactive or archived users do not consume user seats;
- Afterlight resource accounts and resource invitations never consume customer seats.

Managed Service organizations remain unmetered.

Capacity-bearing writes update the organization's license.capacityVersion in the same MongoDB transaction. This makes simultaneous requests contend on one organization record instead of independently passing a stale capacity check.

Enforcement covers:

- administrator invitations;
- ordinary user invitations;
- user reactivation;
- restoration of an active archived user;
- single-property creation;
- bulk user invitations;
- bulk property creation.

Public self-registration is retired so it cannot bypass invitation reservations or license checks.

## CSV onboarding workflow

Organization administrators open the same bulk workflow contextually:

- **Admin tools > Users > Import Users** for invitation imports;
- **Admin tools > Add Properties > Bulk load** for property imports.

The workflow is:

1. choose users or properties;
2. download the matching CSV template;
3. upload a CSV of no more than 250 rows or 512 KB;
4. review row validation and licensed capacity;
5. enter the organization administrative action passkey;
6. commit the all-or-nothing import.

The server parses and validates the CSV. The browser preview is informational and cannot authorize a write.

### User columns

| Column | Required | Notes |
| --- | --- | --- |
| email | Yes | Must not belong to an account or active invitation |
| role | Yes | user, property_manager, client, contractor, or cleaner |
| property_names | No | Property managers and clients only; separate names with a vertical bar |

Administrator rows are rejected and must use the dedicated administrator invitation workflow.

### Property columns

| Column | Required | Notes |
| --- | --- | --- |
| name | Yes | Must be unique in the organization and file |
| property_code | Commercial organizations | Must be unique when supplied |
| physical_address | Commercial organizations | Required for commercial property billing |
| billing_address | Commercial organizations | Required for commercial property billing |
| region | No | Defaults to Uncategorized |
| latitude and longitude | No | Supply both or neither |
| inspection_recipient_emails | No | Separate addresses with a vertical bar |

If the organization, directory, pending invitations, or capacity changes between preview and commit, the transaction stops without creating partial records.

An administrator can also submit a bulk-onboarding assistance request. The request creates a platform audit record with the import type, estimated count, operational reason, and current capacity snapshot, then notifies platform administrators. The request never includes the CSV and cannot reserve capacity, change licensing, or bypass the passkey-protected commit.
