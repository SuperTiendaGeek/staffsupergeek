// Contrato de las novedades (auditoría Shipping V2, punto 8 · 10-oct-2026).
// Ejecutar: npx tsx lib/shipping-v2/__tests__/novedades.test.ts

import {
  appendEntradaHilo,
  articuloSalioDelInventario,
  construirHiloNovedad,
  esNovedadBloqueante,
  estadoPrevioParaRestaurar,
  etiquetaDeBloqueo,
  etiquetaTurno,
  DECISION_VENDIDO_CON_NOVEDAD,
  getAccionesDisponibles,
  pideAclaracionAlVender,
  validarCierrePorVenta,
  getDecisionesPermitidas,
  getNovedadBucket,
  getTurnoNovedad,
  isNovedadAbierta,
  isNovedadCerrada,
  normalizarEstadoNovedad,
  responsablePorDefecto,
  SHIPPING_V2_TIPOS_NOVEDAD,
  SHIPPING_V2_DECISIONES_ARTICULO,
  SHIPPING_V2_NOVEDAD_ACCIONES,
  SHIPPING_V2_NOVEDAD_ESTADOS,
  validarAccionNovedad,
  validarRegistroNovedad,
} from "../novedades";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

console.log("— Estados: solo 3 —");
assert(SHIPPING_V2_NOVEDAD_ESTADOS.length === 3, "Abierta, En solución y Cerrada");
assert(isNovedadCerrada("Cerrada") && isNovedadAbierta("Abierta") && isNovedadAbierta("En solución"), "Cerrada es final; las otras dos siguen abiertas");
assert(normalizarEstadoNovedad("Enviada a proveedor") === "Abierta", "Un estado viejo de proveedor se lee como Abierta");
assert(normalizarEstadoNovedad("Rechazada") === "Cerrada" && normalizarEstadoNovedad("Cerrada sin respuesta") === "Cerrada", "Rechazada y Cerrada sin respuesta se leen como Cerrada");
assert(isNovedadAbierta("Estado inventado"), "Un estado desconocido cuenta como abierto (fail-closed)");

console.log("— Responsable y tipo, por separado (11-oct) —");
assert(SHIPPING_V2_TIPOS_NOVEDAD.join("|") === "Dañado|Falla de funcionamiento|Incompleto|Diferente al esperado|Extraviado|Otro", "Los 6 tipos del dueño");
assert(responsablePorDefecto({ proveedorCompraId: "recProv" }) === "Proveedor", "Con proveedor de compra se propone Proveedor");
assert(responsablePorDefecto({ proveedorCompraId: "" }) === "SUPER GEEK", "Sin proveedor (p. ej. pieza de despiece) → SUPER GEEK");

console.log("— Registrar —");
const enTienda = { estado: "Disponible", cantidad: 1, recibido: true, proveedorCompraId: "recProv" };
let r = validarRegistroNovedad({ tipo: "Dañado", descripcion: "Carcasa rota", esPersonalTienda: true, articulo: enTienda });
assert(r.ok && r.responsable === "Proveedor" && r.bloqueaVenta === false, "Sin elegir responsable: Proveedor (tiene proveedor) y sin bloqueo");
r = validarRegistroNovedad({ tipo: "Dañado", responsable: "SUPER GEEK", descripcion: "Carcasa rota", esPersonalTienda: true, articulo: enTienda });
assert(r.ok && r.responsable === "SUPER GEEK", "Se puede cambiar a SUPER GEEK aunque tenga proveedor");
r = validarRegistroNovedad({ tipo: "Falla de funcionamiento", responsable: "Proveedor", descripcion: "No enciende", esPersonalTienda: true, articulo: { ...enTienda, proveedorCompraId: "" } });
assert(!r.ok && r.motivo.includes("SUPER GEEK"), "Sin proveedor de compra no se puede elegir Proveedor");
r = validarRegistroNovedad({ tipo: "Otro", descripcion: "Algo", esPersonalTienda: true, articulo: { ...enTienda, proveedorCompraId: "" } });
assert(r.ok && r.responsable === "SUPER GEEK", "Sin proveedor y sin elegir → SUPER GEEK");
for (const tipo of SHIPPING_V2_TIPOS_NOVEDAD) {
  const a = validarRegistroNovedad({ tipo, responsable: "Proveedor", descripcion: "x", esPersonalTienda: true, articulo: enTienda });
  const b = validarRegistroNovedad({ tipo, responsable: "SUPER GEEK", descripcion: "x", esPersonalTienda: true, articulo: enTienda });
  assert(a.ok && b.ok, `"${tipo}" sirve para Proveedor y para SUPER GEEK`);
}
r = validarRegistroNovedad({ tipo: "Dañado", descripcion: "Carcasa rota", bloquearVenta: true, esPersonalTienda: true, articulo: enTienda });
assert(r.ok && r.bloqueaVenta === true, "Con la casilla marcada, bloquea");
r = validarRegistroNovedad({ tipo: "Extraviado", descripcion: "No aparece", esPersonalTienda: true, articulo: enTienda });
assert(r.ok && r.bloqueaVenta === true, "Extraviado SIEMPRE bloquea");
r = validarRegistroNovedad({ tipo: "Extraviado", responsable: "Proveedor", descripcion: "No llegó en la caja", esPersonalTienda: true, articulo: { ...enTienda, recibido: false } });
assert(r.ok, "Extraviado también sirve para algo que se perdió antes de llegar (con el proveedor)");
r = validarRegistroNovedad({ tipo: "Dañado", descripcion: "x", esPersonalTienda: true, articulo: { ...enTienda, estado: "Vendido", cantidad: 0 } });
assert(!r.ok && r.motivo.includes("orden de reparación"), "F-5: sobre algo vendido no se registra; se indica la orden de reparación");
r = validarRegistroNovedad({ tipo: "Dañado", descripcion: "x", esPersonalTienda: true, articulo: { ...enTienda, estado: "Disponible", cantidad: 0 } });
assert(!r.ok, "Con 0 unidades tampoco");
for (const estado of ["Agotado", "Dado de baja", "Destinado a partes"]) {
  assert(!validarRegistroNovedad({ tipo: "Otro", descripcion: "x", esPersonalTienda: true, articulo: { ...enTienda, estado } }).ok, `Tampoco en "${estado}"`);
}
assert(!validarRegistroNovedad({ tipo: "Dañado", descripcion: "x", esPersonalTienda: false, articulo: enTienda }).ok, "Un proveedor no registra novedades");
for (const viejo of ["Faltante", "Asunto interno", "Observación menor", "Perdido en tienda"]) {
  assert(!validarRegistroNovedad({ tipo: viejo, descripcion: "x", esPersonalTienda: true, articulo: enTienda }).ok, `"${viejo}" ya no se ofrece para registrar`);
}
assert(!validarRegistroNovedad({ tipo: "Dañado", descripcion: "  ", esPersonalTienda: true, articulo: enTienda }).ok, "La descripción es obligatoria");

console.log("— Bloqueo —");
assert(esNovedadBloqueante({ bloqueaVenta: true }) && !esNovedadBloqueante({ bloqueaVenta: false }), "Solo la casilla decide el bloqueo");
assert(etiquetaDeBloqueo([{ tipo: "Dañado", bloqueaVenta: true }]) === "Con novedad", "Bloqueado por daño → Con novedad");
assert(etiquetaDeBloqueo([{ tipo: "Dañado", bloqueaVenta: true }, { tipo: "Extraviado", bloqueaVenta: true }]) === "Extraviado", "Si está extraviado, manda Extraviado");
assert(etiquetaDeBloqueo([{ tipo: "Perdido en tienda", bloqueaVenta: true }]) === "Extraviado", "El nombre anterior (Perdido en tienda) se trata como Extraviado");
assert(etiquetaDeBloqueo([{ tipo: "Dañado", bloqueaVenta: false }]) === null, "Sin bloqueos, no hay etiqueta");
assert(estadoPrevioParaRestaurar([
  { estadoPrevioArticulo: "Con novedad", fechaRegistro: "2026-10-02" },
  { estadoPrevioArticulo: "En tránsito", fechaRegistro: "2026-10-01" },
]) === "En tránsito", "Al desbloquear vuelve a la etapa anterior (nunca a Con novedad)");
assert(estadoPrevioParaRestaurar([
  { estadoPrevioArticulo: "Pagado", fechaRegistro: "2026-09-01" },
  { estadoPrevioArticulo: "En tránsito", fechaRegistro: "2026-10-01" },
]) === "En tránsito", "Entre dos bloqueos, manda la etapa más reciente (no retrocede a Pagado)");
assert(articuloSalioDelInventario({ estado: "Vendido", cantidad: 0 }) && !articuloSalioDelInventario({ estado: "Con novedad", cantidad: 1 }), "Vendido salió; Con novedad sigue en la tienda");

console.log("— Turno y pestañas —");
const base = { estado: "Abierta", responsable: "Proveedor", descripcion: "Pantalla rayada", fechaRegistro: "2026-10-01T10:00:00.000Z" };
assert(getTurnoNovedad(base) === "proveedor" && etiquetaTurno(base) === "Esperando al proveedor", "Recién registrada: esperando al proveedor");
const respondida = { ...base, respuestaProveedor: appendEntradaHilo(undefined, "Roberto", "Envío otra", "2026-10-02T10:00:00.000Z") };
assert(getTurnoNovedad(respondida) === "nosotros" && etiquetaTurno(respondida) === "Respondió el proveedor", "Respondió → nuestro turno");
const contestada = { ...respondida, mensajeProveedor: appendEntradaHilo(undefined, "Alexis", "Mejor reembolso", "2026-10-03T10:00:00.000Z") };
assert(getTurnoNovedad(contestada) === "proveedor", "Le contestamos → vuelve a su turno");
assert(getTurnoNovedad({ estado: "Abierta", responsable: "SUPER GEEK" }) === "nosotros", "Interna: siempre nuestro turno");
assert(getNovedadBucket({ estado: "En solución", responsable: "Proveedor" }) === "en-solucion", "En solución tiene su pestaña");
assert(getNovedadBucket({ estado: "Cerrada" }) === "cerradas", "Cerrada → Cerradas");

console.log("— Quién puede qué —");
const nProv = { estado: "Abierta", responsable: "Proveedor", tipo: "Dañado", bloqueaVenta: false };
const accProv = getAccionesDisponibles(nProv, "proveedor").map((a) => a.accion);
assert(accProv.length === 1 && accProv[0] === "responder", "El proveedor SOLO responde");
assert(!validarAccionNovedad({ accion: "resolver", novedad: nProv, rol: "proveedor", valores: { decision: "Reparado", texto: "x" } }).ok, "El proveedor no puede resolver (aceptar) por su cuenta");
assert(!validarAccionNovedad({ accion: "cumplida", novedad: { ...nProv, estado: "En solución" }, rol: "proveedor" }).ok, "Ni marcar cumplida");
assert(!validarAccionNovedad({ accion: "desbloquear", novedad: { ...nProv, bloqueaVenta: true }, rol: "proveedor", valores: { texto: "porque sí" } }).ok, "Ni desbloquear");
const accStaff = getAccionesDisponibles(nProv, "staff").map((a) => a.accion);
assert(accStaff.includes("resolver") && accStaff.includes("contestar") && accStaff.includes("registrar-respuesta") && accStaff.includes("bloquear"), "El personal resuelve, contesta, anota la respuesta y bloquea");
assert(!accStaff.includes("responder") && !accStaff.includes("desbloquear") && !accStaff.includes("reabrir"), "El personal no responde por el portal ni desbloquea ni reabre");
assert(!validarAccionNovedad({ accion: "desbloquear", novedad: { ...nProv, bloqueaVenta: true }, rol: "staff", valores: { texto: "ya está reparado" } }).ok, "Desbloquear: solo Administrador");
assert(validarAccionNovedad({ accion: "desbloquear", novedad: { ...nProv, estado: "Cerrada", bloqueaVenta: true }, rol: "admin", valores: { texto: "ya está reparado" } }).ok, "El Administrador desbloquea aunque la novedad esté cerrada");
assert(!validarAccionNovedad({ accion: "bloquear", novedad: { ...nProv, bloqueaVenta: true }, rol: "staff" }).ok, "No se bloquea dos veces");
assert(!validarAccionNovedad({ accion: "bloquear", novedad: { ...nProv, estado: "Cerrada" }, rol: "staff" }).ok, "Una novedad cerrada no se bloquea");
const nInt = { estado: "Abierta", responsable: "SUPER GEEK", tipo: "Asunto interno" };
assert(!getAccionesDisponibles(nInt, "staff").some((a) => a.accion === "contestar"), "Una interna no tiene conversación con el proveedor");

console.log("— Resolver —");
const adminOnly = SHIPPING_V2_DECISIONES_ARTICULO.filter((d) => d.soloAdmin).map((d) => d.valor);
assert(["Dar de baja", "Va a despiece", "Pasa a activo", "Devuelto al proveedor", "No procedía"].every((d) => adminOnly.includes(d as never)), "Baja, despiece, activo, devolución y No procedía son de Administrador");
const staffDec = getDecisionesPermitidas({ tipo: "Dañado", isSiteAdmin: false }).map((d) => d.valor);
assert(staffDec.join("|") === "No requiere solución|Reparado|Se vende con descuento", "Al personal solo se le ofrecen las 3 que no sacan el artículo");
assert(!SHIPPING_V2_DECISIONES_ARTICULO.some((d) => d.valor === ("Se descarta" as never)), "“Se descarta” ya no existe");
for (const d of adminOnly) {
  const v = validarAccionNovedad({ accion: "resolver", novedad: nProv, rol: "staff", valores: { decision: d, texto: "x", cantidad: 1 } });
  assert(!v.ok, `El personal NO puede elegir "${d}" aunque lo mande por detrás`);
}
let v = validarAccionNovedad({ accion: "resolver", novedad: nProv, rol: "staff", valores: { decision: "Reparado", texto: "Se cambió la pantalla" } });
assert(v.ok && v.estadoDestino === "Cerrada", "Resolver sin pendientes → Cerrada");
v = validarAccionNovedad({ accion: "resolver", novedad: nProv, rol: "staff", valores: { decision: "Reparado", texto: "x", propuesta: "Reemplazo", pendienteProveedor: true } });
assert(v.ok && v.estadoDestino === "En solución", "Si falta que el proveedor cumpla → En solución");
assert(!validarAccionNovedad({ accion: "resolver", novedad: nProv, rol: "staff", valores: { decision: "Se vende con descuento", texto: "x" } }).ok, "Con descuento exige el nuevo precio");
assert(validarAccionNovedad({ accion: "resolver", novedad: nProv, rol: "staff", valores: { decision: "Se vende con descuento", texto: "x", precio: 420 } }).ok, "…con precio, pasa");
assert(!validarAccionNovedad({ accion: "resolver", novedad: nProv, rol: "admin", valores: { decision: "Dar de baja", texto: "x" } }).ok, "Dar de baja exige cantidad");
assert(!validarAccionNovedad({ accion: "resolver", novedad: nProv, rol: "staff", valores: { decision: "Reparado", texto: "" } }).ok, "Hay que anotar qué se hizo");
assert(!validarAccionNovedad({ accion: "resolver", novedad: nInt, rol: "staff", valores: { decision: "Reparado", texto: "x", pendienteProveedor: true } }).ok, "Una interna no queda esperando al proveedor");
assert(!validarAccionNovedad({ accion: "resolver", novedad: nProv, rol: "staff", valores: { decision: "Reparado", texto: "x", desbloquear: true } }).ok, "El personal no puede desbloquear al resolver");
const nPerdido = { estado: "Abierta", responsable: "SUPER GEEK", tipo: "Perdido en tienda", bloqueaVenta: true };
assert(getDecisionesPermitidas({ tipo: "Extraviado", isSiteAdmin: true }).map((d) => d.valor).join("|") === "No requiere solución|Dar de baja|No procedía", "Extraviado: apareció, se da de baja o no procedía");
assert(getDecisionesPermitidas({ tipo: "Perdido en tienda", isSiteAdmin: true }).length === 3, "…igual para los registros viejos «Perdido en tienda»");
assert(!validarAccionNovedad({ accion: "resolver", novedad: nPerdido, rol: "staff", valores: { decision: "No requiere solución", texto: "apareció" } }).ok, "Si apareció, hay que anotar dónde o cómo");
assert(validarAccionNovedad({ accion: "resolver", novedad: nPerdido, rol: "staff", valores: { decision: "No requiere solución", texto: "apareció", comoAparecio: "En la bodega" } }).ok, "…anotándolo, pasa");

console.log("— Reabrir —");
assert(validarAccionNovedad({ accion: "reabrir", novedad: { ...nProv, estado: "Cerrada", decision: "Reparado" }, rol: "admin", valores: { texto: "se cerró por error" } }).ok, "Se reabre si no movió el artículo");
assert(!validarAccionNovedad({ accion: "reabrir", novedad: { ...nProv, estado: "Cerrada", decision: "Dar de baja" }, rol: "admin", valores: { texto: "se cerró por error" } }).ok, "Si dio de baja, no se reabre (se usa Revertir baja)");

console.log("— Conversación —");
const hilo = construirHiloNovedad({
  descripcion: "Batería hinchada",
  fechaRegistro: "2026-09-15T08:00:00.000Z",
  respuestaProveedor: appendEntradaHilo(undefined, "Roberto", "10% de descuento", "2026-09-15T10:00:00.000Z"),
  mensajeProveedor: appendEntradaHilo(undefined, "Alexis", "No alcanza", "2026-09-16T12:00:00.000Z"),
});
assert(hilo.length === 3 && hilo[1].lado === "proveedor" && hilo[2].lado === "super-geek", "El hilo junta registro, respuesta y contrapropuesta en orden");
assert(construirHiloNovedad({}).length === 0, "Una novedad vacía no revienta el hilo");

for (const cfg of SHIPPING_V2_NOVEDAD_ACCIONES) {
  assert(cfg.desde.every((e) => (SHIPPING_V2_NOVEDAD_ESTADOS as readonly string[]).includes(e)), `"${cfg.label}" parte de estados que existen`);
}

console.log("— Cartel al vender (8b) —");
assert(!getDecisionesPermitidas({ tipo: "Dañado", isSiteAdmin: true }).some((d) => d.valor === DECISION_VENDIDO_CON_NOVEDAD), "«Vendido con novedad» NO se ofrece al resolver: solo lo pone el cartel");
assert(!validarAccionNovedad({ accion: "resolver", novedad: nProv, rol: "admin", valores: { decision: DECISION_VENDIDO_CON_NOVEDAD, texto: "x" } }).ok, "…ni se acepta por la puerta de resolver");
assert(pideAclaracionAlVender({ estado: "Abierta", bloqueaVenta: false }), "Abierta sin bloqueo → pide aclaración");
assert(!pideAclaracionAlVender({ estado: "En solución" }) && !pideAclaracionAlVender({ estado: "Cerrada" }), "En solución o Cerrada → no (ya se decidió)");
assert(!pideAclaracionAlVender({ estado: "Abierta", bloqueaVenta: true }), "Bloqueada → no (no se puede vender)");
const nv = { estado: "Abierta", bloqueaVenta: false, responsable: "Proveedor", itemIds: ["recItem"] };
let cv = validarCierrePorVenta({ novedad: nv, itemId: "recItem", texto: "Se vende con 10% de descuento por carcasa rota" });
assert(cv.ok && cv.estadoDestino === "Cerrada", "Con aclaración → se cierra");
cv = validarCierrePorVenta({ novedad: nv, itemId: "recItem", texto: "Se vende con 10% de descuento", reclamoContinua: true });
assert(cv.ok && cv.estadoDestino === "En solución", "Si el reclamo con el proveedor continúa → En solución");
cv = validarCierrePorVenta({ novedad: { ...nv, responsable: "SUPER GEEK" }, itemId: "recItem", texto: "Se vende con 10% de descuento", reclamoContinua: true });
assert(cv.ok && cv.estadoDestino === "Cerrada", "Una interna no queda esperando al proveedor");
assert(!validarCierrePorVenta({ novedad: nv, itemId: "recItem", texto: "corto" }).ok, "La aclaración debe tener más información");
assert(!validarCierrePorVenta({ novedad: nv, itemId: "otro", texto: "Se vende con descuento" }).ok, "No se cierra una novedad de otro artículo");
assert(!validarCierrePorVenta({ novedad: { ...nv, estado: "Cerrada" }, itemId: "recItem", texto: "Se vende con descuento" }).ok, "Ni una ya cerrada (no se cierra dos veces)");
assert(!validarCierrePorVenta({ novedad: { ...nv, bloqueaVenta: true }, itemId: "recItem", texto: "Se vende con descuento" }).ok, "Ni una bloqueada");

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}
console.log("✅ novedades.test.ts — todos los asserts pasaron");
