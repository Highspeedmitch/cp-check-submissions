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
