// src/App.jsx
import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase.js";
import Login from "./components/Login.jsx";
import ReportsPage from "./components/ReportsPage.jsx";

function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser || null);
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
      <div className="app-root">
        <div className="app-container">
          <p>Cargando sesión...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-root">
        <div className="app-container">
          <Login />
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <div className="app-container">
        <div className="top-bar">
          <span className="user-email">{user.email}</span>
          <button className="logout-btn" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
        <ReportsPage />
      </div>
    </div>
  );
}

export default App;
