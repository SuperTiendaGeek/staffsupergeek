/**
 * Pruebas — plan de limpieza de los datos de prueba (punto 16, 26-nov-2026).
 * Ejecutar: npm test pruebas/__tests__/migracion
 */
import { IDS, planDatosPrueba, textoActividadOrden, type Foto } from "../migracion";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const DUENO = IDS.clienteDueno;
const hoy: Foto = {
  clientePrueba: null,
  clientesVacios: [{ id: IDS.clientesVacios[0], nombre: "Cliente Prueba Migracion", esPrueba: false }, { id: IDS.clientesVacios[1], nombre: "Test Fecha Registro", esPrueba: false }],
  ordenes: [
    { id: IDS.ordenes[0], codigo: "OR000057", esPrueba: false, clienteId: DUENO, estado: "Finalizado Entregado" },
    { id: IDS.ordenes[1], codigo: "OR000234", esPrueba: false, clienteId: DUENO, estado: "Finalizado Entregado" },
    { id: IDS.ordenes[2], codigo: "OR000368", esPrueba: false, clienteId: DUENO, estado: "Esperando Respuesta" },
  ],
  equipos: IDS.equipos.map((id) => ({ id, nombre: "Equipo de prueba", clienteId: DUENO })),
  pedidos: IDS.pedidos.map((id, i) => ({ id, codigo: `OP-${i}`, esPrueba: false, clienteId: i === 5 ? "recSebastianHaro01" : DUENO })),
  ordenReal: { id: IDS.ordenReal, codigo: "OR000342", facturaIds: [IDS.facturaPruebas] },
  usuario: { id: IDS.usuario, nombre: "Charles Prueba", activo: true },
  servicio: { id: IDS.servicio, nombre: "Servicio de prueba", activo: true },
  pagoEnLinea: { id: IDS.pagoEnLinea, nombre: "PL-000009", estado: "Abierto", idTransaccion: "", abonoIds: [] },
};

const p = planDatosPrueba(hoy);
const de = (t: string) => p.acciones.filter((a) => a.tipo === t);
assert(de("crear_cliente_prueba").length === 1, "crea PRUEBA INTERNA si no existe");
assert(de("marcar_cliente").length === 2, "marca los 2 clientes vacíos (no los borra)");
assert(de("orden").length === 3 && de("orden").every((a) => a.tipo === "orden" && a.marcar && a.mover), "las 3 órdenes: marcar y pasar a PRUEBA INTERNA");
const or368 = p.acciones.find((a) => a.tipo === "orden" && a.id === IDS.ordenACerrar);
assert(!!or368 && or368.tipo === "orden" && or368.cerrar && or368.texto.includes("Finalizado Entregado"), "OR000368 vuelve a Finalizado Entregado");
assert(p.acciones.filter((a) => a.tipo === "orden" && a.cerrar).length === 1, "solo OR000368 cambia de estado");
assert(de("mover_equipo").length === 2 && de("pedido").length === 6, "2 fichas y 6 pedidos (incluido OP-139, la demostración)");
const sep = p.acciones.find((a) => a.tipo === "separar_factura");
assert(!!sep && sep.tipo === "separar_factura" && sep.facturaIds.length === 0, "OR000342 queda sin la factura de PRUEBAS");
assert(de("desactivar_usuario").length === 1 && de("desactivar_servicio").length === 1, "Charles Prueba y «Servicio de prueba» quedan inactivos");
assert(de("cerrar_pago_en_linea").length === 1 && p.avisos.length === 0, "PL-000009 (nunca pagado) pasa a Vencido");
assert(p.acciones.length === 18, `18 acciones en total (hay ${p.acciones.length})`);
assert(textoActividadOrden(or368 as never).includes("la reapertura del 23-nov fue una prueba"), "la Actividad de OR000368 explica por qué vuelve a entregada");

// Un pago con transacción no se toca
{
  const r = planDatosPrueba({ ...hoy, pagoEnLinea: { ...hoy.pagoEnLinea!, idTransaccion: "123" } });
  assert(!r.acciones.some((a) => a.tipo === "cerrar_pago_en_linea") && r.avisos.length === 1, "si el pago en línea tiene transacción: aviso, sin tocarlo");
}

// Después de aplicar: 0 acciones
{
  const PI = "recPruebaInterna01";
  const despues: Foto = {
    clientePrueba: { id: PI },
    clientesVacios: hoy.clientesVacios.map((c) => ({ ...c, esPrueba: true })),
    ordenes: hoy.ordenes.map((o) => ({ ...o, esPrueba: true, clienteId: PI, estado: "Finalizado Entregado" })),
    equipos: hoy.equipos.map((e) => ({ ...e, clienteId: PI })),
    pedidos: hoy.pedidos.map((x) => ({ ...x, esPrueba: true, clienteId: PI })),
    ordenReal: { ...hoy.ordenReal!, facturaIds: [] },
    usuario: { ...hoy.usuario!, activo: false },
    servicio: { ...hoy.servicio!, activo: false },
    pagoEnLinea: { ...hoy.pagoEnLinea!, estado: "Vencido" },
  };
  const r = planDatosPrueba(despues);
  assert(r.acciones.length === 0 && r.avisos.length === 0, "vista previa después de aplicar: 0 acciones");
}

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
