// frontend/src/adminConfig.js

const rawAdmins = import.meta.env.VITE_ADMIN_EMAILS || "";

// Array de mails, limpiando espacios
export const ADMIN_EMAILS = rawAdmins
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
