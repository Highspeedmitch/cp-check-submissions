# Calculate preliminary service pricing

**Audience:** Afterlight platform administrators

Use **Marketing tools > Pricing Estimator** to calculate preliminary customer-facing service pricing for a single property, an eligible property cluster, a route-aware property, or a Boutique service portfolio during a prospect conversation. The estimator uses versioned server-controlled formulas, but it does not create a bid request, upload an attachment, notify a customer, or save prospect information.

This tool estimates client pricing. Route-aware mode includes a bounded operational travel adjustment, but the estimator does not calculate contractor compensation, total overhead, profitability, or an approved customer quote.

## Calculate an estimate

1. Open the Platform dashboard.
2. Under **Marketing tools**, select **Pricing Estimator**.
3. Select **Single property**.
4. Enter the prospect property's approximate gross square footage.
5. Select **Free standing**, **Strip mall**, or **Individual suite**.
6. Select **Monthly**, **Weekly**, or **Ad-hoc** service.
7. Select **Known site concerns are expected** when the prospect has identified issues that may affect scope.
8. Select **Include the organization-level $500 managed-service base in this quote** only when preparing a new or repriced managed-service agreement. Leave it off when adding a property to an organization that already pays the base.
9. Select **Calculate estimate**.

Afterlight displays estimated pricing per visit and, when supported, the monthly visit-service subtotal. When the managed-service base is included, it also displays the $500 organization-level base and the combined monthly contract total. The base is applied once per organization, never once per property.

Formula version 6 retains the diminishing-marginal-cost retail-center curve introduced in version 4. It is calibrated to these per-visit benchmarks: $50 at 1,500 square feet, $125 at 18,000 square feet, $200 at 40,000 square feet, and $250 at 78,000 square feet. Values between the benchmarks are linearly interpolated; larger properties continue at the final marginal rate and still trigger manual review above 250,000 square feet. These anchors represent strip-mall or retail-center work. Free-standing properties and individual suites retain lower relative complexity modifiers.

The $50 minimum remains the floor for an individually priced, non-cluster property. Cluster calculations continue to price the primary property at its standalone amount and each eligible additional property at 50%.

Select **Copy summary** to place a plain-language internal summary on your clipboard. Review and revise the wording before moving it into customer-facing material.

## Calculate Boutique service

Boutique service is for one to three small commercial properties operated through Afterlight fulfillment. The monthly estimate consists of one $75 organization license plus the calculated visit charge for every property. The license is applied once whether the portfolio contains one, two, or three properties.

Every proposed property must have a gross area below 5,000 square feet. A property at exactly 5,000 square feet, a missing size, a fourth property, or a non-monthly service schedule is not eligible for the Boutique calculation and should be evaluated under another service model.

1. Select **Boutique service**.
2. Add one to three proposed properties.
3. Enter each address and confirm the applicable Mapbox result.
4. Enter each property's gross square footage and property type.
5. Mark known concerns when the prospect has identified unusual work or risk.
6. For two or three properties, confirm whether they will normally be serviced on the same route and service date.
7. Select **Calculate Boutique estimate**.

Each property retains at least the $50 visit-work floor. The estimator then measures operational travel from the private operations base. The first 10 round-trip miles and 30 round-trip minutes are included. Excess mileage and loaded travel time are priced by backend policy and rounded to the nearest $5. Boutique travel is not limited by the ordinary route-aware percentage surcharge cap, because a low-cost visit can otherwise understate the real cost of serving a distant standalone property.

When multiple properties will be serviced together, the estimator calculates one home-base loop, selects the efficient stop order, and allocates that loop's travel cost across the properties. When they will be serviced separately, it calculates an independent home-base round trip for each property. Route efficiency reduces travel only; it never discounts the $75 organization license or a property's visit-work floor.

The result separates the organization license, property-work charge, allocated travel charge, per-property visit total, visit-service subtotal, and estimated monthly contract total. It also displays the modeled stop order and any manual-review reason. The private operations-base coordinates and Mapbox token remain backend-only.

## Calculate a property cluster

Cluster pricing shares visit overhead across distinct nearby properties. The highest standalone per-visit estimate remains at full price. Each additional property is included at 50% of its standalone per-visit estimate, and the combined result is rounded to the nearest $25.

A cluster may contain no more than six properties, matching the operational route limit. A seventh property must be priced as a separate cluster, route, or standalone visit.

1. Select **Property cluster**.
2. Enter the square footage and type for each property. Use **Add property** for clusters containing more than two properties.
3. Select the shared service frequency.
4. Confirm that every property is within 0.5 mile of the primary property.
5. Confirm that every property will be serviced during the same scheduled visit.
6. Choose whether this quote should include the organization-level managed-service base.
7. Select **Calculate estimate**.

The result compares the combined cluster price with the total price of estimating every property independently. Distance alone does not qualify properties for cluster pricing. Properties with different service schedules or separate visits must be estimated independently.

Cluster pricing is currently a Platform Admin planning capability. Property managers can continue to submit individual bid requests, but they cannot apply the cluster discount without platform review.

## Calculate a route-aware property

Route-aware pricing separates the property-work estimate from geographic adjustments. It can add a distance surcharge for travel beyond the included local round trip, then apply bounded route and density credits when an Afterlight-serviced property fits efficiently into a specific active organization route.

1. Select **Route-aware property**.
2. Select the organization.
3. Select the active route the proposed property may join, or leave **Standalone trip / new route** selected.
4. For a saved route, select **Modeled future route** or **Confirmed same-day route**. Use confirmed only when the proposed property and every saved route stop will be serviced during the same service date.
5. Enter the proposed property address and select **Find address**.
6. Confirm the correct Mapbox address result. The estimator will not calculate until a result is confirmed.
7. Enter the property size, type, service frequency, and known concerns.
8. Choose whether this quote should include the organization-level managed-service base.
9. Select **Calculate estimate**.

Only properties already saved to the selected route, assigned to an Afterlight fulfillment source, and containing valid coordinates are included. Customer-employee and customer-contractor properties cannot be used as route-pricing stops. Region membership alone does not create a route or density credit. Standalone/new-route pricing deliberately receives no route or density credit.

The estimator uses Mapbox's stable driving profile for road distance and travel time. It preserves the stop order saved by the organization administrator, wraps that route with the private operations base, and measures the least-expensive insertion point for the proposed property. Formula version 6 converts the added detour miles and minutes into a route-fit score. A near-zero-detour stop can receive up to a 70% direct-route credit, while the modeled-route assumption retains a 10% confidence reserve. Selected-route density credit is calculated independently and can contribute up to 15%. Combined credits are capped at 80%, distance surcharges remain bounded, and the final result cannot fall below the $50 standalone minimum.

The result identifies **Direct-route marginal price**, **Near-route price**, or **Standard route price**. It also snapshots and displays the selected route name, region, version, stop count, saved stop order, insertion leg, and route-fit percentage so the assumption can be checked before presenting a quote. Future estimates use the route's current membership and order after an administrator edits it; an already-calculated result retains the route snapshot used for that calculation.

An operational route can contain at most six properties. Routes already containing six stops are unavailable in the estimator because the proposed property cannot be inserted without exceeding that limit.

If live road routing is unavailable or cannot connect every location, the calculation falls back to the bounded coordinate model and requires manual review. Coordinate fallback does not qualify for the deep route-fit credit. The factor breakdown identifies either **Road matrix** or **Coordinate fallback** and shows travel miles and minutes, selected-route density, nearest route property, route detour, confidence, and credits. The private operations-base coordinates and Mapbox token are configured only on the backend and are not returned to the browser.

## Understand manual-review warnings

The estimator marks a result for manual review when the request includes an ad-hoc schedule, known site concerns, a road-routing fallback, an unusually long trip, or another input outside the automatically supported pricing range. A flagged result is still a preliminary baseline; it is not approval to present that amount as a quote.

For ad-hoc service, the tool provides a per-visit estimate but intentionally does not calculate monthly pricing.

## Protect prospect information

- Do not enter names, email addresses, access instructions, or other personal information. Single-property and cluster calculations do not require an address. Route-aware and Boutique address results remain stateless and are used only for the current calculation.
- Estimates are stateless and are not added to the bid repository.
- Use **Reset** before beginning another prospect calculation.
- Create a formal bid request through the customer workflow when supporting property information, review status, and retained history are required.

[Back to the knowledge base](README.md)
