// backend/src/firebaseAdmin.js
import admin from "firebase-admin";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta al JSON de service account (NO subir a GitHub)
const serviceAccountPath = path.join(
  __dirname,
  "..",
  "app-infoexperto-firebase-ad.json"
);

// Inicializamos una sola vez
if (!admin.apps.length) {
  admin.initializeApp({
    // el Admin SDK acepta directamente la ruta al JSON :contentReference[oaicite:0]{index=0}
    credential: admin.credential.cert(serviceAccountPath),
  });
}

export default admin;
