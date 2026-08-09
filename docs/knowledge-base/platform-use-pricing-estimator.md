# Calculate preliminary service pricing

**Audience:** Afterlight platform administrators

Use **Marketing tools > Pricing Estimator** to calculate preliminary customer-facing service pricing for a single property, an eligible property cluster, or a portfolio-aware property during a prospect conversation. The estimator uses the same versioned single-property formula as internal bid estimates, but it does not create a bid request, upload an attachment, notify a customer, or save prospect information.

This tool estimates client pricing. Portfolio-aware mode includes a bounded operational travel adjustment, but the estimator does not calculate contractor compensation, total overhead, profitability, or an approved customer quote.

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

Formula version 4 replaces the earlier square-root size formula with a diminishing-marginal-cost retail-center curve calibrated to these per-visit benchmarks: $50 at 1,500 square feet, $125 at 18,000 square feet, $200 at 40,000 square feet, and $250 at 78,000 square feet. Values between the benchmarks are linearly interpolated; larger properties continue at the final marginal rate and still trigger manual review above 250,000 square feet. These anchors represent strip-mall or retail-center work. Free-standing properties and individual suites retain lower relative complexity modifiers.

The $50 minimum remains the floor for an individually priced, non-cluster property. Cluster calculations continue to price the primary property at its standalone amount and each eligible additional property at 50%.

Select **Copy summary** to place a plain-language internal summary on your clipboard. Review and revise the wording before moving it into customer-facing material.

## Calculate a property cluster

Cluster pricing shares visit overhead across distinct nearby properties. The highest standalone per-visit estimate remains at full price. Each additional property is included at 50% of its standalone per-visit estimate, and the combined result is rounded to the nearest $25.

1. Select **Property cluster**.
2. Enter the square footage and type for each property. Use **Add property** for clusters containing more than two properties.
3. Select the shared service frequency.
4. Confirm that every property is within 0.5 mile of the primary property.
5. Confirm that every property will be serviced during the same scheduled visit.
6. Choose whether this quote should include the organization-level managed-service base.
7. Select **Calculate estimate**.

The result compares the combined cluster price with the total price of estimating every property independently. Distance alone does not qualify properties for cluster pricing. Properties with different service schedules or separate visits must be estimated independently.

Cluster pricing is currently a Platform Admin planning capability. Property managers can continue to submit individual bid requests, but they cannot apply the cluster discount without platform review.

## Calculate a portfolio-aware property

Portfolio-aware pricing separates the property-work estimate from geographic adjustments. It can add a distance surcharge for travel beyond the included local round trip, then apply bounded route and portfolio-density credits when an Afterlight-serviced property fits efficiently into the existing organization portfolio.

1. Select **Portfolio-aware property**.
2. Select the organization whose portfolio should be evaluated.
3. Enter the proposed property address and select **Find address**.
4. Confirm the correct Mapbox address result. The estimator will not calculate until a result is confirmed.
5. Select **Modeled portfolio route**, **Confirmed same-day route**, or **Standalone trip only**.
6. Enter the property size, type, service frequency, and known concerns.
7. Choose whether this quote should include the organization-level managed-service base.
8. Select **Calculate estimate**.

Only organization properties assigned to an Afterlight fulfillment source and containing valid coordinates are included. Customer-employee and customer-contractor properties do not create an Afterlight route or density credit. Density uses distance decay and diminishing returns, so nearby locations help more while additional locations cannot reduce the estimate without limit.

The estimator uses Mapbox's stable driving profile for road distance and travel time. It builds a nearest-neighbor portfolio route and measures the least-expensive insertion point for the proposed property. A modeled route receives less confidence than a same-day route you explicitly confirm. Half of the confidence-weighted travel savings is passed through as a route credit. Total credits and distance surcharges are capped, and the final result cannot fall below the $50 standalone minimum.

If live road routing is unavailable or cannot connect every location, the calculation falls back to the bounded coordinate model and requires manual review. The factor breakdown identifies either **Road matrix** or **Coordinate fallback** and shows travel miles and minutes, portfolio density, nearest eligible property, route detour, confidence, and credits. The private operations-base coordinates and Mapbox token are configured only on the backend and are not returned to the browser.

## Understand manual-review warnings

The estimator marks a result for manual review when the request includes an ad-hoc schedule, known site concerns, a road-routing fallback, an unusually long trip, or another input outside the automatically supported pricing range. A flagged result is still a preliminary baseline; it is not approval to present that amount as a quote.

For ad-hoc service, the tool provides a per-visit estimate but intentionally does not calculate monthly pricing.

## Protect prospect information

- Do not enter names, email addresses, access instructions, or other personal information. Single-property and cluster calculations do not require an address. Portfolio-aware address results remain stateless and are used only for the current calculation.
- Estimates are stateless and are not added to the bid repository.
- Use **Reset** before beginning another prospect calculation.
- Create a formal bid request through the customer workflow when supporting property information, review status, and retained history are required.

[Back to the knowledge base](README.md)
