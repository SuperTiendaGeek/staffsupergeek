"use client";

// Ventana flotante de creación de documentos (rediseño de pantallas).
//
// Un solo punto de entrada ("+ Nuevo documento") abre este modal con un selector
// de tipo. Según el tipo elegido, renderiza el formulario YA EXISTENTE de cada
// documento — no reescribe ni modifica esos formularios (el de factura es de
// producción). Cada formulario trae sus propias herramientas (SRI y borrador en
// factura; forma de pago en recibo; validez en proforma) y su pantalla de éxito.
//
// Al cerrar, el padre refresca el listado (así aparece el documento recién
// creado). Factura usa useSearchParams, por eso va envuelto en <Suspense>.

import { Suspense, useState } from "react";
import { FacturacionForm } from "@/components/facturacion/FacturacionForm";
import { ReciboForm }      from "@/components/facturacion/ReciboForm";
import { ProformaForm }    from "@/components/facturacion/ProformaForm";

type TipoNuevo = "factura" | "recibo" | "proforma";

const TABS: Array<{ id: TipoNuevo; label: string; hint: string }> = [
  { id: "factura",  label: "Factura",  hint: "tributaria · SRI" },
  { id: "recibo",   label: "Recibo",   hint: "interno · sin IVA" },
  { id: "proforma", label: "Proforma", hint: "cotización" },
];

function CargandoForm() {
  return (
    <div className="flex items-center justify-center py-16 text-[#555]">
      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <span className="ml-2 text-sm">Cargando formulario…</span>
    </div>
  );
}

export function NuevoDocumentoModal({
  consumidorFinalLimite,
  vendedorPorDefecto,
  onClose,
}: {
  consumidorFinalLimite: number;
  vendedorPorDefecto: string;
  onClose: () => void;
}) {
  const [tipo, setTipo] = useState<TipoNuevo>("factura");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-3 md:p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Compactación del espacio vertical de los formularios embebidos + ocultar
          los enlaces de navegación ("Ver recibos/proformas/historial") que solo
          tienen sentido en la página completa, no dentro del modal. Se hace con
          CSS de mayor especificidad que Tailwind, sin tocar los formularios. */}
      <style>{`
        .doc-compact .gap-6{gap:1rem}
        .doc-compact .p-6{padding:1.1rem}
        .doc-compact .p-5{padding:1.1rem}
        .doc-compact .pb-20{padding-bottom:.75rem}
        .doc-compact .max-w-5xl{max-width:none}
        .doc-compact a[href="/facturacion/recibos"],
        .doc-compact a[href="/facturacion/proformas"],
        .doc-compact a[href="/facturacion/historial"]{display:none!important}
      `}</style>
      <div className="w-full max-w-5xl my-2 rounded-2xl border border-[#2A2A22] bg-[#151510] shadow-2xl">
        {/* Encabezado + selector de tipo (sticky) */}
        <div className="sticky top-0 z-10 bg-[#151510] border-b border-[#2A2A22] rounded-t-2xl px-5 py-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-bold text-[#D7FF4F]">Nuevo documento</h2>
            <button onClick={onClose} className="text-[#666] hover:text-[#F5F5F5] text-xl leading-none" aria-label="Cerrar">✕</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => {
              const activo = tipo === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTipo(t.id)}
                  className={`rounded-full px-4 py-1.5 text-sm transition ${
                    activo
                      ? "bg-[#D7FF4F] text-[#151515] font-bold"
                      : "border border-[#3A3A36] text-[#A7A7A7] hover:border-[#D7FF4F]/40 hover:text-[#F5F5F5]"
                  }`}
                >
                  {t.label}<span className={activo ? "text-[#151515]/70" : "text-[#666]"}> · {t.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Formulario del tipo elegido */}
        <div className="doc-compact px-4 py-3">
          {tipo === "factura" && (
            <Suspense fallback={<CargandoForm />}>
              <FacturacionForm consumidorFinalLimite={consumidorFinalLimite} vendedorPorDefecto={vendedorPorDefecto} />
            </Suspense>
          )}
          {tipo === "recibo"   && <ReciboForm />}
          {tipo === "proforma" && <ProformaForm />}
        </div>
      </div>
    </div>
  );
}
