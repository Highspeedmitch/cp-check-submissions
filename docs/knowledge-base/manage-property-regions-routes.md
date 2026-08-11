# Manage property regions and routes

**Audience:** Organization administrators

Use property regions to organize nearby locations, then create ordered routes that can be reused for access, scheduling, resource deployments, and route-aware pricing. A region is a property label; it is not a separate record that must be created first.

## Understand regions and routes

- A **region** groups properties geographically, such as `Tucson - East/Central`. Typing a new named region on a property creates that option for the organization after the property is saved.
- A **route** is an administrator-defined, ordered group of two to six properties from one named region.
- Assigning a property to a region makes it eligible for a route but does not enroll it automatically.
- A property can belong to only one active route at a time.
- **Uncategorized** properties cannot be added to a route.

## Create a named region while adding a property

1. From the Dashboard navigation, select **Add Properties**.
2. Select **Single property** and complete the property setup fields.
3. In **Region**, select an existing suggestion or type the new region name exactly as it should appear.
4. Select **Create Property**.

The saved property establishes the named region. The region then appears as an option for other properties and in **Regions & Routes**. There is no separate Create Region button.

## Change an existing property's region

1. Find the property on the Dashboard and select **Manage Details**.
2. Under **Property details**, enter or select the **Region**.
3. Select **Save Property Details**.

Only an organization administrator can change a region. If the property belongs to an active route, remove it from that route first. When the final property leaves a region, that region disappears from the available-region list because regions are derived from current property values.

## Create and order a route

1. From **Admin tools**, open **Regions & Routes**.
2. Select **+ New route**.
3. Enter a route name and select a named region.
4. Select between two and six available properties. Every property must use the selected region and cannot already belong to another active route.
5. Select **Suggest efficient order** to request a travel-based starting order when the properties have valid coordinates.
6. Use the up and down controls to make any operational adjustments.
7. Select **Create route**.

The suggested order minimizes travel between the selected stops. It does not know the operative's home, previous assignment, or shift origin, so the reverse order or a manually adjusted order may be more practical. The saved order is guidance for the Field Operator and is also used by route-aware pricing.

## Understand route-driven access

Routes supplement individual property access; they do not replace it.

- Assigning a user or resource to a route grants future eligibility for every current route stop.
- A person with individual access to every route stop is automatically eligible for that route.
- If an administrator changes route membership, future user and deployment scope follows the saved route automatically.
- Existing scheduled route assignments retain their original stop snapshot and are not rewritten.

See [Manage organization users and access](manage-organization-users.md) for organization-user scope and [Manage Afterlight resources and contractor payables](platform-manage-resources-payables.md) for platform deployment scope.

## Edit, archive, or restore a route

- Select **Edit route** to change membership or order. Changes affect future access, scheduling, and pricing context.
- Select **Archive** when the route should no longer be available for future assignments or scope. Existing scheduled route work remains intact.
- Select **Restore route** to make an archived route active again, subject to current property and route rules.

Review user and resource scope after a significant route edit so administrators understand which future properties became available.

## Schedule and price route work

In Scheduler, select **Route** as the assignment type, choose the route, fulfillment, assignee, and service date, then review the ordered stop preview. Afterlight creates one grouped route assignment backed by per-property assignment records. Notifications and calendar entries identify it as a **ROUTE** assignment with multiple stops. Pricing, customer billing, AP routing, inspection completion, and contractor pay remain per property.

The current Scheduler creates one route assignment at a time; recurring route service is not yet configured. A service night that crosses midnight belongs to its starting service date.

Platform administrators can also select an active route in the route-aware Pricing Estimator. The calculation uses the saved stop order and current route membership. A full six-stop route cannot accept another proposed property. See [Calculate preliminary service pricing](platform-use-pricing-estimator.md).

## If something goes wrong

- **The region is missing from Regions & Routes:** Confirm that at least one saved property uses the named region and that the value is not **Uncategorized**.
- **A property is missing from the route builder:** Confirm that its region matches the selected route region and that it is not already in another active route.
- **The property region cannot be changed:** Remove the property from its active route, then return to **Manage Details**.
- **Suggest efficient order fails:** Confirm that every selected property has a valid physical address and coordinates. You can still order stops manually.
- **A route cannot be saved:** Select between two and six properties, keep every property in one region, and use a route name not already used by another active route.
- **A route is missing from Scheduler:** Confirm that it is active. Property managers see only routes for which they manage every current stop; organization administrators see every active route.
- **An expected assignee is missing after selecting a route:** Confirm that the user's future work scope or the resource deployment covers every current route stop.
- **A route edit did not change existing scheduled work:** This is expected. Scheduled route runs preserve their stop snapshot; the edit applies to future work.

[Back to the knowledge base](README.md)
