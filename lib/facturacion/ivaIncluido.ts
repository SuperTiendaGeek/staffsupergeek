// Aritmética de desglose de un precio final CON IVA incluido en base + IVA.
// Compartida entre el gancho (server, lib/facturacion/gancho/construccion.ts)
// y el formulario de facturación (client, components/facturacion/FacturacionForm.tsx)
// para el toggle "Precios incluyen IVA" — sin "server-only": este módulo se
// importa desde un client component.

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// El IVA se calcula como el COMPLEMENTO de la base ya redondeada (precioFinal
// - base), no como base*tarifa/100 de forma independiente — así
// `base + valorIva` reconstruye EXACTO el precio final al centavo, sin
// importar la acumulación de redondeos de dividir por 1.15. Sumar estos
// valores línea por línea (en vez de aplicar esta fórmula sobre un subtotal
// ya agregado) es lo que garantiza que el total de la factura cuadre al
// centavo contra el total real — aplicar el complemento sobre un subtotal
// agregado de bases ya redondeadas puede introducir hasta $0.01 de
// diferencia por el redondeo del agregado.
// Con tarifa 0 (0%/Exento/No objeto) no hay nada que desglosar: el precio
// final YA es la base.
export function desglosarPrecioConIvaIncluido(
  precioFinal: number,
  tarifa: number
): { base: number; valorIva: number } {
  if (tarifa === 0) {
    return { base: round2(precioFinal), valorIva: 0 };
  }
  const base = round2(precioFinal / (1 + tarifa / 100));
  const valorIva = round2(precioFinal - base);
  return { base, valorIva };
}
