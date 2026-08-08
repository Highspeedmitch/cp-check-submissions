# Manage inspection form templates and field order

**Audience:** Commercial organization administrators and property managers

Use the form editor to control which inspection fields appear, add customer-specific questions, and arrange unlocked fields in the order used by new inspection forms and PDFs.

## Understand the template levels

Afterlight applies commercial inspection fields in two levels:

- The **organization template** defines the default fields inherited by every commercial property. Only an organization administrator can publish this template.
- A **property form** can exclude unlocked organization fields, add property-specific fields, and save a property-specific order. Organization administrators and property managers can manage properties within their access.

Locked fields are controlled by Afterlight or the organization. They remain included and fixed in place. Existing submissions and previously generated PDFs do not change when a template is updated.

## Edit the organization template

1. Open **Admin tools > Form Template** from the Dashboard navigation.
2. Review the **Template name**, **Form title**, and **Default fields**.
3. For an unlocked field, update its label, section, response type, required setting, or photo setting.
4. Drag an unlocked field within its section, or use its up and down buttons. A field cannot be moved across a locked boundary or into another section by dragging.
5. To add a field, enter the **New field label**, select its response type, and select **Add Field**.
6. Remove an unlocked field only after confirming that the organization no longer needs it on future inspections.
7. Select **Publish New Template Version**.

Publishing creates a new version. Property overrides continue to apply on top of the new organization version.

## Customize one property

1. Find the commercial property on the Dashboard and select **Manage Details**.
2. Scroll to **Inspection form settings**.
3. Use each organization-field checkbox to include or exclude that field. A locked organization field cannot be excluded.
4. Edit or remove property-specific fields directly in the same list.
5. Drag an unlocked included field within its section, or use the up and down buttons to set its position.
6. Add a property-specific field when the check should not become part of the organization default.
7. Select **Save Form Settings**.

Property details have their own **Save Property Details** action. Saving property details does not save form settings, and saving form settings does not save unsaved property-detail changes.

## Understand form and PDF ordering

The saved effective order is used when Afterlight opens a new inspection and when it renders that inspection's PDF. Fields remain grouped by section, and locked fields retain their protected positions. Historical reports keep the field order captured when they were generated.

## If something goes wrong

- **A field will not move:** Confirm that it is unlocked and that the destination is inside the same section and does not cross a locked field.
- **A field cannot be disabled:** Locked fields are always included. Change only unlocked organization fields.
- **The property still shows an inherited field:** Return to **Manage Details**, clear the field's checkbox, and select **Save Form Settings**.
- **A new organization field is missing at one property:** Review that property's saved override. It may be excluded or positioned by an existing property configuration.
- **The PDF order did not change:** Confirm that the inspection was created after the form settings were saved. Existing PDFs are not rewritten.

[Back to the knowledge base](README.md)
