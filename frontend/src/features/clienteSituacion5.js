// features/clienteSituacion5.js
// Cliente. Situación 5.
// +75% en 6 cuotas (la UI puede mostrar esto como etiqueta; el cálculo solo decide monto)

// Orden ascendente requerido: C3, C2, C1, B, A  (D1/D2 quedan afuera)
const NSE_RANK = {
  D2: 0,
  D1: 1,
  C3: 2,
  C2: 3,
  C1: 4,
  B: 5,
  A: 6,
};

const NSE_ADJUST = {
  C3: -0.1,
  C2: 0.0,
  C1: 0.05,
  B: 0.1,
  A: 0.1,
};

// ---- DEBUG LOGGER ----
// Activar en dev con .env(.local): VITE_DEBUG_SITUACION5=true
// En prod: NO definir la variable (queda apagado)
const DEBUG_SITUACION5 =
  import.meta?.env?.MODE === "development" ||
  String(import.meta?.env?.VITE_DEBUG_SITUACION5 || "").toLowerCase() === "true";

function logS5(...args) {
  if (!DEBUG_SITUACION5) return;
  console.log("[SITUACION5]", ...args);
}


// Log de carga de módulo (sirve para confirmar que se está importando)
logS5("MODULO CARGADO", {
  mode: import.meta?.env?.MODE,
  flag: import.meta?.env?.VITE_DEBUG_SITUACION5,
});

function safeGet(obj, path) {
  try {
    return path
      .split(".")
      .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
  } catch {
    return undefined;
  }
}

/**
 * Parse numérico robusto para:
 * - "1442083.34" (decimal con punto)  ✅
 * - "$ 1.234.567,89" (AR: miles '.', dec ',' ) ✅
 * - "1,234,567.89" (US) ✅
 * - "1234567" ✅
 */
function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value !== "string") return null;

  let s = value.trim();

  // Quitar símbolo y espacios
  s = s.replace(/\$/g, "").replace(/\s+/g, "");

  if (!s) return null;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  // Caso 1: tiene '.' y ',' -> decidir cuál es decimal por el último separador
  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");

    if (lastComma > lastDot) {
      // Formato tipo: 1.234.567,89  -> '.' miles, ',' decimal
      s = s.replace(/\./g, "").replace(/,/g, ".");
    } else {
      // Formato tipo: 1,234,567.89  -> ',' miles, '.' decimal
      s = s.replace(/,/g, "");
    }

    const num = Number(s);
    return Number.isFinite(num) ? num : null;
  }

  // Caso 2: solo coma
  if (hasComma && !hasDot) {
    // Si termina con ,dd o ,d -> decimal coma
    if (/,(\d{1,2})$/.test(s)) {
      s = s.replace(/\./g, "").replace(/,/g, ".");
    } else {
      // si no, asumimos coma como miles
      s = s.replace(/,/g, "");
    }
    const num = Number(s);
    return Number.isFinite(num) ? num : null;
  }

  // Caso 3: solo punto
  if (hasDot && !hasComma) {
    // Si termina con .dd o .d -> decimal punto (NO borrar el punto)
    if (/\.(\d{1,2})$/.test(s)) {
      const num = Number(s);
      return Number.isFinite(num) ? num : null;
    }

    // Si no parece decimal, entonces '.' eran miles
    s = s.replace(/\./g, "");
    const num = Number(s);
    return Number.isFinite(num) ? num : null;
  }

  // Caso 4: sin separadores
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

function parseNseCode(nseValue) {
  if (!nseValue) return null;
  const s = String(nseValue).trim().toUpperCase();
  const m = s.match(/^(A|B|C1|C2|C3|D1|D2)\b/);
  return m ? m[1] : null;
}

function parseARDateDDMMYYYY(dateStr) {
  // Espera "27/01/2024"
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (!dd || !mm || !yyyy) return null;

  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (
    d.getUTCFullYear() !== yyyy ||
    d.getUTCMonth() !== mm - 1 ||
    d.getUTCDate() !== dd
  ) return null;

  return d;
}

function daysBetweenUTC(a, b) {
  const ms = b.getTime() - a.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = intervals.slice().sort((i1, i2) => i1.start.getTime() - i2.start.getTime());

  const merged = [];
  let cur = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const nxt = sorted[i];
    if (nxt.start.getTime() <= cur.end.getTime()) {
      if (nxt.end.getTime() > cur.end.getTime()) cur.end = nxt.end;
    } else {
      merged.push(cur);
      cur = { ...nxt };
    }
  }
  merged.push(cur);
  return merged;
}

function calcularAntiguedadLaboralAniosDesdeHistorial(informe) {
  const hist = safeGet(informe, "data.informe.condicionTributariaHistorial");
  if (!Array.isArray(hist) || hist.length === 0) return null;

  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const intervals = [];
  for (const item of hist) {
    const desde = parseARDateDDMMYYYY(item?.fecha_desde);
    if (!desde) continue;

    const hasta = parseARDateDDMMYYYY(item?.fecha_hasta) || todayUTC;
    if (hasta.getTime() < desde.getTime()) continue;

    intervals.push({ start: desde, end: hasta });
  }

  if (!intervals.length) return null;

  const merged = mergeIntervals(intervals);
  let totalDays = 0;
  for (const it of merged) totalDays += daysBetweenUTC(it.start, it.end);

  return totalDays / 365.25;
}

function hasBienRegistrable(informe) {
  const inmuebles = safeGet(informe, "data.informe.inmuebles");
  const rodados = safeGet(informe, "data.informe.rodados");
  return (
    (Array.isArray(inmuebles) && inmuebles.length > 0) ||
    (Array.isArray(rodados) && rodados.length > 0)
  );
}

// ✅ creditoDisponible = credito - deuda
function getCreditoDisponible(informe) {
  const creditoRaw = safeGet(informe, "data.informe.scoringInforme.credito");
  const deudaRaw = safeGet(informe, "data.informe.scoringInforme.deuda");

  const credito = toNumber(creditoRaw);
  const deuda = toNumber(deudaRaw);

  logS5("NUM PARSE", { creditoRaw, deudaRaw, credito, deuda });

  if (credito === null || deuda === null) {
    logS5("NO APLICA: falta credito/deuda", { creditoRaw, deudaRaw });
    return null;
  }

  const disponible = credito - deuda;
  const disponibleSafe = disponible > 0 ? disponible : 0;

  logS5("CREDITO DISPONIBLE", { credito, deuda, disponible: disponibleSafe });

  return disponibleSafe;
}

export function calcularClienteSituacion5(informeJson) {
  // Logs de entrada
  const scoringRaw = safeGet(informeJson, "data.informe.scoringInforme.scoring");
  const nseRaw = safeGet(informeJson, "data.informe.nivelSocioeconomico.nse_personal");

  logS5("INICIO", { scoringRaw, nseRaw });

  // 1) Scoring experto 5
  const scoring = toNumber(scoringRaw);
  if (scoring !== 5) {
    logS5("NO APLICA: scoring != 5", { scoring });
    return null;
  }

  // 2) NSE mínimo C3
  const nse = parseNseCode(nseRaw);
  if (!nse) {
    logS5("NO APLICA: NSE no parseable", { nseRaw });
    return null;
  }

  const rank = NSE_RANK[nse];
  if (rank === undefined || rank < NSE_RANK.C3) {
    logS5("NO APLICA: NSE < C3", { nse, rank });
    return null;
  }

  // 3) Crédito disponible
  const creditoDisponible = getCreditoDisponible(informeJson);
  if (creditoDisponible === null) {
    logS5("NO APLICA: creditoDisponible null");
    return null;
  }

  // 4) Porcentaje base
  let pct = 0.35;

  // 5) +10% si antigüedad laboral >= 5 años
  const antigAnios = calcularAntiguedadLaboralAniosDesdeHistorial(informeJson);
  const sumaAntig = antigAnios !== null && antigAnios >= 5;
  if (sumaAntig) pct += 0.1;

  // 6) +20% si posee bien registrable
  const tieneBien = hasBienRegistrable(informeJson);
  if (tieneBien) pct += 0.2;

  // 7) Ajuste por NSE
  const nseAdj = NSE_ADJUST[nse] ?? 0;
  pct += nseAdj;

  // 8) Monto final (floor)
  let monto = Math.floor(creditoDisponible * pct);

  logS5("CALCULO", {
    nse,
    rank,
    creditoDisponible,
    pct,
    nseAdj,
    antigAnios,
    sumaAntig,
    tieneBien,
    montoAntesFiltros: monto,
  });

  // 9) Filtro mínimo 300k
  if (monto < 300000) {
    logS5("NO APLICA: monto < 300000", { monto });
    return null;
  }

  // 10) Tope 2M
  if (monto > 2000000) {
    logS5("TOPE 2M", { montoAntesTope: monto });
    monto = 2000000;
  }

  logS5("RESULTADO FINAL", { monto });

  return {
    monto,
    cuotas: 6,
    tasaLabel: "+75% en 6 cuotas",
    porcentajeFinal: pct,
    debug: {
      nse,
      creditoDisponible,
      antiguedadLaboralAnios: antigAnios,
      tieneBienRegistrable: tieneBien,
    },
  };
}

export default calcularClienteSituacion5;
