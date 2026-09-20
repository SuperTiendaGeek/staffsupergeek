/**
 * Efectos de inventario de una reserva: apartar y liberar el ítem.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/reservas.apartarItem.test.ts
 *
 * Contexto: los tres efectos de una reserva (apartar el ítem, registrar el
 * abono y crear su movimiento financiero) estaban detrás de
 * `if (ambiente !== "2") return`, heredado del guard de facturación
 * electrónica. Con SRI_AMBIENTE=1 la reserva se creaba con su PDF pero el ítem
 * nunca se bloqueaba: en producción quedaron $110 fuera de /finanzas y una
 * misma unidad (DES-000005) con dos reservas activas de dos clientes.
 *
 * Aquí se cubre que:
 *   · apartar funciona sin importar el ambiente,
 *   · apartar algo ya apartado FALLA (barrera dura contra la doble reserva),
 *   · liberar no resucita a la venta un ítem que siguió otro camino.
 */

import { apartarItemParaReserva, liberarItem } from "../reservas/efectos";
import { MENSAJE_BLOQUEO_COMERCIAL } from "@/lib/shipping-v2/item-comercial";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const fetchOriginal = global.fetch;

type Campos = Record<string, unknown>;

/** Estado en memoria de la tabla Shipping Items para este test. */
let items: Record<string, Campos> = {};
let patches: Array<{ id: string; fields: Campos }> = [];

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const decoded = decodeURIComponent(url);

  if (init?.method === "PATCH") {
    const id = decoded.split("/").pop() ?? "";
    const body = JSON.parse(String(init.body ?? "{}")) as { fields: Campos };
    patches.push({ id, fields: body.fields });
    items[id] = { ...(items[id] ?? {}), ...body.fields };
    return Promise.resolve(json({ id, fields: items[id] }));
  }

  // Lectura por RECORD_ID() (fetchRecordsByIds)
  const encontrados = Object.keys(items)
    .filter((id) => decoded.includes(id))
    .map((id) => ({ id, fields: items[id] }));
  return Promise.resolve(json({ records: encontrados }));
}

function prepararItem(id: string, fields: Campos) {
  items = { [id]: fields };
  patches = [];
}

async function esperaError(fn: () => Promise<unknown>, fragmento: string, caso: string) {
  try {
    await fn();
    assert(false, `${caso} → debía fallar con "${fragmento}" pero no falló`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(msg.includes(fragmento), `${caso} → falla con "${fragmento}" (vino: "${msg}")`);
  }
}

async function main(): Promise<void> {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKE0000000000";
  // A propósito en PRUEBAS: los efectos ya no deben depender de esto.
  process.env.SRI_AMBIENTE = "1";
  global.fetch = fakeFetch as unknown as typeof global.fetch;

  try {
    // ── Apartar: camino feliz, con el SRI en pruebas ──────────────────────────
    prepararItem("recITEM1", { "Estado Item": "Disponible", "Disponible para venta": true, Reservado: false, Cantidad: 1, "Cantidad Reservada": 0 });
    await apartarItemParaReserva("recITEM1");
    assert(
      items["recITEM1"]["Estado Item"] === "Reservado",
      "FIX: con SRI_AMBIENTE=1 el ítem SÍ se aparta (antes era un no-op silencioso)"
    );
    assert(items["recITEM1"]["Disponible para venta"] === false, "El ítem sale de la venta");
    assert(items["recITEM1"]["Reservado"] === true, "Queda marcado como reservado");

    // ── Apartar dos veces: la doble reserva ───────────────────────────────────
    prepararItem("recITEM2", { "Estado Item": "Reservado", "Disponible para venta": false, Reservado: true, Cantidad: 1, "Cantidad Reservada": 1 });
    await esperaError(
      () => apartarItemParaReserva("recITEM2"),
      "ya están comprometidas",
      "FIX: apartar un ítem ya apartado (caso DES-000005 con RES-000001 y RES-000002)"
    );
    assert(patches.length === 0, "No se escribió nada al rechazar la segunda reserva");

    // Caso mixto: alguien limpió el estado pero quedó la marca de reservado.
    prepararItem("recITEM3", { "Estado Item": "En revisión", "Disponible para venta": true, Reservado: true, Cantidad: 1, "Cantidad Reservada": 1 });
    await esperaError(() => apartarItemParaReserva("recITEM3"), "ya están comprometidas", "Marca de reservado sin estado Reservado");

    // ── Apartar algo que no está a la venta ───────────────────────────────────
    // El texto sale de MENSAJE_BLOQUEO_COMERCIAL a propósito: cuando cambió el
    // mensaje, este assert se quedó comparando contra el viejo ("no se puede
    // apartar") y la suite empezó a fallar por una diferencia de redacción,
    // no de comportamiento. Atado a la constante, eso no vuelve a pasar.
    prepararItem("recITEM4", { "Estado Item": "Vendido", "Disponible para venta": false, Reservado: false, Cantidad: 1, "Cantidad Reservada": 0 });
    await esperaError(
      () => apartarItemParaReserva("recITEM4"),
      MENSAJE_BLOQUEO_COMERCIAL["estado-terminal"],
      "Ítem ya vendido"
    );

    // ── Apartar algo que todavía viene en camino: SÍ se puede ─────────────────
    // Este test esperaba lo contrario, de cuando la etapa logística bloqueaba
    // el apartado. Hoy item-comercial.ts separa a propósito la ETAPA (en
    // tránsito, en packing) de la SALIDA del inventario (vendido, migrado…), y
    // solo la segunda bloquea. Es lo que necesita el negocio: un cliente
    // aparta con abono un artículo que todavía está llegando de USA. Ojo con
    // "Disponible para venta": está en false y aun así se aparta — esa bandera
    // no es guarda, se apaga sola cuando se agotan las unidades libres.
    prepararItem("recITEM5", { "Estado Item": "En tránsito", "Disponible para venta": false, Reservado: false, Cantidad: 1, "Cantidad Reservada": 0 });
    await apartarItemParaReserva("recITEM5");
    assert(items["recITEM5"]["Reservado"] === true, "Ítem en tránsito SÍ se puede apartar (el cliente lo encarga antes de que llegue)");
    assert(items["recITEM5"]["Cantidad Reservada"] === 1, "El apartado del ítem en tránsito compromete la unidad");

    items = {};
    await esperaError(() => apartarItemParaReserva("recNOEXISTE"), "no existe", "Ítem inexistente");

    // ── Liberar ───────────────────────────────────────────────────────────────
    prepararItem("recITEM6", { "Estado Item": "Reservado", "Disponible para venta": false, Reservado: true, Cantidad: 1, "Cantidad Reservada": 1 });
    await liberarItem("recITEM6");
    assert(items["recITEM6"]["Estado Item"] === "Disponible", "Liberar devuelve el ítem a Disponible");
    assert(items["recITEM6"]["Disponible para venta"] === true, "Liberar lo devuelve a la venta");
    assert(items["recITEM6"]["Reservado"] === false, "Liberar quita la marca de reservado");

    prepararItem("recITEM7", { "Estado Item": "Disponible", "Disponible para venta": true, Reservado: false, Cantidad: 1, "Cantidad Reservada": 0 });
    await liberarItem("recITEM7");
    assert(patches.length === 0, "Liberar algo ya disponible no escribe nada (idempotente)");

    // El ítem siguió otro camino mientras estaba reservado.
    prepararItem("recITEM8", { "Estado Item": "Vendido", "Disponible para venta": false, Reservado: true, Cantidad: 1, "Cantidad Reservada": 1 });
    await liberarItem("recITEM8");
    assert(
      items["recITEM8"]["Estado Item"] === "Vendido",
      "FIX: liberar NO resucita a la venta un ítem que ya se vendió"
    );
    assert(items["recITEM8"]["Reservado"] === false, "…pero sí le quita la marca de reservado");
    assert(
      items["recITEM8"]["Disponible para venta"] === false,
      "…y no lo vuelve a poner disponible para venta"
    );

    prepararItem("recITEM9", { "Estado Item": "Con novedad", "Disponible para venta": false, Reservado: true, Cantidad: 1, "Cantidad Reservada": 1 });
    await liberarItem("recITEM9");
    assert(items["recITEM9"]["Estado Item"] === "Con novedad", "Tampoco resucita un ítem con novedad");
  } finally {
    global.fetch = fetchOriginal;
  }

  if (fallos > 0) {
    console.error(`\n${fallos} assert(s) fallaron.`);
    process.exit(1);
  }
  console.log("\n✅ reservas.apartarItem.test.ts — todos los asserts pasaron");
}

void main();
