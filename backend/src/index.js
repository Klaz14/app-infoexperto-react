// backend/src/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { authMiddleware } from "./middlewares/authMiddleware.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 🚨 Seguridad básica con Helmet (CSP relax para dev)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://www.gstatic.com", "https://cdnjs.cloudflare.com"],
        connectSrc: [
          "'self'",
          "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com",
          "https://servicio.infoexperto.com.ar",
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
      },
    },
  })
);

// 🌐 CORS para el front en Vite
const allowedOrigins = [
  "http://localhost:5173",
  "https://informespuntofinanciamiento.netlify.app",
  "https://tudominio-frontend.com" // si luego agregás dominio propio
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // Postman/cURL
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));


app.use(express.json());

// ✅ Health check público (sin auth)
app.get("/api/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "infoexperto-backend",
    ts: new Date().toISOString(),
  });
});


// 🔒 Rate limit para InfoExperto
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

/**
 * Mapea códigos de error de InfoExperto a mensaje estándar.
 * Si hay código: "Error interno, código XX (...), consulte a un administrador."
 */
function construirMensajeErrorDesdeCodigo(codigo, mensajeApi = null) {
  if (!codigo) return null;

  const base = (desc) =>
    `Error interno, código ${codigo}${desc ? ` (${desc})` : ""}. Consulte a un administrador.`;

  switch (codigo) {
    case 11:
      return base("Api_key inválida");
    case 12:
      return base("Faltan datos necesarios");
    case 13:
      return base("CUIT/CUIL o DNI inválido");
    case 14:
      return base(
        `Corte del servicio${mensajeApi ? `, motivo: ${mensajeApi}` : ""}`
      );
    case 15:
      return base("Error al obtener el informe");
    case 16:
      return base("No se encontró información");
    case 17:
      return base("No se pudo generar el PDF");
    case 18:
      return base("No tiene acceso a ese recurso");
    case 19:
      return base("Dominio inválido");
    case 20:
      return base("Se encontró DNI con homónimos");
    default:
      return `Error interno, código ${codigo}. Consulte a un administrador.`;
  }
}

/**
 * Extrae código y mensaje de la respuesta cruda de InfoExperto
 * (por si viene en metadata.codigo / message, etc.)
 */
function extraerCodigoYMensajeDesdeApiJson(apiJson) {
  if (!apiJson || typeof apiJson !== "object") {
    return { codigo: null, mensajeApi: null };
  }

  const metadata = apiJson.metadata || apiJson.meta || {};
  let codigo =
    metadata.codigo ??
    metadata.code ??
    apiJson.codigo ??
    null;

  if (typeof codigo === "string") {
    const n = Number(codigo);
    codigo = Number.isFinite(n) ? n : null;
  } else if (!Number.isFinite(codigo)) {
    codigo = null;
  }

  const mensajeApi = metadata.message || apiJson.message || null;

  return { codigo, mensajeApi };
}

/**
 * Validación reutilizable de tipoDocumento + número
 * Devuelve: { ok, error?, codigo?, tipoLower?, numeroLimpio? }
 */
function validarNumeroInfoexperto(tipoDocumento, numero) {
  const tipo = (tipoDocumento || "").toLowerCase();
  const numStr = (numero || "").toString();
  const limpio = numStr.replace(/\D/g, "");

  if (!tipo || !numStr) {
    return {
      ok: false,
      error: "Campos requeridos: tipoDocumento y numero",
      codigo: 12,
    };
  }

  if (tipo === "dni") {
    if (limpio.length < 7 || limpio.length > 8) {
      return {
        ok: false,
        error: "Formato de DNI inválido. Debe tener 7 u 8 dígitos.",
        codigo: 13,
      };
    }
  } else if (tipo === "cuit" || tipo === "cuil") {
    if (limpio.length !== 11) {
      return {
        ok: false,
        error: "Formato de CUIT/CUIL inválido. Debe tener 11 dígitos.",
        codigo: 13,
      };
    }
  } else {
    return {
      ok: false,
      error: "tipoDocumento debe ser 'dni' o 'cuit'",
      codigo: 12,
    };
  }

  return {
    ok: true,
    tipoLower: tipo,
    numeroLimpio: limpio,
  };
}

/**
 * Middleware para la ruta simple /api/infoexperto
 * Usa la validación anterior y corta con 400 si algo está mal.
 */
function validarEntradaInfoexperto(req, res, next) {
  const { tipoDocumento, numero } = req.body || {};
  const {
    ok,
    error,
    codigo,
    tipoLower,
    numeroLimpio,
  } = validarNumeroInfoexperto(tipoDocumento, numero);

  if (!ok) {
    const msg =
      construirMensajeErrorDesdeCodigo(codigo) ||
      error ||
      "Datos inválidos.";
    return res.status(400).json({
      error: msg,
      ...(codigo ? { codigo } : {}),
    });
  }

  req.tipoLower = tipoLower;
  req.numeroLimpio = numeroLimpio;
  next();
}

/**
 * Lógica de riesgo (igual a la que venías usando)
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

  return "MEDIO";
}

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

  let ingresoMensualEstimado = 0;
  if (typeof condicionTributaria.monto_anual === "number") {
    ingresoMensualEstimado = condicionTributaria.monto_anual / 12;
  }

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
        `Relación cuota/ingreso cómoda (${(dti * 100).toFixed(1)}% del ingreso).`
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
 * Llamado central a InfoExperto para UNA sola consulta
 * - Maneja códigos 11–20
 * - Devuelve el objeto "bonito" que el front usa
 */
async function consultarInformeSingle(tipoLower, numeroLimpio) {
  const apiKey = process.env.INFOEXPERTO_API_KEY;
  if (!apiKey) {
    const err = new Error(
      "Falta INFOEXPERTO_API_KEY en el archivo .env del backend."
    );
    err.httpStatus = 500;
    return Promise.reject(err);
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
    const err = new Error("tipoDocumento inválido.");
    err.httpStatus = 400;
    return Promise.reject(err);
  }

  const resp = await fetch(url, {
    method: "POST",
    body: formData,
    redirect: "follow",
  });

  let apiJson = null;
  try {
    apiJson = await resp.json();
  } catch {
    // Si ni siquiera se puede parsear JSON
  }

  const { codigo, mensajeApi } = extraerCodigoYMensajeDesdeApiJson(apiJson);

  if (!resp.ok) {
    const mensaje =
      construirMensajeErrorDesdeCodigo(codigo, mensajeApi) ||
      mensajeApi ||
      `Error desde API InfoExperto (HTTP ${resp.status})`;

    const err = new Error(mensaje);
    err.httpStatus = resp.status;
    if (codigo) err.codigo = codigo;
    throw err;
  }

  const informe = apiJson?.data?.informe;
  if (!informe) {
    const mensaje =
      construirMensajeErrorDesdeCodigo(codigo, mensajeApi) ||
      apiJson?.message ||
      "No se pudo obtener el informe";

    const err = new Error(mensaje);
    err.httpStatus = 400;
    if (codigo) err.codigo = codigo;
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

// 🔹 Ruta simple: un solo documento
app.post(
  "/api/infoexperto",
  authMiddleware,
  infoexpertoLimiter,
  validarEntradaInfoexperto,
  async (req, res) => {
    try {
      const { tipoLower, numeroLimpio } = req;
      const data = await consultarInformeSingle(tipoLower, numeroLimpio);
      return res.json(data);
    } catch (err) {
      console.error("Error en /api/infoexperto:", err);
      const status = err.httpStatus || 500;
      const payload = {
        error: err.message || "Error interno del servidor",
      };
      if (err.codigo) payload.codigo = err.codigo;
      return res.status(status).json(payload);
    }
  }
);

// 🔹 Ruta múltiple: SOLO para admins (ya controlado por el front, pero acá igual se secuencia)
app.post(
  "/api/infoexperto/multiple",
  authMiddleware,
  infoexpertoLimiter,
  async (req, res) => {
    try {
      const { tipoDocumento, numeros } = req.body || {};

      if (!tipoDocumento || !Array.isArray(numeros) || numeros.length === 0) {
        return res.status(400).json({
          error:
            "Debes enviar tipoDocumento y un array 'numeros' con al menos un elemento.",
        });
      }

      const resultados = [];
      for (const raw of numeros) {
        const {
          ok,
          error,
          codigo,
          tipoLower,
          numeroLimpio,
        } = validarNumeroInfoexperto(tipoDocumento, raw);

        if (!ok) {
          const msg =
            construirMensajeErrorDesdeCodigo(codigo) || error || "Datos inválidos.";
          resultados.push({
            ok: false,
            numeroOriginal: raw,
            error: msg,
            ...(codigo ? { codigo } : {}),
          });
          continue;
        }

        try {
          const data = await consultarInformeSingle(tipoLower, numeroLimpio);
          resultados.push({
            ok: true,
            numeroOriginal: raw,
            ...data,
          });
        } catch (err) {
          resultados.push({
            ok: false,
            numeroOriginal: raw,
            error: err.message || "Error interno del servidor",
            ...(err.codigo ? { codigo: err.codigo } : {}),
          });
        }
      }

      return res.json({ resultados });
    } catch (err) {
      console.error("Error en /api/infoexperto/multiple:", err);
      return res.status(500).json({
        error: "Error interno del servidor",
      });
    }
  }
);

const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`Servidor escuchando en http://${HOST}:${PORT}`);
});
