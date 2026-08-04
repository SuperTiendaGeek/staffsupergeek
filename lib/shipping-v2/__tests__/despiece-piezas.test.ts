/**
 * Despiece — con qué valores nace una pieza y cómo se recalcula el reparto.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/shipping-v2/__tests__/despiece-piezas.test.ts
 */

import {
  calcularRepartoParaPiezas, camposVinculoPieza, construirInputPiezaDespiece, type PiezaDespiece,
} from "../despiece-airtable";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const padre = { proveedorCompraId: "recPROV1", tipoOperacion: "Compra a proveedor" };

function pieza(id: string, precio: number | null, cantidad = 1, costoAsignado = 0): PiezaDespiece {
  return {
    id, sku: id, nombre: id, categoria: "RAM", cantidad, condicion: "No probado",
    precioVenta: precio, costoAsignado, estadoItem: "En revisión", observaciones: "",
    numeroSerie: "", tieneFacturaORecibo: false,
  };
}

function main(): void {
  // ── Con qué nace una pieza ─────────────────────────────────────────────────
  const p = construirInputPiezaDespiece(
    { nombre: "Teclado retroiluminado", categoria: "Teclado", cantidad: 1, precioVenta: 20 },
    padre
  );
  assert(p.estado === "En revisión", "Nace 'En revisión', no disponible");
  assert(p.disponibleVenta === false, "Nace FUERA de la venta: debe pasar por 'Listo para vender'");
  assert(p.condicion === "No probado", "Nace como 'No probado': es la verdad hasta que alguien la pruebe");
  assert(p.tipoItem === "Parte", "Se marca como parte, no como equipo completo");
  assert(p.proveedorId === "recPROV1", "Hereda el proveedor del equipo padre: el historial de compra sigue cuadrando");
  assert(p.requierePago === false, "NO genera un pago nuevo: la pieza salió de algo ya pagado");
  assert(p.requierePacking === false, "Ni packing: ya está en la tienda");
  assert(p.costoProveedor === null, "No lleva costo de compra; su costo sale del reparto del equipo");
  assert(p.reservado === false, "Nace libre");

  const conCondicion = construirInputPiezaDespiece(
    { nombre: "Disco", categoria: "SSD", cantidad: 1, condicion: "Dañado" }, padre
  );
  assert(conCondicion.condicion === "Dañado", "Si se indica la condición, se respeta");
  assert(conCondicion.precioVenta === null, "Sin precio queda en null: 'sin precio asignado'");

  // ── Validaciones ───────────────────────────────────────────────────────────
  let err = "";
  try { construirInputPiezaDespiece({ nombre: "  ", categoria: "RAM", cantidad: 1 }, padre); }
  catch (e) { err = e instanceof Error ? e.message : ""; }
  assert(err.includes("nombre"), "Una pieza sin nombre se rechaza");

  err = "";
  try { construirInputPiezaDespiece({ nombre: "Algo", categoria: "", cantidad: 1 }, padre); }
  catch (e) { err = e instanceof Error ? e.message : ""; }
  assert(err.includes("categoría"), "Sin categoría no se puede asignar SKU, así que se rechaza");

  const cantidadRara = construirInputPiezaDespiece({ nombre: "RAM", categoria: "RAM", cantidad: 0 }, padre);
  assert(cantidadRara.cantidad === 1, "Una cantidad inválida cae a 1 en vez de crear una pieza fantasma");

  // ── El vínculo con el padre ────────────────────────────────────────────────
  const v = camposVinculoPieza("recPADRE1");
  assert(v["Item padre"] === "recPADRE1", "La pieza queda vinculada a su equipo");
  assert(v["Es parte recuperada"] === true, "…y marcada como recuperada de un despiece, no comprada");

  // ── Recálculo del reparto ──────────────────────────────────────────────────
  // Agregar una pieza cambia lo que cargan las demás: el reparto es sobre el
  // conjunto, no pieza por pieza.
  const dos = calcularRepartoParaPiezas(100, [pieza("a", 50), pieza("b", 50)]);
  assert(dos.piezas.every((x) => x.costoAsignado === 50), "Dos piezas de igual precio cargan $50 cada una");

  const tres = calcularRepartoParaPiezas(100, [pieza("a", 50, 1, 50), pieza("b", 50, 1, 50), pieza("c", 100)]);
  const porId = new Map(tres.piezas.map((x) => [x.id, x.costoAsignado]));
  assert(porId.get("c") === 50, "Al agregar una tercera pieza más cara, ella carga la mitad del costo");
  assert(porId.get("a") === 25, "…y las anteriores bajan de $50 a $25");
  assert(tres.aEscribir.length === 3, "Las tres necesitan actualizarse en Airtable");

  // Sin cambios reales, no se escribe nada.
  const igual = calcularRepartoParaPiezas(100, [pieza("a", 50, 1, 50), pieza("b", 50, 1, 50)]);
  assert(igual.aEscribir.length === 0, "Si el reparto no cambió, no se escribe en Airtable sin necesidad");

  // Una pieza sin precio se reporta pero no recibe costo.
  const conHueco = calcularRepartoParaPiezas(100, [pieza("a", 60), pieza("b", null)]);
  assert(conHueco.piezasSinPrecio.includes("b"), "Se avisa qué pieza quedó sin precio");
  assert(conHueco.piezas.find((x) => x.id === "b")!.costoAsignado === 0, "…y no carga costo");

  if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
  console.log("\n✅ despiece-piezas.test.ts — todos los asserts pasaron");
}

main();
