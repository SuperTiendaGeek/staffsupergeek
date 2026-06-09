"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function ShippingV2PrintControls() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("print") === "1") {
      window.setTimeout(() => window.print(), 250);
    }
  }, [searchParams]);

  return (
    <div className="print:hidden mb-4 flex justify-end">
      <button type="button" onClick={() => window.print()} className="rounded-md border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
        Imprimir
      </button>
    </div>
  );
}
