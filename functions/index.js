import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

function requireSignedIn(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in with any Firebase account first.");
}

function cleanText(value, max = 100) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Creates only a company registry record. It never copies, edits or deletes
// the existing root-level MABROUK POS collections.
export const createCompany = onCall(async (request) => {
  requireSignedIn(request);
  const name = cleanText(request.data?.name, 80);
  const legalName = cleanText(request.data?.legalName, 120);
  const email = cleanText(request.data?.adminEmail, 160).toLowerCase();
  const phone = cleanText(request.data?.phone, 40);
  const country = cleanText(request.data?.country || "Kenya", 60);
  const currency = cleanText(request.data?.currency || "KES", 8).toUpperCase();

  if (name.length < 2) throw new HttpsError("invalid-argument", "Company name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "A valid company administrator email is required.");
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpsError("invalid-argument", "Currency must be a 3-letter code.");

  const companyRef = db.collection("companies").doc();
  const membershipRef = db.collection("companyMemberships").doc(email + "_" + companyRef.id);

  await db.runTransaction(async (tx) => {
    tx.create(companyRef, {
      name, legalName, adminEmail: email, phone, country, currency,
      status: "pending",
      plan: "trial",
      branding: { mode: "company", displayName: name, logoUrl: "", primaryColor: "#087a0b" },
      dataModelVersion: 1,
      dataMode: "tenant_scoped",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.create(membershipRef, {
      companyId: companyRef.id,
      email,
      role: "company_admin",
      status: "invitation_pending",
      createdAt: FieldValue.serverTimestamp()
    });
    tx.create(db.collection("platformAuditLogs").doc(), {
      action: "company.created",
      companyId: companyRef.id,
      actorUid: request.auth.uid,
      createdAt: FieldValue.serverTimestamp()
    });
  });

  return { companyId: companyRef.id, status: "pending" };
});

export const listCompanies = onCall(async (request) => {
  requireSignedIn(request);
  const snap = await db.collection("companies").orderBy("createdAt", "desc").limit(200).get();
  return { companies: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
});

export const setCompanyStatus = onCall(async (request) => {
  requireSignedIn(request);
  const companyId = cleanText(request.data?.companyId, 128);
  const status = cleanText(request.data?.status, 20);
  if (!companyId || !["active", "suspended", "pending"].includes(status)) {
    throw new HttpsError("invalid-argument", "Valid company ID and status are required.");
  }
  const ref = db.collection("companies").doc(companyId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Company not found.");
    tx.update(ref, { status, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid });
    tx.create(db.collection("platformAuditLogs").doc(), {
      action: "company.status_changed", companyId, status,
      actorUid: request.auth.uid, createdAt: FieldValue.serverTimestamp()
    });
  });
  return { companyId, status };
});

// Returns the latest platform audit events for signed-in control-room users.
export const listPlatformAuditLogs = onCall(async (request) => {
  requireSignedIn(request);
  const snap = await db.collection("platformAuditLogs")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  return {
    logs: snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        action: cleanText(data.action, 80),
        companyId: cleanText(data.companyId, 128),
        actorUid: cleanText(data.actorUid, 128),
        status: cleanText(data.status, 20),
        email: cleanText(data.email, 160),
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null
      };
    })
  };
});

// A company administrator accepts an invitation only when signed in with
// the exact invited, verified email address. The browser cannot assign roles.
export const acceptCompanyInvitation = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in with the invited account first.");
  const uid = request.auth.uid;
  const email = cleanText(request.auth.token.email, 160).toLowerCase();
  if (!email || request.auth.token.email_verified !== true) {
    throw new HttpsError("failed-precondition", "Verify the invited email address before accepting.");
  }
  const companyId = cleanText(request.data?.companyId, 128);
  if (!companyId) throw new HttpsError("invalid-argument", "Company ID is required.");
  const companyRef = db.collection("companies").doc(companyId);
  const invitationQuery = db.collection("companyMemberships")
    .where("companyId", "==", companyId)
    .where("email", "==", email)
    .where("status", "==", "invitation_pending")
    .limit(1);
  const invitationSnap = await invitationQuery.get();
  if (invitationSnap.empty) throw new HttpsError("not-found", "No pending invitation matches this verified email and company.");
  const invitationRef = invitationSnap.docs[0].ref;
  const membershipRef = db.collection("companyMemberships").doc(uid + "_" + companyId);
  await db.runTransaction(async (tx) => {
    const [companySnap, inviteSnap, memberSnap] = await Promise.all([
      tx.get(companyRef), tx.get(invitationRef), tx.get(membershipRef)
    ]);
    if (!companySnap.exists) throw new HttpsError("not-found", "Company not found.");
    if (companySnap.data().status !== "active") throw new HttpsError("failed-precondition", "This company is not active yet.");
    if (!inviteSnap.exists || inviteSnap.data().status !== "invitation_pending" || inviteSnap.data().email !== email) {
      throw new HttpsError("failed-precondition", "This invitation is no longer available.");
    }
    if (memberSnap.exists && memberSnap.data().status === "active") return;
    tx.set(membershipRef, {
      uid, companyId, email, role: inviteSnap.data().role || "company_admin",
      status: "active", acceptedAt: FieldValue.serverTimestamp()
    });
    tx.update(invitationRef, { status: "accepted", acceptedBy: uid, acceptedAt: FieldValue.serverTimestamp() });
    tx.create(db.collection("platformAuditLogs").doc(), {
      action: "company.invitation_accepted", companyId, actorUid: uid, email,
      createdAt: FieldValue.serverTimestamp()
    });
  });
  return { companyId, status: "active" };
});
