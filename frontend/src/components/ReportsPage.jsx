// frontend/src/components/ReportsPage.jsx
import React, { useState } from "react";
import { auth } from "../firebase";

const RIESGOS = ["BAJO", "MEDIO", "ALTO"];

function ReportsPage() {
  const [docType, setDocType] = useState("CUIT_CUIL");
  const [docNumber, setDocNumber] = useState("");
  const [risk, setRisk] = useState(null);
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
      const user = auth.currentUser;
      if (!user) {
        setError("No hay sesión activa. Volvé a iniciar sesión.");
        setLoading(false);
        return;
      }

      const token = await user.getIdToken();

      // Mapeamos docType a lo que espera el backend: "dni" o "cuit"
      const tipoDocumento =
        docType === "DNI" ? "dni" : "cuit"; // para CUIT/CUIL usamos "cuit"

      const resp = await fetch("http://localhost:3000/api/infoexperto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tipoDocumento,
          numero: docNumber.trim(),
        }),
      });

      if (!resp.ok) {
        throw new Error("Error consultando informe");
      }

      const data = await resp.json();
      const riesgo = (data.riesgo || "").toUpperCase();

      if (RIESGOS.includes(riesgo)) {
        setRisk(riesgo);
        setEstado("Consulta realizada correctamente.");
      } else {
        setEstado(
          "Consulta realizada, pero el riesgo devuelto no es ALTO/MEDIO/BAJO."
        );
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
      <h1>Informes Punto Financiamiento</h1>
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

      {/* Mostrar el riesgo solo si hay dato */}
      {risk && (
        <div className="resultado">
          <h2>Riesgo</h2>
          <div className="riesgos-container">
            <span className="riesgo-badge activo" data-riesgo={risk}>
              {`RIESGO ${risk}`}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

export default ReportsPage;
