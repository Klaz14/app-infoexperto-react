// frontend/src/components/ReportsPage.jsx
import React, { useState } from "react";
import { getAuth } from "firebase/auth";

function ReportsPage({ currentUser, isAdmin }) {
  const [tipoDocumento, setTipoDocumento] = useState("cuit");
  const [numero, setNumero] = useState("");
  const [resultados, setResultados] = useState([]); // array de resultados
  const [estado, setEstado] = useState("");
  const [cargando, setCargando] = useState(false);

  // Placeholder dinámico (solo muestra múltiple a admins)
  const placeholderNumero =
    tipoDocumento === "dni"
      ? isAdmin
        ? "Ej: 30123456 o múltiples: 30123456, 28111222"
        : "Ej: 30123456"
      : isAdmin
      ? "Ej: 20-12345678-3 o múltiples: 20-12345678-3, 27-87654321-9"
      : "Ej: 20-12345678-3";

  const limpiarYSepararNumeros = (texto) => {
    return texto
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  };

  const construirMensajeErrorCodigo = (codigo) => {
    if (!codigo) return null;
    return `Error interno, código ${codigo}. Consulte a un administrador.`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEstado("");
    setResultados([]);

    const texto = numero.trim();
    if (!texto) {
      setEstado("Ingresá al menos un DNI o CUIT/CUIL.");
      return;
    }

    // 🔐 Obtener usuario desde props o desde Firebase Auth global
    const auth = getAuth();
    const user = currentUser || auth.currentUser;

    if (!user) {
      setEstado(
        "No hay usuario autenticado. Cerrá sesión y volvé a iniciar sesión."
      );
      return;
    }

    // Separar posibles múltiples documentos
    const numerosSeparados = limpiarYSepararNumeros(texto);

    // Si NO es admin y puso más de un documento → no permitimos
    if (!isAdmin && numerosSeparados.length > 1) {
      setEstado(
        "Solo se permite una consulta por vez para usuarios. Por favor, ingresá un único documento."
      );
      return;
    }

    try {
      setCargando(true);
      const token = await user.getIdToken();

      // Admin + múltiples documentos => consultas secuenciales
      if (isAdmin && numerosSeparados.length > 1) {
        const acumulados = [];

        for (const num of numerosSeparados) {
          try {
            const resp = await fetch("http://localhost:3000/api/infoexperto", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                tipoDocumento,
                numero: num,
              }),
            });

            if (!resp.ok) {
              let dataError = {};
              try {
                dataError = await resp.json();
              } catch (parseErr) {
                console.warn(
                  "No se pudo parsear el cuerpo de error como JSON (múltiple):",
                  parseErr
                );
              }

              const msgCodigo = construirMensajeErrorCodigo(dataError.codigo);
              const msg =
                msgCodigo ||
                dataError?.error ||
                `Error consultando informe (HTTP ${resp.status})`;

              acumulados.push({
                ok: false,
                numeroOriginal: num,
                error: msg,
              });
            } else {
              const data = await resp.json();
              acumulados.push({
                ok: true,
                numeroOriginal: num,
                ...data,
              });
            }
          } catch (err) {
            acumulados.push({
              ok: false,
              numeroOriginal: num,
              error:
                err.message ||
                "Error de red al consultar este documento. Intente nuevamente.",
            });
          }
        }

        setResultados(acumulados);
        setEstado(
          `Se procesaron ${numerosSeparados.length} documentos (ver resultados debajo).`
        );
      } else {
        // Usuario normal o admin con un solo documento → una sola consulta
        const resp = await fetch("http://localhost:3000/api/infoexperto", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            tipoDocumento,
            numero: texto,
          }),
        });

        if (!resp.ok) {
          let dataError = {};
          try {
            dataError = await resp.json();
          } catch (parseErr) {
            console.warn(
              "No se pudo parsear el cuerpo de error como JSON (simple):",
              parseErr
            );
          }

          const msgCodigo = construirMensajeErrorCodigo(dataError.codigo);
          const msg =
            msgCodigo ||
            dataError?.error ||
            `Error consultando informe (HTTP ${resp.status})`;

          throw new Error(msg);
        }

        const data = await resp.json();
        setResultados([
          {
            ok: true,
            numeroOriginal: texto,
            ...data,
          },
        ]);
        setEstado("Informe obtenido correctamente.");
      }
    } catch (err) {
      console.error("Error consultando informe:", err);
      setEstado(err.message || "Error consultando informe.");
      setResultados([]);
    } finally {
      setCargando(false);
    }
  };

  const getBadgeClase = (riesgo) => {
    if (!riesgo) return "riesgo-badge";
    const r = String(riesgo).toUpperCase();
    if (r === "ALTO") return "riesgo-badge activo riesgo-alto";
    if (r === "MEDIO") return "riesgo-badge activo riesgo-medio";
    if (r === "BAJO") return "riesgo-badge activo riesgo-bajo";
    return "riesgo-badge activo";
  };

  return (
    <main className="reports-container">
      <div className="app-container">
        <h1 className="page-title">Informes Punto Financiero</h1>
        <p className="page-subtitle">
          Seleccioná el tipo de documento, ingresá el número y solicitá el
          informe.
          {isAdmin && (
            <>
              {" "}
              <strong>
                Como administrador podés ingresar varios documentos separados
                por coma y espacio.
              </strong>
            </>
          )}
        </p>

        <form className="form-card" onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="tipoDocumento" className="form-label">
              Tipo de documento
            </label>
            <select
              id="tipoDocumento"
              className="form-select"
              value={tipoDocumento}
              onChange={(e) => setTipoDocumento(e.target.value)}
            >
              <option value="cuit">CUIT / CUIL</option>
              <option value="dni">DNI</option>
            </select>
          </div>

          <div className="form-row">
            <label htmlFor="numero" className="form-label">
              Número de {tipoDocumento === "dni" ? "DNI" : "CUIT/CUIL"}
            </label>
            <textarea
              id="numero"
              className="form-input"
              placeholder={placeholderNumero}
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              rows={isAdmin ? 3 : 1}
            />
            {isAdmin && (
              <small className="helper-text">
                Formato múltiple:{" "}
                <code>20-12345678-3, 27-87654321-9</code> o{" "}
                <code>30123456, 28999888</code>. También podés usar solo un
                número como siempre.
              </small>
            )}
          </div>

          <button className="primary-button" type="submit" disabled={cargando}>
            {cargando ? "Consultando..." : "Solicitar informe"}
          </button>

          {estado && <p className="status-message">{estado}</p>}
        </form>

        {/* Resultados */}
        {resultados.length > 0 && (
          <section className="resultado">
            <h2 className="resultado-title">
              {resultados.length === 1
                ? "Resultado del informe"
                : "Resultados de los informes"}
            </h2>

            <div className="multi-results">
              {resultados.map((item, idx) => {
                if (!item) return null;

                // Errores por documento
                if (item.ok === false) {
                  return (
                    <div key={idx} className="multi-result-item error-item">
                      <div className="multi-result-name">
                        Error para{" "}
                        <strong>
                          {item.numeroOriginal || item.numero || "documento"}
                        </strong>
                      </div>
                      <div className="multi-result-error">
                        {item.error || "No se pudo obtener el informe."}
                      </div>
                    </div>
                  );
                }

                const riesgo = item.riesgo || item.riesgoApi;
                const nombre = item.nombreCompleto || "Sin nombre";
                const numeroDoc = item.numero || item.numeroOriginal;
                const tipo = (
                  item.tipoDocumento ||
                  tipoDocumento ||
                  ""
                ).toUpperCase();

                return (
                  <div key={idx} className="multi-result-item">
                    <div className="multi-result-header">
                      <div className="multi-result-name">
                        <strong>{nombre}</strong>
                        {numeroDoc && (
                          <span className="multi-result-doc">
                            {" "}
                            — {tipo} {numeroDoc}
                          </span>
                        )}
                      </div>
                      {riesgo && (
                        <div className="riesgos-container">
                          <span className={getBadgeClase(riesgo)}>
                            {`RIESGO ${String(riesgo).toUpperCase()}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default ReportsPage;
