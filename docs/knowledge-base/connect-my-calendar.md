# Connect My Calendar

Use a private calendar subscription to see your authorized Afterlight assignments in Apple Calendar, Google Calendar, Outlook, or another calendar app that supports calendar URLs.

The feed follows your Afterlight identity, not one organization. If you are authorized for assignments in more than one workspace, those assignments can appear in the same private feed.

## Before you begin

- Sign in to the Afterlight workspace where you normally review assignments.
- Decide which external calendar account should receive the subscription.
- Treat the subscription URL like a password. Anyone who has it can read the limited assignment details in the feed.

The feed includes the property name, assignment type, dates, property address when available, current status, and a link back to Afterlight. It does not include compensation, invoices, access instructions, one-time requests, checklist answers, photos, or internal notes.

## Create and copy your private link

1. Open the organization Dashboard or Afterlight Resource Portal.
2. Find **Connect My Calendar**.
3. Select **Create Private Link**.
4. Select **Copy Link**. Afterlight displays the unhashed link only when it is created or regenerated.
5. Add the copied URL as a subscribed or internet calendar in your calendar application. Do not import it as a one-time file.

Calendar applications use different labels for the same action:

- Apple Calendar: add a **New Calendar Subscription** and paste the URL.
- Google Calendar on the web: under **Other calendars**, choose **From URL** and paste the URL.
- Outlook on the web: choose **Add calendar**, then **Subscribe from web**, and paste the URL.

Choose a recognizable name such as “Afterlight Assignments.” Refresh timing is controlled by the external calendar provider, so a new assignment, schedule change, or cancellation may not appear immediately.

## Schedule changes and cancellations

Afterlight keeps a stable calendar event ID for each assignment. When assignment dates change, the existing calendar item is updated. When an assignment is canceled, the feed publishes a cancellation so the calendar application can remove or cancel its copy on a later refresh.

Always use Afterlight as the source of truth before traveling to a property. External calendars may cache older feed data between refreshes.

## Regenerate a compromised or lost link

1. In **Connect My Calendar**, select **Regenerate Link**.
2. Confirm the change.
3. Copy the new private URL and subscribe to it in your calendar application.
4. Remove the old Afterlight subscription from your calendar application.

Regenerating immediately invalidates the previous URL. Use it if the link was shared, exposed, or lost.

## Disconnect the feed

1. Select **Disconnect** in Afterlight and confirm.
2. Remove the Afterlight subscribed calendar from each external calendar application.

Disconnecting causes the existing URL to publish an empty calendar, but the external application controls when cached items disappear. Removing the subscribed calendar locally clears those cached items immediately.

## Troubleshooting

- If the calendar is empty, confirm you have scheduled assignments in Afterlight and wait for the external provider's next refresh.
- If the calendar application reports that the URL is invalid after regeneration, remove the old subscription and add the newly generated URL.
- If assignment details differ, follow Afterlight. The external calendar may not have refreshed yet.
- If a private URL may have been exposed, regenerate it immediately.

[Back to the knowledge base](README.md)
