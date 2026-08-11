# Create and manage a scheduler assignment

**Audience:** Organization administrators and property managers

**Current access:** Administrators across their organization; property managers for properties assigned to them

Use Scheduler to review upcoming property work, create individual-property or grouped route assignments for eligible organization users or deployed Afterlight resources, and manage schedule changes from a visual calendar.

## Open the assignment editor

![Illustrated Scheduler calendar and assignment editor with numbered fields](images/scheduler-assignment.svg)

From the Dashboard navigation, open **Scheduler**. The page shows current assignment counts, a color legend, and the assignment calendar.

Choose the way you prefer to begin:

1. Select **+ New Assignment** to open a blank assignment editor.
2. In **Month** view, select a date, its assignment count, or **+ more** to open that day's complete schedule. Select an assignment to edit it, or select **+ Create Assignment** to open the editor with that date prefilled.
3. On a desktop or tablet with a wide screen, drag across several calendar dates to open the editor with that date range prefilled.
4. On a compact mobile screen, the selected day's schedule appears below the calendar with the same edit and create actions.

Every populated date in Month view displays its total assignment count even when the calendar only has room to preview some of the assignments. Use **Month**, **Week**, or **Agenda** to change the calendar view. **Today** returns to the current date.

## Create an assignment

Complete the numbered areas shown in the illustration:

1. Choose the **Property**. When the selected fulfillment route creates an invoice, Scheduler displays the property's **Suggested client amount**. This is the customer billing setting, not an Afterlight contractor's compensation. No amount is shown for customer-employee work because that route creates no invoice.
2. Review **Fulfillment** and **Routing**. The property default is used unless you select another allowed source for this assignment. Changing the property or fulfillment source clears the selected user so eligibility can be recalculated.
3. Choose the **Assignee** who will complete the work. Customer fulfillment lists only active organization users whose saved assignment type matches Customer Employee or Customer Contractor. Afterlight fulfillment lists only eligible deployed resources. Customer users and property managers never see a resource's contractor pay rate.
4. Set the required **Start Date**. Leave **End Date (optional)** blank when the work must be completed on that same date. Enter an end date when the assignee may complete the work during a date range. Afterlight blocks creation when another scheduled assignment overlaps the same property and dates.
5. In **One-Time Additional Check Request**, enter instructions that apply only to this assignment. Be concise and do not place passwords, alarm codes, or other secrets here.
6. Select **Create Assignment**. Close the editor and confirm that the assignment appears on the calendar.

Afterlight sends the assignee an in-app or push notification when available. Organization users see the work on their Dashboard. Afterlight resources see it in the Resource Portal. Only Afterlight 1099 contractor assignments include snapshotted compensation and create a contractor earning after completion.

Some legacy organization workflows also display a **Visit Type** field with **QA Check**, **Maintenance**, and **Cleaning** options. Choose the visit type before selecting the assignee.

## Create a route assignment

An organization administrator must first create the route under **Regions & Routes**. See [Manage property regions and routes](manage-property-regions-routes.md).

1. Open the assignment editor and select **Route** under **Assignment type**.
2. Select the active route and review its ordered stop preview.
3. Review **Fulfillment**. If the route's properties have different defaults, choose one allowed fulfillment source for the grouped assignment.
4. Choose an assignee who is eligible for every current route stop.
5. Set the service date or date range and add any route-wide one-time instructions.
6. Review each property's suggested client amount. Pricing and billing settings remain per property.
7. Select **Create ROUTE Assignment**.

Afterlight displays the route as one grouped calendar item and sends one clearly labeled **ROUTE** assignment notification containing multiple stops. The grouped work is backed by individual property assignments so inspection completion, customer billing, AP routing, and contractor compensation remain per property. A service night that continues after midnight belongs to its starting service date.

Recurring route service is not yet available; create each route service date separately.

## Understand fulfillment choices

- **Customer employee:** Assigns the work to an eligible organization employee. No field-operator invoice is required.
- **Customer contractor:** Assigns the work to an organization-managed contractor. Customer accounts payable handles the invoice.
- **Afterlight staff:** Available to Hybrid and Managed Service organizations when an eligible Afterlight employee or owner is actively deployed.
- **Afterlight contractor:** Available to Hybrid and Managed Service organizations when an eligible 1099 resource is actively deployed and has a configured rate.

SaaS organizations can create new assignments only for customer employees or customer-managed contractors. Hybrid and Managed Service organizations can also use deployed Afterlight staff and contractors.

## Change or cancel an assignment

1. Select the assignment on the calendar or from the Month view's daily schedule. The editor opens with its saved property, user, fulfillment, dates, and instructions.
2. Change the permitted fields and select **Update Assignment**. Afterlight notifies the affected assignee when work is rescheduled or reassigned.
3. To remove it from future work, select **Cancel Assignment** and confirm. Cancellation retains an audit record and notifies the assignee.

On desktop, you can also drag a scheduled assignment to new dates. Open it afterward to verify the start and end dates.

If an organization moves from Boutique, Hybrid, or Managed Service to SaaS, previously scheduled Afterlight assignments remain available for completion, rescheduling, or cancellation. The Afterlight resource is retained only on that existing work. To change its property or assignee, first change fulfillment to a customer source and select an eligible organization user.

## Review completed and canceled work

Select **Assignment History** in the calendar header to open the read-only audit trail. The view shows up to the 200 most recently created completed or canceled assignments, including:

- property and fulfillment type;
- person assigned;
- scheduled date or date range;
- person who assigned the work and the assignment time;
- completion or cancellation time; and
- final status.

Organization administrators see history across their organization. Property managers see only properties assigned to them. Completed and canceled records cannot be edited or deleted from Assignment History; this protects linked inspection submissions, contractor earnings, and the operational audit trail.

## If something goes wrong

- **The assignee is missing:** Select the fulfillment route first. Then check that the user's account is active and their Assignment type exactly matches Customer Employee or Customer Contractor. If you changed fulfillment, select the assignee again.
- **An Afterlight contractor is missing:** Confirm that **Afterlight contractor** is selected and that the resource has an active deployment for the property. The selected start date must fall within the deployment period, and a positive contractor rate must be configured.
- **An Afterlight employee or owner is missing:** Confirm that **Afterlight staff** is selected and that the resource relationship and deployment are active for the property and selected date.
- **No Afterlight fulfillment choices appear:** SaaS plans use only customer employees and customer-managed contractors. Existing Afterlight work may still appear as retained work when it was scheduled before a service-model transition.
- **The assignment overlaps:** Choose different dates or edit the existing scheduled assignment for that property.
- **The Route option is unavailable:** Ask an organization administrator to create an active route containing two to six properties.
- **A route assignee is missing:** Confirm that the user's property/route scope or the resource deployment covers every current route stop.
- **A route uses mixed fulfillment defaults:** Choose one permitted fulfillment source for the complete route assignment and review the routing summary before saving.
- **The assignment is created but the user did not receive a push:** Ask them to sign in and check **My Assignments** or the Resource Portal.
- **The suggested client amount is not configured:** Ask an organization administrator to save the property's Suggested amount under commercial Billing settings.
- **A property manager cannot select the property:** An organization administrator must assign that property to the manager before they can schedule its work.
- **A completed assignment cannot be edited or deleted:** This protects the inspection and any contractor earning created from it.
- **A historical assignment is missing:** Assignment History contains completed and canceled work only and returns the 200 most recently created matching records.

[Back to the knowledge base](README.md)
