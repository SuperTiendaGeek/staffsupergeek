/**
 * Activos de la tienda (punto 4 de la auditoría, 8-oct-2026).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/activos.test.ts
 */
import {
  etiquetaComoActivo,
  evaluarDarDeBaja,
  evaluarPasarALaVenta,
  evaluarPasarAUsoLocal,
  evaluarRevertirBaja,
  requierePagoParteSeparada,
  situacionPago,
  valoresComoMercaderia,
  type ArticuloParaMovimiento,
} from "../activos";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}
const ok = (r: { ok: boolean }) => r.ok;
const modo = (r: { ok: boolean; modo?: string }) => (r.ok ? r.modo : "error");

console.log("— Situación de pago —");
assert(situacionPago({ requierePago: false }) === "sin-pago", "Reajuste/regalo: no se debe");
assert(situacionPago({ requierePago: true, esRegalo: true }) === "sin-pago", "Regalo: no se debe");
assert(situacionPago({ requierePago: true }) === "por-pagar", "Compra sin pago: por pagar");
assert(situacionPago({ requierePago: true, pagos: [{ estado: "Pendiente" }] }) === "pago-en-curso", "En un pago pendiente");
assert(situacionPago({ requierePago: true, pagos: [{ estado: "Anulado" }, { estado: "Pagado" }] }) === "pagado", "Pagado (el anulado no cuenta)");
assert(situacionPago({ requierePago: true, pagos: [{ estado: "Anulado" }] }) === "por-pagar", "Solo pagos anulados: vuelve a por pagar");

const laptop: ArticuloParaMovimiento = { sku: "LAP-1", usoLocal: false, recibido: true, estado: "Disponible", cantidad: 1, pago: "pagado" };
const cables: ArticuloParaMovimiento = { sku: "CAB-1", usoLocal: false, recibido: true, estado: "Disponible", cantidad: 5, pago: "pagado" };
const admin = { esAdministrador: true, motivo: "para la caja" };

console.log("\n— Pasar a uso local —");
assert(!ok(evaluarPasarAUsoLocal(laptop, { ...admin, cantidad: 1, esAdministrador: false })), "Solo Administrador");
assert(!ok(evaluarPasarAUsoLocal(laptop, { ...admin, cantidad: 1, motivo: "x" })), "Pide motivo");
assert(modo(evaluarPasarAUsoLocal(laptop, { ...admin, cantidad: 1 })) === "todo", "Laptop de 1 unidad: el mismo artículo pasa a activo");
assert(modo(evaluarPasarAUsoLocal(cables, { ...admin, cantidad: 2 })) === "separar", "2 de 5 cables: se separan");
assert(!ok(evaluarPasarAUsoLocal(cables, { ...admin, cantidad: 6 })), "No más de lo que hay");
assert(!ok(evaluarPasarAUsoLocal({ ...cables, cantidadReservada: 4 }, { ...admin, cantidad: 2 })), "Lo reservado para un cliente no se toca");
assert(!ok(evaluarPasarAUsoLocal({ ...laptop, usoLocal: true }, { ...admin, cantidad: 1 })), "Ya es activo");
assert(!ok(evaluarPasarAUsoLocal({ ...laptop, estado: "Vendido", cantidad: 0 }, { ...admin, cantidad: 1 })), "Vendido: no");
assert(modo(evaluarPasarAUsoLocal({ ...cables, recibido: false, estado: "En tránsito" }, { ...admin, cantidad: 5 })) === "todo", "En camino, todas las unidades: sí (al llegar será Uso local)");
assert(!ok(evaluarPasarAUsoLocal({ ...cables, recibido: false, estado: "En tránsito" }, { ...admin, cantidad: 2 })), "En camino, solo una parte: no");
assert(!ok(evaluarPasarAUsoLocal({ ...cables, pago: "pago-en-curso" }, { ...admin, cantidad: 2 })), "Separar con un pago en curso: no");
assert(modo(evaluarPasarAUsoLocal({ ...cables, pago: "por-pagar" }, { ...admin, cantidad: 2 })) === "separar", "Separar algo por pagar: sí (las dos partes siguen por pagar)");

const pcCaja: ArticuloParaMovimiento = { sku: "DES-1", usoLocal: true, recibido: true, estado: "Uso local", cantidad: 1, pago: "pagado" };
const sillas: ArticuloParaMovimiento = { sku: "OTR-1", usoLocal: true, recibido: true, estado: "Uso local", cantidad: 4, pago: "sin-pago" };

console.log("\n— Dar de baja —");
const baja = evaluarDarDeBaja(pcCaja, { ...admin, cantidad: 1, motivo: "se quemó la fuente" });
assert(baja.ok && baja.dadoDeBaja && baja.quedan === 0, "PC de la caja: queda Dado de baja con 0");
const bajaParcial = evaluarDarDeBaja(sillas, { ...admin, cantidad: 1, motivo: "se rompió una" });
assert(bajaParcial.ok && !bajaParcial.dadoDeBaja && bajaParcial.quedan === 3, "1 de 4 sillas: quedan 3 en uso");
assert(!ok(evaluarDarDeBaja(cables, { ...admin, cantidad: 1 })), "Mercadería no se da de baja");
assert(!ok(evaluarDarDeBaja({ ...pcCaja, pago: "por-pagar" }, { ...admin, cantidad: 1 })), "Si todavía se debe, primero el pago");
assert(!ok(evaluarDarDeBaja({ ...pcCaja, pago: "pago-en-curso" }, { ...admin, cantidad: 1 })), "Pago en curso: primero marcarlo pagado");
assert(!ok(evaluarDarDeBaja({ ...pcCaja, recibido: false, estado: "En tránsito" }, { ...admin, cantidad: 1 })), "En camino: se registra novedad, no baja");
assert(!ok(evaluarDarDeBaja({ ...pcCaja, estado: "Dado de baja", cantidad: 0 }, { ...admin, cantidad: 1 })), "No se da de baja dos veces");
assert(!ok(evaluarDarDeBaja(pcCaja, { ...admin, cantidad: 1, esAdministrador: false })), "Solo Administrador");

console.log("\n— Revertir baja —");
assert(evaluarRevertirBaja({ usoLocal: true, unidadesDadasDeBaja: 1 }, { cantidad: 1, esAdministrador: true, motivo: "fue un error" }).ok, "Baja por error: se revierte");
assert(!evaluarRevertirBaja({ usoLocal: true, unidadesDadasDeBaja: 1 }, { cantidad: 2, esAdministrador: true, motivo: "fue un error" }).ok, "No más de lo que se dio de baja");
assert(!evaluarRevertirBaja({ usoLocal: true, unidadesDadasDeBaja: 0 }, { cantidad: 1, esAdministrador: true, motivo: "fue un error" }).ok, "Sin bajas: nada que revertir");
assert(!evaluarRevertirBaja({ usoLocal: true, unidadesDadasDeBaja: 1 }, { cantidad: 1, esAdministrador: false, motivo: "fue un error" }).ok, "Solo Administrador");

console.log("\n— Pasar a la venta —");
assert(modo(evaluarPasarALaVenta(pcCaja, { ...admin, cantidad: 1, motivo: "cambiamos la PC" })) === "todo", "PC vieja: el mismo artículo pasa a la venta");
assert(modo(evaluarPasarALaVenta(sillas, { ...admin, cantidad: 2, motivo: "sobran dos" })) === "separar", "2 de 4: se separan");
assert(!ok(evaluarPasarALaVenta(cables, { ...admin, cantidad: 1 })), "Mercadería: ya está a la venta");
const v = valoresComoMercaderia({ recibido: true, estado: "Uso local", categoria: "Desktop" });
assert(v.requiereInspeccion && v.estado === "En revisión" && v.reabrirInspeccion, "Desktop vuelve a pedir inspección: En revisión");
const v2 = valoresComoMercaderia({ recibido: true, estado: "Uso local", categoria: "Cable" });
assert(!v2.requiereInspeccion && v2.estado === "Disponible", "Un cable: Disponible directo");

console.log("\n— Etiquetas y pagos —");
assert(etiquetaComoActivo({ recibido: true, requiereInspeccion: false }) === "Uso local", "Activo en la tienda: Uso local");
assert(etiquetaComoActivo({ recibido: true, requiereInspeccion: true, inspeccionFirmada: false }) === "En revisión", "Activo con inspección pendiente: En revisión");
assert(etiquetaComoActivo({ recibido: false, estado: "En tránsito" }) === "En tránsito", "Activo en camino: sigue su camino");
assert(requierePagoParteSeparada("por-pagar") && !requierePagoParteSeparada("pagado") && !requierePagoParteSeparada("sin-pago"), "La parte separada solo se paga si todavía se debía");

if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
console.log("\n✅ activos.test.ts — todos los asserts pasaron");
