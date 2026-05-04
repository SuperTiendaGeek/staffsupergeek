"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

type AutoPrintProps = {
  backHref: string;
};

export function AutoPrint({ backHref }: AutoPrintProps) {
  const printedRef = useRef(false);

  useEffect(() => {
    if (printedRef.current) return;
    printedRef.current = true;

    const timeoutId = window.setTimeout(() => {
      window.print();
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <div className="print-actions">
      <button type="button" onClick={() => window.print()}>
        Imprimir
      </button>
      <Link href={backHref}>Volver</Link>
    </div>
  );
}
