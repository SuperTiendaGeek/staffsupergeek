/**
 * Test — lib/facturacion/ivaIncluido.ts (desglose de precio final CON IVA
 * incluido, compartido entre el gancho y el toggle "Precios incluyen IVA"
 * de FacturacionForm.tsx).
 * Ejecutar: npx tsx lib/facturacion/__tests__/ivaIncluido.test.ts
 *
 * Puro, sin red. Cubre exactamente el bug reportado en prueba en vivo:
 * sumar el IVA de un COMPLEMENTO por línea (correcto) reconstruye el total
 * real al centavo; calcularlo sobre el subtotal agregado de bases ya
 * redondeadas (el bug) puede introducir hasta $0.01 de diferencia.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import { round2, desglosarPrecioConIvaIncluido } from "../ivaIncluido";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// Suma línea por línea, desglosando cada una por separado — el método
// correcto (nunca agregar bases primero y calcular IVA sobre el agregado).
function totalPorLinea(precios: number[], tarifa: number): number {
  let base = 0, iva = 0;
  for (const p of precios) {
    const d = desglosarPrecioConIvaIncluido(p, tarifa);
    base = round2(base + d.base);
    iva = round2(iva + d.valorIva);
  }
  return round2(base + iva);
}

// El método incorrecto que causaba el bug: agregar bases redondeadas y
// recién ahí aplicar la tarifa — se deja aquí solo para documentar/probar
// que efectivamente difiere del método correcto en el caso real reportado.
function totalPorAgregadoBuggy(precios: number[], tarifa: number): number {
  let baseAgregada = 0;
  for (const p of precios) {
    baseAgregada = round2(baseAgregada + desglosarPrecioConIvaIncluido(p, tarifa).base);
  }
  const ivaAgregado = round2(baseAgregada * (tarifa / 100));
  return round2(baseAgregada + ivaAgregado);
}

// ─── Caso real reportado: repuesto $78 + servicio $10, ambos 15% ────────────
{
  const precios = [78, 10];
  assert(
    totalPorLinea(precios, 15) === 88,
    "repuesto $78 + servicio $10 (15%): suma por línea reconstruye $88.00 exacto"
  );
  assert(
    totalPorAgregadoBuggy(precios, 15) === 88.01,
    "el método agregado (bug) sí produce $88.01 — confirma la causa raíz del bug reportado"
  );
}

// ─── 3 líneas de $0.10 (15%) ─────────────────────────────────────────────────
{
  const precios = [0.10, 0.10, 0.10];
  assert(
    totalPorLinea(precios, 15) === 0.30,
    "3 líneas de $0.10 (15%): suma por línea reconstruye $0.30 exacto"
  );
}

// ─── Centavos incómodos: $1.15 y $33.33 (15%) ────────────────────────────────
{
  const precios = [1.15, 33.33];
  const esperado = round2(1.15 + 33.33);
  assert(
    totalPorLinea(precios, 15) === esperado,
    `líneas $1.15 + $33.33 (15%): suma por línea reconstruye $${esperado.toFixed(2)} exacto`
  );
}

// ─── Mixto 15% y 0% ───────────────────────────────────────────────────────────
{
  const d15 = desglosarPrecioConIvaIncluido(50, 15);
  const d0  = desglosarPrecioConIvaIncluido(20, 0);
  assert(d0.base === 20 && d0.valorIva === 0, "tarifa 0%: base = precio final, IVA = 0 (nada que desglosar)");
  const totalMixto = round2(d15.base + d15.valorIva + d0.base + d0.valorIva);
  assert(totalMixto === 70, "mixto 15%+0% ($50+$20): reconstruye $70.00 exacto sumando ambas líneas");
}

// ─── Muchas líneas con precios "feos" — cuadre al centavo en volumen ────────
{
  const precios = [7.77, 19.99, 33.33, 0.10, 0.10, 0.10, 1.15, 99.99, 5.55, 12.34];
  const sumaOriginal = round2(precios.reduce((s, p) => round2(s + p), 0));
  assert(
    totalPorLinea(precios, 15) === sumaOriginal,
    `10 líneas con centavos incómodos (15%): suma por línea reconstruye $${sumaOriginal.toFixed(2)} exacto`
  );
}

// ─── Exento / No objeto (tarifa 0, igual que 0%) ─────────────────────────────
{
  const dExento = desglosarPrecioConIvaIncluido(45.67, 0);
  assert(dExento.base === 45.67 && dExento.valorIva === 0, "Exento/No objeto (tarifa 0): base = precio final, IVA = 0");
}

if (fallos > 0) {
  console.error(`\n❌ ivaIncluido.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ ivaIncluido.test.ts — todos los asserts pasaron");
