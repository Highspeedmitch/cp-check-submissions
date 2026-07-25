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
