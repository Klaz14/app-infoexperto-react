// frontend/src/components/generateReportPdf.js
import { jsPDF } from "jspdf";

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

/**
 * Construye el texto visible del riesgo según el rol.
 * Para PDF lo tratamos siempre como admin (RECHAZAR/REVISAR/APROBAR).
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
 * "Resumen de capacidad y riesgo" que se usan en algunos textos.
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

/**
 * Genera un PDF con la información completa del informe de InfoExperto.
 * @param {Object} item - Item de resultados (incluye informe/JSON de InfoExperto).
 * @param {string} fallbackTipoDocumento - Tipo de documento actual en la UI ("cuit" / "dni" / etc).
 */
export function generateReportPdf(item, fallbackTipoDocumento = "DOC") {
  const boolTxt = (v) => formatBool(v);

  try {
    const doc = new jsPDF();
    let y = 10;
    const lineHeight = 6;
    const maxWidth = 180;

    const ensureSpace = (needed = lineHeight) => {
      if (y + needed > 280) {
        doc.addPage();
        y = 10;
      }
    };

    const addSectionTitle = (title) => {
      ensureSpace(lineHeight * 2);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, 10, y);
      y += lineHeight;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
    };

    const addLine = (text) => {
      if (!text) return;
      const lines = doc.splitTextToSize(String(text), maxWidth);
      lines.forEach((line) => {
        ensureSpace();
        doc.text(line, 10, y);
        y += lineHeight;
      });
    };

    // Obtenemos el JSON original de InfoExperto
    const informe = getInformeFromItem(item);
    const resumen = buildResumenCapacidadDesdeInfoExperto(informe);

    const riesgo = item.riesgo || item.riesgoApi;
    const tipo = (
      item.tipoDocumento ||
      fallbackTipoDocumento ||
      "DOC"
    ).toUpperCase();
    const numeroDoc = item.numero || item.numeroOriginal || "";
    const nombre =
      item.nombreCompleto || resumen.nombreCompleto || "Sin nombre";
    const fecha = item.fechaInforme || item.fecha || "";
    const labelRiesgo = buildRiskLabel(riesgo, true); // admin siempre para PDF
    const scoringApi =
      item.scoringApi !== undefined && item.scoringApi !== null
        ? item.scoringApi
        : null;

    // Encabezado
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Informe Punto Financiero", 10, y);
    y += lineHeight + 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    addLine(`Nombre: ${nombre}`);
    addLine(`Documento: ${tipo} ${numeroDoc}`);
    if (fecha) addLine(`Fecha del informe: ${fecha}`);
    if (labelRiesgo) addLine(`Riesgo: ${labelRiesgo}`);
    if (scoringApi !== null)
      addLine(`Scoring API InfoExperto: ${scoringApi}`);

    // Identidad
    if (informe.identidad) {
      addSectionTitle("Identidad");
      const id = informe.identidad;
      addLine(`Nombre completo: ${safeText(id.nombre_completo)}`);
      addLine(
        `Documento: ${safeText(id.tipo_documento)} ${safeText(
          id.numero_documento
        )}`
      );
      addLine(`CUIT/CUIL: ${safeText(id.cuit)}`);
      addLine(`Sexo: ${safeText(id.sexo)}`);
      addLine(
        `Localidad: ${safeText(id.localidad)} (${safeText(id.provincia)})`
      );
      addLine(
        `Fecha de inscripción: ${safeText(
          id.fecha_inscripcion
        )} — Antigüedad (años inscripción): ${safeText(
          id.anios_inscripcion
        )}`
      );
      addLine(`Actividad: ${safeText(id.actividad)}`);
    }

    // Scoring InfoExperto
    if (informe.scoringInforme) {
      addSectionTitle("Scoring InfoExperto");
      const s = informe.scoringInforme;
      addLine(`Detalle: ${safeText(s.detalle)}`);
      addLine(`Scoring: ${safeText(s.scoring)}`);
      addLine(`Crédito estimado: ${safeText(s.credito)}`);
      addLine(`Deuda estimada: ${safeText(s.deuda)}`);
    }

    // Condición Tributaria actual
    if (informe.condicionTributaria) {
      addSectionTitle("Condición tributaria (actual)");
      const ct = informe.condicionTributaria;
      addLine(`Nombre AFIP: ${safeText(ct.nombre)}`);
      addLine(`Actividad: ${safeText(ct.actividad)}`);
      addLine(
        `IVA: ${safeText(ct.impuestos_iva)} — Ganancias: ${safeText(
          ct.impuestos_ganancias
        )}`
      );
      addLine(
        `Categoría monotributo: ${safeText(
          ct.categoria_monotributo || ct.categoria
        )}`
      );
      if (ct.monto_anual !== undefined && ct.monto_anual !== null) {
        addLine(`Monto anual declarado: ${safeText(ct.monto_anual)}`);
      }
    }

    // Historial condición tributaria
    if (
      Array.isArray(informe.condicionTributariaHistorial) &&
      informe.condicionTributariaHistorial.length > 0
    ) {
      addSectionTitle("Historial de condición tributaria");
      informe.condicionTributariaHistorial.forEach((h) => {
        addLine(
          `${safeText(h.fecha_desde)} a ${safeText(
            h.fecha_hasta
          )} — IVA: ${safeText(
            h.impuestos_iva
          )}, Ganancias: ${safeText(
            h.impuestos_ganancias
          )}, Categoría: ${safeText(h.categoria)}, Actividad: ${safeText(
            h.actividad
          )}`
        );
      });
    }

    // BCRA resumen histórico 24 meses
    if (informe.bcra && informe.bcra.resumen_historico) {
      addSectionTitle("Resumen BCRA (últimos 24 meses)");
      const hist = informe.bcra.resumen_historico;
      Object.keys(hist).forEach((key) => {
        const h = hist[key];
        addLine(
          `Periodo ${safeText(h.periodo)} — peor situación: ${safeText(
            h.peor_situacion
          )}, deuda total: ${safeText(h.deuda_total)}`
        );
      });
    }

    // BCRA - deudas por entidad
    if (informe.bcra && Array.isArray(informe.bcra.datos)) {
      addSectionTitle("Detalle de deudas por entidad (BCRA)");
      informe.bcra.datos.forEach((ent) => {
        addLine(`Entidad: ${safeText(ent.nombre)}`);
        if (Array.isArray(ent.deudas)) {
          ent.deudas.forEach((d) => {
            addLine(
              `  - Periodo ${safeText(d.periodo)} — situación ${safeText(
                d.situacion
              )}, monto ${safeText(d.monto)}`
            );
          });
        }
      });
    }

    // Último BCRA online
    if (informe.ultimoBcra && Array.isArray(informe.ultimoBcra.bcra)) {
      addSectionTitle("Último BCRA online (detalle por entidad)");
      informe.ultimoBcra.bcra.forEach((b) => {
        addLine(
          `${safeText(b.entidad)} — periodo ${safeText(
            b.periodo
          )}, situación ${safeText(b.situacion)}, monto ${safeText(
            b.monto
          )}, días atraso ${safeText(b.dias_atraso)}`
        );
      });
    }

    // Rodados
    if (Array.isArray(informe.rodados) && informe.rodados.length > 0) {
      addSectionTitle("Rodados registrados");
      informe.rodados.forEach((r) => {
        addLine(
          `${safeText(r.marca)} ${safeText(
            r.version
          )} — modelo ${safeText(r.modelo)} — dominio ${safeText(
            r.dominio
          )} — participación ${safeText(
            r.porcentaje
          )}% — fecha transacción ${safeText(r.fecha_transaccion)}`
        );
      });
    }

    // Inmuebles
    if (Array.isArray(informe.inmuebles) && informe.inmuebles.length > 0) {
      addSectionTitle("Inmuebles registrados");
      informe.inmuebles.forEach((i) => {
        addLine(
          `${safeText(i.direccion)} (${safeText(
            i.provincia
          )}) — catastro ${safeText(
            i.numero_catastro
          )} — fecha alta ${safeText(i.fecha_alta)}`
        );
      });
    }

    // Nivel socioeconómico
    if (informe.nivelSocioeconomico) {
      addSectionTitle("Nivel socioeconómico");
      const nse = informe.nivelSocioeconomico;
      addLine(`NSE personal: ${safeText(nse.nse_personal)}`);
      if (nse.nse_detalle) {
        addLine("Detalles de rangos NSE:");
        Object.keys(nse.nse_detalle).forEach((k) => {
          addLine(`  - ${k}: ${safeText(nse.nse_detalle[k])}`);
        });
      }
    }

    // Emails registrados
    if (Array.isArray(informe.mails) && informe.mails.length > 0) {
      addSectionTitle("Emails registrados");
      informe.mails.forEach((m) => {
        addLine(`Email: ${safeText(m.mail)}`);
      });
    }

    // Domicilios del titular
    if (Array.isArray(informe.domicilios) && informe.domicilios.length > 0) {
      addSectionTitle("Domicilios del titular");
      informe.domicilios.forEach((d) => {
        addLine(
          `${safeText(d.calle)} ${safeText(d.altura)} ${safeText(
            d.extra
          )} — ${safeText(d.localidad)} (${safeText(
            d.provincia
          )}) — CP ${safeText(d.cp)} — tipo: ${safeText(
            d.tipo
          )} — fecha: ${safeText(d.fecha)}`
        );
      });
    }

    // Personas relacionadas
    if (
      Array.isArray(informe.personasRelacionadas) &&
      informe.personasRelacionadas.length > 0
    ) {
      addSectionTitle("Personas relacionadas (grupo familiar / AFIP)");
      informe.personasRelacionadas.forEach((p) => {
        addLine(
          `${safeText(p.nombre_completo)} — CUIT ${safeText(
            p.cuit
          )} — clase ${safeText(p.clase)} — edad aprox. ${safeText(
            p.anios
          )} años`
        );
      });
    }

    // Personas relacionadas - empresas
    if (
      Array.isArray(informe.personasRelacionadasEmpresas) &&
      informe.personasRelacionadasEmpresas.length > 0
    ) {
      addSectionTitle("Personas relacionadas - empresas");
      informe.personasRelacionadasEmpresas.forEach((e) => {
        addLine(
          `${safeText(e.nombre)} — CUIT ${safeText(
            e.cuit
          )} — relación: ${safeText(e.relacion)}`
        );
      });
    }

    // Personas relacionadas - socios
    if (
      Array.isArray(informe.personasRelacionadasSocios) &&
      informe.personasRelacionadasSocios.length > 0
    ) {
      addSectionTitle("Personas relacionadas - socios");
      informe.personasRelacionadasSocios.forEach((s) => {
        addLine(
          `${safeText(s.nombre)} — CUIT ${safeText(
            s.cuit
          )} — relación: ${safeText(s.relacion)}`
        );
      });
    }

    // Domicilios de personas relacionadas
    if (
      Array.isArray(informe.domiciliosPersonasRelacionadas) &&
      informe.domiciliosPersonasRelacionadas.length > 0
    ) {
      addSectionTitle("Domicilios de personas relacionadas");
      informe.domiciliosPersonasRelacionadas.forEach((p) => {
        addLine(
          `Persona: ${safeText(
            p.datos_persona?.nombre_completo
          )} — CUIT ${safeText(p.datos_persona?.cuit)}`
        );
        if (Array.isArray(p.domicilios)) {
          p.domicilios.forEach((d) => {
            addLine(
              `  - ${safeText(d.calle)} ${safeText(
                d.altura
              )} ${safeText(d.extra)} — ${safeText(
                d.localidad
              )} (${safeText(d.provincia)}) — CP ${safeText(
                d.cp
              )} — tipo: ${safeText(d.tipo)} — fecha: ${safeText(d.fecha)}`
            );
          });
        }
      });
    }

    // Teléfonos validados del titular
    if (
      Array.isArray(informe.telefonosDeclaradosValidados) &&
      informe.telefonosDeclaradosValidados.length > 0
    ) {
      addSectionTitle("Teléfonos declarados / validados del titular");
      informe.telefonosDeclaradosValidados.forEach((t) => {
        addLine(
          `Tel: ${safeText(t.telefono)} — WhatsApp: ${safeText(
            t.whatsapp
          )} — InfoExperto: ${safeText(
            t.infoexperto
          )} — ENACOM: ${safeText(t.enacom)}`
        );
      });
    }

    // Teléfonos de personas relacionadas
    if (informe.telefonosPersonasRelacionadas) {
      const valores = Object.values(informe.telefonosPersonasRelacionadas);
      if (valores.length > 0) {
        addSectionTitle("Teléfonos de personas relacionadas");
        valores.forEach((entry) => {
          addLine(
            `Persona: ${safeText(
              entry.datos_persona?.nombre_completo
            )} — CUIT ${safeText(entry.datos_persona?.cuit)}`
          );
          if (Array.isArray(entry.celulares)) {
            entry.celulares.forEach((cel) => {
              addLine(
                `  - Celular: ${safeText(
                  cel.numero
                )} (orden ${safeText(cel.orden)})`
              );
            });
          }
        });
      }
    }

    // AFIP A4 Online
    if (informe.soaAfipA4Online) {
      addSectionTitle("AFIP - Ficha online (A4)");
      const afip = informe.soaAfipA4Online;
      addLine(`Nombre completo AFIP: ${safeText(afip.nombreCompleto)}`);
      addLine(
        `Documento: ${safeText(afip.tipoDocumento)} ${safeText(
          afip.numeroDocumento
        )}`
      );
      addLine(
        `Fecha de nacimiento: ${safeText(
          afip.fechaNacimientoFormato
        )} — Estado clave: ${safeText(afip.estadoClave)}`
      );
      addLine(
        `Tipo persona: ${safeText(
          afip.tipoPersona
        )} — Sexo: ${safeText(afip.sexoFormato)}`
      );
      addLine(
        `Fecha de inscripción: ${safeText(
          afip.fechaInscripcionFormato
        )} — Mes de cierre: ${safeText(afip.mesCierre)}`
      );

      if (Array.isArray(afip.email) && afip.email.length > 0) {
        addLine("Emails AFIP:");
        afip.email.forEach((m) => {
          addLine(
            `  - ${safeText(m.direccion)} (${safeText(
              m.tipoEmail
            )}, estado ${safeText(m.estado)})`
          );
        });
      }

      if (Array.isArray(afip.telefono) && afip.telefono.length > 0) {
        addLine("Teléfonos AFIP:");
        afip.telefono.forEach((t) => {
          addLine(
            `  - ${safeText(t.numero)} (${safeText(
              t.tipoTelefono
            )}, ${safeText(t.tipoLinea)})`
          );
        });
      }

      if (Array.isArray(afip.actividad) && afip.actividad.length > 0) {
        addLine("Actividades AFIP:");
        afip.actividad.forEach((a) => {
          addLine(
            `  - ${safeText(a.descripcionActividad)} (id ${
              a.idActividad
            }, periodo ${safeText(a.periodo)})`
          );
        });
      }

      if (Array.isArray(afip.categoria) && afip.categoria.length > 0) {
        addLine("Categorías AFIP:");
        afip.categoria.forEach((c) => {
          addLine(
            `  - Impuesto ${safeText(
              c.idImpuesto
            )} — categoría ${safeText(
              c.descripcionCategoria
            )} — estado ${safeText(c.estado)}`
          );
        });
      }

      if (Array.isArray(afip.impuesto) && afip.impuesto.length > 0) {
        addLine("Impuestos AFIP:");
        afip.impuesto.forEach((imp) => {
          addLine(
            `  - ${safeText(
              imp.descripcionImpuesto
            )} — estado ${safeText(
              imp.estado
            )} — desde ${safeText(imp.ffInscripcionFormato)}`
          );
        });
      }

      if (Array.isArray(afip.domicilio) && afip.domicilio.length > 0) {
        addLine("Domicilios AFIP:");
        afip.domicilio.forEach((d) => {
          addLine(
            `  - ${safeText(d.direccion)} (${safeText(
              d.descripcionProvincia
            )}) — ${safeText(d.localidad)} — CP ${safeText(
              d.codPostal
            )} — tipo ${safeText(d.tipoDomicilio)}`
          );
        });
      }
    }

    // Estadísticas de uso del informe
    if (informe.estadisticasInforme) {
      addSectionTitle("Estadísticas de consultas del informe");
      const est = informe.estadisticasInforme;
      addLine(
        `Cantidad total de consultas: ${safeText(
          est.cantidad_total
        )} — Fecha último informe: ${safeText(est.fecha_ultimo)}`
      );
      if (Array.isArray(est.historial) && est.historial.length > 0) {
        est.historial.forEach((h) => {
          addLine(
            `  - Mes ${safeText(h.fecha)} — cantidad de consultas: ${safeText(
              h.cantidad
            )}`
          );
        });
      }
    }

    // Resumen textual (mensajes verde/amarillo/rojo)
    if (informe.resumen && informe.resumen.mensajes) {
      addSectionTitle("Resumen textual del informe");
      const msgs = informe.resumen.mensajes;
      if (Array.isArray(msgs.verde) && msgs.verde.length > 0) {
        addLine("Mensajes positivos:");
        msgs.verde.forEach((m) => addLine(` • ${m}`));
      }
      if (Array.isArray(msgs.amarillo) && msgs.amarillo.length > 0) {
        addLine("Mensajes de precaución:");
        msgs.amarillo.forEach((m) => addLine(` • ${m}`));
      }
      if (Array.isArray(msgs.rojo) && msgs.rojo.length > 0) {
        addLine("Mensajes críticos:");
        msgs.rojo.forEach((m) => addLine(` • ${m}`));
      }
    }

    // Otros indicadores booleanos del informe
    const indicadoresBool = [
      ["Cheques", informe.cheques],
      ["Teléfonos", informe.telefonos],
      ["Prestadores CNC", informe.prestadoresCnc],
      ["Teléfonos declarados", informe.telefonosDeclarados],
      ["ART", informe.art],
      ["Notas de rectificación", informe.notasRectificacion],
      ["Empleados", informe.empleados],
      ["Boletines Córdoba", informe.boletinesCordoba],
      [
        "Relacion dependencia",
        informe.personasRelacionadasRelacionDependencia,
      ],
      ["Laboral", informe.laboral],
      ["Dominios", informe.dominios],
      ["Afectaciones", informe.afectaciones],
      ["Marcas", informe.marcas],
      ["Boletines Buenos Aires", informe.boletinesBuenosAires],
      ["Operadores de granos", informe.operadoresGranos],
      ["Cantidad empleados (dato adicional)", informe.cantidadEmpleados],
      ["Juicios / Edictos", informe.juiciosEdictos],
      ["Quiebra / Concurso", informe.quiebraConcurso],
    ];

    const hayAlguno =
      indicadoresBool.find(
        ([, value]) => value !== undefined && value !== null
      ) !== undefined;

    if (hayAlguno) {
      addSectionTitle("Otros indicadores del informe");
      indicadoresBool.forEach(([titulo, value]) => {
        if (value !== undefined && value !== null) {
          addLine(`${titulo}: ${boolTxt(value)}`);
        }
      });
    }

    const safeNumero = String(numeroDoc || "documento").replace(
      /[^\w-]+/g,
      "_"
    );
    const fileName = `informe_${tipo}_${safeNumero}.pdf`;
    doc.save(fileName);
  } catch (err) {
    console.error("Error generando PDF:", err);
    throw err; // Lo maneja el caller (por ejemplo, mostrando alert)
  }
}
