"use client";

// Red de seguridad para toda la app: antes de esto no existía NINGÚN Error
// Boundary en el proyecto (ni aquí ni por segmento), así que cualquier
// excepción de render en cualquier pantalla — un modal, un formulario, una
// tabla — tumbaba TODO el árbol de React sin aviso: la pantalla se quedaba en
// blanco o "desaparecía" de golpe, sin mensaje, sin forma de recuperarse sin
// recargar. Este boundary cubre cualquier página bajo el layout raíz;
// global-error.tsx cubre el caso más raro de que el propio layout falle.
//
// No se investiga la causa aquí — eso es trabajo de quien reportó el error
// (queda en los logs del servidor vía console.error). Este componente solo
// evita que un bug puntual se sienta como "el sistema se rompió".

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error.tsx] Error no capturado:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#151510] p-4 text-[#F5F5F5]">
      <div className="w-full max-w-md rounded-2xl border border-[#2A2A22] bg-[#1A1A16] p-6 text-center shadow-2xl">
        <p className="mb-2 text-3xl" aria-hidden>⚠</p>
        <h1 className="mb-2 text-lg font-bold text-[#D7FF4F]">Algo falló en esta pantalla</h1>
        <p className="mb-5 text-sm text-[#A7A7A7]">
          Fue un error puntual, no perdiste tu sesión. Puedes intentar de nuevo o volver al inicio.
          {error.digest && <span className="mt-2 block text-xs text-[#666]">Referencia: {error.digest}</span>}
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => reset()}
            className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-bold text-[#151515] hover:brightness-105"
          >
            Reintentar
          </button>
          <a
            href="/dashboard"
            className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:text-[#F5F5F5]"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
