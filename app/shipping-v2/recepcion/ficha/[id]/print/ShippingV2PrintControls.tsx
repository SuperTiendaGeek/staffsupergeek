"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { onFichaPrintReady } from "./ficha-print-ready";

export function ShippingV2PrintControls() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("print") !== "1") return;

    let printed = false;
    const doPrint = () => {
      if (printed) return;
      printed = true;
      window.print();
    };

    // Espera a que el ajuste fit-to-width termine (fonts.ready + medición) antes de
    // imprimir; el timeout es solo una red de seguridad si algo falla en el ajuste.
    const unsubscribe = onFichaPrintReady(doPrint);
    const fallback = window.setTimeout(doPrint, 3000);
    return () => {
      unsubscribe();
      window.clearTimeout(fallback);
    };
  }, [searchParams]);

  return (
    <div className="print:hidden mb-4 flex justify-end">
      <button type="button" onClick={() => window.print()} className="rounded-md border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
        Imprimir
      </button>
    </div>
  );
}
