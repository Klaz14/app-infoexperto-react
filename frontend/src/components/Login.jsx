// src/components/Login.jsx
import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setEstado("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setEstado("Sesión iniciada correctamente.");
    } catch (err) {
      console.error("Error al iniciar sesión:", err);
      setError("Correo o contraseña incorrectos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1>Consulta InfoExperto</h1>
      <p className="subtitle">
        Inicia sesión con tu cuenta autorizada para acceder a los informes.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="field-group">
          <label htmlFor="email">Correo electrónico</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="tuusuario@dominio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="field-group">
          <label htmlFor="password">Contraseña</label>
          <div className="password-wrapper">
            <input
              id="password"
              type={mostrarPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="toggle-password-btn"
              onClick={() => setMostrarPassword((v) => !v)}
            >
              {mostrarPassword ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        {estado && <div className="estado">{estado}</div>}
        {error && <div className="estado error">{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </>
  );
}

export default Login;
