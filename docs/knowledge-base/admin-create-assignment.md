# Create and manage a scheduler assignment

**Audience:** Organization administrators and property managers

**Current access:** Administrators across their organization; property managers for properties assigned to them

Use Scheduler to assign property work to an eligible organization user or deployed Afterlight resource, set the work dates, and include instructions shown with the assignment.

## Create an assignment

![Illustrated Scheduler assignment form with numbered fields and calendar](images/scheduler-assignment.svg)

From the Dashboard navigation, open **Scheduler**, then use the numbered areas in the illustration:

1. Choose the **Property** and review its **Suggested client amount**. This is the property's customer billing setting, not an Afterlight contractor's compensation.
2. Confirm the **Fulfillment** source. Choose **Afterlight contractor** for a deployed 1099 resource or **Afterlight staff** for a deployed Afterlight employee or owner.
3. Choose the **User** who will complete the work. The list updates for the selected property and fulfillment source. Customer users and property managers never see a resource's default or deployment-specific contractor pay rate.
4. Set the required **Start Date**. Leave **End Date (optional)** blank when the work must be completed on that same date. Enter an end date only when the assignee may complete the work during a date range. Avoid dates that overlap another assignment for the same property.
5. In **One-Time Additional Check Request**, enter only instructions for this assignment. Be concise and do not place passwords, alarm codes, or other secrets here.
6. Select **Create Assignment**.
7. Confirm that the new assignment appears on the calendar.

Afterlight adds the assignment to the calendar and sends an in-app or push notification when available. Organization users see the work on their Dashboard. Afterlight resources see it in the Resource Portal. Only 1099 contractor assignments include snapshotted compensation and create a contractor earning after completion.

Some organizations also display an **Event Type** field with options such as **QA Check**, **Maintenance**, and **Cleaning**. Choose the type that matches the work before selecting the user.

## Change or delete an assignment

1. Select the assignment in the calendar. The form is populated with its current values.
2. Change the property, user, dates, or instructions and select **Update Assignment**. Afterlight notifies the affected assignee when work is rescheduled or reassigned.
3. To remove it from future work, select **Cancel Assignment** and confirm the prompt. Cancellation retains an audit record and notifies the assignee.

You can also drag an assignment to new dates in the calendar. Open it afterward to verify the start and end dates.

## Review completed and canceled work

Select **Assignment History** next to **Create Assignment** to open the read-only audit trail. The view shows up to the 200 most recently created completed or canceled assignments, including:

- property and fulfillment type;
- person assigned;
- scheduled date;
- person who assigned the work and the assignment time;
- completion or cancellation time; and
- final status.

Organization administrators see history across their organization. Property managers see only properties assigned to them. Completed and canceled records cannot be edited or deleted from Assignment History; this protects linked inspection submissions, contractor earnings, and the operational audit trail.

## If something goes wrong

- **The user is missing:** Only active, eligible users in the organization appear. Check the user’s account and role.
- **An Afterlight contractor is missing:** Confirm that **Afterlight contractor** is the selected fulfillment source and that the resource has an active deployment for the selected property and date.
- **An Afterlight employee or owner is missing:** Confirm that **Afterlight staff** is selected and that the resource relationship and deployment are active for the selected property and date.
- **The assignment overlaps:** Choose different dates or edit the existing assignment for that property.
- **The assignment is created but the user did not receive a push:** Ask them to sign in and check **My Assignments** or the Resource Portal.
- **The suggested client amount is not configured:** Ask an organization administrator to save the property's Suggested amount under commercial Billing settings.
- **A property manager cannot select the property:** An organization administrator must assign that property to the manager before they can schedule its work.
- **A completed assignment cannot be edited or deleted:** This protects the inspection and any contractor earning created from it.
- **A historical assignment is missing:** Assignment History contains completed and canceled work only and returns the 200 most recently created matching records.

[Back to the knowledge base](README.md)
