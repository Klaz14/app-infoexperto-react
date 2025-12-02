// backend/src/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { authMiddleware } from "./middlewares/authMiddleware.js";
import infoexpertoRouter from "./routes/infoexperto.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares generales
app.use(cors());
app.use(express.json());

// Ruta protegida con Firebase Auth para InfoExperto
app.use("/api/infoexperto", authMiddleware, infoexpertoRouter);

app.get("/", (req, res) => {
  res.json({ message: "Backend InfoExperto OK" });
});

app.listen(PORT, () => {
  console.log(`Backend InfoExperto escuchando en http://localhost:${PORT}`);
});
