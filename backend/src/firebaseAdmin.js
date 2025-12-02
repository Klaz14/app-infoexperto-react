// backend/src/firebaseAdmin.js
import admin from "firebase-admin";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta al JSON de service account (NO se sube a GitHub)
const serviceAccountPath = path.join(
  __dirname,
  "..",
  "app-infoexperto-firebase-ad.json"
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
  });
}

export default admin;
