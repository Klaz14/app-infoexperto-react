// backend/src/routes/infoexperto.js
import express from "express";

const router = express.Router();

// POST /api/infoexperto/consulta
router.post("/consulta", async (req, res) => {
  const { tipoDocumento, numeroDocumento } = req.body || {};

  if (!tipoDocumento || !numeroDocumento) {
    return res
      .status(400)
      .json({ error: "Faltan campos: tipoDocumento o numeroDocumento." });
  }

  try {
    // TODO: aquí va la llamada real a la API de InfoExperto
    // usando process.env.INFOEXPERTO_API_KEY

    // Por ahora devolvemos un mock:
    const riesgoMock = "ALTO"; // BAJO | MEDIO | ALTO

    return res.json({
      riesgo: riesgoMock,
      tipoDocumento,
      numeroDocumento,
    });
  } catch (err) {
    console.error("Error consultando InfoExperto:", err);
    return res.status(500).json({ error: "Error interno consultando InfoExperto." });
  }
});

export default router;
