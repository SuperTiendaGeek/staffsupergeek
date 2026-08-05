"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Banner de vencimiento de la firma electrónica.
//
// Se monta en las pantallas de facturación. Mientras la firma esté vigente
// (más de 60 días) no pinta absolutamente nada: no hay que acostumbrar a nadie
// a ignorar un aviso permanente.
//
// El endpoint que consulta es accesible a cualquier usuario de facturación, no
// solo administradores: son ellos los que emiten y los que se quedarían
// tirados. El enlace a la pantalla de carga solo se muestra a quien pueda
// usarla.

type Aviso = {
  nivel: "vigente" | "por-vencer" | "critica" | "vencida" | null;
  diasRestantes?: number;
  mensaje?: string;
};

const ESTILO: Record<string, string> = {
  "por-vencer": "border-amber-700/50 bg-amber-950/30 text-amber-200",
  critica:      "border-red-700/60 bg-red-950/40 text-red-200",
  vencida:      "border-red-500 bg-red-950/60 text-red-100",
};

const ICONO: Record<string, string> = {
  "por-vencer": "⏳",
  critica:      "⚠",
  vencida:      "⛔",
};

export function AvisoFirma({ esAdmin = false }: { esAdmin?: boolean } = {}) {
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/facturacion/firma/aviso")
      .then((r) => r.json())
      .then((j) => { if (vivo && j.success) setAviso(j.data); })
      .catch(() => { /* el banner nunca debe romper la pantalla */ });
    return () => { vivo = false; };
  }, []);

  const nivel = aviso?.nivel;
  if (!nivel || nivel === "vigente") return null;

  return (
    <div className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 ${ESTILO[nivel]}`}>
      <span className="text-lg leading-none mt-0.5" aria-hidden>{ICONO[nivel]}</span>
      <div className="flex-1">
        <p className="text-sm font-semibold">
          {nivel === "vencida" ? "Firma electrónica vencida" : "Firma electrónica por vencer"}
        </p>
        <p className="text-sm mt-0.5 opacity-90">{aviso?.mensaje}</p>
        {nivel === "vencida" && (
          <p className="text-xs mt-1 opacity-80">
            No se pueden emitir facturas ni notas de crédito hasta cargar un certificado vigente.
          </p>
        )}
      </div>
      {esAdmin && (
        <Link
          href="/facturacion/firma"
          className="shrink-0 self-center rounded-full border border-current px-3 py-1.5 text-xs font-bold hover:bg-white/10"
        >
          Cargar firma
        </Link>
      )}
    </div>
  );
}
