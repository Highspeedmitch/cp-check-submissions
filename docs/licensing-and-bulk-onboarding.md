# Licensing enforcement and bulk onboarding

## Contract pricing

Organization-level recurring prices are defined in `backend/services/servicePlanPricing.js`:

| Service model | Tier | Recurring organization fee | Additional service billing |
| --- | --- | ---: | --- |
| Full-stack SaaS | Tier 1 | $300/month | None by default |
| Full-stack SaaS | Tier 2 | $700/month | None by default |
| Full-stack SaaS | Tier 3 | $1,000/month | None by default |
| Hybrid | Tier 1 | $300/month | Afterlight visits billed separately; 15% monthly portfolio minimum |
| Hybrid | Tier 2 | $700/month | Afterlight visits billed separately; 12% monthly portfolio minimum |
| Hybrid | Tier 3 | $1,000/month | Afterlight visits billed separately; 10% monthly portfolio minimum |
| Managed service | Tier 1 | $500/month | Up to 25 properties; property visits billed separately |
| Managed service | Tier 2 | $1,250/month | Up to 75 properties; property visits billed separately |
| Managed service | Tier 3 | $2,500/month | Up to 250 properties; property visits billed separately |
| Boutique service | Not tiered | $75/month | Afterlight visits billed separately; 1-3 properties under 5,000 square feet each |

The Hybrid percentage is the minimum share of the monthly portfolio assigned to Afterlight. It is not a percentage surcharge on the license fee.

Boutique service is a deliberately constrained Afterlight-operated plan for small commercial portfolios. Only organizations whose organization type is **Commercial** are eligible. It includes one administrator, two non-administrator users, and no more than three active properties. Every property must have a recorded gross area below 5,000 square feet; a property at exactly 5,000 square feet is not eligible. Boutique fulfillment is limited to Afterlight staff or Afterlight contractors. Portfolio Reporting and monthly executive summaries are not included. The $75 organization fee is charged once per organization each month, never once per property, and does not replace per-visit pricing.

Boutique organization users do not receive a generic **Start Inspection** action. Field work opens from an exact scheduled assignment in the Afterlight resource workspace. An assignment created before a service-model transition remains available through its assignment-specific link and keeps its saved fulfillment and billing snapshot, but an unassigned organization submission is rejected.

The service-plan interfaces display these contract terms and preserve the current and requested fee in each plan-change request. They do not yet create or collect an organization-level recurring invoice. Existing customer invoices remain tied to completed property visits.

## Licensed capacity

backend/services/licenseCapacity.js is the canonical source for administrator, user, and property allocation.

For tiered SaaS, Hybrid, and Managed Service organizations:

- active, non-archived organization administrators consume administrator seats;
- pending, unexpired administrator invitations consume administrator seats;
- active, non-archived non-admin organization accounts consume user seats;
- pending, unexpired non-admin invitations consume user seats;
- organization properties consume property capacity;
- inactive or archived users do not consume user seats;
- Afterlight resource accounts and resource invitations never consume customer seats.

SaaS and Hybrid enforce administrator, user, and property capacity. Managed Service enforces the shared 25/75/250 property bands while organization administrator and user accounts remain unmetered. Boutique organizations use fixed capacity of one administrator, two non-administrator users, and three properties and do not select a tier.

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

### DEV license backfill

Legacy Managed Service records without a saved tier resolve safely as Tier 1 at runtime. After deploying the tier-aware backend to DEV, preview the persistent normalization from the backend directory:

```powershell
npm run backfill-dev-licenses
```

Review the organization names and before/after limits, then apply only to the DEV database:

```powershell
npm run backfill-dev-licenses -- --apply
```

The script refuses to apply when `NODE_ENV=production`. Production uses the separately reviewed organization-license manifest, where Picor is explicitly Managed Service Tier 1.

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
| gross_square_feet | Boutique organizations | Must be a positive whole number below 5,000 for every Boutique property |
| property_type | No | `free_standing`, `strip_mall`, or `individual_suite`; defaults to `free_standing` for Boutique imports when omitted |
| region | No | Defaults to Uncategorized |
| latitude and longitude | No | Supply both or neither |
| inspection_recipient_emails | No | Separate addresses with a vertical bar |

If the organization, directory, pending invitations, or capacity changes between preview and commit, the transaction stops without creating partial records.

An administrator can also submit a bulk-onboarding assistance request. The request creates a platform audit record with the import type, estimated count, operational reason, and current capacity snapshot, then notifies platform administrators. The request never includes the CSV and cannot reserve capacity, change licensing, or bypass the passkey-protected commit.
