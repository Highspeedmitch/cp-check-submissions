# Notification setup

The current application is a PWA. Web and Home Screen installations use
standards-based Web Push. Firebase Cloud Messaging remains available only for
a possible future native Capacitor application.

## Required backend environment for the PWA

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (for example, `mailto:admin@example.com`)
- `FRONTEND_URL` (defaults to the development Render frontend)

Generate one VAPID key pair and keep it stable. Replacing the key pair requires
devices to create new subscriptions.

When VAPID or Firebase credentials are absent, workflow events are still saved
as in-app notifications. This is the expected lower-environment behavior. A
production deployment begins sending push messages once the credentials are
configured and each user has enabled a device or browser subscription.

## Operational notification coverage

The following lifecycle transitions use the shared in-app and push delivery
path:

- AP email delivery accepted by the provider (shown as queued) or failed
- Afterlight service invoice marked paid
- Contractor earning created, approved, or voided
- Gusto payout batch created, submitted, or marked paid
- Assignment rescheduled, reassigned, or canceled
- Service-model change requested, information requested or supplied, approved,
  or denied

Provider acceptance does not prove final mailbox delivery. AP notifications and
UI copy therefore say **queued** until a later provider delivery event is
available.

## PWA requirements

- The application must be served over HTTPS.
- iPhone and iPad users need iOS/iPadOS 16.4 or newer.
- On iPhone and iPad, the PWA must be added to the Home Screen.
- Permission must be requested from the **Enable Notifications** button.
- The deployed response must make `/service-worker.js` available at the origin root.

No App Store listing, Apple Developer membership, native bundle ID, APNs key, or
Xcode deployment is required for PWA Web Push.

## First acceptance test

1. Deploy the backend VAPID environment variables and the latest frontend build.
2. Open the installed PWA and sign in as a submitter.
3. Choose **Enable Notifications**.
4. Confirm a subscription is stored through
   `POST /api/notifications/web-subscriptions`.
5. Assign a property inspection to that user.
6. Confirm an in-app notification record is created.
7. Confirm the push appears with the PWA closed.
8. Tap it and confirm the dashboard opens.

Test at minimum:

- iPhone Home Screen PWA on iOS 16.4+
- Android installed PWA
- Chrome or Edge desktop
- Safari desktop if used by the business

## Future native application

If a native Capacitor build is later distributed, it can use the existing FCM
token path. At that point the iOS bundle ID, Firebase Apple application, APNs
authentication key, Xcode capabilities, and provisioning profile must be aligned.
