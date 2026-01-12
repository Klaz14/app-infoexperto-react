const AUDIT_URL = import.meta.env.VITE_AUDIT_URL;

export async function registrarClickAuditoria(email) {
  if (!AUDIT_URL || !email) return;

  const url = `${AUDIT_URL}?email=${encodeURIComponent(email)}`;

  try {
    // GET simple, sin preflight; y "fire-and-forget"
    await fetch(url, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
    });
  } catch (err) {
    // Si querés ver errores, descomentá:
    console.error("Audit error:", err);
  }
}
