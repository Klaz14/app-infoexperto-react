import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase.js";
import Login from "./Login.jsx";
import ReportsPage from "./ReportsPage.jsx";
import { ADMIN_EMAILS } from "../adminConfig.js"; // si querés mantener fallback

function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser || null);

      if (firebaseUser) {
        try {
          // Leemos las custom claims del token
          const tokenResult = await firebaseUser.getIdTokenResult(true); // true = fuerza refresh
          const hasAdminClaim = tokenResult.claims.admin === true;

          // Opcional: fallback por lista de emails (por si te olvidás de setear claim)
          let isInAdminList = false;
          if (firebaseUser.email) {
            isInAdminList = ADMIN_EMAILS.includes(
              firebaseUser.email.toLowerCase()
            );
          }

          setIsAdmin(hasAdminClaim || isInAdminList);
        } catch (err) {
          console.error("Error leyendo custom claims:", err);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }

      setCheckingAuth(false);
    });

    return () => unsub();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Error haciendo logout:", err);
    }
  };

  if (checkingAuth) {
    return (
      <>
        <h1>Informes Punto Financiero</h1>
        <p className="subtitle">Cargando sesión...</p>
      </>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <>
      <div className="top-bar">
        <span className="user-email">{user.email}</span>

        <span className={`role-badge ${isAdmin ? "role-admin" : "role-user"}`}>
          {isAdmin ? "ADMIN" : "USUARIO"}
        </span>

        <button className="logout-btn" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>

      <ReportsPage isAdmin={isAdmin} />
    </>
  );
}

export default App;
