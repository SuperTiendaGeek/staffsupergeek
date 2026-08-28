"use client";

// Mismo boundary que app/error.tsx, pero para el caso en que falle el propio
// layout raíz (app/layout.tsx) — ahí ya no hay <html>/<body> que envuelva
// esta pantalla, así que este archivo los pone él mismo. Next.js solo usa
// este archivo cuando app/error.tsx no alcanza a capturar el fallo.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/global-error.tsx] Error no capturado en el layout raíz:", error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#151510", color: "#F5F5F5", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 420, borderRadius: 16, border: "1px solid #2A2A22", background: "#1A1A16", padding: 24, textAlign: "center" }}>
            <p style={{ marginBottom: 8, fontSize: 28 }} aria-hidden>⚠</p>
            <h1 style={{ marginBottom: 8, fontSize: 18, fontWeight: 700, color: "#D7FF4F" }}>El portal no pudo cargar</h1>
            <p style={{ marginBottom: 20, fontSize: 14, color: "#A7A7A7" }}>
              Fue un error puntual. Puedes intentar de nuevo.
              {error.digest && <span style={{ marginTop: 8, display: "block", fontSize: 12, color: "#666" }}>Referencia: {error.digest}</span>}
            </p>
            <button
              onClick={() => reset()}
              style={{ borderRadius: 999, border: "1px solid #D7FF4F", background: "#D7FF4F", color: "#151515", fontWeight: 700, padding: "8px 16px", fontSize: 14, cursor: "pointer" }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
