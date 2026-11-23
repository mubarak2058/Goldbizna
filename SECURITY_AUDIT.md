# MABROUK TRADER'S POS Pro — Security & Data Integrity Audit

Audit date: 2026-11-23  
Audited repository: `mubarak2058/Goldbizna`  
Audited branch: `Main`  
Audited commit: `c7ea831c30149fe27002c43eb7de7770011ad328`

## Scope and safety

This is a source-repository audit, not a live Firebase security assessment. The repository does not contain a deployed `firestore.rules` file and `firebase.json` currently configures Cloud Functions only. Therefore the active Firestore rules, Authentication provider settings, App Check enforcement state, deployed Functions versions, and live database contents must be checked in the Firebase console before any production security change.

No production data, live Firestore documents, or production branch files were changed for this audit. The audit is on a separate branch so the live GitHub Pages site is not changed by this report.

## Executive summary

The project has useful foundations: a shared Firebase module, Firebase Authentication integration on some pages, owner-only callable Functions protected by a custom claim, server-side company lifecycle operations, and a deliberately un-deployed tenant-rules draft.

However, the application is **not yet safe to treat as a secured multi-user production system**. Authentication is explicitly paused in the shared `auth.js`; `login.html` redirects straight to the dashboard; several pages have no effective shared route guard; and the dashboard, POS sales, customers, reports, and some other records still depend on browser localStorage. The existing POS and inventory data model is mixed between Firestore and local storage.

## Findings

### Critical — Authentication is deliberately bypassed in the current site

- `auth.js` sets `DEVELOPMENT_MODE = true` and intentionally does not enforce Firebase Authentication.
- `login.html` immediately redirects to `index.html`; it is not a sign-in page.
- `index.html` loads the development-mode auth module, so the dashboard remains accessible without a Firebase sign-in.
- `pos.html` loads the same development-mode module. Its own POS code initializes Firestore directly and does not independently require a signed-in user before rendering or attempting a sale.
- `settings.html` accepts legacy localStorage flags as an alternative to a Firebase user. Local storage values are controlled by the browser and are not authentication proof.
- `users.html` loads and writes the `users` collection without an in-page Firebase Auth check. Its security therefore depends entirely on the currently deployed Firestore rules.

**Required fix:** restore a real Firebase sign-in page and one shared authentication/authorization guard; apply it to every protected page. Never accept localStorage flags, usernames, UI role labels, or client-written profile fields as proof of identity or privilege.

### Critical — Deployed Firestore rules are not represented in this repository

- There is no `firestore.rules` file in the audited repository tree.
- `firebase.json` deploys only Cloud Functions; it does not configure or deploy Firestore rules.
- `firestore.multitenant.rules.draft` explicitly says it is draft-only and warns that it denies legacy POS paths.
- Existing pages read and write root collections including `inventory`, `users`, `usernames`, `settings`, `savings`, and `activityLog`.

**Required fix:** inspect and export the currently deployed rules from Firebase Console/CLI, preserve a dated copy, map every collection and operation, and test replacement rules in a non-production project before deployment. Do not deploy the tenant draft as-is: it would break legacy POS collections.

### High — Role and staff-profile data must not be treated as trusted authorization

- The staff management UI writes fields such as `role`, `status`, `active`, and `permissions` from browser code.
- These profile values are useful for display and workflow, but they are not safe authorization credentials if a client can write them.
- The company backend correctly checks the `platformOwner: true` Firebase custom claim for owner operations. That trust boundary should be preserved.
- The owner setup page contains account-specific identifiers and can write a privileged-looking Firestore profile. It does not itself grant the server-side custom claim, but it should be removed from public use or converted into a tightly controlled one-time setup procedure after verifying its necessity.

**Required fix:** enforce roles and permissions in Firestore Rules and trusted Cloud Functions using verified identity and server-controlled claims/membership records. Prevent clients from granting themselves owner/admin roles or changing their own access status.

### High — Sales and stock updates are not one atomic transaction

- POS inventory is read from Firestore, but completed sales are appended to localStorage.
- POS stock quantities are updated with multiple independent `updateDoc` calls before the sale is stored locally.
- A partial failure, browser closure, duplicate click, or device change can leave stock decremented without a durable sale record, or a sale record without a reliable shared history.
- Dashboard, sales history, reports, customer records, and credit summaries currently read localStorage in several pages. This creates device-specific views and weak auditability.

**Required fix:** design a backwards-compatible Firestore sales ledger and use a trusted callable function or Firestore transaction/batched write with server-side validation to create a sale and adjust stock atomically. Keep existing local records intact until backup, reconciliation, migration, and restore testing are complete.

### High — M-Pesa backend needs a production security review

- `server.js` exposes STK push and payment-status routes without application authentication or request-level authorization.
- CORS is configured permissively.
- Payment state is held in an in-memory Map, which is lost on restart and is not shared across multiple instances.
- The callback currently accepts and stores callback payloads without durable reconciliation against a server-created payment record.
- The repository's `firebase.json` does not deploy this Express server; its actual hosting and exposure are not established by this source audit.

**Required fix:** confirm whether this server is deployed and where. Before production use, restrict origins, authenticate/authorize POS requests, validate amounts and order references against trusted server-side records, persist payment attempts and callbacks durably, verify callback correlation and idempotency, add rate limits and structured redacted logs, and keep Daraja secrets only in server-side secret storage. Do not put consumer secrets or passkeys in browser code or Git.

### Medium — Shared Firebase configuration is duplicated

- `firebase.js` is a shared module, but several pages initialize Firebase separately and repeat the same web configuration.
- Firebase web API keys are client identifiers, not server secrets; security must come from Authentication, Rules, App Check, and API-key restrictions—not from hiding the web config.
- Duplicate initialization makes future environment changes and diagnostics harder.

**Required fix:** consolidate pages onto the shared Firebase module after compatibility tests. Apply appropriate Firebase API-key restrictions and App Check without treating either as a substitute for Firestore Rules.

### Medium — Repository and release safeguards are limited

- The `Main` branch is currently unprotected according to the branch metadata checked during this audit.
- There is no visible automated test/lint workflow in the audited tree.
- The Functions workflow deploys Functions only; it does not deploy Firestore Rules or migrate data. Its secret must remain in GitHub Actions secrets and must never be committed.

**Required fix:** use feature branches and reviewed changes, protect `Main`, add static checks and tests, and separate application, Functions, Rules, and data-migration release steps.

## Existing data compatibility inventory

The source references these existing data stores. This list is a source-code inventory, not proof that each collection currently contains records:

- Firestore root collections: `inventory`, `users`, `usernames`, `settings`, `savings`, `activityLog`.
- Browser localStorage keys include `goldbizna_sales`, `goldbizna_inventory`, `goldbizna_customers`, `goldbizna_debts`, `goldbizna_savings`, `goldbizna_username`, held carts, and printed-invoice IDs.
- POS currently decrements Firestore inventory while keeping its sale history in localStorage.
- The separate tenant model proposes `companies/{companyId}/...` collections, but no legacy data migration has been performed by the audited source.

**Data preservation rule:** do not delete, rename, bulk-move, overwrite, or reset any existing collection or localStorage key during the security foundation work. First export Firestore, preserve the browser-side records from each device that has unique sales data, reconcile duplicates, and test a full restore.

## Recommended implementation sequence

1. **Read-only live configuration check:** verify the Firebase project ID, Authentication providers and users, deployed Firestore Rules, App Check state, Functions deployment, and actual M-Pesa hosting. Record current settings before changing them.
2. **Backup and recovery:** export Firestore and create device-level exports of local-only sales/customer/debt/savings data. Test restoring to a separate Firebase project.
3. **Security test environment:** create or use a separate Firebase test project with representative legacy collections and two test staff accounts. Never use production customer data for these tests.
4. **Authentication foundation:** implement email/password sign-in, sign-out, auth-state waiting, session expiry handling, and a shared route guard. Test direct URL access to every protected page.
5. **Authorization foundation:** define least-privilege roles; move authoritative role assignment to trusted backend/admin-only operations; deny client privilege escalation. Keep the existing platform-owner custom-claim check.
6. **Legacy-compatible Firestore Rules:** explicitly secure every existing collection and operation. Verify ordinary staff cannot read/write users, settings, audit logs, or another company's records unless allowed.
7. **Data integrity:** add a durable sales ledger and atomic stock/sale operation. Migrate only after reconciliation and a verified rollback plan.
8. **Tenant rollout:** map the existing MABROUK workspace to a company only after the legacy pages support tenant-scoped paths. Test cross-company isolation with two companies.
9. **Payments and monitoring:** harden and test M-Pesa callback processing, App Check, rate limits, logs, backups, and recovery.
10. **UI transformation:** upgrade design and analytics after the secure data contracts are stable, preserving current workflows and receipt behavior.

## Acceptance tests before production release

- Signed-out visitors are redirected to sign-in on every protected page, including direct URLs.
- A signed-in cashier cannot open owner controls or change their own role/permissions.
- A disabled staff account loses access on the next authorized request/token refresh.
- A staff member in Company A cannot read or change Company B records.
- Unauthenticated and malformed Firestore requests are denied.
- Failed/duplicate sale submissions do not double-decrement stock or create duplicate invoices.
- Sales, inventory, customers, savings, credit, reports, and receipts reconcile across two devices.
- A backup can be restored in a separate project and verified before any production migration.
- M-Pesa success, failure, timeout, duplicate callback, and server restart scenarios reconcile correctly.

## Audit conclusion

The safest next change is not a visual redesign or a blanket rules deployment. It is to verify the live Firebase security configuration and back up existing data, then implement authentication and authorization in a test environment against the actual legacy collection map. The current production branch and business records should remain untouched until those checks pass.
