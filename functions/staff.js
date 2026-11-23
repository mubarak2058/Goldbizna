import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const db = getFirestore();
const auth = getAuth();

const ALLOWED_PERMISSIONS = [
  "Dashboard", "POS", "Inventory", "Customers", "Sales History",
  "Reports", "Savings", "Payments", "Settings", "User Management"
];
const ALLOWED_ROLES = ["Cashier", "Storekeeper", "Accountant", "Manager"];

function requireOwner(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in.");
  if (request.auth.token.platformOwner !== true) {
    throw new HttpsError("permission-denied", "Only the verified owner can manage staff.");
  }
}

function text(value, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validatePermissions(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpsError("invalid-argument", "Select at least one page permission.");
  }
  const result = {};
  for (const key of ALLOWED_PERMISSIONS) result[key] = input[key] === true;
  if (!Object.values(result).some(Boolean)) {
    throw new HttpsError("invalid-argument", "Select at least one page permission.");
  }
  return result;
}

// Creates the Authentication account and its Firestore profile together.
// The owner receives a password-setup link to share with the invited staff member.
export const createStaffUser = onCall({ enforceAppCheck: true }, async (request) => {
  requireOwner(request);
  const fullName = text(request.data?.fullName, 100);
  const email = text(request.data?.email, 160).toLowerCase();
  const phone = text(request.data?.phone, 30);
  const role = text(request.data?.role, 30);
  const delivery = text(request.data?.delivery, 10).toLowerCase();
  const permissions = validatePermissions(request.data?.permissions);

  if (fullName.length < 2) throw new HttpsError("invalid-argument", "Enter the staff member's full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "A valid email address is required for this first invitation version.");
  }
  if (!ALLOWED_ROLES.includes(role)) throw new HttpsError("invalid-argument", "Choose a valid staff role.");
  if (!["email", "sms"].includes(delivery)) throw new HttpsError("invalid-argument", "Choose email or SMS.");
  if (delivery === "sms" && !phone) throw new HttpsError("invalid-argument", "Enter a phone number for SMS invitation.");

  let userRecord;
  try {
    userRecord = await auth.createUser({
      email, displayName: fullName, phoneNumber: phone || undefined,
      password: require("crypto").randomBytes(32).toString("base64url"),
      emailVerified: false, disabled: false
    });
    const profile = {
      uid: userRecord.uid, fullName, name: fullName, email, phone,
      role, status: "pending", active: false, permissions,
      invitationMethod: delivery,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
      updatedAt: FieldValue.serverTimestamp()
    };
    await db.collection("users").doc(userRecord.uid).create(profile);
    const inviteLink = await auth.generatePasswordResetLink(email);
    await db.collection("activityLog").add({
      action: "staff.invited", targetUid: userRecord.uid, email,
      actorUid: request.auth.uid, createdAt: FieldValue.serverTimestamp()
    });
    return {
      uid: userRecord.uid, email, phone, inviteLink,
      delivery, note: delivery === "email"
        ? "Account created. Share the password-setup link with the staff member by email."
        : "Account created. SMS delivery is not connected yet; copy the password-setup link and send it manually for now."
    };
  } catch (error) {
    if (userRecord?.uid) {
      try { await auth.deleteUser(userRecord.uid); } catch (_) {}
    }
    if (error instanceof HttpsError) throw error;
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "This email already has a Firebase Authentication account.");
    }
    throw new HttpsError("internal", error.message || "Could not create staff account.");
  }
});

export const listStaffUsers = onCall({ enforceAppCheck: true }, async (request) => {
  requireOwner(request);
  const snap = await db.collection("users").orderBy("createdAt", "desc").limit(300).get();
  return { staff: snap.docs.map((d) => ({ uid: d.id, ...d.data() })) };
});

export const updateStaffPermissions = onCall({ enforceAppCheck: true }, async (request) => {
  requireOwner(request);
  const uid = text(request.data?.uid, 128);
  const role = text(request.data?.role, 30);
  const permissions = validatePermissions(request.data?.permissions);
  if (!uid || !ALLOWED_ROLES.includes(role)) {
    throw new HttpsError("invalid-argument", "A valid staff UID and role are required.");
  }
  const ref = db.collection("users").doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Staff profile not found.");
    if (snap.data().role === "Owner/Admin" || snap.data().isOwner === true) {
      throw new HttpsError("permission-denied", "The owner account cannot be changed here.");
    }
    tx.update(ref, { role, permissions, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid });
    tx.create(db.collection("activityLog").doc(), {
      action: "staff.permissions_updated", targetUid: uid, actorUid: request.auth.uid,
      createdAt: FieldValue.serverTimestamp()
    });
  });
  return { uid, updated: true };
});

export const setStaffUserStatus = onCall({ enforceAppCheck: true }, async (request) => {
  requireOwner(request);
  const uid = text(request.data?.uid, 128);
  const status = text(request.data?.status, 20);
  if (!uid || !["active", "disabled"].includes(status)) {
    throw new HttpsError("invalid-argument", "Choose a valid staff account status.");
  }
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Staff profile not found.");
  if (snap.data().role === "Owner/Admin" || snap.data().isOwner === true) {
    throw new HttpsError("permission-denied", "The owner account cannot be disabled here.");
  }
  await auth.updateUser(uid, { disabled: status !== "active" });
  await ref.update({ status, active: status === "active", updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid });
  await db.collection("activityLog").add({
    action: "staff.status_changed", targetUid: uid, status,
    actorUid: request.auth.uid, createdAt: FieldValue.serverTimestamp()
  });
  return { uid, status };
});
