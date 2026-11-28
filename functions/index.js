import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { randomBytes, createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";

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
    const isPlatformOwner = actorUid === PLATFORM_OWNER_UID;
    const isCompanyAdmin = actorSnap.exists && actorSnap.data().status === "active" && actorSnap.data().role === "company_admin";
    if (!isPlatformOwner && !isCompanyAdmin) {
      throw new HttpsError("permission-denied", "Only the platform owner or an active company administrator can manage memberships for this company.");
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

// Adds a pending company membership from the platform owner control room.
export const createCompanyInvitation = onCall(async (request) => {
  requirePlatformOwner(request);
  const companyId = cleanText(request.data?.companyId, 128);
  const email = cleanText(request.data?.email, 160).toLowerCase();
  const role = cleanText(request.data?.role, 40);
  if (!companyId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["company_admin", "manager", "staff", "viewer"].includes(role)) {
    throw new HttpsError("invalid-argument", "Choose a company, enter a valid email and select a role.");
  }
  const company = await db.collection("companies").doc(companyId).get();
  if (!company.exists) throw new HttpsError("not-found", "Company not found.");
  const found = await db.collection("companyMemberships").where("companyId", "==", companyId).where("email", "==", email).limit(1).get();
  if (!found.empty && ["active", "invitation_pending"].includes(found.docs[0].data().status)) {
    throw new HttpsError("already-exists", "This email already has an active membership or pending invitation.");
  }

  // Provision the Firebase Authentication identity on the trusted server.
  // The random temporary password is never returned or stored in Firestore.
  const adminAuth = getAuth();
  let authUser;
  let accountCreated = false;
  try {
    authUser = await adminAuth.getUserByEmail(email);
    if (authUser.disabled) {
      throw new HttpsError("failed-precondition", "This Firebase account is disabled. Review its status before inviting it.");
    }
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error.code !== "auth/user-not-found") throw error;
    authUser = await adminAuth.createUser({
      email,
      password: randomBytes(36).toString("base64url"),
      emailVerified: false,
      disabled: false
    });
    accountCreated = true;
  }

  const continueUrl = "https://mubarak2058.github.io/Goldbizna/login.html";
  const actionSettings = { url: continueUrl, handleCodeInApp: false };
  let passwordSetupLink = null;
  let emailVerificationLink = null;
  try {
    passwordSetupLink = await adminAuth.generatePasswordResetLink(email, actionSettings);
    if (!authUser.emailVerified) {
      emailVerificationLink = await adminAuth.generateEmailVerificationLink(email, actionSettings);
    }
  } catch (error) {
    if (accountCreated) {
      try { await adminAuth.deleteUser(authUser.uid); } catch (_) {}
    }
    throw new HttpsError("internal", "The account was created but Firebase could not generate setup links. Check Firebase Authentication email templates and authorized domains.");
  }

  const ref = db.collection("companyMemberships").doc(email + "_" + companyId);
  await ref.set({
    companyId, companyName: cleanText(company.data().name, 80), email,
    uid: authUser.uid, role, status: "invitation_pending",
    createdAt: FieldValue.serverTimestamp(), invitedBy: request.auth.uid,
    updatedAt: FieldValue.serverTimestamp()
  });
  await db.collection("platformAuditLogs").add({
    action: "membership.invited", companyId, email, role,
    authUid: authUser.uid, accountCreated, actorUid: request.auth.uid,
    createdAt: FieldValue.serverTimestamp()
  });
  return {
    companyId, email, role, status: "invitation_pending",
    authUid: authUser.uid, accountCreated,
    passwordSetupLink, emailVerificationLink,
    delivery: "manual_link_sharing"
  };
});


// Live staff presence. The browser sends a heartbeat every 30 seconds;
// sessions older than 90 seconds are treated as offline.
export const updateStaffPresence = onCall(async (request) => {
  requireSignedIn(request);
  const sessionId = cleanText(request.data?.sessionId, 100);
  const page = cleanText(request.data?.page || "POS", 60);
  const device = cleanText(request.data?.device || "Browser", 80);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(sessionId)) {
    throw new HttpsError("invalid-argument", "A valid session ID is required.");
  }
  const uid = request.auth.uid;
  const ref = db.collection("staffPresence").doc(uid + "_" + sessionId);
  const snap = await ref.get();
  await ref.set({
    uid,
    email: cleanText(request.auth.token.email, 160),
    displayName: cleanText(request.auth.token.name || request.data?.displayName || request.auth.token.email || "Staff", 100),
    sessionId, page, device, status: "online",
    startedAt: snap.exists ? (snap.data().startedAt || FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { status: "online" };
});

export const endStaffPresence = onCall(async (request) => {
  requireSignedIn(request);
  const sessionId = cleanText(request.data?.sessionId, 100);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(sessionId)) {
    throw new HttpsError("invalid-argument", "A valid session ID is required.");
  }
  const ref = db.collection("staffPresence").doc(request.auth.uid + "_" + sessionId);
  const snap = await ref.get();
  if (snap.exists) await ref.set({ status: "offline", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { status: "offline" };
});

export const listLiveStaffPresence = onCall(async (request) => {
  requirePlatformOwner(request);
  const snap = await db.collection("staffPresence").limit(500).get();
  const cutoff = Date.now() - 90000;
  const sessions = snap.docs.map(d => {
    const data = d.data();
    const lastSeen = data.updatedAt?.toDate?.()?.toISOString?.() || null;
    const startedAt = data.startedAt?.toDate?.()?.toISOString?.() || null;
    const fresh = data.status === "online" && lastSeen && Date.parse(lastSeen) >= cutoff;
    return {
      id: d.id, uid: cleanText(data.uid, 128), email: cleanText(data.email, 160),
      displayName: cleanText(data.displayName, 100), page: cleanText(data.page, 60),
      device: cleanText(data.device, 80), status: fresh ? "online" : "offline",
      startedAt, lastSeen, durationSeconds: startedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000)) : 0
    };
  });
  sessions.sort((a,b) => (a.status === "online" ? 0 : 1) - (b.status === "online" ? 0 : 1) || Date.parse(b.lastSeen || 0) - Date.parse(a.lastSeen || 0));
  return { sessions };
});

// A single M-Pesa transaction code can be claimed by only one sale globally.
// Firestore transaction makes simultaneous attempts from different tills safe.
export const registerMpesaCode = onCall(async (request) => {
  requireSignedIn(request);
  const code = cleanText(request.data?.code, 40).toUpperCase().replace(/\s+/g, "");
  const saleId = cleanText(request.data?.saleId, 100);
  const phone = cleanText(request.data?.phone, 30);
  const amount = Number(request.data?.amount || 0);
  if (!/^[A-Z0-9]{6,20}$/.test(code) || !saleId || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("invalid-argument", "Enter a valid M-Pesa code and sale details.");
  }
  const hash = createHash("sha256").update(code).digest("hex");
  const ref = db.collection("mpesaCodeRegistry").doc(hash);
  const alertRef = db.collection("mpesaAlerts").doc();
  const result = await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      const old = existing.data();
      if (old.saleId === saleId) return { duplicate: false, alreadyRegistered: true };
      tx.create(alertRef, {
        code, saleId, existingSaleId: cleanText(old.saleId, 100),
        existingUid: cleanText(old.uid, 128), existingEmail: cleanText(old.email, 160),
        attemptedUid: request.auth.uid, attemptedEmail: cleanText(request.auth.token.email, 160),
        phone, amount, existingPhone: cleanText(old.phone, 30),
        existingAmount: Number(old.amount || 0), status: "open",
        createdAt: FieldValue.serverTimestamp()
      });
      return { duplicate: true, alertId: alertRef.id, existingSaleId: cleanText(old.saleId, 100) };
    }
    tx.create(ref, {
      code, saleId, uid: request.auth.uid,
      email: cleanText(request.auth.token.email, 160),
      phone, amount, createdAt: FieldValue.serverTimestamp()
    });
    return { duplicate: false, registered: true };
  });
  return result;
});

export const releaseMpesaCode = onCall(async (request) => {
  requireSignedIn(request);
  const code = cleanText(request.data?.code, 40).toUpperCase().replace(/\s+/g, "");
  const saleId = cleanText(request.data?.saleId, 100);
  const hash = createHash("sha256").update(code).digest("hex");
  const ref = db.collection("mpesaCodeRegistry").doc(hash);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().uid === request.auth.uid && snap.data().saleId === saleId) tx.delete(ref);
  });
  return { released: true };
});

export const listMpesaDuplicateAlerts = onCall(async (request) => {
  requirePlatformOwner(request);
  const snap = await db.collection("mpesaAlerts").orderBy("createdAt", "desc").limit(100).get();
  return { alerts: snap.docs.map(d => {
    const x = d.data();
    return {
      id: d.id, code: cleanText(x.code, 40), saleId: cleanText(x.saleId, 100),
      existingSaleId: cleanText(x.existingSaleId, 100),
      existingEmail: cleanText(x.existingEmail, 160), attemptedEmail: cleanText(x.attemptedEmail, 160),
      phone: cleanText(x.phone, 30), existingPhone: cleanText(x.existingPhone, 30),
      amount: Number(x.amount || 0), existingAmount: Number(x.existingAmount || 0),
      status: cleanText(x.status, 20), createdAt: x.createdAt?.toDate?.()?.toISOString?.() || null
    };
  }) };
});

export const resolveMpesaDuplicateAlert = onCall(async (request) => {
  requirePlatformOwner(request);
  const alertId = cleanText(request.data?.alertId, 128);
  if (!alertId) throw new HttpsError("invalid-argument", "Alert ID is required.");
  const ref = db.collection("mpesaAlerts").doc(alertId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Alert not found.");
  await ref.update({ status: "reviewed", reviewedBy: request.auth.uid, reviewedAt: FieldValue.serverTimestamp() });
  return { status: "reviewed" };
});


// -----------------------------------------------------------------------------
// TENANT FOUNDATION (Phase 1)
// New company-scoped records live below companies/{companyId}/....
// Legacy root-level POS collections are intentionally untouched during migration.
// -----------------------------------------------------------------------------

async function requireActiveCompany(companyId) {
  const ref = db.collection("companies").doc(companyId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Company not found.");
  if (snap.data().status !== "active") throw new HttpsError("failed-precondition", "This company workspace is not active.");
  return { ref, data: snap.data() };
}

async function requireCompanyManager(request, companyId) {
  requireSignedIn(request);
  const { data } = await requireActiveCompany(companyId);
  if (request.auth.uid === PLATFORM_OWNER_UID) return { role: "platform_owner", company: data };
  const member = await db.collection("companyMemberships").doc(request.auth.uid + "_" + companyId).get();
  if (!member.exists || member.data().status !== "active" ||
      !["company_admin", "manager"].includes(member.data().role)) {
    throw new HttpsError("permission-denied", "An active company administrator or manager is required.");
  }
  return { role: member.data().role, company: data };
}

async function requireCompanyMember(request, companyId) {
  requireSignedIn(request);
  await requireActiveCompany(companyId);
  if (request.auth.uid === PLATFORM_OWNER_UID) return { role: "platform_owner" };
  const member = await db.collection("companyMemberships").doc(request.auth.uid + "_" + companyId).get();
  if (!member.exists || member.data().status !== "active") {
    throw new HttpsError("permission-denied", "You are not an active member of this company.");
  }
  return { role: member.data().role };
}

// Create a branch/outlet inside a company. This does not move legacy POS data.
export const createCompanyBranch = onCall(async (request) => {
  const companyId = cleanText(request.data?.companyId, 128);
  const name = cleanText(request.data?.name, 80);
  const code = cleanText(request.data?.code, 24).toUpperCase();
  const address = cleanText(request.data?.address, 200);
  const managerUid = cleanText(request.data?.managerUid, 128);
  if (!companyId || name.length < 2) throw new HttpsError("invalid-argument", "Company and branch name are required.");
  await requireCompanyManager(request, companyId);
  if (managerUid) {
    const manager = await db.collection("companyMemberships").doc(managerUid + "_" + companyId).get();
    if (!manager.exists || manager.data().status !== "active" ||
        !["company_admin", "manager"].includes(manager.data().role)) {
      throw new HttpsError("failed-precondition", "Branch manager must be an active manager in this company.");
    }
  }
  const ref = db.collection("companies").doc(companyId).collection("branches").doc();
  await ref.create({
    companyId, name, code, address, managerUid: managerUid || null,
    status: "active", createdAt: FieldValue.serverTimestamp(),
    createdBy: request.auth.uid, updatedAt: FieldValue.serverTimestamp()
  });
  await db.collection("platformAuditLogs").add({
    action: "branch.created", companyId, branchId: ref.id, branchName: name,
    actorUid: request.auth.uid, createdAt: FieldValue.serverTimestamp()
  });
  return { branchId: ref.id, status: "active" };
});

export const listCompanyBranches = onCall(async (request) => {
  const companyId = cleanText(request.data?.companyId, 128);
  if (!companyId) throw new HttpsError("invalid-argument", "Company ID is required.");
  await requireCompanyMember(request, companyId);
  const snap = await db.collection("companies").doc(companyId)
    .collection("branches").orderBy("createdAt", "desc").limit(200).get();
  return { branches: snap.docs.map(d => ({ id: d.id, ...d.data(),
    createdAt: d.data().createdAt?.toDate?.()?.toISOString?.() || null
  })) };
});

export const updateCompanyBranch = onCall(async (request) => {
  const companyId = cleanText(request.data?.companyId, 128);
  const branchId = cleanText(request.data?.branchId, 128);
  const name = cleanText(request.data?.name, 80);
  const code = cleanText(request.data?.code, 24).toUpperCase();
  const address = cleanText(request.data?.address, 200);
  const managerUid = cleanText(request.data?.managerUid, 128);
  const status = cleanText(request.data?.status, 20);
  if (!companyId || !branchId || name.length < 2 || !["active", "suspended"].includes(status)) {
    throw new HttpsError("invalid-argument", "Valid company, branch, name and status are required.");
  }
  await requireCompanyManager(request, companyId);
  if (managerUid) {
    const manager = await db.collection("companyMemberships").doc(managerUid + "_" + companyId).get();
    if (!manager.exists || manager.data().status !== "active" ||
        !["company_admin", "manager"].includes(manager.data().role)) {
      throw new HttpsError("failed-precondition", "Branch manager must be an active manager in this company.");
    }
  }
  const ref = db.collection("companies").doc(companyId).collection("branches").doc(branchId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Branch not found in this company.");
  await ref.update({ name, code, address, managerUid: managerUid || null, status,
    updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid });
  await db.collection("platformAuditLogs").add({
    action: "branch.updated", companyId, branchId, branchName: name, status,
    actorUid: request.auth.uid, createdAt: FieldValue.serverTimestamp()
  });
  return { branchId, status };
});

// Seller payment controls: only the configured methods are returned to that seller.
// POS frontends must call getSellerPaymentOptions and render only its returned list.
const SELLER_PAYMENT_METHODS = ["cash", "mpesa", "card", "bank", "credit"];
export const setSellerPaymentOptions = onCall(async (request) => {
  const companyId = cleanText(request.data?.companyId, 128);
  const sellerUid = cleanText(request.data?.sellerUid, 128);
  const enabledMethods = request.data?.enabledMethods;
  if (!companyId || !sellerUid || !Array.isArray(enabledMethods) ||
      enabledMethods.some(x => !SELLER_PAYMENT_METHODS.includes(x)) ||
      new Set(enabledMethods).size !== enabledMethods.length) {
    throw new HttpsError("invalid-argument", "Choose a seller and valid, non-duplicate payment methods.");
  }
  await requireCompanyManager(request, companyId);
  const seller = await db.collection("companyMemberships").doc(sellerUid + "_" + companyId).get();
  if (!seller.exists || seller.data().status !== "active") {
    throw new HttpsError("not-found", "Active seller membership not found in this company.");
  }
  const ref = db.collection("companies").doc(companyId)
    .collection("sellerPaymentSettings").doc(sellerUid);
  await ref.set({
    companyId, sellerUid, enabledMethods,
    updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid
  });
  await db.collection("platformAuditLogs").add({
    action: "seller.payment_methods_updated", companyId, sellerUid,
    enabledMethods, actorUid: request.auth.uid, createdAt: FieldValue.serverTimestamp()
  });
  return { sellerUid, enabledMethods };
});

export const getSellerPaymentOptions = onCall(async (request) => {
  const companyId = cleanText(request.data?.companyId, 128);
  if (!companyId) throw new HttpsError("invalid-argument", "Company ID is required.");
  await requireCompanyMember(request, companyId);
  const sellerUid = request.auth.uid;
  const ref = db.collection("companies").doc(companyId)
    .collection("sellerPaymentSettings").doc(sellerUid);
  const snap = await ref.get();
  const enabledMethods = snap.exists && Array.isArray(snap.data().enabledMethods)
    ? snap.data().enabledMethods.filter(x => SELLER_PAYMENT_METHODS.includes(x))
    : [...SELLER_PAYMENT_METHODS];
  return { companyId, sellerUid, enabledMethods };
});

// -----------------------------------------------------------------------------
// OFFLINE SYNC FOUNDATION — company workspaces only.
// This records terminal heartbeats and immutable incoming operations. It does
// NOT apply queued business changes to inventory/sales until a later validated
// sync-apply workflow is implemented and tested.
// -----------------------------------------------------------------------------
function validSyncId(value, label) {
  const id = cleanText(value, 120);
  if (!/^[A-Za-z0-9_-]{6,120}$/.test(id)) {
    throw new HttpsError("invalid-argument", "A valid " + label + " is required.");
  }
  return id;
}

function isoOrNull(value) {
  return value?.toDate?.()?.toISOString?.() || null;
}

export const registerSyncTerminal = onCall(async (request) => {
  const companyId = cleanText(request.data?.companyId, 128);
  const terminalId = validSyncId(request.data?.terminalId, "terminal ID");
  const branchId = cleanText(request.data?.branchId, 128);
  const label = cleanText(request.data?.label || "POS terminal", 80);
  const device = cleanText(request.data?.device || "Unknown device", 120);
  const page = cleanText(request.data?.page || "POS", 40);
  const pendingCount = Number(request.data?.pendingCount || 0);
  if (!companyId || !Number.isInteger(pendingCount) || pendingCount < 0 || pendingCount > 10000) {
    throw new HttpsError("invalid-argument", "Company and a valid pending transaction count are required.");
  }
  const { data: company } = await requireActiveCompany(companyId);
  const member = await requireCompanyMember(request, companyId);
  const ref = db.collection("companies").doc(companyId).collection("syncTerminals").doc(terminalId);
  await ref.set({
    companyId, companyName: cleanText(company.name, 80), branchId,
    terminalId, label, device, page, uid: request.auth.uid,
    role: member.role, status: "online", pendingCount,
    lastSeenAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { status: "online", terminalId };
});

export const submitOfflineSyncBatch = onCall(async (request) => {
  const companyId = cleanText(request.data?.companyId, 128);
  const terminalId = validSyncId(request.data?.terminalId, "terminal ID");
  const branchId = cleanText(request.data?.branchId, 128);
  const operations = request.data?.operations;
  if (!companyId || !Array.isArray(operations) || operations.length < 1 || operations.length > 50) {
    throw new HttpsError("invalid-argument", "Submit between 1 and 50 offline operations.");
  }
  await requireCompanyMember(request, companyId);
  const allowedTypes = ["sale", "inventory", "customer", "stockMovement"];
  const result = { accepted: 0, duplicates: 0, conflicts: 0 };
  const companyRef = db.collection("companies").doc(companyId);
  for (const raw of operations) {
    const operationId = validSyncId(raw?.operationId, "operation ID");
    const entityType = cleanText(raw?.entityType, 30);
    const entityId = cleanText(raw?.entityId, 128);
    const payload = raw?.payload;
    if (!allowedTypes.includes(entityType) || !entityId || !payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new HttpsError("invalid-argument", "Each operation needs a supported entity type, entity ID and object payload.");
    }
    const serialized = JSON.stringify(payload);
    if (serialized.length > 180000) throw new HttpsError("invalid-argument", "An offline operation is too large.");
    const payloadHash = createHash("sha256").update(serialized).digest("hex");
    const queueRef = companyRef.collection("syncQueue").doc(operationId);
    const conflictRef = companyRef.collection("syncConflicts").doc();
    const outcome = await db.runTransaction(async (tx) => {
      const existing = await tx.get(queueRef);
      if (!existing.exists) {
        tx.create(queueRef, {
          companyId, branchId, terminalId, operationId, entityType, entityId,
          baseVersion: cleanText(raw?.baseVersion, 100),
          payload, payloadHash, status: "pending",
          submittedBy: request.auth.uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        return "accepted";
      }
      const old = existing.data();
      if (old.payloadHash === payloadHash) return "duplicate";
      tx.create(conflictRef, {
        companyId, branchId, terminalId, operationId, entityType, entityId,
        status: "open",
        original: {
          payload: old.payload || null,
          payloadHash: old.payloadHash || "",
          submittedBy: old.submittedBy || "",
          createdAt: old.createdAt || null
        },
        incoming: {
          payload, payloadHash, submittedBy: request.auth.uid,
          receivedAt: FieldValue.serverTimestamp()
        },
        createdAt: FieldValue.serverTimestamp()
      });
      return "conflict";
    });
    result[outcome === "accepted" ? "accepted" : outcome === "duplicate" ? "duplicates" : "conflicts"]++;
  }
  const terminalRef = companyRef.collection("syncTerminals").doc(terminalId);
  await terminalRef.set({
    companyId, terminalId, branchId, uid: request.auth.uid,
    status: "online", pendingCount: FieldValue.increment(-result.accepted),
    lastUploadAt: FieldValue.serverTimestamp(), lastSeenAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return result;
});

export const listPlatformSyncOverview = onCall(async (request) => {
  requirePlatformOwner(request);
  const [terminalsSnap, queueSnap, conflictsSnap] = await Promise.all([
    db.collectionGroup("syncTerminals").limit(500).get(),
    db.collectionGroup("syncQueue").limit(500).get(),
    db.collectionGroup("syncConflicts").limit(500).get()
  ]);
  const cutoff = Date.now() - 90000;
  const terminals = terminalsSnap.docs.map(docSnap => {
    const x = docSnap.data();
    const lastSeenAt = isoOrNull(x.lastSeenAt);
    return {
      id: docSnap.id, companyId: cleanText(x.companyId, 128),
      companyName: cleanText(x.companyName, 80), branchId: cleanText(x.branchId, 128),
      label: cleanText(x.label || "POS terminal", 80), device: cleanText(x.device, 120),
      page: cleanText(x.page, 40), status: lastSeenAt && Date.parse(lastSeenAt) >= cutoff ? "online" : "offline",
      pendingCount: Number(x.pendingCount || 0), lastSeenAt,
      lastUploadAt: isoOrNull(x.lastUploadAt)
    };
  });
  const queue = queueSnap.docs.map(docSnap => {
    const x = docSnap.data();
    return {
      id: docSnap.id, companyId: cleanText(x.companyId, 128),
      branchId: cleanText(x.branchId, 128), terminalId: cleanText(x.terminalId, 120),
      entityType: cleanText(x.entityType, 30), entityId: cleanText(x.entityId, 128),
      status: cleanText(x.status, 30), createdAt: isoOrNull(x.createdAt)
    };
  });
  const conflicts = conflictsSnap.docs.map(docSnap => {
    const x = docSnap.data();
    return {
      id: docSnap.id, companyId: cleanText(x.companyId, 128),
      branchId: cleanText(x.branchId, 128), terminalId: cleanText(x.terminalId, 120),
      operationId: cleanText(x.operationId, 120), entityType: cleanText(x.entityType, 30),
      entityId: cleanText(x.entityId, 128), status: cleanText(x.status, 20),
      createdAt: isoOrNull(x.createdAt)
    };
  });
  return { terminals, queue, conflicts, sampledAt: new Date().toISOString() };
});

export const markSyncConflictReviewed = onCall(async (request) => {
  requirePlatformOwner(request);
  const companyId = cleanText(request.data?.companyId, 128);
  const conflictId = cleanText(request.data?.conflictId, 128);
  if (!companyId || !conflictId) throw new HttpsError("invalid-argument", "Company and conflict IDs are required.");
  const ref = db.collection("companies").doc(companyId).collection("syncConflicts").doc(conflictId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Sync conflict not found.");
  await ref.update({
    status: "reviewed", reviewedBy: request.auth.uid,
    reviewedAt: FieldValue.serverTimestamp()
  });
  await db.collection("platformAuditLogs").add({
    action: "sync.conflict_reviewed", companyId, conflictId,
    actorUid: request.auth.uid, createdAt: FieldValue.serverTimestamp()
  });
  return { status: "reviewed" };
});
