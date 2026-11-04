"use client";
import { useEffect } from "react";

/** El service worker sólo se registra en producción (sólo cachea el shell estático). */
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => { /* sin SW la app funciona igual */ });
  }, []);
  return null;
}
