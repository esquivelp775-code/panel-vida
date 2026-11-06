"use client";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { indexDirection, routeDirection, type Direction } from "@/lib/motion";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Dirección del último cambio de índice (pestañas internas). Se calcula en el render que cambia, sin efectos. */
export function useIndexDirection(index: number): Direction {
  const prev = useRef(index);
  const dir = useRef<Direction>("none");
  if (prev.current !== index) {
    dir.current = indexDirection(prev.current, index);
    prev.current = index;
  }
  return dir.current;
}

/** Igual que useIndexDirection, pero entre rutas (barra inferior y navegación a detalles). */
export function useRouteDirection(path: string): Direction {
  const prev = useRef(path);
  const dir = useRef<Direction>("none");
  if (prev.current !== path) {
    dir.current = routeDirection(prev.current, path);
    prev.current = path;
  }
  return dir.current;
}

/**
 * Posición del indicador deslizante bajo el elemento activo de un grupo (`[data-ind-item]` dentro de `ref`).
 * El primer cálculo no anima (evita que la píldora "vuele" desde la izquierda al cargar la página).
 */
export function useIndicator(ref: RefObject<HTMLElement | null>, active: number, count: number): CSSProperties {
  const [box, setBox] = useState<{ x: number; w: number; ready: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const items = el.querySelectorAll<HTMLElement>("[data-ind-item]");
      const it = items[active];
      if (!it) { setBox(null); return; }
      setBox((b) => ({ x: it.offsetLeft, w: it.offsetWidth, ready: b !== null }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, active, count]);
  if (!box) return { opacity: 0 };
  return { transform: `translate3d(${box.x}px,0,0)`, width: box.w, transition: box.ready ? undefined : "none" };
}

/** Mantiene montado un panel mientras se anima su salida. `closing` sirve para el atributo data-closing. */
export function usePresence(open: boolean, ms = 220): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    if (!mounted) return;
    const t = window.setTimeout(() => setMounted(false), prefersReducedMotion() ? 150 : ms);
    return () => window.clearTimeout(t);
  }, [open, mounted, ms]);
  return { mounted: open || mounted, closing: !open && mounted };
}
