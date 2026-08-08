# Calculate preliminary service pricing

**Audience:** Afterlight platform administrators

Use **Marketing tools > Pricing Estimator** to calculate preliminary customer-facing service pricing for a single property or an eligible property cluster during a prospect conversation. The estimator uses the same versioned single-property formula as internal bid estimates, but it does not create a bid request, upload an attachment, notify a customer, or save prospect information.

This tool estimates client pricing. It does not calculate Afterlight labor cost, contractor compensation, travel, overhead, profitability, or an approved customer quote.

## Calculate an estimate

1. Open the Platform dashboard.
2. Under **Marketing tools**, select **Pricing Estimator**.
3. Select **Single property**.
4. Enter the prospect property's approximate gross square footage.
5. Select **Free standing**, **Strip mall**, or **Individual suite**.
6. Select **Monthly**, **Weekly**, or **Ad-hoc** service.
7. Select **Known site concerns are expected** when the prospect has identified issues that may affect scope.
8. Select **Calculate estimate**.

Afterlight displays estimated pricing per visit and, when supported, estimated monthly pricing. It also displays the size basis, property modifier, expected visits per month, and frequency modifier used by the active formula version.

Formula version 2 uses a $75 minimum per-visit estimate for an individual property before frequency pricing is applied.

Select **Copy summary** to place a plain-language internal summary on your clipboard. Review and revise the wording before moving it into customer-facing material.

## Calculate a property cluster

Cluster pricing shares visit overhead across distinct nearby properties. The highest standalone per-visit estimate remains at full price. Each additional property is included at 50% of its standalone per-visit estimate, and the combined result is rounded to the nearest $25.

1. Select **Property cluster**.
2. Enter the square footage and type for each property. Use **Add property** for clusters containing more than two properties.
3. Select the shared service frequency.
4. Confirm that every property is within 0.5 mile of the primary property.
5. Confirm that every property will be serviced during the same scheduled visit.
6. Select **Calculate estimate**.

The result compares the combined cluster price with the total price of estimating every property independently. Distance alone does not qualify properties for cluster pricing. Properties with different service schedules or separate visits must be estimated independently.

Cluster pricing is currently a Platform Admin planning capability. Property managers can continue to submit individual bid requests, but they cannot apply the cluster discount without platform review.

## Understand manual-review warnings

The estimator marks a result for manual review when the request includes an ad-hoc schedule, known site concerns, or another input outside the automatically supported pricing range. A flagged result is still a preliminary baseline; it is not approval to present that amount as a quote.

For ad-hoc service, the tool provides a per-visit estimate but intentionally does not calculate monthly pricing.

## Protect prospect information

- Do not enter names, email addresses, property addresses, access instructions, or other personal information. The calculation does not require them.
- Estimates are stateless and are not added to the bid repository.
- Use **Reset** before beginning another prospect calculation.
- Create a formal bid request through the customer workflow when supporting property information, review status, and retained history are required.

[Back to the knowledge base](README.md)
