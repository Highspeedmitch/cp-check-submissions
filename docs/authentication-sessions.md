# Authentication sessions

The application uses two credentials with different lifetimes:

- Access JWT: two hours, stored by the web client and sent as a bearer token.
- Refresh session: 90-day absolute lifetime, represented by a rotating, HTTP-only cookie.

The PWA refreshes an access token shortly before it expires and retries an authenticated
request once when the server reports an expired token. JavaScript cannot read the refresh
cookie.

Refresh sessions are revoked when:

- the user explicitly logs out;
- the user's password is reset;
- an organization administrator edits the user, including role or account status; or
- the user is inactive or their token version no longer matches.

## Authenticator-app MFA

Afterlight supports standards-based TOTP codes from authenticator apps. Organization and
platform administrators are always required to enroll when TOTP MFA is enabled. An
organization administrator can require the same protection for every user from the
Security page. Enabling that organization policy invalidates existing sessions for the
other organization users so the new requirement takes effect on their next request.

Configure the backend with:

- `TOTP_MFA_ENABLED=true`
- `MFA_ENCRYPTION_KEY=<base64-encoded 32-byte random value>`

A suitable key can be generated locally with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Store that value as a secret environment variable and keep it stable. Losing or replacing
it makes existing encrypted authenticator enrollments unreadable. Deploy the encryption
key with `TOTP_MFA_ENABLED=false` first if a staged rollout is needed, then enable MFA in a
second deployment.

Enrollment displays a QR code and manual setup key. The user must verify a six-digit code,
then save ten one-time recovery codes. Recovery codes are stored only as hashes. TOTP
secrets are encrypted with AES-256-GCM. A used time-step code cannot be replayed.

The legacy Okta button is hidden unless `REACT_APP_OKTA_LOGIN_ENABLED=true` is explicitly
set on the frontend. Okta backend enforcement remains controlled separately by
`OKTA_ENFORCEMENT_ENABLED`.

The 90-day limit is absolute. Token rotation does not extend it, so users must enter their
credentials again after 90 days.

Production requires `JWT_SECRET`, `FRONTEND_URL`, and HTTPS. Render supplies the `RENDER`
environment marker used to enable `Secure` and `SameSite=None` on the refresh cookie.

## Safari and installed PWAs

For dependable long-lived sessions on Safari, the frontend and API should be same-site.
Use sibling custom domains such as `app.example.com` and `api.example.com`, or proxy API
requests through the frontend origin. Separate customer-owned `onrender.com` hostnames can
be treated as different sites, and Safari may block the API refresh cookie as third-party.

Set `FRONTEND_URL` to the exact deployed frontend origin. Session endpoints also validate
the request `Origin` header against this allowlist.
