"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

export function errMsg(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : "Error inesperado";
}

/** Carga datos al montar / cuando cambian las dependencias. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true); setError(null);
    try { const d = await fnRef.current(); if (my === seq.current) setData(d); }
    catch (e) { if (my === seq.current) setError(errMsg(e)); }
    finally { if (my === seq.current) setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);
  return { data, error, loading, reload };
}

/** Valor recordado en localStorage (preferencias de conveniencia). */
export function getPref(key: string): string {
  try { return localStorage.getItem("pv_" + key) || ""; } catch { return ""; }
}
export function setPref(key: string, value: string) {
  try { localStorage.setItem("pv_" + key, value); } catch { /* ignore */ }
}
