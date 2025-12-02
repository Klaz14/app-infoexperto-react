import admin from "../src/firebaseAdmin.js";
import { getAuth } from "firebase-admin/auth";

async function showClaims(email) {
  try {
    const auth = getAuth();
    const user = await auth.getUserByEmail(email);
    console.log("customClaims para", email, ":", user.customClaims || {});
    process.exit(0);
  } catch (err) {
    console.error("Error obteniendo usuario:", err);
    process.exit(1);
  }
}

const email = process.argv[2];
if (!email) {
  console.error("Uso: node scripts/showUserClaims.js <email>");
  process.exit(1);
}

showClaims(email);
