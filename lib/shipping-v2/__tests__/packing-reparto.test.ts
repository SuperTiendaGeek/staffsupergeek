// Reparto de flete/arancel/otros de un packing entre sus registros.
// Caso real que motivó el módulo: PK-20260928-97012 (ver packing-reparto.ts).
import {
  calcularRepartoPacking,
  repartirEnCentavos,
  unidadesParaReparto,
  type ItemParaReparto,
} from "../packing-reparto";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const cent = (n: number) => Math.round(n * 100);
function assertMoney(actual: number, expected: number, msg: string) {
  assert(cent(actual) === cent(expected), `${msg} (${actual} === ${expected})`);
}

// ─── Caso real PK-20260928-97012 ─────────────────────────────────────────────

const otr187: ItemParaReparto = { id: "recvPXv0mzJArNmLr", sku: "OTR-000187", cantidad: 8, costoProveedor: 10 };
const rep41: ItemParaReparto = { id: "recaXilchCYRPAaf0", sku: "REP-000041", cantidad: 1, costoProveedor: 35.53 };

const real = calcularRepartoPacking(
  { estado: "En tránsito", regla: "Por costo del item", flete: 55.8, arancel: 0, otrosCostos: 0 },
  [otr187, rep41]
);
assert(real.ok, "PK-20260928-97012 se puede repartir");
if (real.ok) {
  const [a, b] = real.registros;
  assertMoney(a.subtotalProveedor, 80, "OTR-000187: subtotal proveedor = 8 × 10,00");
  assertMoney(real.totales.subtotalProveedor, 115.53, "Subtotal del packing = 115,53 (no 45,53)");
  assertMoney(a.fleteRegistro, 38.64, "OTR-000187 recibe 38,64 de flete (registro)");
  assertMoney(b.fleteRegistro, 17.16, "REP-000041 recibe 17,16 de flete (registro)");
  assertMoney(real.totales.flete, 55.8, "La suma repartida cuadra exacto con el flete 55,80");
  assertMoney(a.fletePorUnidad, 4.83, "OTR-000187: flete por unidad = 38,64 ÷ 8 = 4,83");
  assertMoney(a.totalUnidad, 14.83, "OTR-000187: total unidad = 10,00 + 4,83");
  assertMoney(b.totalUnidad, 52.69, "REP-000041: total unidad = 35,53 + 17,16");
  assert(a.unidades === 8 && b.unidades === 1, "Se usan las unidades de cada registro");
  assertMoney(
    a.fletePorUnidad * a.unidades + b.fletePorUnidad * b.unidades,
    55.8,
    "Flete por unidad × unidades reconstruye el flete pagado (antes se cargaban 141,62)"
  );
}

// ─── Cuadre al centavo ───────────────────────────────────────────────────────

const tercios = repartirEnCentavos(10, [1, 1, 1]);
assertMoney(tercios.reduce((s, x) => s + x, 0), 10, "10,00 entre 3 partes iguales suma 10,00");
assert(tercios.join("|") === "3.34|3.33|3.33", "El centavo sobrante va a la primera parte en empate (3,34/3,33/3,33)");

const raro = repartirEnCentavos(99.99, [7.13, 2.2, 0.01, 55.555, 13]);
assertMoney(raro.reduce((s, x) => s + x, 0), 99.99, "Pesos arbitrarios: la suma sigue siendo exacta");

const conCero = repartirEnCentavos(5, [0, 3, 1]);
assert(conCero[0] === 0, "Un peso 0 (regalo) nunca recibe centavos del ajuste");
assertMoney(conCero.reduce((s, x) => s + x, 0), 5, "Con un peso 0 la suma sigue cuadrando");

assert(repartirEnCentavos(12, [0, 0]).every((x) => x === 0), "Sin pesos no se reparte nada");
assert(repartirEnCentavos(0, [1, 2]).every((x) => x === 0), "Flete 0 reparte 0");

// ─── Regla "Por cantidad": por unidades, no por registros ────────────────────

const porCantidad = calcularRepartoPacking(
  { estado: "En Proceso", regla: "Por cantidad", flete: 90 },
  [otr187, rep41]
);
assert(porCantidad.ok, "Por cantidad se puede repartir");
if (porCantidad.ok) {
  assertMoney(porCantidad.registros[0].fleteRegistro, 80, "Por cantidad: 8 de 9 unidades reciben 80,00");
  assertMoney(porCantidad.registros[1].fleteRegistro, 10, "Por cantidad: 1 de 9 unidades recibe 10,00");
  assertMoney(porCantidad.registros[0].fletePorUnidad, 10, "Por cantidad: todas las unidades cargan lo mismo");
}

// ─── Arancel y otros siguen la misma regla y suman al total unidad ───────────

const completo = calcularRepartoPacking(
  { estado: "Cerrado", regla: "Por costo del item", flete: 55.8, arancel: 11.55, otrosCostos: 3 },
  [otr187, rep41]
);
if (completo.ok) {
  assertMoney(completo.totales.arancel, 11.55, "El arancel repartido cuadra exacto");
  assertMoney(completo.totales.otros, 3, "Otros costos repartidos cuadran exacto");
  const a = completo.registros[0];
  assertMoney(
    a.totalUnidad,
    a.costoProveedorUnidad + a.fleteRegistro / 8 + a.arancelRegistro / 8 + a.otrosRegistro / 8,
    "Total unidad = costo + (flete + arancel + otros del registro) ÷ unidades"
  );
} else {
  assert(false, "Reparto completo debía funcionar");
}

// ─── Regalos ─────────────────────────────────────────────────────────────────

const conRegalo = calcularRepartoPacking(
  { estado: "En tránsito", regla: "Por costo del item", flete: 20 },
  [otr187, { id: "recREGALO", sku: "REGALO-1", cantidad: 3, costoProveedor: null, esRegalo: true }]
);
if (conRegalo.ok) {
  assertMoney(conRegalo.registros[1].fleteRegistro, 0, "Por costo: un regalo no absorbe flete");
  assertMoney(conRegalo.registros[0].fleteRegistro, 20, "Por costo: el flete va entero a lo que tiene costo");
}

// ─── Reglas que no reparten ──────────────────────────────────────────────────

const manual = calcularRepartoPacking({ estado: "En Proceso", regla: "Manual", flete: 30 }, [otr187]);
assert(manual.ok && manual.registros[0].fleteRegistro === 0, "Manual deja el flete en 0 (como antes)");
assert(manual.ok && manual.advertencias.length === 1, "…pero lo advierte");

const sinCostos = calcularRepartoPacking(
  { estado: "En Proceso", regla: "Por costo del item", flete: 30 },
  [{ id: "recA", sku: "A", cantidad: 2, costoProveedor: 0 }]
);
assert(sinCostos.ok && sinCostos.advertencias.length === 1, "Por costo sin ningún costo proveedor avisa en vez de callar");

// ─── Unidades: Cantidad es stock actual ──────────────────────────────────────

const vendido: ItemParaReparto = { id: "recV", sku: "LAP-1", cantidad: 3, unidadesEnPacking: 8, costoProveedor: 10 };
assert(unidadesParaReparto(vendido, false) === 3, "Packing no recibido: manda la Cantidad actual (aún se puede corregir)");
assert(unidadesParaReparto(vendido, true) === 8, "Packing recibido: manda lo guardado, no el stock que ya bajó por ventas");

const recibidoSinGuardar = calcularRepartoPacking(
  { estado: "Recibido", regla: "Por costo del item", flete: 10 },
  [{ id: "recX", sku: "OLD-1", cantidad: 0, costoProveedor: 50 }]
);
assert(!recibidoSinGuardar.ok, "Packing recibido sin unidades guardadas NO se recalcula (no se inventan unidades)");

const recibidoGuardado = calcularRepartoPacking(
  { estado: "En revisión", regla: "Por costo del item", flete: 55.8 },
  [{ ...otr187, cantidad: 2, unidadesEnPacking: 8 }, { ...rep41, cantidad: 0, unidadesEnPacking: 1 }]
);
assert(recibidoGuardado.ok, "Packing recibido con unidades guardadas sí se recalcula");
if (recibidoGuardado.ok) {
  assertMoney(recibidoGuardado.registros[0].fleteRegistro, 38.64, "…y vender unidades no mueve el flete (38,64 sigue igual)");
}

assert(
  !calcularRepartoPacking({ estado: "En Proceso", regla: "Por costo del item", flete: 5 }, [{ id: "recQ", sku: "Q", cantidad: 0, costoProveedor: 1 }]).ok,
  "Packing abierto con Cantidad 0 no se reparte a ciegas"
);
assert(!calcularRepartoPacking({ estado: "Cancelado", regla: "Por costo del item", flete: 5 }, [otr187]).ok, "Packing cancelado no se reparte");

let lanzo = false;
try {
  calcularRepartoPacking({ estado: "En Proceso", regla: "Por costo del item", flete: -1 }, [otr187]);
} catch {
  lanzo = true;
}
assert(lanzo, "Un flete negativo es un error, no un reparto");

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}

console.log("Reparto de costos de packing: OK");
