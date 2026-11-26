// Punto 16 — limpieza de los datos de prueba que ya existían (26-nov-2026).
// Plan PURO: recibe lo que hay hoy en Airtable y devuelve lo que falta hacer.
// Se puede correr las veces que haga falta: después de --aplicar, 0 acciones.
// Decisiones del dueño (26-nov): opción C (marca), cliente PRUEBA INTERNA nuevo
// con las órdenes, pedidos y fichas de prueba; OR000368 vuelve a «Finalizado
// Entregado»; OR000342 se separa de la factura de PRUEBAS (su recibo lo emite
// el personal desde la orden); Charles Prueba y «Servicio de prueba» inactivos;
// PL-000009 (OP-2026-000139, demostración al personal) se cierra sin cobro.

export const NOMBRE_CLIENTE_PRUEBA = "PRUEBA INTERNA";

/** Registros verificados en Airtable el 25 y 26-nov-2026. */
export const IDS = {
  clientesVacios: ["recAU0qHAC7MJi2dd", "recmdCuCND2QHNqvy"], // «Cliente Prueba Migracion», «Test Fecha Registro»
  clienteDueno: "recrRaIcGoxSXy5dN", // «Alex Bolaños»: su teléfono va en PRUEBA INTERNA (los WhatsApp de prueba le llegan a él)
  ordenes: ["recAw7fXhUNgIpihc", "recYhi7aObJEnSaEt", "recvYZCZKoeNdeXLP"], // OR000057, OR000234, OR000368
  ordenACerrar: "recvYZCZKoeNdeXLP", // OR000368
  equipos: ["rec7lsV6joFOIpi3Q", "receFFmawaxn15VYg"], // «PRUEBA DE CORRECCION NO MOVER», «Equipo de prueba»
  pedidos: ["recxUxaEilBgnivWC", "recruyeSjMsBFK3xl", "recwcOEBuNkSBXInd", "rec79qNPTX2zBFss4", "recot5JoNHd397j7g", "rec20MKdLotEjfmcj"], // OP-032, 086, 092, 137, 140, 139
  ordenReal: "recKELLl1qj5VsI9L", // OR000342 (Daniel Ruiz)
  facturaPruebas: "recwOge9ZqN5SJdt7", // 001-002-000000672, ambiente PRUEBAS
  usuario: "recEqnhaJVQn0yqtA", // «Charles Prueba»
  servicio: "recAJNwcWaSw2MgOX", // «Servicio de prueba»
  pagoEnLinea: "recBkwSGgA5Lg6yvX", // PL-000009
} as const;

export const ESTADO_ENTREGADA = "Finalizado Entregado";

export type Foto = {
  clientePrueba: { id: string } | null;
  clientesVacios: Array<{ id: string; nombre: string; esPrueba: boolean }>;
  ordenes: Array<{ id: string; codigo: string; esPrueba: boolean; clienteId: string | null; estado: string }>;
  equipos: Array<{ id: string; nombre: string; clienteId: string | null }>;
  pedidos: Array<{ id: string; codigo: string; esPrueba: boolean; clienteId: string | null }>;
  ordenReal: { id: string; codigo: string; facturaIds: string[] } | null;
  usuario: { id: string; nombre: string; activo: boolean } | null;
  servicio: { id: string; nombre: string; activo: boolean } | null;
  pagoEnLinea: { id: string; nombre: string; estado: string; idTransaccion: string; abonoIds: string[] } | null;
};

export type Accion =
  | { tipo: "crear_cliente_prueba"; texto: string }
  | { tipo: "marcar_cliente"; id: string; texto: string }
  | { tipo: "orden"; id: string; marcar: boolean; mover: boolean; cerrar: boolean; texto: string }
  | { tipo: "mover_equipo"; id: string; texto: string }
  | { tipo: "pedido"; id: string; marcar: boolean; mover: boolean; texto: string }
  | { tipo: "separar_factura"; id: string; facturaIds: string[]; texto: string }
  | { tipo: "desactivar_usuario"; id: string; texto: string }
  | { tipo: "desactivar_servicio"; id: string; texto: string }
  | { tipo: "cerrar_pago_en_linea"; id: string; texto: string };

export type Plan = { acciones: Accion[]; avisos: string[] };

export function planDatosPrueba(f: Foto): Plan {
  const acciones: Accion[] = [];
  const avisos: string[] = [];
  const pi = f.clientePrueba?.id ?? null;
  const destino = pi ? NOMBRE_CLIENTE_PRUEBA : `${NOMBRE_CLIENTE_PRUEBA} (nuevo)`;

  if (!pi) acciones.push({ tipo: "crear_cliente_prueba", texto: `Crear el cliente ${NOMBRE_CLIENTE_PRUEBA} con «Es prueba»` });

  for (const c of f.clientesVacios) {
    if (!c.esPrueba) acciones.push({ tipo: "marcar_cliente", id: c.id, texto: `Cliente «${c.nombre}» → «Es prueba» (sin nada ligado; no se borra)` });
  }

  for (const o of f.ordenes) {
    const marcar = !o.esPrueba;
    const mover = !pi || o.clienteId !== pi;
    const cerrar = o.id === IDS.ordenACerrar && o.estado !== ESTADO_ENTREGADA;
    if (!marcar && !mover && !cerrar) continue;
    const partes = [marcar && "«Es prueba»", mover && `cliente → ${destino}`, cerrar && `«${o.estado}» → «${ESTADO_ENTREGADA}» (como estaba el 14-ago)`].filter(Boolean);
    acciones.push({ tipo: "orden", id: o.id, marcar, mover, cerrar, texto: `${o.codigo}: ${partes.join(" · ")}` });
  }

  for (const e of f.equipos) {
    if (!pi || e.clienteId !== pi) acciones.push({ tipo: "mover_equipo", id: e.id, texto: `Ficha «${e.nombre}»: cliente → ${destino}` });
  }

  for (const p of f.pedidos) {
    const marcar = !p.esPrueba;
    const mover = !pi || p.clienteId !== pi;
    if (!marcar && !mover) continue;
    const partes = [marcar && "«Es prueba»", mover && `cliente → ${destino}`].filter(Boolean);
    acciones.push({ tipo: "pedido", id: p.id, marcar, mover, texto: `${p.codigo}: ${partes.join(" · ")}` });
  }

  if (f.ordenReal && f.ordenReal.facturaIds.includes(IDS.facturaPruebas)) {
    acciones.push({
      tipo: "separar_factura", id: f.ordenReal.id,
      facturaIds: f.ordenReal.facturaIds.filter((x) => x !== IDS.facturaPruebas),
      texto: `${f.ordenReal.codigo}: quitar el enlace a la factura de PRUEBAS 001-002-000000672 (el recibo lo emite el personal desde la orden)`,
    });
  }

  if (f.usuario?.activo) acciones.push({ tipo: "desactivar_usuario", id: f.usuario.id, texto: `Usuario «${f.usuario.nombre}» → inactivo` });
  if (f.servicio?.activo) acciones.push({ tipo: "desactivar_servicio", id: f.servicio.id, texto: `Servicio «${f.servicio.nombre}» → inactivo` });

  const pl = f.pagoEnLinea;
  if (pl && pl.estado === "Abierto") {
    if (pl.idTransaccion || pl.abonoIds.length) {
      avisos.push(`${pl.nombre}: tiene transacción o abono; no se toca. Revisar a mano en Pagos en línea.`);
    } else {
      acciones.push({ tipo: "cerrar_pago_en_linea", id: pl.id, texto: `${pl.nombre}: «Abierto» → «Vencido» (nunca se pagó; demostración al personal)` });
    }
  }

  return { acciones, avisos };
}

/** Constancia en la Actividad de cada orden tocada. */
export function textoActividadOrden(a: Extract<Accion, { tipo: "orden" }>): string {
  const partes = [
    a.marcar && "marcada como PRUEBA",
    a.mover && `pasada al cliente ${NOMBRE_CLIENTE_PRUEBA}`,
    a.cerrar && `vuelve a «${ESTADO_ENTREGADA}» (estaba entregada desde el 14-ago; la reapertura del 23-nov fue una prueba)`,
  ].filter(Boolean);
  return `Punto 16 (datos de prueba): orden ${partes.join(", ")}. Autorizado por el dueño el 26-nov-2026.`;
}

export const TEXTO_ACTIVIDAD_OR000342 =
  "Punto 16 (datos de prueba): se quitó el enlace a la factura 001-002-000000672, que era del ambiente de PRUEBAS (hecha en local a nombre de ALEX BOLAÑOS). Esta orden no tiene documento: emitir el recibo desde la Cuenta (decisión del dueño, 26-nov-2026).";

export const TEXTO_PEDIDO = `Punto 16 (datos de prueba): pedido marcado como PRUEBA y pasado al cliente ${NOMBRE_CLIENTE_PRUEBA}. Autorizado por el dueño el 26-nov-2026.`;
