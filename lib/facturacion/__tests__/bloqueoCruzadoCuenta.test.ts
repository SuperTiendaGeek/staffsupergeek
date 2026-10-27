/**
 * Auditoría Técnicos y Operaciones, punto 2 — parche provisional (27-oct-2026).
 * Una cuenta = la orden + todas sus operaciones: un solo documento, y se
 * cierran/reabren juntas. Casos reales: OP-2026-000102 ↔ OR000504 (REC-000073).
 * Ejecutar: npm test bloqueoCruzadoCuenta
 */
import { buscarDocumentoBloqueante, etiquetaDondeEstaElDocumento } from "../gancho/idempotencia";
import { cerrarOperacionesDeLaCuenta, reabrirOperacionesDeLaCuenta } from "../gancho/cierreCuenta";
import { armarRegistrosDeLaCuenta, operacionSeCierraConLaCuenta } from "@/lib/operaciones/cierre";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

type Rec = { id: string; fields: Record<string, unknown> };
type Base = Record<string, Record<string, Rec>>;

function fetchDoble(base: Base) {
  return (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const partes = u.pathname.split("/").map(decodeURIComponent); // ["", "v0", base, tabla, id?]
    const tabla = partes[3];
    const id = partes[4];
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if ((init?.method ?? "GET").toUpperCase() === "PATCH" && id) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { fields: Record<string, unknown> };
      const r = base[tabla]?.[id];
      if (!r) return json({ error: "NOT_FOUND" }, 404);
      Object.assign(r.fields, body.fields);
      return json(r);
    }
    if (id) {
      const r = base[tabla]?.[id];
      return r ? json(r) : json({ error: "NOT_FOUND" }, 404);
    }
    const formula = u.searchParams.get("filterByFormula") ?? "";
    const records = Object.values(base[tabla] ?? {}).filter((r) => formula.includes(r.id));
    return json({ records });
  }) as typeof fetch;
}

const OR504 = "recy2SibeD3qvULUw", OP102 = "recG3JAf4ukEhDYoU", REC73 = "rec2a4HbnQuIM7niH";
const T_OR = "Órdenes de Reparación", T_OP = "Operación Comercial", T_REC = "Recibos", T_FAC = "Facturas Electrónicas";

function baseReal(estadoRecibo = "Vigente", estadoOp = "Pedido"): Base {
  return {
    [T_OR]: { [OR504]: { id: OR504, fields: { "Operaciones Comerciales": [OP102, "recOPRECHAZADA00"], "Recibos": [REC73] } } },
    [T_OP]: {
      [OP102]: { id: OP102, fields: { "Orden de Reparación": [OR504], "Estado": estadoOp, "Código Operación": "OP-2026-000102" } },
      recOPRECHAZADA00: { id: "recOPRECHAZADA00", fields: { "Orden de Reparación": [OR504], "Estado": "Rechazado", "Código Operación": "OP-X" } },
    },
    [T_REC]: { [REC73]: { id: REC73, fields: { "Número": "REC-000073", Estado: estadoRecibo, Total: 145 } } },
    [T_FAC]: {},
  };
}

(async () => {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKEBASE0001";
  const original = global.fetch;

  // ── Reglas puras ──
  const regs = armarRegistrosDeLaCuenta({ origen: { tipo: "operacion", recordId: OP102 }, ordenId: OR504, operacionIdsDeLaOrden: [OP102, "recOTRA"] });
  assert(regs.map((r) => r.recordId).join(",") === `${OP102},${OR504},recOTRA`, "La cuenta empieza por el origen, luego la orden y sus pedidos, sin repetir");
  assert(operacionSeCierraConLaCuenta("Pedido") && operacionSeCierraConLaCuenta("Aprobado") && !operacionSeCierraConLaCuenta("Rechazado"), "Se cierran Pedido y Aprobado; una rechazada no");

  // ── Desde la operación: la orden ya tiene recibo → bloqueado (caso real) ──
  global.fetch = fetchDoble(baseReal());
  const b1 = await buscarDocumentoBloqueante({ tipo: "operacion", recordId: OP102 });
  assert(b1?.tipo === "recibo" && b1.recibo.numero === "REC-000073", "OP-2026-000102: NO se puede emitir otro documento, OR000504 ya tiene REC-000073");
  assert(!!b1 && etiquetaDondeEstaElDocumento(b1) === " (en la orden vinculada)", "El mensaje dice dónde está el documento");

  // ── Desde la orden: un pedido suyo tiene el documento → bloqueado ──
  const base2 = baseReal();
  base2[T_OR][OR504].fields["Recibos"] = [];
  base2[T_OP][OP102].fields["Recibos"] = [REC73];
  global.fetch = fetchDoble(base2);
  const b2 = await buscarDocumentoBloqueante({ tipo: "orden", recordId: OR504 });
  assert(b2?.tipo === "recibo" && etiquetaDondeEstaElDocumento(b2) === " (en la operación vinculada)", "Si el documento salió desde el pedido, la orden tampoco puede emitir otro");

  // ── Recibo anulado: la cuenta queda libre ──
  global.fetch = fetchDoble(baseReal("Anulado"));
  assert((await buscarDocumentoBloqueante({ tipo: "operacion", recordId: OP102 })) === null, "Con el recibo anulado se puede emitir el documento correcto");

  // ── Emitir desde la orden cierra sus pedidos (y no toca los rechazados) ──
  const base3 = baseReal("Vigente", "Pedido");
  global.fetch = fetchDoble(base3);
  const cierre = await cerrarOperacionesDeLaCuenta({ tipo: "orden", recordId: OR504 });
  assert(base3[T_OP][OP102].fields["Estado"] === "Entregado", "Al emitir desde OR000504, OP-2026-000102 pasa sola a Entregado (ya no queda colgada)");
  assert(base3[T_OP].recOPRECHAZADA00.fields["Estado"] === "Rechazado", "Una operación rechazada de la misma cuenta no cambia");
  assert(cierre.movidas.length === 1 && cierre.errores.length === 0, "Informa qué cerró");

  // ── Anular reabre lo que se cerró ──
  const reapertura = await reabrirOperacionesDeLaCuenta({ tipo: "orden", recordId: OR504 });
  assert(base3[T_OP][OP102].fields["Estado"] === "Pedido", "Al anular el documento de la orden, el pedido vuelve a Pedido");
  assert(reapertura.movidas.length === 1, "Solo reabre lo que estaba Entregado");

  global.fetch = original;
  if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
  console.log("\nTodas las pruebas pasaron.");
})();
