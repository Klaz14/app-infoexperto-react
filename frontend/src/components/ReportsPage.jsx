// src/components/ReportsPage.jsx
import React, { useState } from "react";

const RIESGOS = ["BAJO", "MEDIO", "ALTO"];

function ReportsPage() {
  const [docType, setDocType] = useState("CUIT_CUIL");
  const [docNumber, setDocNumber] = useState("");
  const [risk, setRisk] = useState(null); // "BAJO" | "MEDIO" | "ALTO"
  const [loading, setLoading] = useState(false);
  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setEstado("");
    setRisk(null);

    if (!docNumber.trim()) {
      setError("Ingresá un número válido.");
      return;
    }

    setLoading(true);
    try {
      // 🔒 Esto debería pegarle a TU backend Node,
      // que a su vez llama a la API de InfoExperto con la API key del .env.
      const resp = await fetch("/api/infoexperto/consulta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tipoDocumento: docType, // "CUIT_CUIL" o "DNI"
          numeroDocumento: docNumber.trim(),
        }),
      });

      if (!resp.ok) {
        throw new Error("Error consultando informe");
      }

      const data = await resp.json();
      // Suponemos que tu backend devuelve algo como { riesgo: "ALTO" }
      const riesgo = (data.riesgo || "").toUpperCase();

      if (!RIESGOS.includes(riesgo)) {
        // fallback por si la API todavía no está lista
        setEstado("Consulta realizada. Ajustá el mapeo de riesgo al integrar la API real.");
      } else {
        setRisk(riesgo);
        setEstado("Consulta realizada correctamente.");
      }
    } catch (err) {
      console.error(err);
      setError("No se pudo obtener el informe. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1>Informes InfoExperto</h1>
      <p className="subtitle">
        Selecciona el tipo de documento, ingresa el número y solicita el informe.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="field-group">
          <label htmlFor="docType">Tipo de documento</label>
          <select
            id="docType"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
          >
            <option value="CUIT_CUIL">CUIT / CUIL</option>
            <option value="DNI">DNI</option>
          </select>
        </div>

        <div className="field-group">
          <label htmlFor="docNumber">
            Número de {docType === "DNI" ? "DNI" : "CUIT/CUIL"}
          </label>
          <input
            id="docNumber"
            type="text"
            placeholder={
              docType === "DNI" ? "Ej: 12345678" : "Ej: 20-12345678-3"
            }
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            required
          />
        </div>

        {estado && <div className="estado">{estado}</div>}
        {error && <div className="estado error">{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? "Consultando..." : "Solicitar informe"}
        </button>
      </form>

      <div className="resultado">
        <h2>Riesgo</h2>
        <div className="riesgos-container">
          <span
            className={
              "riesgo-badge" +
              (risk === "BAJO" ? " activo" : "")
            }
            data-riesgo="BAJO"
          >
            RIESGO BAJO
          </span>
          <span
            className={
              "riesgo-badge" +
              (risk === "MEDIO" ? " activo" : "")
            }
            data-riesgo="MEDIO"
          >
            RIESGO MEDIO
          </span>
          <span
            className={
              "riesgo-badge" +
              (risk === "ALTO" ? " activo" : "")
            }
            data-riesgo="ALTO"
          >
            RIESGO ALTO
          </span>
        </div>
      </div>
    </>
  );
}

export default ReportsPage;
