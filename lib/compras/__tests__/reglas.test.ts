/**
 * Test — solicitudes de compra (auditoría ops, Fase 2).
 * Ejecutar: npm test compras
 */
import {
  validarCategoriaDeCompra,
  claveDeLinea,
  coberturaAnticipo,
  diasEntre,
  puedeComprar,
  resumenRepuestos,
  situacionDeSolicitud,
  solicitudesParecidas,
  validarAsignarExistente,
  validarCancelar,
  validarComprar,
  type SolicitudBase,
} from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const sol = (o: Partial<SolicitudBase>): SolicitudBase => ({
  id: "s", codigo: "SOL-000001", descripcion: "Repuesto", estado: "Por comprar", cantidad: 1, precioCliente: 40,
  fechaAprobacion: "2026-10-29T22:00:00Z", ...o,
});

// ── Anticipo (regla del dueño, 2-nov) ───────────────────────────────────────
{
  const c = coberturaAnticipo([sol({ id: "teclado" })], 0);
  assert(c.get("teclado")?.tipo === "sin_pago", "OR000525: el cliente no ha pagado el teclado → sin pago");
  const s = situacionDeSolicitud({ solicitud: sol({}), articulo: null, cobertura: c.get("teclado"), hoy: "2026-11-02" });
  assert(s.clave === "esperando_pago" && s.texto === "Esperando pago del cliente", "chip: Esperando pago del cliente");
}
{
  const c = coberturaAnticipo([
    sol({ id: "bisagras", precioCliente: 30, fechaAprobacion: "2026-10-08T10:00:00Z" }),
    sol({ id: "tapa", precioCliente: 15, fechaAprobacion: "2026-10-08T10:00:00Z" }),
    sol({ id: "cover", precioCliente: 60, fechaAprobacion: "2026-10-08T10:00:01Z" }),
  ], 50);
  assert(c.get("bisagras")?.tipo === "cubierta" && c.get("tapa")?.tipo === "cubierta", "con $50: bisagras $30 y tapa $15 cubiertas");
  const cover = c.get("cover");
  assert(cover?.tipo === "parcial" && cover.pagado === 5 && cover.precio === 60, "el cover queda con anticipo parcial $5 de $60");
  const s = situacionDeSolicitud({ solicitud: sol({}), articulo: null, cobertura: cover, hoy: "2026-11-02" });
  assert(s.texto === "Anticipo parcial $5.00 de $60.00", "chip: Anticipo parcial $5.00 de $60.00");
}
{
  const c = coberturaAnticipo([sol({ id: "a", estado: "Cancelada", precioCliente: 100 }), sol({ id: "b", precioCliente: 20, cantidad: 2 })], 40);
  assert(!c.has("a") && c.get("b")?.tipo === "cubierta", "lo cancelado no consume el anticipo; ×2 = $40 cubierto con $40");
}

// ── El chip ─────────────────────────────────────────────────────────────────
assert(diasEntre("2026-10-29T22:00:00Z", "2026-11-02") === 4, "29-oct → 2-nov = 4 días");
{
  const s = situacionDeSolicitud({ solicitud: sol({ fechaAprobacion: "2026-11-01T15:00:00Z" }), articulo: null, cobertura: { tipo: "cubierta" }, hoy: "2026-11-02" });
  assert(s.clave === "falta_pedir" && s.texto === "Falta pedir · 1 día" && s.tono === "aviso", "pagado y sin comprar: Falta pedir · 1 día (ámbar)");
  const rojo = situacionDeSolicitud({ solicitud: sol({ fechaAprobacion: "2026-10-29T15:00:00Z" }), articulo: null, cobertura: { tipo: "cubierta" }, hoy: "2026-11-02" });
  assert(rojo.tono === "peligro", "4 días sin comprar: rojo");
}
{
  const art = { id: "i", sku: "REP-000136", recibido: false, estado: "En tránsito", faltaPagarProveedor: 86.34 };
  assert(situacionDeSolicitud({ solicitud: sol({ estado: "Comprada" }), articulo: art, cobertura: undefined, hoy: "2026-11-02" }).clave === "falta_pagar_proveedor", "comprado sin pagar al proveedor");
  const pagado = { ...art, faltaPagarProveedor: 0, rastreo: "1Z999" };
  const s = situacionDeSolicitud({ solicitud: sol({ estado: "Comprada" }), articulo: pagado, cobertura: undefined, hoy: "2026-11-02" });
  assert(s.clave === "en_camino" && s.texto === "En camino · 1Z999", "pagado y sin llegar: En camino con su rastreo");
  const llego = situacionDeSolicitud({ solicitud: sol({ estado: "Comprada" }), articulo: { ...pagado, recibido: true, sku: "PAN-000001" }, cobertura: undefined, hoy: "2026-11-02" });
  assert(llego.clave === "llego" && llego.texto === "Llegó ✓ PAN-000001", "Recepción lo marcó Recibido: Llegó ✓");
  const vendido = situacionDeSolicitud({ solicitud: sol({ estado: "Comprada" }), articulo: { ...pagado, recibido: true, estado: "Vendido" }, cobertura: undefined, hoy: "2026-11-02" });
  assert(vendido.clave === "entregado", "vendido con su documento: Instalado / entregado");
}
assert(situacionDeSolicitud({ solicitud: sol({ estado: "Cancelada", motivo: "el cliente se retractó" }), articulo: null, cobertura: undefined, hoy: "2026-11-02" }).texto === "Cancelado · el cliente se retractó", "cancelado con motivo");

// ── Resumen del tablero ─────────────────────────────────────────────────────
{
  const llego = { clave: "llego" as const, texto: "", tono: "exito" as const, dias: 0 };
  const camino = { clave: "en_camino" as const, texto: "", tono: "info" as const, dias: 0 };
  const falta = { clave: "falta_pedir" as const, texto: "", tono: "peligro" as const, dias: 4 };
  assert(resumenRepuestos([llego, camino, camino])?.texto === "Repuestos 1/3", "OR000507: Repuestos 1/3");
  const r = resumenRepuestos([llego, falta]);
  assert(r?.texto === "1 sin comprar" && r.tono === "peligro", "lo sin comprar gana: 1 sin comprar (rojo)");
  assert(resumenRepuestos([]) === null, "sin repuestos bajo pedido: sin chip");
}

// ── Validaciones ────────────────────────────────────────────────────────────
assert(puedeComprar("staff") && puedeComprar("admin") && !puedeComprar("tecnico"), "compran Staff y Administradores; el técnico no");
{
  const v = validarComprar([sol({ id: "a", descripcion: "Teclado Dell G5" }), sol({ id: "b", descripcion: "Bisagras HP" })], new Map([["a", { tipo: "sin_pago", precio: 40 } as const]]));
  assert(v.ok && v.sinAnticipo.length === 1 && v.sinAnticipo[0] === "Teclado Dell G5", "comprar sin anticipo no se bloquea: se pide confirmar el teclado");
  assert(!validarComprar([sol({ estado: "Comprada" })], new Map()).ok, "no se compra dos veces la misma solicitud");
}
assert(!validarCancelar(sol({}), " ").ok, "cancelar pide motivo");
assert(validarCancelar(sol({}), "El cliente desistió").ok, "cancelar lo que no se compró");
assert(!validarCancelar(sol({ estado: "Comprada" }), "x").ok, "lo comprado no se cancela desde la bandeja");
assert(validarAsignarExistente(sol({}), { estado: "En tránsito", libres: 1 }).ok, "Ya la tenemos: sirve un artículo en camino con unidad libre");
assert(!validarAsignarExistente(sol({}), { estado: "Vendido", libres: 0 }).ok, "no se aparta algo vendido");
assert(!validarAsignarExistente(sol({ cantidad: 2 }), { estado: "Disponible", libres: 1 }).ok, "faltan unidades libres");

// ── ¿Es para OR000507? (punto 3) ────────────────────────────────────────────
{
  const abiertas = [
    sol({ id: "tapa", descripcion: "TAPA BISAGRA HP 15-DWXXXX" }),
    sol({ id: "teclado", descripcion: "TECLADO DELL GAMORAG5 5587" }),
  ];
  const p = solicitudesParecidas("Tapa bisagra HP 15-dw0000 negra", abiertas);
  assert(p.length === 1 && p[0].id === "tapa", "comprar 'Tapa bisagra HP 15-dw' sugiere la solicitud de la tapa");
  assert(solicitudesParecidas("Mouse Logitech", abiertas).length === 0, "algo distinto no sugiere nada");
}
// ── Categoría al comprar para una orden ─────────────────────────────────────
assert(validarCategoriaDeCompra({ codigo: "SOL-1", lineaId: "recL" }, "Mainboard").ok, "Mainboard para una orden: se puede apartar");
assert(!validarCategoriaDeCompra({ codigo: "SOL-1", lineaId: "recL" }, "Laptop").ok, "Laptop no es repuesto: se rechaza antes de crear");
assert(validarCategoriaDeCompra({ codigo: "SOL-2", lineaId: null }, "Laptop").ok, "para una operación comercial vale cualquier categoría");
// ── Lo comprado para una orden se aparta aunque venga en camino ─────────────
{
  const fs = require("fs") as typeof import("fs");
  const cargar = fs.readFileSync("lib/tecnicos/presupuesto/cargar.ts", "utf8");
  const ship = fs.readFileSync("lib/shipping-v2/airtable.ts", "utf8");
  const compra = cargar.slice(cargar.indexOf("export async function cargarCompraEnLinea"));
  assert(/compradoParaEstaOrden: true/.test(compra.slice(0, 1200)), "cargarCompraEnLinea aparta con compradoParaEstaOrden");
  assert((cargar.match(/compradoParaEstaOrden: true/g) ?? []).length === 1, "…y es el único lugar que salta la regla de 'en camino'");
  assert(/!compradoParaEstaOrden && firstBoolean\(f\[SHIPPING_V2_ITEM_FIELDS\.disponibleVenta\]\) === false/.test(ship), "el resto de órdenes sigue sin poder montar mercadería que no llegó");
}

// ── Punto 5B-2: licencias (sin abono, no consumen el anticipo) ──────────────
{
  const lic = (o: Partial<SolicitudBase>) => ({ ...sol(o), categoria: "Licencia digital" });
  const c = coberturaAnticipo([lic({ id: "office", precioCliente: 35 }), { ...sol({ id: "teclado", precioCliente: 40 }), categoria: "Teclado" }], 40);
  assert(c.get("office")?.tipo === "cubierta", "licencia sin abono → se puede comprar (decisión del dueño)");
  assert(c.get("teclado")?.tipo === "cubierta", "los $40 abonados quedan para el teclado (la licencia no los consume)");
  const chip = situacionDeSolicitud({ solicitud: lic({ fechaAprobacion: "2026-11-07T10:00:00Z" }), articulo: null, cobertura: c.get("office"), hoy: "2026-11-07" });
  assert(chip.texto === "Falta comprar · 0 días", "chip de licencia: Falta comprar");
  const comprada = situacionDeSolicitud({ solicitud: lic({}), articulo: { id: "i", sku: "OTR-000900", recibido: true, estado: "Reservado", faltaPagarProveedor: 0 }, cobertura: c.get("office"), hoy: "2026-11-07" });
  assert(comprada.texto === "Comprada ✓ OTR-000900", "licencia comprada: Comprada ✓ (no \"Llegó\")");
  const v = validarCategoriaDeCompra({ codigo: "SOL-000020", lineaId: "recL", categoria: "Licencia digital" }, "Otro");
  assert(!v.ok, "una licencia no se compra como artículo físico");
}
assert(claveDeLinea("recX") === "linea:recX", "clave única por línea");

if (fallos > 0) { console.error(`\n${fallos} prueba(s) fallaron.`); process.exit(1); }
