/**
 * Cada SKU debe ser único e irrepetible.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/sku/__tests__/skuUnico.test.ts
 *
 * El SKU es el número con el que un artículo se identifica en facturas,
 * packings y órdenes. Dos artículos con el mismo SKU harían imposible saber
 * cuál se vendió.
 *
 * Airtable no puede imponer unicidad por sí solo. La garantía es del código:
 * el turno por prefijo de categoría (mismo mecanismo que las reservas, F-26)
 * más la verificación al crear. Este test cubre la aritmética de generación y
 * demuestra por qué hace falta el turno.
 */

import { generateUniqueSkuFromExistingSkus, getSkuPrefixByCategory } from "../sku-service";
import { withLock } from "../../concurrencia";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  // ── Prefijo por categoría ──────────────────────────────────────────────────
  assert(getSkuPrefixByCategory("SSD") === "SSD", "Una SSD usa el prefijo SSD");
  assert(getSkuPrefixByCategory("Laptop") === "LAP", "Una laptop usa LAP");
  assert(getSkuPrefixByCategory("Batería") === "REP", "Una batería es repuesto → REP");
  assert(getSkuPrefixByCategory("Categoría inventada") === "OTR", "Una categoría desconocida cae en OTR, no falla");

  // ── El siguiente número libre ──────────────────────────────────────────────
  const existentes = ["SSD-000001", "SSD-000002", "LAP-000009"];
  assert(
    generateUniqueSkuFromExistingSkus("SSD", existentes) === "SSD-000003",
    "El siguiente SSD continúa la secuencia de su propia categoría"
  );
  assert(
    generateUniqueSkuFromExistingSkus("Laptop", existentes) === "LAP-000010",
    "Cada categoría lleva su secuencia por separado"
  );
  assert(
    generateUniqueSkuFromExistingSkus("RAM", existentes) === "RAM-000001",
    "Una categoría sin artículos previos empieza en 1"
  );

  // Huecos: si se borró SSD-000002, el siguiente NO debe reutilizar el hueco.
  assert(
    generateUniqueSkuFromExistingSkus("SSD", ["SSD-000001", "SSD-000003"]) === "SSD-000004",
    "Tras borrar un artículo, el número liberado NO se reutiliza (evita confundir dos artículos distintos)"
  );

  // ── Por qué hace falta el turno ────────────────────────────────────────────
  // Sin turno, dos creaciones simultáneas de la misma categoría leen la misma
  // lista y calculan el MISMO número.
  {
    const skus = ["SSD-000001"];
    const asignados: string[] = [];
    const crearSinTurno = async () => {
      const sku = generateUniqueSkuFromExistingSkus("SSD", skus);  // lee
      await dormir(5);                                             // viaje a Airtable
      skus.push(sku); asignados.push(sku);                         // escribe
    };
    await Promise.all([crearSinTurno(), crearSinTurno()]);
    assert(
      asignados[0] === asignados[1],
      `SIN turno, dos SSD simultáneas reciben el MISMO SKU (${asignados.join(" y ")}) — el bug`
    );
  }

  // Con turno, cada una recibe el suyo.
  {
    const skus = ["SSD-000001"];
    const asignados: string[] = [];
    const crearConTurno = () =>
      withLock("shipping-sku:SSD", async () => {
        const sku = generateUniqueSkuFromExistingSkus("SSD", skus);
        await dormir(5);
        skus.push(sku); asignados.push(sku);
      });
    await Promise.all([crearConTurno(), crearConTurno(), crearConTurno()]);
    assert(new Set(asignados).size === 3, `CON turno, las tres reciben SKU distintos: ${asignados.join(", ")}`);
    assert(asignados.includes("SSD-000004"), "…y la secuencia avanza correctamente hasta SSD-000004");
  }

  // El turno es por categoría: crear un SSD no debe frenar la creación de una RAM.
  {
    const orden: string[] = [];
    await Promise.all([
      withLock("shipping-sku:SSD", async () => { await dormir(20); orden.push("SSD"); }),
      withLock("shipping-sku:RAM", async () => { await dormir(1); orden.push("RAM"); }),
    ]);
    assert(orden[0] === "RAM", "Categorías distintas no hacen cola entre sí");
  }

  if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
  console.log("\n✅ skuUnico.test.ts — todos los asserts pasaron");
}

void main();
