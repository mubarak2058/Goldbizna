# MABROUK TRADER'S — Multi-Company Rollout

## Current state
The existing POS remains the legacy MABROUK TRADER'S workspace. Its current root-level collections and local records are not migrated or rewritten by this rollout.

The Master Control Room is a static GitHub Pages client. GitHub Pages cannot host trusted server code. Company creation and platform administration must run through Firebase Cloud Functions and Firestore Security Rules.

## Tenant data model
- `companies/{companyId}`: company profile, lifecycle status, plan, currency and branding.
- `companyMemberships/{membershipId}`: user/company membership, role and invitation state.
- `companies/{companyId}/inventory/{itemId}`
- `companies/{companyId}/sales/{saleId}`
- `companies/{companyId}/customers/{customerId}`
- `companies/{companyId}/settings/{settingId}`
- `platformAuditLogs/{eventId}`: owner actions and company lifecycle changes.

Each company-owned record lives below its company document. A user can access a tenant only when a trusted membership record grants access. Client-supplied company IDs are never proof of permission.

## Owner trust boundary
The callable functions require the Firebase custom claim `platformOwner: true`. Do not set this claim from browser JavaScript or from a Firestore document. Set it only from a trusted Admin SDK environment after verifying the platform owner's identity.

## Important compatibility rule
Do not bulk-move the existing MABROUK POS collections into a tenant path until every page has been updated, a verified backup exists, and a restore test succeeds. The first company registry record must be created as a controlled migration step that explicitly maps the legacy workspace. The included createCompany function creates a new isolated company record only; it does not migrate legacy data.

## Deploy prerequisites
1. Confirm the correct Firebase project is `goldbizna`.
2. Install Firebase CLI in a trusted development environment and authenticate as the project owner.
3. Configure Firebase App Check for the web app before enabling callable functions.
4. Set up Application Default Credentials in a trusted environment and run the owner-claim bootstrap script with the verified Firebase Auth UID: `PLATFORM_OWNER_UID=YOUR_VERIFIED_UID node functions/set-platform-owner.mjs`. The script merges the claim with existing custom claims. Never commit service-account credentials or expose them in browser code. The signed-in owner must sign out and back in to refresh the token.
5. Review and deploy tenant-aware Firestore rules before enabling tenant data access.
6. Deploy Functions from this directory with `firebase deploy --only functions`.
7. Configure Firebase App Check for the web app and deploy its provider settings; the callable functions enforce App Check.
8. Test with two separate test companies and verify cross-tenant reads/writes are denied.
9. Back up and restore-test the legacy MABROUK collections before any migration.

## Included backend
- `functions/index.js`: owner-claim-gated callable functions to create a company registry entry, list companies, and change company status. Company creation is pending by default and records an audit event.
- `functions/set-platform-owner.mjs`: trusted-environment helper to add the owner custom claim while preserving existing claims.
- The functions deliberately do not create Firebase Auth users, send invitations, alter existing records, or migrate data. Those require a separately verified invitation and migration workflow.

## Not yet live
The callable backend is source code only until deployed to Firebase. Tenant security rules, App Check enforcement configuration, owner custom claim, company invitation flow, migration tooling, backup/restore, subscription billing and monitoring still require setup and testing. Do not advertise multi-tenant isolation as active until the two-company isolation tests pass.
