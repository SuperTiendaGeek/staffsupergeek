// Llevar algo a la vista respetando «reducir movimiento» del sistema
// (regla del tablero 12: ninguna animación obligatoria).
export function desplazar(el: Element | null | undefined, block: ScrollLogicalPosition = "center"): void {
  if (!el) return;
  const quieto = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block });
}
