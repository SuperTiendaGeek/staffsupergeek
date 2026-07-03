"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ModuloMudadoRedirect() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.replace("/operaciones"), 2500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07080A] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#D7FF4F]/30 bg-[#1E1F1C] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[#D7FF4F]/40 bg-[#D7FF4F]/10">
          <svg
            width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="#D7FF4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
        <p className="text-[13px] font-semibold uppercase tracking-wider text-[#D7FF4F]">
          Módulo reubicado
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[#CFCFCB]">
          Este módulo se movió a{" "}
          <strong className="text-white">Operaciones Comerciales</strong>.
          Redirigiendo…
        </p>
        <a
          href="/operaciones"
          className="mt-5 inline-block rounded-full border border-[#D7FF4F]/60 px-5 py-2 text-sm font-semibold text-[#D7FF4F] transition hover:border-[#D7FF4F] hover:bg-[#D7FF4F]/10"
        >
          Ir ahora →
        </a>
      </div>
    </div>
  );
}
