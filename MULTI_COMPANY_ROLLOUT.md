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

## GitHub Actions deployment option
A manual/automatic Functions-only deployment workflow is available at `.github/workflows/deploy-firebase-functions.yml`. Before using it, add a GitHub Actions repository secret named `FIREBASE_SERVICE_ACCOUNT_GOLDBIZNA` containing a dedicated Google service-account JSON key with the required Firebase deployment IAM permissions. The workflow deploys Cloud Functions only; it does not deploy Firestore rules or migrate data. Run it manually from the repository Actions tab after verifying the Firebase project and App Check setup. Never commit the service-account JSON key.

## Included backend
- `functions/index.js`: owner-claim-gated callable functions to create a company registry entry, list companies, and change company status. Company creation is pending by default and records an audit event. It also includes `acceptCompanyInvitation`, which allows a verified invited email to accept an invitation only after the company is active.
- `functions/set-platform-owner.mjs`: trusted-environment helper to add the owner custom claim while preserving existing claims.
- `accept-company.html`: signed-in invitee page for accepting a company invitation using the invited verified email and company ID.
- `firestore.multitenant.rules.draft`: an un-deployed example of tenant membership isolation. It is intentionally not connected to `firebase.json`; deploying it as-is would deny access to the existing legacy POS collections.
- The functions deliberately do not create Firebase Auth users, send invitation emails, alter existing legacy records, or migrate data. The platform owner must securely share the company ID with the invited administrator. A production email invitation workflow and full role-specific permissions remain future work.

## Not yet live
The callable backend is source code only until deployed to Firebase. Tenant security rules, App Check enforcement configuration, owner custom claim, company invitation flow, migration tooling, backup/restore, subscription billing and monitoring still require setup and testing. Do not advertise multi-tenant isolation as active until the two-company isolation tests pass.

## Offline sync foundation (new)
- `tenant-sync.js` provides an IndexedDB queue for company-scoped POS pages. It keeps operations on the device while offline and uploads batches when connectivity returns.
- `registerSyncTerminal` records authenticated terminal heartbeats in `companies/{companyId}/syncTerminals`.
- `submitOfflineSyncBatch` accepts up to 50 operations per batch into `companies/{companyId}/syncQueue`. Repeated operation IDs with changed payloads create a conflict record containing both versions in `syncConflicts`.
- `sync-center.html` is the platform-owner monitoring screen, linked from the Master Control Room.
- The legacy root-level MABROUK POS pages are intentionally not connected to this helper. Existing legacy sales and inventory remain untouched.
- **Important limitation:** this foundation stores and monitors incoming offline operations; it does not yet apply queued sales or stock changes to live business records. Do not use it as a live offline checkout workflow until the validated apply stage, role checks, idempotency, and end-to-end tests are completed.

### Deploy and test
1. GitHub Pages publishes the new static files from `Main`.
2. The Functions deployment workflow requires the GitHub Actions secret `FIREBASE_SERVICE_ACCOUNT_GOLDBIZNA`. The latest deployment attempt failed at Google authentication because that secret was not injected (missing or empty); no Functions were deployed by that run.
3. Add a dedicated Google service-account JSON with the required Firebase deployment permissions as that repository secret, then rerun **Deploy Firebase Cloud Functions** from the Actions tab.
4. Confirm the Functions workflow completes successfully before testing the sync centre. Do not deploy Firestore rules as part of this step; the current rules intentionally preserve legacy access and the new sync documents are written/read through trusted callable Functions.
5. A company POS page must import `createTenantSync` from `tenant-sync.js`, provide its active `companyId`, optional `branchId`, and a stable terminal ID, then call `enqueue()` for offline operations. Only active company members can register terminals or submit batches.
