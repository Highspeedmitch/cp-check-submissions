# DEV platform administrator provisioning

The DEV environment uses `dev@afterlightinspections.com` as its bootstrap platform administrator identity.

## Safety properties

- The provisioner is restricted to that exact normalized email.
- It requires an explicit one-time DEV approval flag.
- A new account receives a cryptographically random password that is immediately discarded.
- No password, reset token, database connection string, or other credential is printed.
- If the user already exists, the script grants `platform_admin`, increments the token version, and revokes existing refresh sessions.

## Run inside the DEV backend environment

Run the command from a DEV backend shell where `MONGO_URI` is already injected by the hosting environment:

```bash
ALLOW_DEV_PLATFORM_ADMIN_PROVISIONING=true npm run provision-dev-platform-admin
```

Do not paste `MONGO_URI` into the command or terminal history.

After the command reports success:

1. Open the DEV Afterlight sign-in page.
2. Select **Forgot password**.
3. Enter `dev@afterlightinspections.com`.
4. Use the emailed link to establish the password.
5. Sign in and complete the configured MFA or Okta enrollment.
6. Confirm that the user lands on **Platform administration** and can open **Help Center**.

The approval environment variable should not remain configured as a persistent service variable.
