// Ajuste de datos de UNA SOLA VEZ — auditoría Técnicos y Operaciones,
// punto 4A (27-oct-2026). Reglas PURAS (sin Airtable); el script
// scripts/ajuste-auditoria-ops-punto4.ts lee, muestra la vista previa y,
// con --aplicar, escribe.
//
// El reporte de la calculadora única encontró dos pedidos cuyos datos no
// reflejan lo que pasó; el dueño confirmó qué hacer con cada uno:
//
//  · OP-2026-000032 "Mainboard de Prueba" (OR000368): registro de PRUEBA que
//    quedó en "Pedido". Con la regla "lo aprobado suma" la orden pasaba a
//    deber $105 que nadie debe. Se pasa a "Rechazado" (adelanta una parte del
//    punto 16, datos de prueba).
//  · OP-2026-000015 cargador genérico 130 W (OR000344, Andrea Encalada): la
//    cliente pagó $45 y SE LE ENTREGÓ (confirmado por el dueño), pero el
//    pedido quedó en "Aprobado" sin opción elegida (migración de junio). Se
//    elige su única opción ($45) y pasa a "Entregado": la cuenta queda pagada
//    en vez de "saldo a favor $45".
//
// Cada cambio deja una nota en "Observación Interna" de la operación.

export const MARCA_PUNTO4 = "Regularización auditoría ops punto 4A";

export type LecturaOperacion = {
  existe: boolean;
  codigo: string;
  estado: string;
  producto: string;
  ordenIds: string[];
  opcionIds: string[];
  opcionElegidaIds: string[];
  articuloIds: string[];
  observacion: string;
};

export type LecturaOpcion = { existe: boolean; precio: number; operacionIds: string[] };

export type AccionPunto4 = {
  operacionId: string;
  descripcion: string;
  campos: Record<string, unknown>;
};

export type PlanPunto4 = { caso: string; acciones: AccionPunto4[]; bloqueos: string[] };

export const CASO_OP32 = {
  operacionId: "recxUxaEilBgnivWC",
  codigo: "OP-2026-000032",
  ordenId: "recvYZCZKoeNdeXLP", // OR000368
} as const;

export const CASO_OP15 = {
  operacionId: "recpGFDtFG64yNULX",
  codigo: "OP-2026-000015",
  ordenId: "recjZa1pvYTgGkHka", // OR000344
  opcionId: "recr27u4JyLI1xS9l",
  precio: 45,
} as const;

function nota(observacion: string, texto: string, fecha: string): string {
  const linea = `[${fecha}] ${MARCA_PUNTO4}: ${texto}`;
  return observacion.trim() ? `${observacion.trim()}\n${linea}` : linea;
}

export function planOP32(op: LecturaOperacion, fecha: string): PlanPunto4 {
  const caso = CASO_OP32.codigo;
  const bloqueos: string[] = [];
  if (!op.existe) bloqueos.push(`${caso} no existe`);
  else {
    if (op.codigo !== CASO_OP32.codigo) bloqueos.push(`el registro no es ${caso} (es ${op.codigo})`);
    if (!op.ordenIds.includes(CASO_OP32.ordenId)) bloqueos.push(`${caso} ya no está en OR000368`);
    if (!/prueba/i.test(op.producto)) bloqueos.push(`${caso} no parece de prueba ("${op.producto}")`);
    if (op.articuloIds.length > 0) bloqueos.push(`${caso} tiene artículo físico: revisar a mano`);
  }
  if (bloqueos.length || op.estado === "Rechazado") return { caso, acciones: [], bloqueos };
  return {
    caso,
    bloqueos,
    acciones: [{
      operacionId: CASO_OP32.operacionId,
      descripcion: `${caso}: ${op.estado} → Rechazado (registro de prueba)`,
      campos: {
        "Estado": "Rechazado",
        "Observación Interna": nota(op.observacion, "registro de prueba; se pasa a Rechazado para que no sume a la cuenta de OR000368. Autorizado por el dueño.", fecha),
      },
    }],
  };
}

export function planOP15(op: LecturaOperacion, opcion: LecturaOpcion, fecha: string): PlanPunto4 {
  const caso = CASO_OP15.codigo;
  const bloqueos: string[] = [];
  if (!op.existe) bloqueos.push(`${caso} no existe`);
  else {
    if (op.codigo !== CASO_OP15.codigo) bloqueos.push(`el registro no es ${caso} (es ${op.codigo})`);
    if (!op.ordenIds.includes(CASO_OP15.ordenId)) bloqueos.push(`${caso} ya no está en OR000344`);
    if (!op.opcionIds.includes(CASO_OP15.opcionId)) bloqueos.push(`la opción del cargador ya no es de ${caso}`);
    if (op.opcionElegidaIds.some((id) => id !== CASO_OP15.opcionId)) bloqueos.push(`${caso} ya tiene otra opción elegida`);
    if (op.articuloIds.length > 0) bloqueos.push(`${caso} tiene artículo físico: revisar a mano`);
  }
  if (!opcion.existe) bloqueos.push("la opción del cargador no existe");
  else if (Math.abs(opcion.precio - CASO_OP15.precio) > 0.005) bloqueos.push(`la opción ya no cuesta $${CASO_OP15.precio} (cuesta $${opcion.precio})`);
  if (bloqueos.length) return { caso, acciones: [], bloqueos };

  const yaElegida = op.opcionElegidaIds.length === 1 && op.opcionElegidaIds[0] === CASO_OP15.opcionId;
  if (yaElegida && op.estado === "Entregado") return { caso, acciones: [], bloqueos };
  return {
    caso,
    bloqueos,
    acciones: [{
      operacionId: CASO_OP15.operacionId,
      descripcion: `${caso}: ${op.estado} → Entregado, opción elegida $${CASO_OP15.precio} (cargador entregado a la cliente)`,
      campos: {
        "Opción Elegida": [CASO_OP15.opcionId],
        "Estado": "Entregado",
        "Observación Interna": nota(op.observacion, `el cargador se entregó a la cliente por $${CASO_OP15.precio} (confirmado por el dueño); se elige su opción y pasa a Entregado. Venía de la migración de junio sin opción elegida.`, fecha),
      },
    }],
  };
}
