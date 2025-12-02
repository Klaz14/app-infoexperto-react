// backend/src/middlewares/authMiddleware.js
// Nos aseguramos de que la app de Firebase Admin esté inicializada
import "../firebaseAdmin.js";
import { getAuth } from "firebase-admin/auth";

/**
 * Middleware de autenticación con Firebase.
 * Espera un header: Authorization: Bearer <ID_TOKEN>
 * y adjunta req.user con info básica + flag isAdmin.
 */
export async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || req.headers.Authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res
        .status(401)
        .json({ error: "No se encontró token de autenticación." });
    }

    const idToken = match[1].trim();
    if (!idToken) {
      return res
        .status(401)
        .json({ error: "Token de autenticación vacío o inválido." });
    }

    // Usamos la app por defecto inicializada en firebaseAdmin.js
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(idToken);

    // Custom claim de admin (más adelante podés agregar otros roles)
    const isAdmin =
      decodedToken.admin === true || decodedToken.role === "admin";

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      isAdmin,
      // dejamos el resto de claims por si las necesitás después
      ...decodedToken,
    };

    return next();
  } catch (err) {
    console.error("Error verificando token Firebase en authMiddleware:", err);
    return res.status(401).json({ error: "Token inválido o expirado." });
  }
}
