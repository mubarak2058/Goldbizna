import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

function requireSignedIn(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in with a Firebase account first.");
}

const PLATFORM_OWNER_UID = "ZW5pqCx3FvSzxtXBiZMMC6fP5ro2";
function requirePlatformOwner(request) {
  requireSignedIn(request);
  if (request.auth.uid !== PLATFORM_OWNER_UID) {
    throw new HttpsError("permission-denied", "Only the platform owner can use this control-room action.");
  }
}

function cleanText(value, max = 100) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Creates only a company registry record. It never copies, edits or deletes
// the existing root-level MABROUK POS collections.
export const createCompany = onCall(async (request) => {
  requirePlatformOwner(request);
  const name = cleanText(request.data?.name, 80);
  const legalName = cleanText(request.data?.legalName, 120);
  const email = cleanText(request.data?.adminEmail, 160).toLowerCase();
  const phone = cleanText(request.data?.phone, 40);
  const companyUrl = cleanText(request.data?.companyUrl, 500);
  const country = cleanText(request.data?.country || "Kenya", 60);
  const currency = cleanText(request.data?.currency || "KES", 8).toUpperCase();

  if (name.length < 2) throw new HttpsError("invalid-argument", "Company name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "A valid company administrator email is required.");
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpsError("invalid-argument", "Currency must be a 3-letter code.");
  if (companyUrl && !/^https:\/\//i.test(companyUrl)) throw new HttpsError("invalid-argument", "Company link must use HTTPS.");

  const companyRef = db.collection("companies").doc();
  const membershipRef = db.collection("companyMemberships").doc(email + "_" + companyRef.id);

  await db.runTransaction(async (tx) => {
    tx.create(companyRef, {
      name, legalName, adminEmail: email, phone, companyUrl, country, currency,
      status: "pending",
      plan: "free",
      subscription: { plan: "free", status: "trial", billingCycle: "none", renewalAt: null },
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


export const updateCompanySubscription = onCall(async (request) => {
  requireSignedIn(request);
  requirePlatformOwner(request);
  const companyId = cleanText(request.data?.companyId, 128);
  const plan = cleanText(request.data?.plan, 24);
  const status = cleanText(request.data?.status, 24);
  const billingCycle = cleanText(request.data?.billingCycle || "monthly", 16);
  const renewalAt = cleanText(request.data?.renewalAt, 30);
  if (!companyId || !["free","basic","professional","enterprise"].includes(plan) || !["trial","active","past_due","cancelled"].includes(status) || !["monthly","yearly","none"].includes(billingCycle)) throw new HttpsError("invalid-argument", "Choose valid subscription settings.");
  if (renewalAt && !/^\d{4}-\d{2}-\d{2}$/.test(renewalAt)) throw new HttpsError("invalid-argument", "Renewal date must use YYYY-MM-DD.");
  const ref = db.collection("companies").doc(companyId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Company not found.");
    tx.update(ref, { plan, subscription: { plan, status, billingCycle, renewalAt: renewalAt || null, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid });
    tx.create(db.collection("platformAuditLogs").doc(), { action: "company.subscription_updated", companyId, plan, status, actorUid: request.auth.uid, createdAt: FieldValue.serverTimestamp() });
  });
  return { companyId, plan, status, billingCycle, renewalAt: renewalAt || null };
});

export const listCompanies = onCall(async (request) => {
  requirePlatformOwner(request);
  const snap = await db.collection("companies").orderBy("createdAt", "desc").limit(200).get();
  return { companies: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
});

// Updates a company's profile and visual branding. Only its active company admin can edit it.
export const updateCompanyWorkspace = onCall(async (request) => {
  requireSignedIn(request);
  const companyId = cleanText(request.data?.companyId, 128);
  const name = cleanText(request.data?.name, 80);
  const legalName = cleanText(request.data?.legalName, 120);
  const phone = cleanText(request.data?.phone, 40);
  const companyUrl = cleanText(request.data?.companyUrl, 500);
  const country = cleanText(request.data?.country, 60);
  const currency = cleanText(request.data?.currency, 8).toUpperCase();
  const displayName = cleanText(request.data?.displayName || name, 80);
  const logoUrl = cleanText(request.data?.logoUrl, 500);
  const primaryColor = cleanText(request.data?.primaryColor || "#087a0b", 7);
  if (!companyId || name.length < 2 || !/^[A-Z]{3}$/.test(currency)) {
    throw new HttpsError("invalid-argument", "A valid company, name and three-letter currency are required.");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
    throw new HttpsError("invalid-argument", "Brand color must be a six-digit hex color.");
  }
  if (companyUrl && !/^https:\/\//i.test(companyUrl)) {
    throw new HttpsError("invalid-argument", "Company link must use HTTPS.");
  }
  if (logoUrl && !/^https:\/\//i.test(logoUrl)) {
    throw new HttpsError("invalid-argument", "Logo URL must use HTTPS.");
  }
  const actorUid = request.auth.uid;
  const memberRef = db.collection("companyMemberships").doc(actorUid + "_" + companyId);
  const companyRef = db.collection("companies").doc(companyId);
  await db.runTransaction(async (tx) => {
    const [memberSnap, companySnap] = await Promise.all([tx.get(memberRef), tx.get(companyRef)]);
    const isPlatformOwner = actorUid === PLATFORM_OWNER_UID;
    const isCompanyAdmin = memberSnap.exists && memberSnap.data().status === "active" && memberSnap.data().role === "company_admin";
    if (!isPlatformOwner && !isCompanyAdmin) {
      throw new HttpsError("permission-denied", "Only the platform owner or an active company administrator can edit this workspace.");
    }
    if (!companySnap.exists) throw new HttpsError("not-found", "Company workspace not found.");
    tx.update(companyRef, {
      name, legalName, phone, companyUrl, country, currency,
      branding: { ...(companySnap.data().branding || {}), mode: "company", displayName, logoUrl, primaryColor },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid
    });
    tx.create(db.collection("platformAuditLogs").doc(), {
      action: "company.workspace_updated", companyId, actorUid,
      createdAt: FieldValue.serverTimestamp()
    });
  });
  return { companyId, status: "updated" };
});

export const setCompanyStatus = onCall(async (request) => {
  requirePlatformOwner(request);
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
  requirePlatformOwner(request);
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
        roomId: cleanText(data.roomId, 128),
        roomName: cleanText(data.roomName, 80),
        actorUid: cleanText(data.actorUid, 128),
        status: cleanText(data.status, 20),
        plan: cleanText(data.plan, 24),
        email: cleanText(data.email, 160),
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null
      };
    })
  };
});

// Lists recent company memberships for the signed-in platform console.
export const listPlatformUsers = onCall(async (request) => {
  requirePlatformOwner(request);
  const snap = await db.collection("companyMemberships")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();
  return {
    users: snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        uid: cleanText(data.uid, 128),
        companyId: cleanText(data.companyId, 128),
        email: cleanText(data.email, 160),
        role: cleanText(data.role, 40),
        status: cleanText(data.status, 40),
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null
      };
    })
  };
});

// Company admins may manage memberships only inside their own company.
// A user cannot change their own membership or promote themselves.
export const updateCompanyMembership = onCall(async (request) => {
  requireSignedIn(request);
  const companyId = cleanText(request.data?.companyId, 128);
  const membershipId = cleanText(request.data?.membershipId, 180);
  const role = cleanText(request.data?.role, 40);
  const status = cleanText(request.data?.status, 40);
  const allowedRoles = ["company_admin", "manager", "staff", "viewer"];
  const allowedStatuses = ["active", "suspended", "cancelled", "invitation_pending"];
  if (!companyId || !membershipId || !allowedRoles.includes(role) || !allowedStatuses.includes(status)) {
    throw new HttpsError("invalid-argument", "Company, membership, role and status are required.");
  }
  const actorUid = request.auth.uid;
  const actorRef = db.collection("companyMemberships").doc(actorUid + "_" + companyId);
  const targetRef = db.collection("companyMemberships").doc(membershipId);
  await db.runTransaction(async (tx) => {
    const [actorSnap, targetSnap] = await Promise.all([tx.get(actorRef), tx.get(targetRef)]);
    if (!actorSnap.exists || actorSnap.data().status !== "active" || actorSnap.data().role !== "company_admin") {
      throw new HttpsError("permission-denied", "Only an active company administrator can manage memberships for this company.");
    }
    if (!targetSnap.exists || targetSnap.data().companyId !== companyId) {
      throw new HttpsError("not-found", "Membership not found in this company.");
    }
    if (targetSnap.id === actorRef.id) {
      throw new HttpsError("failed-precondition", "You cannot change your own membership from this screen.");
    }
    tx.update(targetRef, {
      role,
      status,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid
    });
    tx.create(db.collection("platformAuditLogs").doc(), {
      action: "membership.updated",
      companyId,
      email: cleanText(targetSnap.data().email, 160),
      role,
      status,
      actorUid,
      createdAt: FieldValue.serverTimestamp()
    });
  });
  return { companyId, membershipId, role, status };
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


// Multi-room registry. Rooms are separate workspace entry points and do not
// move or rewrite legacy POS collections.
export const createCompanyRoom = onCall(async (request) => {
  requirePlatformOwner(request);
  const companyId = cleanText(request.data?.companyId, 128);
  const roomName = cleanText(request.data?.roomName, 80);
  const roomUrl = cleanText(request.data?.roomUrl, 500);
  const managerEmail = cleanText(request.data?.managerEmail, 160).toLowerCase();
  const notes = cleanText(request.data?.notes, 300);
  if (!companyId || roomName.length < 2) throw new HttpsError("invalid-argument", "Choose a company and enter a room name.");
  if (!/^https:\/\//i.test(roomUrl)) throw new HttpsError("invalid-argument", "Room link must use HTTPS.");
  if (managerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail)) {
    throw new HttpsError("invalid-argument", "Enter a valid manager email address.");
  }
  const companyRef = db.collection("companies").doc(companyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) throw new HttpsError("not-found", "Company not found.");
  if (managerEmail) {
    const memberSnap = await db.collection("companyMemberships")
      .where("companyId", "==", companyId).where("email", "==", managerEmail).limit(1).get();
    if (memberSnap.empty || memberSnap.docs[0].data().status !== "active" ||
        !["manager", "company_admin"].includes(memberSnap.docs[0].data().role)) {
      throw new HttpsError("failed-precondition", "The room manager must be an active manager or company administrator in this company.");
    }
  }
  const ref = db.collection("companyRooms").doc();
  await ref.create({
    companyId, companyName: cleanText(companySnap.data().name, 80),
    roomName, roomUrl, managerEmail, notes, status: "active",
    createdAt: FieldValue.serverTimestamp(), createdBy: request.auth.uid,
    updatedAt: FieldValue.serverTimestamp()
  });
  await db.collection("platformAuditLogs").add({
    action: "room.created", companyId, roomId: ref.id, roomName,
    actorUid: request.auth.uid, createdAt: FieldValue.serverTimestamp()
  });
  return { roomId: ref.id, status: "active" };
});

export const listCompanyRooms = onCall(async (request) => {
  requirePlatformOwner(request);
  const snap = await db.collection("companyRooms").orderBy("createdAt", "desc").limit(300).get();
  return { rooms: snap.docs.map(d => ({ id: d.id, ...d.data(),
    createdAt: d.data().createdAt?.toDate?.()?.toISOString?.() || null
  })) };
});

export const updateCompanyRoom = onCall(async (request) => {
  requirePlatformOwner(request);
  const roomId = cleanText(request.data?.roomId, 128);
  const roomName = cleanText(request.data?.roomName, 80);
  const roomUrl = cleanText(request.data?.roomUrl, 500);
  const managerEmail = cleanText(request.data?.managerEmail, 160).toLowerCase();
  const notes = cleanText(request.data?.notes, 300);
  const status = cleanText(request.data?.status, 20);
  if (!roomId || roomName.length < 2 || !/^https:\/\//i.test(roomUrl) ||
      !["active", "suspended"].includes(status)) {
    throw new HttpsError("invalid-argument", "Room details, HTTPS link and valid status are required.");
  }
  const ref = db.collection("companyRooms").doc(roomId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Room not found.");
  if (managerEmail) {
    const memberSnap = await db.collection("companyMemberships")
      .where("companyId", "==", snap.data().companyId).where("email", "==", managerEmail).limit(1).get();
    if (memberSnap.empty || memberSnap.docs[0].data().status !== "active" ||
        !["manager", "company_admin"].includes(memberSnap.docs[0].data().role)) {
      throw new HttpsError("failed-precondition", "The room manager must be an active manager or company administrator in this company.");
    }
  }
  await ref.update({ roomName, roomUrl, managerEmail, notes, status,
    updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid });
  await db.collection("platformAuditLogs").add({
    action: "room.updated", companyId: snap.data().companyId, roomId, roomName, status,
    actorUid: request.auth.uid, createdAt: FieldValue.serverTimestamp()
  });
  return { roomId, status };
});
