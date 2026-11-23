# Control Room setup notes

This branch is development-only. Nothing here has been deployed to the live Firebase project.

## Included
- `users.html`: owner Control Room interface.
- `functions/staff.js`: callable backend for creating staff accounts, listing profiles, updating permissions and enabling/disabling accounts.
- `firestore.rules.draft`: proposed permission-based rules; not approved for deployment.

## Required before testing
1. Restore and test real Firebase Authentication for the owner. The current `auth.js` is explicitly in development-bypass mode, and `login.html` redirects to the dashboard.
2. Confirm the owner UID in `functions/staff.js` and `firestore.rules.draft`. The existing value was copied from rules previously shared in chat; verify it against Firebase Authentication.
3. Configure Firebase App Check for the web app (reCAPTCHA v3), then replace `ADD_YOUR_FIREBASE_APP_CHECK_RECAPTCHA_V3_SITE_KEY` in `users.html` with the site key. Register the app and verify tokens before enforcing App Check.
4. Deploy the Cloud Functions from this branch only after reviewing the diff and testing in a separate Firebase test project.
5. Review the actual live Firestore schema and current published rules. The draft is deliberately not wired into `firebase.json` and must not be deployed as-is.
6. Configure email delivery. The current function returns a Firebase password-reset/setup link to the owner; it does not send an email itself.
7. SMS provider integration is not implemented. SMS choice currently prepares a link for manual sending; do not describe it as automatic SMS delivery.

## Important security notes
- Do not use unrestricted Firestore rules such as `allow read, write: if true;`.
- The staff creation function creates a random temporary password unknown to the owner and returns a Firebase password-reset link. Staff should set their own password.
- Existing business collections and data have not been migrated or deleted.
- Do not merge this branch into `Main` or deploy rules until the real schema, owner sign-in, App Check, and permission behavior have been tested.
