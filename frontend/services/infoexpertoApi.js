const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const url = `${API_BASE}/api/infoexperto`;

export async function consultarInfoexperto({ token, tipoDocumento, numero }) {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ tipoDocumento, numero }),
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    const err = new Error(
      data?.error || `Error consultando informe (HTTP ${resp.status})`
    );
    err.codigo = data?.codigo;
    throw err;
  }

  if (data?.error) {
    const err = new Error(data.error);
    err.codigo = data.codigo;
    throw err;
  }

  return data;
}
