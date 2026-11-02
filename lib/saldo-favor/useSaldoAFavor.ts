"use client";

import { useEffect, useState } from "react";

/**
 * Saldo a favor del cliente elegido en mostrador (auditoría ops, punto
 * 13B-2). 0 mientras carga, para consumidor final o si falla la lectura.
 */
export function useSaldoAFavorCliente(clienteId: string | null | undefined): number {
  const [saldo, setSaldo] = useState(0);
  useEffect(() => {
    if (!clienteId) { setSaldo(0); return; }
    let vivo = true;
    fetch(`/api/facturacion/saldo-favor?clienteId=${encodeURIComponent(clienteId)}`)
      .then((r) => r.json())
      .then((j) => { if (vivo) setSaldo(j?.success ? Number(j.data?.disponible) || 0 : 0); })
      .catch(() => { if (vivo) setSaldo(0); });
    return () => { vivo = false; };
  }, [clienteId]);
  return saldo;
}
