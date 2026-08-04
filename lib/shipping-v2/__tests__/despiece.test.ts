/**
 * Despiece — reglas y reparto del costo del equipo entre sus piezas.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/shipping-v2/__tests__/despiece.test.ts
 *
 * Caso guía: una laptop que costó $214 (con flete y arancel) se desarma en un
 * teclado que se venderá a $20, dos memorias RAM a $25 cada una y un disco a
 * $30. El costo tiene que repartirse entre las piezas: si nacen en cero, cada
 * venta parecerá 100% de ganancia y los reportes de utilidad mentirán.
 */

import {
  calcularCierreDespiece, evaluarSiSePuedeDespiezar, puedeCancelarseDespiece, repartirCostoEntrePiezas,
} from "../despiece";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const suma = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

function main(): void {
  // ── Quién se puede despiezar ───────────────────────────────────────────────
  const laptop = { estadoItem: "Disponible", cantidad: 1, cantidadReservada: 0 };
  assert(evaluarSiSePuedeDespiezar(laptop).puede, "Un equipo disponible y libre se puede despiezar");
  assert(
    evaluarSiSePuedeDespiezar({ ...laptop, estadoItem: "Con novedad" }).puede,
    "Un equipo que llegó dañado también: es el candidato natural"
  );

  const enTransito = evaluarSiSePuedeDespiezar({ ...laptop, estadoItem: "En tránsito" });
  assert(!enTransito.puede, "Un equipo que todavía no llega NO se puede despiezar");
  assert(
    !enTransito.puede && enTransito.mensaje.includes("En tránsito"),
    `El mensaje dice en qué estado está (vino: ${!enTransito.puede ? enTransito.mensaje : ""})`
  );

  const vendido = evaluarSiSePuedeDespiezar({ ...laptop, estadoItem: "Vendido" });
  assert(!vendido.puede, "Un equipo ya vendido no se puede desarmar");

  const facturado = evaluarSiSePuedeDespiezar({ ...laptop, tieneFacturaORecibo: true });
  assert(!facturado.puede && facturado.motivo === "ya-facturado", "Con factura o recibo emitidos, tampoco");

  const apartado = evaluarSiSePuedeDespiezar({ estadoItem: "Disponible", cantidad: 1, cantidadReservada: 1 });
  assert(!apartado.puede && apartado.motivo === "unidades-comprometidas",
    "Un equipo apartado para un cliente no se puede desarmar sin liberarlo antes");
  assert(!apartado.puede && apartado.mensaje.includes("Libéralas"),
    "…y el mensaje dice qué hacer para destrabarlo");

  // Con varias unidades, basta que quede UNA libre.
  assert(
    evaluarSiSePuedeDespiezar({ estadoItem: "Disponible", cantidad: 3, cantidadReservada: 1 }).puede,
    "Con 3 unidades y 1 apartada, se puede despiezar una de las libres"
  );

  assert(!evaluarSiSePuedeDespiezar({ ...laptop, estadoDespiece: "Despiece completo" }).puede,
    "Un equipo ya despiezado del todo no se vuelve a despiezar");

  // ── El reparto del costo ───────────────────────────────────────────────────
  const piezas = [
    { id: "teclado", precioVenta: 20, cantidad: 1 },
    { id: "ram", precioVenta: 25, cantidad: 2 },
    { id: "disco", precioVenta: 30, cantidad: 1 },
  ];
  const r = repartirCostoEntrePiezas(214, piezas);
  const asignados = r.piezas.map((p) => p.costoAsignado);
  assert(r.criterio === "proporcional-al-precio", "Se reparte proporcional al precio de venta");
  assert(suma(asignados) === 214, `La suma cuadra EXACTA con el costo del equipo: $${suma(asignados)} de $214`);

  const porId = new Map(r.piezas.map((p) => [p.id, p.costoAsignado]));
  // Pesos: teclado 20, ram 25*2=50, disco 30 → total 100
  assert(porId.get("teclado") === 42.8, `El teclado (20 de 100) carga $42,80 (vino ${porId.get("teclado")})`);
  assert(porId.get("ram") === 107, `Las 2 RAM (50 de 100) cargan $107,00 juntas (vino ${porId.get("ram")})`);
  assert(porId.get("disco")! > 64 && porId.get("disco")! < 65, `El disco carga ~$64,20 (vino ${porId.get("disco")})`);

  // La cantidad pesa: 2 RAM valen el doble que 1 al repartir.
  const rUna = repartirCostoEntrePiezas(214, [
    { id: "teclado", precioVenta: 20, cantidad: 1 },
    { id: "ram", precioVenta: 25, cantidad: 1 },
    { id: "disco", precioVenta: 30, cantidad: 1 },
  ]);
  assert(
    rUna.piezas.find((p) => p.id === "ram")!.costoAsignado < porId.get("ram")!,
    "Una sola RAM carga menos costo que dos: la cantidad cuenta"
  );

  // ── Piezas sin precio ──────────────────────────────────────────────────────
  const conHueco = repartirCostoEntrePiezas(100, [
    { id: "pantalla", precioVenta: 60, cantidad: 1 },
    { id: "carcasa", precioVenta: null, cantidad: 1 },
  ]);
  assert(conHueco.piezasSinPrecio.includes("carcasa"), "Se avisa qué piezas quedaron sin precio");
  assert(
    conHueco.piezas.find((p) => p.id === "carcasa")!.costoAsignado === 0,
    "Una pieza sin precio no recibe costo: no se le inventa un valor"
  );
  assert(
    conHueco.piezas.find((p) => p.id === "pantalla")!.costoAsignado === 100,
    "Todo el costo va a la única pieza con precio, hasta que se le ponga precio a la otra"
  );

  // Ninguna tiene precio todavía → partes iguales, para no dejar el costo colgando.
  const sinPrecios = repartirCostoEntrePiezas(90, [
    { id: "a", cantidad: 1 }, { id: "b", cantidad: 1 }, { id: "c", cantidad: 1 },
  ]);
  assert(sinPrecios.criterio === "partes-iguales", "Sin ningún precio aún, se reparte en partes iguales");
  assert(suma(sinPrecios.piezas.map((p) => p.costoAsignado)) === 90, "…y también cuadra exacto");

  // ── Redondeo: el caso que descuadra si no se cuida ─────────────────────────
  const impar = repartirCostoEntrePiezas(100, [
    { id: "a", precioVenta: 10, cantidad: 1 }, { id: "b", precioVenta: 10, cantidad: 1 }, { id: "c", precioVenta: 10, cantidad: 1 },
  ]);
  assert(
    suma(impar.piezas.map((p) => p.costoAsignado)) === 100,
    `$100 entre 3 cuadra exacto (la última absorbe el centavo): ${impar.piezas.map((p) => p.costoAsignado).join(" + ")}`
  );

  assert(repartirCostoEntrePiezas(0, piezas).criterio === "sin-reparto", "Un equipo sin costo no reparte nada");
  assert(repartirCostoEntrePiezas(214, []).sinRepartir === 214, "Sin piezas todavía, todo el costo queda sin repartir");

  // ── Cierre del despiece ────────────────────────────────────────────────────
  const cierreUnica = calcularCierreDespiece({ cantidad: 1 }, true);
  assert(cierreUnica.cantidadPadre === 0, "Despiezar la única unidad deja el equipo en 0: ya no existe");
  assert(cierreUnica.estadoItemPadre === "Desarmado completamente", "…y queda como desarmado completamente");
  assert(cierreUnica.disponibleVenta === false, "…y fuera de la venta");

  const cierreMulti = calcularCierreDespiece({ cantidad: 3 }, true);
  assert(cierreMulti.cantidadPadre === 2, "Con 3 unidades, despiezar una deja 2");
  assert(cierreMulti.estadoItemPadre === "Desarmado parcialmente", "…y el registro sigue vivo como parcialmente desarmado");

  assert(
    calcularCierreDespiece({ cantidad: 1 }, false).estadoDespiecePadre === "Despiece parcial",
    "Si no se aprovechó todo, queda rotulado como despiece parcial"
  );

  // ── Deshacer ───────────────────────────────────────────────────────────────
  assert(puedeCancelarseDespiece([{ estadoItem: "En revisión" }, { estadoItem: "Disponible" }]).puede,
    "Se puede cancelar mientras ninguna pieza se haya vendido");
  const conVenta = puedeCancelarseDespiece([{ estadoItem: "Vendido" }, { estadoItem: "Disponible" }]);
  assert(!conVenta.puede, "Si ya se vendió una pieza, no se puede deshacer");
  assert(conVenta.mensaje!.includes("una pieza"), `El mensaje explica por qué (vino: ${conVenta.mensaje})`);
  assert(!puedeCancelarseDespiece([{ estadoItem: "Disponible", tieneFacturaORecibo: true }]).puede,
    "Una pieza ya facturada también impide deshacer");

  if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
  console.log("\n✅ despiece.test.ts — todos los asserts pasaron");
}

main();
