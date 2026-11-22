import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const uid = process.env.PLATFORM_OWNER_UID;
if (!uid) {
  console.error("Set PLATFORM_OWNER_UID to the verified Firebase Authentication UID.");
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const user = await auth.getUser(uid);
const existingClaims = user.customClaims || {};
await auth.setCustomUserClaims(uid, { ...existingClaims, platformOwner: true });
console.log("Platform owner claim set for verified UID:", uid);
console.log("The user must sign out and sign in again to refresh their ID token.");
