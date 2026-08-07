# Advanced organization onboarding

## Goal

Create one traceable path from a signed customer decision to a workspace that is
ready for its first live inspection. Platform setup and customer setup remain
separate so Afterlight can establish contractual defaults without impersonating
the customer's administrator.

## Experience

### 1. Platform launch wizard

The platform administrator opens **New Organization** and completes four steps:

1. Organization name, type, reporting timezone.
2. Contracted service model and default fulfillment source.
3. Initial organization administrator.
4. Review and launch.

The draft is stored in the administrator's browser until launch or **Start over**.
No organization, user, or invitation is created before the final launch action.
The existing audited organization-creation endpoint remains the system of record.

### 2. Invitation handoff

Launch creates the isolated workspace and sends the existing secure, single-use
administrator invitation. The organization card continues to expose invitation
delivery, expiration, and resend controls. Accepting the first administrator
invitation advances a guided tenant from `invited` to `in_progress`.

### 3. Organization Setup Guide

Organization administrators can open **Setup Guide** from Admin tools while guided onboarding is incomplete. Required
progress is derived from live configuration instead of manual checkboxes:

- workspace settings are present;
- an organization-owned administrative passkey is configured;
- at least one property exists.

The guide also recommends inviting an operating team and completing a controlled
first inspection. These remain visible after required onboarding is complete.
Platform administrators using audited Admin View can inspect progress, but the
customer administrator must make security changes.

### 4. Completion and ongoing readiness

After every required item is complete, the organization administrator can mark
onboarding complete. That action is persisted and audited. The navigation entry is
then removed from Admin tools, while **Review Setup Guide** remains available in the
Help Center header as a readiness review. Established organizations use the same
Help Center entry without being enrolled in guided onboarding.

## Compatibility and rollout

- Only organizations created through the new wizard receive guided onboarding
  state.
- Existing organizations remain established and are not prompted or migrated.
- The guide reads existing property, user, invitation, security, fulfillment, and
  submission data. It does not create parallel settings.
- The change introduces no new environment variables or AWS resources.
- Deployment should promote backend support before or with the frontend route.

## Review checkpoints before commit

- Confirm the three required items match Afterlight's operational definition of
  launch readiness.
- Decide whether inviting a team member or completing a test inspection should
  become required.
- Confirm whether platform administrators should be allowed to mark onboarding
  complete through Admin View.
- Confirm the service-model descriptions match contract language.
