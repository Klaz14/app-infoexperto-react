// backend/src/routes/infoexperto.js
import express from "express";
import rateLimit from "express-rate-limit";

const router = express.Router();

/**
 * Rate limit por IP para cualquier ruta bajo /api/infoexperto
 */
const infoexpertoLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Demasiadas consultas a InfoExperto desde esta IP. Intentá de nuevo más tarde.",
  },
});

// ================== Helpers de validación y mapping ==================

function limpiarNumero(numeroRaw) {
  return numeroRaw.toString().replace(/\D/g, "");
}

/**
 * Valida un número según tipo de documento.
 * Devuelve { ok, error, numeroLimpio }
 */
function validarNumero(tipoDocumento, numeroRaw) {
  const tipo = (tipoDocumento || "").toLowerCase();
  const limpio = limpiarNumero(numeroRaw || "");

  if (!tipo || !numeroRaw) {
    return {
      ok: false,
      error: "Campos requeridos: tipoDocumento y numero",
      numeroLimpio: limpio,
    };
  }

  if (tipo === "dni") {
    if (limpio.length < 7 || limpio.length > 8) {
      return {
        ok: false,
        error: "Formato de DNI inválido. Debe tener 7 u 8 dígitos.",
        numeroLimpio: limpio,
      };
    }
  } else if (tipo === "cuit" || tipo === "cuil") {
    if (limpio.length !== 11) {
      return {
        ok: false,
        error: "Formato de CUIT/CUIL inválido. Debe tener 11 dígitos.",
        numeroLimpio: limpio,
      };
    }
  } else {
    return {
      ok: false,
      error: "tipoDocumento debe ser 'dni' o 'cuit'",
      numeroLimpio: limpio,
    };
  }

  return { ok: true, error: null, numeroLimpio: limpio };
}

/**
 * Inferimos el riesgo ALTO / MEDIO / BAJO a partir del scoring.
 */
function inferirRiesgoDesdeScoring(informe) {
  const scoringObj = informe?.scoringInforme;
  const scoring =
    typeof scoringObj?.scoring === "number"
      ? scoringObj.scoring
      : Number(scoringObj?.scoring);

  if (Number.isFinite(scoring)) {
    if (scoring <= 2) return "ALTO";
    if (scoring <= 4) return "MEDIO";
    return "BAJO";
  }

  // Sin scoring -> lo dejamos en MEDIO (forzar revisión)
  return "MEDIO";
}

/**
 * Peor situación BCRA 24 meses (bcra.resumen_historico)
 */
function obtenerPeorSituacionBcra24m(informe) {
  const resumen = informe?.bcra?.resumen_historico;
  if (!resumen || typeof resumen !== "object") return null;

  let peor = null;
  for (const key of Object.keys(resumen)) {
    const entry = resumen[key];
    const sit = Number(entry?.peor_situacion);
    if (!Number.isNaN(sit)) {
      if (peor === null || sit > peor) peor = sit;
    }
  }
  return peor;
}

/**
 * Mapeo del JSON de InfoExperto a datos internos.
 * Acá sacamos el nombre y demás métricas.
 */
function mapearInfoexpertoADatosInternos(informe) {
  const identidad = informe?.identidad || {};
  const scoring = informe?.scoringInforme || {};
  const condicionTributaria = informe?.condicionTributaria || {};
  const actividadScoring = scoring?.actividad || {};

  const nombreCompleto =
    identidad.nombre_completo ||
    informe?.soaAfipA4Online?.nombreCompleto ||
    condicionTributaria?.nombre ||
    "Sin nombre";

  const riesgoApi = inferirRiesgoDesdeScoring(informe);

  // Ingreso mensual estimado AFIP
  let ingresoMensualEstimado = 0;
  if (typeof condicionTributaria.monto_anual === "number") {
    ingresoMensualEstimado = condicionTributaria.monto_anual / 12;
  }

  // Capacidad / compromiso (aprox desde scoringInforme)
  let capacidadTotal = 0;
  let compromisoMensual = 0;
  const credito = scoring?.credito ? Number(scoring.credito) : NaN;
  const deuda = scoring?.deuda ? Number(scoring.deuda) : NaN;

  if (Number.isFinite(credito) && credito > 0) {
    capacidadTotal = credito;
  }
  if (Number.isFinite(deuda) && deuda > 0) {
    compromisoMensual = deuda / 12;
  }

  // Antigüedad laboral (meses)
  let antiguedadLaboralMeses = 0;
  const aniosIns = Number(identidad?.anios_inscripcion);
  if (Number.isFinite(aniosIns) && aniosIns > 0) {
    antiguedadLaboralMeses = aniosIns * 12;
  }

  const situacionBcraPeor24m = obtenerPeorSituacionBcra24m(informe);

  let tieneActividadFormal = false;
  if (actividadScoring) {
    if (
      actividadScoring.empleado === "SI" ||
      actividadScoring.monotributista === "SI" ||
      actividadScoring.autonomo === "SI" ||
      actividadScoring.empleador === "SI"
    ) {
      tieneActividadFormal = true;
    }
  }

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
}

/**
 * Evaluación para RIESGO MEDIO (la misma que ya tenías)
 */
function evaluarRiesgoMedio(datos) {
  let score = 50;
  const motivos = [];

  const {
    capacidadTotal,
    compromisoMensual,
    ingresoMensualEstimado,
    antiguedadLaboralMeses,
    situacionBcraPeor24m,
    tieneActividadFormal,
    tieneVehiculosRegistrados,
    tieneInmueblesRegistrados,
  } = datos;

  // 1) BCRA
  if (situacionBcraPeor24m != null) {
    if (situacionBcraPeor24m >= 3) {
      score -= 30;
      motivos.push(
        "Registro de situación BCRA 3 o superior en los últimos 24 meses."
      );
    } else if (situacionBcraPeor24m === 2) {
      score += 5;
      motivos.push("Alguna situación 2 regularizada en BCRA.");
    } else if (situacionBcraPeor24m === 1) {
      score += 15;
      motivos.push("Historial BCRA en situación 1 (normal) últimos 24 meses.");
    }
  } else {
    motivos.push("Sin información clara de situación BCRA (neutro).");
  }

  // 2) Actividad y antigüedad
  if (!tieneActividadFormal) {
    score -= 30;
    motivos.push("No se detecta actividad formal registrable.");
  } else {
    if (antiguedadLaboralMeses >= 36) {
      score += 15;
      motivos.push("Actividad formal con antigüedad ≥ 36 meses.");
    } else if (antiguedadLaboralMeses >= 12) {
      score += 5;
      motivos.push("Actividad formal con antigüedad entre 12 y 36 meses.");
    } else {
      motivos.push("Actividad formal con antigüedad < 12 meses.");
    }
  }

  // 3) Uso de capacidad
  let usoCapacidad = null;
  if (capacidadTotal > 0) {
    usoCapacidad = compromisoMensual / capacidadTotal;
    if (usoCapacidad <= 0.3) {
      score += 15;
      motivos.push(
        `Uso de capacidad crediticia bajo (${(usoCapacidad * 100).toFixed(
          1
        )}%).`
      );
    } else if (usoCapacidad <= 0.5) {
      score += 5;
      motivos.push(
        `Uso de capacidad crediticia moderado (${(usoCapacidad * 100).toFixed(
          1
        )}%).`
      );
    } else if (usoCapacidad <= 0.8) {
      score -= 10;
      motivos.push(
        `Uso de capacidad crediticia alto (${(usoCapacidad * 100).toFixed(
          1
        )}%).`
      );
    } else {
      score -= 20;
      motivos.push(
        `Uso de capacidad crediticia crítico (${(usoCapacidad * 100).toFixed(
          1
        )}%).`
      );
    }
  } else if (compromisoMensual > 0) {
    score -= 25;
    motivos.push(
      "Compromiso mensual con capacidad crediticia total nula o no informada."
    );
  } else {
    motivos.push("Sin deudas registradas y sin capacidad informada (neutro).");
  }

  // 4) DTI
  let dti = null;
  if (ingresoMensualEstimado > 0) {
    dti = compromisoMensual / ingresoMensualEstimado;
    if (dti <= 0.3) {
      score += 15;
      motivos.push(
        `Relación cuota/ingreso cómoda (${(dti * 100).toFixed(
          1
        )}% del ingreso).`
      );
    } else if (dti <= 0.4) {
      score += 5;
      motivos.push(
        `Relación cuota/ingreso moderada (${(dti * 100).toFixed(
          1
        )}% del ingreso).`
      );
    } else if (dti <= 0.5) {
      score -= 10;
      motivos.push(
        `Relación cuota/ingreso elevada (${(dti * 100).toFixed(
          1
        )}% del ingreso).`
      );
    } else {
      score -= 20;
      motivos.push(
        `Relación cuota/ingreso crítica (${(dti * 100).toFixed(
          1
        )}% del ingreso).`
      );
    }
  } else {
    motivos.push("Sin información de ingresos estimados (neutro).");
  }

  // 5) Activos
  if (tieneVehiculosRegistrados) {
    score += 5;
    motivos.push("Posee vehículos registrados a su nombre.");
  }
  if (tieneInmueblesRegistrados) {
    score += 10;
    motivos.push("Posee inmuebles/domicilios registrados a su nombre.");
  }

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  let estado;
  if (score >= 70) estado = "APROBADO";
  else if (score >= 55) estado = "REVISION";
  else estado = "RECHAZADO";

  return {
    estado,
    scoreInterno: score,
    motivos,
    metricas: {
      capacidadTotal,
      compromisoMensual,
      ingresoMensualEstimado,
      antiguedadMeses: antiguedadLaboralMeses,
      situacionBcraPeor24m,
      tieneActividadFormal,
      tieneVehiculosRegistrados,
      tieneInmueblesRegistrados,
      usoCapacidad,
      dti,
    },
  };
}

/**
 * Llama a la API de InfoExperto y devuelve el mismo formato
 * que ya usábamos para el front.
 */
async function consultarInfoexperto(tipoLower, numeroLimpio) {
  const apiKey = process.env.INFOEXPERTO_API_KEY;
  if (!apiKey) {
    throw new Error("Falta INFOEXPERTO_API_KEY en el archivo .env");
  }

  const formData = new FormData();
  formData.append("apiKey", apiKey);
  formData.append("tipo", "normal");

  let url = "";
  if (tipoLower === "cuit" || tipoLower === "cuil") {
    url =
      "https://servicio.infoexperto.com.ar/api/informeApi/obtenerInforme";
    formData.append("cuit", numeroLimpio);
  } else if (tipoLower === "dni") {
    url =
      "https://servicio.infoexperto.com.ar/api/informeApi/obtenerInformeDni";
    formData.append("dni", numeroLimpio);
  } else {
    throw new Error("Tipo de documento no soportado");
  }

  const resp = await fetch(url, {
    method: "POST",
    body: formData,
    redirect: "follow",
  });

  if (!resp.ok) {
    const textoError = await resp.text();
    const err = new Error("Error desde API InfoExperto");
    err.status = resp.status;
    err.detalle = textoError;
    throw err;
  }

  const apiJson = await resp.json();
  const informe = apiJson?.data?.informe;
  if (!informe) {
    const err = new Error(
      apiJson.message || "No se pudo obtener el informe desde InfoExperto"
    );
    err.codigo = apiJson.metadata?.codigo ?? null;
    throw err;
  }

  const internos = mapearInfoexpertoADatosInternos(informe);
  const riesgo = internos.riesgoApi;
  const scoringApi = Number(informe?.scoringInforme?.scoring) || null;

  let riesgoInterno = null;
  if (riesgo === "MEDIO") {
    riesgoInterno = evaluarRiesgoMedio(internos);
  }

  return {
    nombreCompleto: internos.nombreCompleto,
    numero: numeroLimpio,
    tipoDocumento: tipoLower,
    riesgo,
    scoringApi,
    fechaInforme: apiJson?.data?.fecha || null,
    riesgoInterno,
    informeOriginal: informe,
  };
}

// ================== Rutas ==================

/**
 * POST /api/infoexperto
 * Consulta única (usuarios y admins).
 */
router.post("/", infoexpertoLimiter, async (req, res) => {
  try {
    const { tipoDocumento, numero } = req.body || {};
    const tipoLower = (tipoDocumento || "").toLowerCase();

    const { ok, error, numeroLimpio } = validarNumero(tipoLower, numero);
    if (!ok) {
      return res.status(400).json({ error });
    }

    const data = await consultarInfoexperto(tipoLower, numeroLimpio);

    return res.json(data);
  } catch (err) {
    console.error("Error en /api/infoexperto:", err);
    if (err.status) {
      return res.status(err.status).json({
        error: err.message || "Error desde API InfoExperto",
        detalle: err.detalle || null,
      });
    }
    return res.status(500).json({
      error: "Error interno del servidor",
    });
  }
});

/**
 * POST /api/infoexperto/multiple
 * Sólo admins. Permite varios DNI / CUIT separados.
 * Body: { tipoDocumento, numeros: ["xx", "yy", ...] }
 */
router.post("/multiple", infoexpertoLimiter, async (req, res) => {
  try {
    const { tipoDocumento, numeros } = req.body || {};
    const tipoLower = (tipoDocumento || "").toLowerCase();

    if (!Array.isArray(numeros) || numeros.length === 0) {
      return res.status(400).json({
        error:
          "Debes enviar un array 'numeros' con al menos un DNI/CUIT/CUIL.",
      });
    }

    const isAdmin = req.user?.isAdmin === true;
    if (!isAdmin) {
      return res.status(403).json({
        error: "Sólo los administradores pueden hacer consultas múltiples.",
      });
    }

    const resultados = [];

    for (const numeroRaw of numeros) {
      const numeroString = String(numeroRaw || "").trim();
      if (!numeroString) continue;

      const { ok, error, numeroLimpio } = validarNumero(
        tipoLower,
        numeroString
      );

      if (!ok) {
        resultados.push({
          ok: false,
          numeroOriginal: numeroString,
          numero: numeroLimpio,
          tipoDocumento: tipoLower,
          error,
        });
        continue;
      }

      try {
        const data = await consultarInfoexperto(tipoLower, numeroLimpio);
        resultados.push({
          ok: true,
          numeroOriginal: numeroString,
          ...data,
        });
      } catch (err) {
        console.error(
          "Error consultando InfoExperto para",
          numeroString,
          ":",
          err
        );
        resultados.push({
          ok: false,
          numeroOriginal: numeroString,
          numero: numeroLimpio,
          tipoDocumento: tipoLower,
          error:
            err.message ||
            "Error consultando la API de InfoExperto para este documento.",
        });
      }
    }

    return res.json({
      tipoDocumento: tipoLower,
      resultados,
    });
  } catch (err) {
    console.error("Error en /api/infoexperto/multiple:", err);
    return res.status(500).json({
      error: "Error interno del servidor en consultas múltiples.",
    });
  }
});

export default router;
