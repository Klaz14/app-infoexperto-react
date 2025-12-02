// backend/src/index.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import infoexpertoRouter from "./routes/infoexperto.js";
import { authMiddleware } from "./middlewares/authMiddleware.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Seguridad básica: Helmet
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

// CORS para el frontend en Vite (dev)
app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json());

// Ruta principal protegida con Firebase Auth
app.use("/api/infoexperto", authMiddleware, infoexpertoRouter);

app.get("/", (req, res) => {
  res.json({ message: "Backend InfoExperto OK" });
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
