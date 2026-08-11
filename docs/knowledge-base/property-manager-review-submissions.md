# Review inspection submissions for a property

**Audience:** Property managers and organization administrators

Use a property’s submission history to open completed inspection reports. Property managers see only their managed properties.

## Open a property’s history

![Illustrated property-manager Dashboard showing a managed property with new activity](images/manager-dashboard.svg)

1. Open **Dashboard**.
2. Find the property under **All Managed Properties**. A **New!** badge means the property has unread inspection activity.
3. Select **View Submissions**.

You can use **Search** and **Region** in the navigation to narrow a long property list.

## Review monthly scheduling coverage

The management Dashboard shows **Properties Scheduled for [Month]: X/Y** above the property cards. Organization administrators see coverage across every organization property. Property managers see coverage only across the properties assigned to them. Searching or filtering the visible cards does not change this portfolio total.

Each property card displays its current-month scheduling state beneath the management badge:

- **Unscheduled:** No non-canceled assignment covers the property during the current month.
- **Scheduled:** At least one assignment remains due today or later.
- **Completed:** The property's current-month assignments have all been completed.
- **Missed:** At least one scheduled assignment has passed its inclusive end date without completion. Missed takes priority when a property has multiple assignments requiring attention.

Completed and missed properties remain included in the top scheduled-property count because they received scheduled coverage during the month. Canceled assignments do not count. The status is recalculated from Scheduler activity when the Dashboard loads, while it remains open, and when you return to it. At the start of a new calendar month, Afterlight evaluates only assignments covering that new month; no manual reset is required.

## Filter the history

![Illustrated submission history showing a date-range filter and View PDF links](images/property-submissions.svg)

Use one or more filters to narrow the property history:

- **Date range:** Choose the last 1, 3, 6, 12, or 18 months.
- **Submitted by:** Show work completed by one person.
- **Assigned by:** Show work scheduled by one person. Choose **Not recorded / direct** for direct submissions and older records without assignment details.
- **Fulfillment:** Show direct submissions, customer employees or contractors, Afterlight staff or contractors, or legacy assignments when those values exist in the selected history.

Filters query every matching submission in the selected property and date range before the page is selected. They are not limited to records already visible on the current page. Changing a filter returns you to page 1. Select **Clear filters** to return to the default 12-month view.

## Open a report

Each result shows the submission date and time, **Submitted by**, **Date assigned**, **Assigned by**, and **Fulfillment**. Older or direct submissions may show **Not recorded** when no linked assignment exists.

1. Find the submission using its date and assignment details.
2. Select **View PDF**. The report opens in a new browser tab.

For an organization enabled for AI cover summaries, the first-page **General Observations** panel may contain a concise AI-generated summary and an accuracy disclaimer. Use it as an overview only. The detailed checklist responses, issue descriptions, and photos later in the report remain the authoritative inspection record. If summarization is unavailable, the report continues without a generated summary.

Afterlight displays 10 records per page. When more than 10 records match, use **Previous** and **Next** below the results. The page summary shows the visible record range, total matching records, and current page.

The property’s new-activity notification is marked read when you open its submission history.

When the organization's service plan includes Portfolio Reporting, return to the Dashboard and open **Reporting** for trends across multiple submissions. You can filter Reporting by date range, property, and Field Operator. Boutique service does not include this aggregate reporting area or monthly executive summaries; review the individual property PDFs instead.

## If something goes wrong

- **No submissions are shown:** Increase the date range, clear one or more filters, and confirm that you opened the correct property.
- **A recent inspection is missing:** Its report may still be processing. Wait a few minutes, then refresh the page.
- **Assignment details say Not recorded:** The inspection may have been submitted directly or may predate assignment-history linking. The completed report remains valid.
- **Monthly scheduling coverage is unavailable:** Refresh the Dashboard. Afterlight does not display an Unscheduled badge when it cannot verify Scheduler data.
- **A property says Missed after work was performed:** Confirm that the inspection was submitted from the matching assignment. A completed report linked to that assignment updates the scheduling state automatically.
- **View PDF does not open:** Allow pop-ups for Afterlight or open the link in a new tab.
- **The property is missing from your Dashboard:** Ask an organization administrator to verify that you are assigned as a property manager for that property.

[Back to the knowledge base](README.md)
