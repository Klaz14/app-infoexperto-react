// backend/scripts/setAdminClaim.js
import admin from "../src/firebaseAdmin.js";
import { getAuth } from "firebase-admin/auth";

async function setAdmin(email, adminFlag) {
  try {
    const auth = getAuth(); // usa la app inicializada en firebaseAdmin.js

    // Buscamos usuario por email
    const user = await auth.getUserByEmail(email);

    // Seteamos las custom claims, p.ej. { admin: true }
    await auth.setCustomUserClaims(user.uid, { admin: adminFlag });

    console.log(
      `Claims actualizadas para ${email}: admin=${adminFlag} (uid=${user.uid})`
    );
    console.log(
      "Las nuevas claims se guardan en Firebase y aparecerán en el token la próxima vez que se renueve."
    );
    process.exit(0);
  } catch (err) {
    console.error("Error actualizando claim:", err);
    process.exit(1);
  }
}

// Uso: node scripts/setAdminClaim.js <email> <true|false>
const email = process.argv[2];
const flagArg = process.argv[3];

if (!email || typeof flagArg === "undefined") {
  console.error("Uso: node scripts/setAdminClaim.js <email> <true|false>");
  process.exit(1);
}

const adminFlag = flagArg === "true";
setAdmin(email, adminFlag);
