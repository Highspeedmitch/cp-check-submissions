# Set up and recover authenticator verification

**Audience:** Afterlight organization users and Resource Network users

Multi-factor authentication protects an Afterlight account with a changing code in addition to its password. Administrators must use it when authenticator verification is enabled. An organization administrator can also require it for every organization user.

## Enroll an authenticator

When Afterlight displays **Set up your authenticator** during sign-in:

1. Open a trusted authenticator application on your phone or password manager.
2. Scan the QR code shown by Afterlight. If scanning is unavailable, enter the displayed setup key manually.
3. Enter the current six-digit code from the authenticator.
4. Select the verification action once.
5. Save or download all ten recovery codes when Afterlight displays them.

Each recovery code works once. Store them somewhere protected and separate from the device that holds the authenticator. Afterlight does not show that recovery-code set again.

## Verify a sign-in

1. Enter your Afterlight email and password.
2. On **Verify your sign-in**, enter the current six-digit authenticator code.
3. If the authenticator is unavailable, enter one unused recovery code instead.

Wait for a new authenticator code if the current code was already accepted or is about to expire. A time-step code cannot be reused.

## Replace recovery codes

Organization administrators can replace their own recovery codes from **Security**:

1. Open **Security** from the Dashboard navigation.
2. Under **Replace recovery codes**, enter the current account password.
3. Enter a current authenticator code or one unused recovery code.
4. Select **Generate new recovery codes**.
5. Download and securely store the new set immediately.

Generating a new set invalidates every previous recovery code.

## Reset an authenticator

Use **Reset authenticator and sign out** only when moving to a new authenticator or replacing a compromised enrollment. Confirm the current password and an authenticator or recovery code first. Afterlight signs the account out, and the next sign-in starts enrollment again.

If you have neither the authenticator nor an unused recovery code, contact an authorized Afterlight administrator or support contact. Do not create a replacement account or share another person's credentials.

## Organization-wide policy

Organization administrators can open **Security** and choose **Require MFA for all users** after confirming their account password. Enabling the policy invalidates existing sessions for affected users so the requirement takes effect when they return.

Making MFA optional for non-administrators does not remove the administrator requirement and does not erase an existing user's authenticator enrollment.

## If something goes wrong

- **The code is invalid:** Confirm the authenticator entry is for Afterlight and that the phone's date and time are automatic, then wait for a fresh code.
- **The code was already used:** Wait for the next six-digit code. Do not repeatedly submit the same code.
- **A recovery code does not work:** Confirm it has not already been used and enter it exactly as saved.
- **Enrollment expired:** Return to sign-in and start the enrollment prompt again.
- **Authenticator verification is unavailable in the environment:** Contact Afterlight support. Do not send passwords, setup keys, QR codes, or recovery codes by email.

[Back to the knowledge base](README.md)
