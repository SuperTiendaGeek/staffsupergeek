"use client";

// Selector de TIPO DE DOCUMENTO para la emisión que viene de una orden o de
// una operación (?origen=orden|operacion&recordId=…).
//
// El problema que resuelve: el botón de la orden llevaba directo al formulario
// de facturas, el único que sabe leer ?origen= y pedir la pre-factura. Si el
// usuario quería un recibo tenía que ir al formulario de recibos, que arranca
// en blanco — todo lo que venía de la orden se perdía. Ahora la pre-factura se
// pide UNA vez aquí y alimenta a los tres formularios, así que cambiar de
// pestaña no pierde nada.
//
// Detalle deliberado: la pestaña "Factura" monta FacturacionForm tal cual, que
// sigue leyendo la URL por su cuenta (es el formulario de producción y no se
// toca). Por eso la pre-factura solo se pide aquí cuando el usuario se mueve a
// Recibo o Proforma — abrir la pantalla en Factura no cuesta ninguna lectura
// extra a Airtable.

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FacturacionForm } from "@/components/facturacion/FacturacionForm";
import { ReciboForm }      from "@/components/facturacion/ReciboForm";
import { ProformaForm }    from "@/components/facturacion/ProformaForm";
import type { ResultadoPreFactura } from "@/lib/facturacion/gancho/traductor";

type Tipo = "factura" | "recibo" | "proforma";

const TABS: Array<{ id: Tipo; label: string; hint: string }> = [
  { id: "factura",  label: "Factura",  hint: "tributaria · SRI" },
  { id: "recibo",   label: "Recibo",   hint: "interno · sin IVA" },
  { id: "proforma", label: "Proforma", hint: "presupuesto" },
];

export function EmisionDesdeOrigen({ consumidorFinalLimite }: { consumidorFinalLimite: number }) {
  return (
    <Suspense fallback={<Cargando texto="Cargando formulario…" />}>
      <EmisionDesdeOrigenInterno consumidorFinalLimite={consumidorFinalLimite} />
    </Suspense>
  );
}

function EmisionDesdeOrigenInterno({ consumidorFinalLimite }: { consumidorFinalLimite: number }) {
  const searchParams = useSearchParams();
  const origenTipo = searchParams.get("origen");
  const recordId   = searchParams.get("recordId");

  const hayOrigen =
    (origenTipo === "orden" || origenTipo === "operacion") && !!recordId?.trim();

  const [tipo, setTipo] = useState<Tipo>("factura");
  const [prefactura, setPrefactura] = useState<ResultadoPreFactura | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dos refs, y no estado, a propósito:
  //
  // `pedida` evita pedir la pre-factura dos veces. Si esto dependiera de
  // `cargando`, setCargando(true) volvería a disparar el efecto, su limpieza
  // cancelaría el fetch en vuelo y el segundo pase saldría por el guard —
  // el spinner se quedaba girando para siempre. Pasó de verdad.
  //
  // `montado` reemplaza al "cancel" de la limpieza: cambiar de Recibo a
  // Proforma mientras carga NO debe descartar la respuesta (es la misma para
  // las dos pestañas). Solo se descarta si el componente ya no está montado.
  const pedida  = useRef(false);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  // Se pide solo al salir de la pestaña Factura, y una sola vez.
  useEffect(() => {
    if (!hayOrigen || tipo === "factura" || pedida.current) return;
    pedida.current = true;
    setCargando(true);
    setError(null);
    const qs = origenTipo === "orden"
      ? `orden=${encodeURIComponent(recordId!)}`
      : `operacion=${encodeURIComponent(recordId!)}`;
    fetch(`/api/facturacion/prefactura?${qs}`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: ResultadoPreFactura; error?: string }) => {
        if (!montado.current) return;
        if (!j.success || !j.data) { setError(j.error ?? "No se pudieron cargar los datos de la orden"); return; }
        setPrefactura(j.data);
      })
      .catch(() => { if (montado.current) setError("Error de red al cargar los datos de la orden"); })
      .finally(() => { if (montado.current) setCargando(false); });
  }, [hayOrigen, tipo, origenTipo, recordId]);

  // Reintentar tras un error de red: limpia la marca y vuelve a pedirla.
  function reintentar() {
    pedida.current = false;
    setError(null);
    setPrefactura(null);
    setCargando(false);
  }

  // Sin origen (mostrador, borrador o reemplazo de NC) esta pantalla se
  // comporta exactamente como antes: solo el formulario de facturas.
  if (!hayOrigen) {
    return <FacturacionForm consumidorFinalLimite={consumidorFinalLimite} />;
  }

  const origen = { tipo: origenTipo as "orden" | "operacion", recordId: recordId! };

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap gap-2">
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
              {t.label}
              <span className={activo ? "text-[#151515]/70" : "text-[#666]"}> · {t.hint}</span>
            </button>
          );
        })}
      </div>

      {tipo === "factura" && <FacturacionForm consumidorFinalLimite={consumidorFinalLimite} />}

      {tipo !== "factura" && cargando && <Cargando texto="Cargando datos de la orden…" />}

      {tipo !== "factura" && !cargando && error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3">
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={reintentar} className="mt-2 rounded-full border border-[#3A3A36] px-3 py-1 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5]">
            Reintentar
          </button>
        </div>
      )}

      {tipo !== "factura" && !cargando && prefactura?.bloqueado && (
        <BloqueoBanner resultado={prefactura} />
      )}

      {tipo === "recibo" && !cargando && prefactura && !prefactura.bloqueado && (
        <ReciboForm
          prefactura={prefactura.datosVenta}
          origen={origen}
          bannerOrigen={{ ordenIdVisible: prefactura.ordenIdVisible, operacionCodigo: prefactura.operacionCodigo }}
        />
      )}

      {tipo === "proforma" && !cargando && prefactura && !prefactura.bloqueado && (
        <ProformaForm
          prefactura={prefactura.datosVenta}
          origen={origen}
          bannerOrigen={{ ordenIdVisible: prefactura.ordenIdVisible, operacionCodigo: prefactura.operacionCodigo }}
        />
      )}
    </div>
  );
}

function Cargando({ texto }: { texto: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-[#555]">
      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <span className="ml-2 text-sm">{texto}</span>
    </div>
  );
}

// Espejo del banner del formulario de facturas, para que el bloqueo se vea
// igual en las tres pestañas. La proforma NO bloquea (no tiene efectos), así
// que solo se listan los motivos que sí impiden emitir.
function BloqueoBanner({ resultado }: { resultado: Extract<ResultadoPreFactura, { bloqueado: true }> }) {
  if (resultado.motivo === "FACTURA_EXISTENTE" && resultado.facturaExistente) {
    const f = resultado.facturaExistente;
    return (
      <div className="rounded-xl border border-[#F0C75E]/40 bg-[#F0C75E]/10 p-6">
        <p className="text-[#F0C75E] font-bold text-lg mb-1">Ya existe una factura para este origen</p>
        <p className="text-[#F5F5F5] text-sm">{f.numeroFactura || f.claveAcceso} — estado <strong>{f.estado}</strong></p>
      </div>
    );
  }
  if (resultado.motivo === "RECIBO_EXISTENTE" && resultado.reciboExistente) {
    const r = resultado.reciboExistente;
    return (
      <div className="rounded-xl border border-[#F0C75E]/40 bg-[#F0C75E]/10 p-6">
        <p className="text-[#F0C75E] font-bold text-lg mb-1">Ya existe un recibo para este origen</p>
        <p className="text-[#F5F5F5] text-sm">{r.numero} — estado <strong>{r.estado}</strong> — ${r.total.toFixed(2)}</p>
        <p className="text-[#A7A7A7] text-xs mt-2">
          El recibo ya cerró esta cuenta: descontó el inventario y registró el ingreso. Para emitir otro documento,
          primero hay que anular el recibo.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[#F0C75E]/40 bg-[#F0C75E]/10 p-6">
      <p className="text-[#F0C75E] font-bold text-lg mb-2">No se puede emitir todavía</p>
      <ul className="flex flex-col gap-1">
        {(resultado.itemsNoListos ?? []).map((item) => (
          <li key={item.id} className="text-sm text-[#F5F5F5]">
            {item.nombre} —{" "}
            <span className="text-[#F0C75E]">
              {item.motivo === "NO_RESERVADO" ? "no está Reservado"
                : item.motivo === "SIN_STOCK" ? "no tiene stock disponible"
                : item.motivo === "SIN_PRECIO_FINAL" ? "no tiene Precio venta final"
                : "ya tiene un documento de venta"}
            </span>
          </li>
        ))}
        {(resultado.productosDigitalesNoListos ?? []).map((item) => (
          <li key={item.id} className="text-sm text-[#F5F5F5]">
            {item.nombre} —{" "}
            <span className="text-[#F0C75E]">
              {item.motivo === "SIN_NOMBRE" ? "falta vincular su catálogo (nombre comercial)" : "falta poner su Precio Venta"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
