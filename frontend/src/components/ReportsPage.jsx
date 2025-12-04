// frontend/src/components/ReportsPage.jsx
import React, { useState } from "react";
import { getAuth } from "firebase/auth";
import { generateReportPdf } from "./generateReportPdf";
import { FaWhatsapp } from "react-icons/fa";
import Swal from "sweetalert2";

const WHATSAPP_NUMBER = "5493813426488"; // ← cambiá esto por el número real, sin + ni espacios

/**
 * Construye el texto visible del riesgo según el rol.
 * - Usuario normal: RIESGO ALTO / MEDIO / BAJO
 * - Admin: RIESGO ALTO - RECHAZAR / MEDIO - REVISAR / BAJO - APROBAR
 */
function buildRiskLabel(riesgo, isAdmin) {
  if (!riesgo) return "";
  const r = String(riesgo).toUpperCase();

  if (!isAdmin) {
    return `RIESGO ${r}`;
  }

  if (r === "ALTO") return "RIESGO ALTO - RECHAZAR";
  if (r === "MEDIO") return "RIESGO MEDIO - REVISAR";
  if (r === "BAJO") return "RIESGO BAJO - APROBAR";
  return `RIESGO ${r}`;
}

/**
 * Clase CSS para el badge de riesgo.
 */
function getBadgeClase(riesgo) {
  if (!riesgo) return "riesgo-badge";
  return "riesgo-badge activo";
}

/** Texto seguro (para evitar null/undefined vacíos). */
const safeText = (v) =>
  v === null || v === undefined || v === "" ? "Sin datos" : String(v);

/** Booleans bonitos en español. */
const formatBool = (v) => {
  if (v === true) return "Sí";
  if (v === false) return "No";
  const s = String(v || "").toUpperCase();
  if (s === "SI" || s === "SÍ") return "Sí";
  if (s === "NO") return "No";
  return "Sin datos";
};

/** Mensaje estándar para códigos de error de la API. */
const construirMensajeErrorCodigo = (codigo) => {
  if (!codigo) return null;
  return `Error interno, código ${codigo}. Consulte a un administrador.`;
};

/** Separa "1, 2,3" en ["1","2","3"] sin vacíos. */
const limpiarYSepararNumeros = (texto) =>
  texto
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

/**
 * Obtiene el objeto "informe" de InfoExperto desde el item de resultado,
 * cubriendo las posibles variantes de nombre que pueda usar el backend.
 */
const getInformeFromItem = (item) => {
  if (!item) return {};
  return (
    item.informeOriginal ||
    item.infoExperto ||
    item.informe ||
    (item.data && item.data.informe) ||
    {}
  );
};

/**
 * A partir del JSON de InfoExperto, arma los campos del
 * "Resumen de capacidad y riesgo" que se muestran en el panel interno.
 */
const buildResumenCapacidadDesdeInfoExperto = (informe) => {
  if (!informe) informe = {};

  const identidad = informe.identidad || {};
  const afip = informe.soaAfipA4Online || {};
  const scoring = informe.scoringInforme || {};
  const ct =
    informe.condicionTributaria ||
    (informe.data && informe.data.condicionTributaria) ||
    {};

  // Nombre completo: primero identidad, luego AFIP
  const nombreCompleto =
    identidad.nombre_completo || afip.nombreCompleto || afip.nombre || null;

  // Riesgo API: usamos detalle de scoring (EXCELENTE / BUENO / etc)
  const riesgoApi = scoring.detalle || null;

  // Capacidad total: tomamos el "crédito" del scoring
  const capacidadTotal = scoring.credito || null;

  // Compromiso mensual: tomamos la "deuda" del scoring
  const compromisoMensual = scoring.deuda || null;

  // Ingreso mensual estimado: monto_anual / 12 si existe
  let ingresoMensualEstimado = null;
  if (ct.monto_anual !== undefined && ct.monto_anual !== null) {
    const anual = Number(ct.monto_anual);
    if (!Number.isNaN(anual)) {
      ingresoMensualEstimado = (anual / 12).toFixed(2);
    }
  }

  // Antigüedad laboral (meses): tomamos años de inscripción y lo pasamos a meses
  let antiguedadLaboralMeses = null;
  const aniosIns = identidad.anios_inscripcion;
  if (aniosIns !== undefined && aniosIns !== null) {
    const years = Number(aniosIns);
    if (!Number.isNaN(years)) {
      antiguedadLaboralMeses = years * 12;
    }
  }

  // Peor situación BCRA últimos 24 meses: máximo de "peor_situacion"
  let situacionBcraPeor24m = null;
  if (informe.bcra && informe.bcra.resumen_historico) {
    const values = Object.values(informe.bcra.resumen_historico);
    let worst = null;
    values.forEach((h) => {
      const n = Number(h.peor_situacion);
      if (!Number.isNaN(n)) {
        if (worst === null || n > worst) worst = n;
      }
    });
    if (worst !== null) situacionBcraPeor24m = String(worst);
  }

  // Actividad formal: miramos flags de actividad del scoring AFIP
  let tieneActividadFormal = null;
  if (scoring.actividad) {
    const act = scoring.actividad;
    const flags = [
      act.empleado,
      act.monotributista,
      act.autonomo,
      act.empleador,
    ];
    if (flags.some((v) => String(v || "").toUpperCase() === "SI")) {
      tieneActividadFormal = true;
    } else if (
      flags.every(
        (v) =>
          v === "NO" || v === "no" || v === null || v === undefined || v === ""
      )
    ) {
      tieneActividadFormal = false;
    }
  } else if (ct.actividad) {
    // Si hay una actividad AFIP en condición tributaria, asumimos que es formal
    tieneActividadFormal = true;
  }

  // Vehículos / inmuebles registrados
  const tieneVehiculosRegistrados =
    Array.isArray(informe.rodados) && informe.rodados.length > 0;

  const tieneInmueblesRegistrados =
    Array.isArray(informe.inmuebles) && informe.inmuebles.length > 0;

  return {
    nombreCompleto,
    riesgoApi,
    capacidadTotal,
    compromisoMensual,
    ingresoMensualEstimado,
    antiguedadLaboralMeses,
    situacionBcraPeor24m,
    tieneActividadFormal,
    tieneVehiculosRegistrados,
    tieneInmueblesRegistrados,
  };
};

function ReportsPage({ currentUser, isAdmin }) {
  const [tipoDocumento, setTipoDocumento] = useState("cuit");
  const [numero, setNumero] = useState("");
  const [resultados, setResultados] = useState([]);
  const [estado, setEstado] = useState("");
  const [cargando, setCargando] = useState(false);
  const [detallesAbiertos, setDetallesAbiertos] = useState({});

  // Placeholder condicionado por tipo de doc y rol
  const placeholderNumero = (() => {
    if (tipoDocumento === "dni") {
      return isAdmin
        ? "Ej: 30123456 o múltiples: 30123456, 28111222"
        : "Ej: 30123456";
    }
    return isAdmin
      ? "Ej: 20-12345678-3 o múltiples: 20-12345678-3, 27-87654321-9"
      : "Ej: 20-12345678-3";
  })();

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

    try {
      setCargando(true);

      const token = await user.getIdToken();
      const numerosSeparados = limpiarYSepararNumeros(texto);

      // Bloquear múltiples consultas para usuarios NO admin
      if (!isAdmin && numerosSeparados.length > 1) {
        setEstado(
          "Solo se permite una consulta por vez para usuarios no administradores."
        );
        return;
      }

      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      // 🔁 Admin: múltiples consultas secuenciales
      if (isAdmin && numerosSeparados.length > 1) {
        const acumulados = [];

        for (const num of numerosSeparados) {
          try {
            const resp = await fetch("http://localhost:3000/api/infoexperto", {
              method: "POST",
              headers,
              body: JSON.stringify({
                tipoDocumento,
                numero: num,
              }),
            });

            const data = await resp.json().catch(() => null);

            if (!resp.ok) {
              acumulados.push({
                ok: false,
                numeroOriginal: num,
                error:
                  data?.error ||
                  `Error consultando informe (HTTP ${resp.status})`,
                codigo: data?.codigo,
              });
              continue;
            }

            if (data?.error) {
              acumulados.push({
                ok: false,
                numeroOriginal: num,
                error: data.error,
                codigo: data.codigo,
              });
            } else {
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
              error: err.message || "Error consultando informe.",
            });
          }
        }

        setResultados(acumulados);
        setEstado(
          `Se procesaron ${numerosSeparados.length} documentos (ver resultados debajo).`
        );
      } else {
        // 🔹 Consulta simple (usuarios y admins)
        const resp = await fetch("http://localhost:3000/api/infoexperto", {
          method: "POST",
          headers,
          body: JSON.stringify({
            tipoDocumento,
            numero: texto,
          }),
        });

        const data = await resp.json().catch(() => null);

        if (!resp.ok) {
          const msgCodigo = construirMensajeErrorCodigo(data?.codigo);
          throw new Error(
            msgCodigo ||
              data?.error ||
              `Error consultando informe (HTTP ${resp.status})`
          );
        }

        if (data?.error) {
          const msgCodigo = construirMensajeErrorCodigo(data.codigo);
          throw new Error(msgCodigo || data.error);
        }

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
      if (!isAdmin) {
        setResultados([]);
      }
    } finally {
      setCargando(false);
    }
  };

  const handleToggleDetalle = (idx) => {
    setDetallesAbiertos((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  /**
   * Wrapper para llamar al generador de PDF externo.
   */
  const handleDownloadPdf = (item) => {
    try {
      // Le pasamos el item completo y el tipo de documento actual como fallback.
      generateReportPdf(item, tipoDocumento);
    } catch (err) {
      console.error("Error generando PDF desde ReportsPage:", err);
      alert(
        "No se pudo generar el PDF. Revisá la consola para más detalles."
      );
    }
  };

  const handleWhatsAppClick = async (tipo, numeroDoc, nombre) => {
    const phone = WHATSAPP_NUMBER || "5493813426488"; // remplazá por el real
    const numeroLabel = numeroDoc || "";
    const nombreLabel = nombre || "";

    const { value: montoRaw } = await Swal.fire({
      title: "Ingresa el monto de tu financiación:",
      input: "text",
      inputPlaceholder: "$ 0",
      inputAttributes: {
        inputmode: "numeric",
        autocomplete: "off",
      },
      showCancelButton: true,
      confirmButtonText: "Continuar",
      cancelButtonText: "Cancelar",
      allowOutsideClick: false,
      allowEscapeKey: true,

      // 👉 Formateo en tiempo real SIN decimales
      didOpen: () => {
        const input = Swal.getInput();
        if (!input) return;

        input.addEventListener("input", () => {
          // Quitamos todo lo que no sea dígito
          const cleaned = input.value.replace(/[^0-9]/g, "");

          if (!cleaned) {
            input.value = "";
            return;
          }

          const num = Number(cleaned);
          if (Number.isNaN(num)) {
            input.value = "";
            return;
          }

          // Formato tipo 1,000,000 (sin .00 dentro del input)
          const formatted = num.toLocaleString("en-US", {
            maximumFractionDigits: 0,
          });

          input.value = "$ " + formatted;
        });
      },

      preConfirm: (value) => {
        if (!value) {
          Swal.showValidationMessage("Por favor, ingresá un monto.");
          return false;
        }

        // De nuevo limpiamos: solo dígitos
        const cleaned = value.replace(/[^0-9]/g, "");
        const num = Number(cleaned);

        if (Number.isNaN(num) || num <= 0) {
          Swal.showValidationMessage("Ingresá un monto válido mayor a 0.");
          return false;
        }

        // Devolvemos el número "crudo" en enteros
        return num;
      },
    });

    // Si canceló, no hacemos nada
    if (!montoRaw) {
      return;
    }

    // Ahora sí, lo formateamos bonito para WhatsApp CON decimales
    const montoNumber = Number(montoRaw);
    const formattedAmount =
      "$ " +
      montoNumber.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const text = `Hola, gestiono consulta sobre el siguiente perfil:
    ${nombreLabel}
    DNI/CUIL: ${numeroLabel}
    Monto de financiación: ${formattedAmount}`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  return (
    <main className="reports-container">
      <h1 className="page-title">Informes Punto Financiero</h1>
      <p className="page-subtitle">
        Seleccioná el tipo de documento, ingresá el número y solicitá el
        informe.
        {isAdmin && (
          <>
            {" "}
            <strong>
              Como administrador podés ingresar varios documentos separados por
              coma y espacio.
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
              Formato múltiple: <code>20-12345678-3, 27-87654321-9</code> o{" "}
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

              // Errores
              if (item.ok === false) {
                const msgCodigo =
                  item.codigo && construirMensajeErrorCodigo(item.codigo);

                return (
                  <div key={idx} className="multi-result-item error-item">
                    <div className="multi-result-name">
                      Error para{" "}
                      <strong>
                        {item.numeroOriginal || item.numero || "documento"}
                      </strong>
                    </div>
                    <div className="multi-result-error">
                      {msgCodigo ||
                        item.error ||
                        "No se pudo obtener el informe."}
                    </div>
                  </div>
                );
              }

              const informe = getInformeFromItem(item);
              const resumen = buildResumenCapacidadDesdeInfoExperto(informe);

              const riesgo = item.riesgo || item.riesgoApi;
              const nombreHeader =
                item.nombreCompleto || resumen.nombreCompleto || "Sin nombre";
              const numeroDoc = item.numero || item.numeroOriginal;
              const tipo =
                (item.tipoDocumento || tipoDocumento || "").toUpperCase();
              const riesgoUpper = String(riesgo || "").toUpperCase();
              const riesgoLabel = buildRiskLabel(riesgo, isAdmin);

              // Para el panel interno, priorizamos valores de InfoExperto;
              // si en el futuro el backend manda campos directos, se pueden usar como override.
              const resumenFinal = {
                nombreCompleto:
                  item.nombreCompleto ?? resumen.nombreCompleto,
                riesgoApi: item.riesgoApi ?? resumen.riesgoApi,
                capacidadTotal:
                  item.capacidadTotal ?? resumen.capacidadTotal,
                compromisoMensual:
                  item.compromisoMensual ?? resumen.compromisoMensual,
                ingresoMensualEstimado:
                  item.ingresoMensualEstimado ??
                  resumen.ingresoMensualEstimado,
                antiguedadLaboralMeses:
                  item.antiguedadLaboralMeses ??
                  resumen.antiguedadLaboralMeses,
                situacionBcraPeor24m:
                  item.situacionBcraPeor24m ?? resumen.situacionBcraPeor24m,
                tieneActividadFormal:
                  item.tieneActividadFormal ?? resumen.tieneActividadFormal,
                tieneVehiculosRegistrados:
                  item.tieneVehiculosRegistrados ??
                  resumen.tieneVehiculosRegistrados,
                tieneInmueblesRegistrados:
                  item.tieneInmueblesRegistrados ??
                  resumen.tieneInmueblesRegistrados,
              };

              return (
                <div key={idx} className="multi-result-item">
                  <div className="multi-result-header">
                    <div className="multi-result-name">
                      <strong>{nombreHeader}</strong>
                      {numeroDoc && (
                        <span className="multi-result-doc">
                          {" "}
                          — {tipo} {numeroDoc}
                        </span>
                      )}
                    </div>
                    {riesgo && (
                      <div className="riesgos-container">
                        <span
                          className={getBadgeClase(riesgo)}
                          data-riesgo={riesgoUpper}
                        >
                          {riesgoLabel}
                        </span>

                        {/* Botón solo para usuarios (no admins) */}
                        {!isAdmin && (
                          <button
                            type="button"
                            className="whatsapp-button"
                            onClick={() =>
                              handleWhatsAppClick(tipo, numeroDoc, nombreHeader)
                            }
                          >
                            <FaWhatsapp className="whatsapp-icon" />
                            <span>GESTIONA TU CONSULTA</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Detalle adicional SOLO para admins y RIESGO MEDIO/BAJO */}
                  {isAdmin && (riesgoUpper === "MEDIO" || riesgoUpper === "BAJO") && (
                    <div className="riesgo-extra">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleToggleDetalle(idx)}
                      >
                        {detallesAbiertos[idx]
                          ? "Ocultar análisis interno"
                          : "Ver análisis interno"}
                      </button>

                      {detallesAbiertos[idx] && (
                        <div className="riesgo-detalle">
                          <h3>Resumen de capacidad y riesgo</h3>
                          <ul>
                            <li>
                              <strong>Nombre completo:</strong>{" "}
                              {safeText(resumenFinal.nombreCompleto)}
                            </li>
                            <li>
                              <strong>Riesgo API InfoExperto:</strong>{" "}
                              {safeText(resumenFinal.riesgoApi)}
                            </li>
                            <li>
                              <strong>Capacidad total:</strong>{" "}
                              {safeText(resumenFinal.capacidadTotal)}
                            </li>
                            <li>
                              <strong>Compromiso mensual:</strong>{" "}
                              {safeText(resumenFinal.compromisoMensual)}
                            </li>
                            <li>
                              <strong>Ingreso mensual estimado:</strong>{" "}
                              {safeText(resumenFinal.ingresoMensualEstimado)}
                            </li>
                            <li>
                              <strong>Antigüedad laboral (meses):</strong>{" "}
                              {safeText(resumenFinal.antiguedadLaboralMeses)}
                            </li>
                            <li>
                              <strong>
                                Peor situación BCRA últimos 24 meses:
                              </strong>{" "}
                              {safeText(resumenFinal.situacionBcraPeor24m)}
                            </li>
                            <li>
                              <strong>Actividad formal:</strong>{" "}
                              {formatBool(resumenFinal.tieneActividadFormal)}
                            </li>
                            <li>
                              <strong>Vehículos registrados:</strong>{" "}
                              {formatBool(
                                resumenFinal.tieneVehiculosRegistrados
                              )}
                            </li>
                            <li>
                              <strong>Inmuebles registrados:</strong>{" "}
                              {formatBool(
                                resumenFinal.tieneInmueblesRegistrados
                              )}
                            </li>
                          </ul>
                        </div>
                      )}

                      {/* Botón PDF debajo de la info adicional para MEDIO/BAJO */}
                      <div className="pdf-wrapper">
                        <button
                          type="button"
                          className="primary-button pdf-button"
                          onClick={() => handleDownloadPdf(item)}
                        >
                          Descargar PDF del informe
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Botón PDF para ALTO (solo admins, sin panel extra) */}
                  {isAdmin && riesgoUpper === "ALTO" && (
                    <div className="pdf-wrapper">
                      <button
                        type="button"
                        className="primary-button pdf-button"
                        onClick={() => handleDownloadPdf(item)}
                      >
                        Descargar PDF del informe
                      </button>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

export default ReportsPage;
