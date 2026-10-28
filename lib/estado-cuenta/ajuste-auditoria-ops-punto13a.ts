// Ajuste de datos de UNA SOLA VEZ — auditoría Técnicos y Operaciones,
// punto 13A. Reglas PURAS; el script scripts/ajuste-auditoria-ops-punto13a.ts
// lee, muestra la vista previa y, con --aplicar, escribe.
//
// La calculadora única (punto 4A) marcó 47 órdenes con "saldo a favor"
// ($2.115). Ninguna es un saldo a favor real: el cliente pagó lo que se le
// vendió, pero ese cargo nunca se registró en la orden.
//   · 43 órdenes viejas (antes del portal): sus abonos son el "Abono legacy
//     interfaz Airtable" del 1-ene-2026 y sus cargos no se migraron, o se
//     migraron incompletos. El detalle está en el historial de cada orden.
//   · 4 órdenes del portal, revisadas una por una con el dueño (CASOS_PUNTO13A).
// A cada una se le agrega lo que faltaba como cargo de la orden (Servicios por
// Orden, con su línea "Cargada" del presupuesto), por EXACTAMENTE lo que hoy
// sobra. No toca dinero, Finanzas ni inventario: el abono ya está y es real.
//
// Además: la nota de crédito 001-002-000000002 ($5, "Nota de credito de
// prueba", emitida en producción) deja de ser un crédito del cliente.
//
// Decisiones del dueño, 28-oct-2026 (claude/Decisiones_y_pendientes.md).
// Una orden que no encaja en ninguna regla NO se toca: queda como bloqueo
// para revisarla a mano.

export const MARCA_PUNTO13A = "Regularización auditoría ops punto 13A";

const TOL = 0.005;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Nombre del cargo que se agrega a las órdenes viejas. */
export const CARGO_SISTEMA_ANTERIOR = "Trabajo del sistema anterior";

export type CargoCaso = { nombre: string; costo: number };
export type CasoPunto13A = { orden: string; cargos: readonly CargoCaso[]; motivo: string };

/** Las 4 órdenes del portal, con lo que realmente se vendió (confirmado por el dueño). */
export const CASOS_PUNTO13A: readonly CasoPunto13A[] = [
  {
    orden: "OR000366",
    cargos: [
      { nombre: "SSD NVMe 128GB", costo: 60 },
      { nombre: "Disco mecánico 500GB", costo: 20 },
      { nombre: "Memoria RAM DDR4 4GB", costo: 35 },
      { nombre: "Licencia Antivirus McAfee", costo: 20 },
      { nombre: "Licencia Office 2021", costo: 30 },
    ],
    motivo: "La cliente pagó $215 por todos los servicios del historial; solo se habían cargado $50. Registrado sin artículo de inventario.",
  },
  {
    orden: "OR000397",
    cargos: [{ nombre: "Batería Dell Original 3HWPP", costo: 85 }],
    motivo: "El cliente solo compró la batería; el equipo se ingresó como orden de reparación. Registrado sin artículo de inventario.",
  },
  {
    orden: "OR000439",
    cargos: [{ nombre: "Servicio de carga", costo: 5 }],
    motivo: "Servicio sencillo de carga del equipo, cobrado $5 y nunca cargado.",
  },
  {
    orden: "OR000443",
    cargos: [{ nombre: "Cargador HP 45W Punta Azul", costo: 35 }],
    motivo: "Vendido en el recibo REC-000024 ($60 = servicio $25 + cargador $35); la orden no lo tenía. Registrado sin artículo de inventario.",
  },
];

/** NC de prueba que deja de ser crédito. */
export const NC_PRUEBA = {
  id: "rec0rUsWmBCRPdrhQ",
  numero: "001-002-000000002",
  saldo: 5,
} as const;

const ESTADO_ENTREGADA = "Finalizado Entregado";
const MARCA_ABONO_LEGACY = "Abono legacy";

// ─── Lecturas ────────────────────────────────────────────────────────────────

export type LecturaOrden = {
  id: string;
  codigo: string;
  estado: string;
  cliente: string;
  /** Lo que sobra hoy según la calculadora única (0 si no sobra). */
  aFavor: number;
  /** Abonos vigentes de la cuenta. */
  abonos: ReadonlyArray<{ monto: number; observacion: string }>;
};

/** Un cargo creado por este ajuste (lleva la marca en su Observación). */
export type LecturaCargoMarcado = {
  id: string;
  ordenId: string;
  ordenCodigo: string;
  nombre: string;
  costo: number;
  /** ¿Alguna línea del presupuesto ya apunta a este cargo? */
  tieneLinea: boolean;
};

export type LecturaNC = { existe: boolean; saldoDisponible: number; estadoCredito: string; motivo: string };

// ─── Acciones ────────────────────────────────────────────────────────────────

export type AccionPunto13A =
  | { tipo: "crear-cargo"; ordenId: string; ordenCodigo: string; nombre: string; costo: number; observacion: string; descripcion: string }
  | { tipo: "crear-linea"; ordenId: string; cargoId: string; nombre: string; costo: number; descripcion: string }
  | { tipo: "nc-sin-credito"; ncId: string; descripcion: string; campos: Record<string, unknown> };

export type PlanPunto13A = {
  acciones: AccionPunto13A[];
  bloqueos: string[];
  /** Resumen: órdenes que se corrigen y monto. */
  ordenes: Array<{ codigo: string; cliente: string; regla: "vieja" | "caso"; monto: number }>;
};

function observacionCargo(motivo: string): string {
  return `${MARCA_PUNTO13A} (autorizado por el dueño, 28-oct-2026). ${motivo}`;
}

/** ¿Es una orden vieja cuyo dinero vino del sistema anterior? */
export function esOrdenVieja(o: LecturaOrden): boolean {
  return (
    o.estado === ESTADO_ENTREGADA &&
    o.abonos.length > 0 &&
    o.abonos.every((a) => a.observacion.includes(MARCA_ABONO_LEGACY))
  );
}

export function planPunto13A(input: {
  /** Órdenes que HOY están en saldo a favor. */
  ordenesConSaldoAFavor: readonly LecturaOrden[];
  /** Cargos con la marca de este ajuste (de una corrida anterior). */
  cargosMarcados: readonly LecturaCargoMarcado[];
  nc: LecturaNC;
}): PlanPunto13A {
  const acciones: AccionPunto13A[] = [];
  const bloqueos: string[] = [];
  const ordenes: PlanPunto13A["ordenes"] = [];
  const casos = new Map(CASOS_PUNTO13A.map((c) => [c.orden, c]));
  const vistas = new Set<string>();

  for (const o of input.ordenesConSaldoAFavor) {
    if (vistas.has(o.id)) continue;
    vistas.add(o.id);
    const aFavor = r2(o.aFavor);
    if (aFavor <= TOL) continue;
    const etiqueta = `${o.codigo} (${o.cliente || "sin cliente"})`;
    const caso = casos.get(o.codigo);

    if (caso) {
      const suma = r2(caso.cargos.reduce((s, c) => s + c.costo, 0));
      if (Math.abs(suma - aFavor) > TOL) {
        bloqueos.push(`${etiqueta}: hoy le sobran $${aFavor.toFixed(2)} y el caso revisado era de $${suma.toFixed(2)}; algo cambió, no se toca`);
        continue;
      }
      for (const c of caso.cargos) {
        acciones.push({
          tipo: "crear-cargo", ordenId: o.id, ordenCodigo: o.codigo, nombre: c.nombre, costo: c.costo,
          observacion: observacionCargo(caso.motivo),
          descripcion: `${o.codigo}: + cargo "${c.nombre}" $${c.costo.toFixed(2)}`,
        });
      }
      ordenes.push({ codigo: o.codigo, cliente: o.cliente, regla: "caso", monto: aFavor });
      continue;
    }

    if (esOrdenVieja(o)) {
      acciones.push({
        tipo: "crear-cargo", ordenId: o.id, ordenCodigo: o.codigo, nombre: CARGO_SISTEMA_ANTERIOR, costo: aFavor,
        observacion: observacionCargo(
          `Cobrado antes del portal ("Abono legacy"); el cargo no se migró. El detalle de lo realizado está en el historial de la orden.`
        ),
        descripcion: `${o.codigo}: + cargo "${CARGO_SISTEMA_ANTERIOR}" $${aFavor.toFixed(2)}`,
      });
      ordenes.push({ codigo: o.codigo, cliente: o.cliente, regla: "vieja", monto: aFavor });
      continue;
    }

    bloqueos.push(`${etiqueta}: saldo a favor de $${aFavor.toFixed(2)} que no es de una orden vieja ni de un caso revisado; revisar a mano`);
  }

  // Cargos de una corrida anterior que quedaron sin su línea del presupuesto
  // (la escritura se cortó entre el cargo y la línea): se completa la línea.
  for (const c of input.cargosMarcados) {
    if (c.tieneLinea) continue;
    acciones.push({
      tipo: "crear-linea", ordenId: c.ordenId, cargoId: c.id, nombre: c.nombre, costo: c.costo,
      descripcion: `${c.ordenCodigo}: + línea del presupuesto para el cargo "${c.nombre}" $${c.costo.toFixed(2)} (ya creado)`,
    });
  }

  // NC de prueba.
  const nc = input.nc;
  if (!nc.existe) bloqueos.push(`NC ${NC_PRUEBA.numero}: no existe`);
  else if (nc.saldoDisponible > TOL) {
    if (Math.abs(nc.saldoDisponible - NC_PRUEBA.saldo) > TOL) bloqueos.push(`NC ${NC_PRUEBA.numero}: su crédito ya no es $${NC_PRUEBA.saldo} (es $${nc.saldoDisponible}); no se toca`);
    else if (!/prueba/i.test(nc.motivo)) bloqueos.push(`NC ${NC_PRUEBA.numero}: el motivo ya no dice "prueba"; no se toca`);
    else acciones.push({
      tipo: "nc-sin-credito", ncId: NC_PRUEBA.id,
      descripcion: `NC ${NC_PRUEBA.numero} (Abigail Moreno, prueba): crédito $${NC_PRUEBA.saldo.toFixed(2)} → $0`,
      campos: { "Saldo Disponible": 0, "Estado Crédito": "Consumido" },
    });
  }

  return { acciones, bloqueos, ordenes };
}

/** Lo que el cargo hace en la cuenta: después del ajuste, la orden queda en $0. */
export function saldoDespuesDelAjuste(aFavor: number, cargos: readonly { costo: number }[]): number {
  return r2(cargos.reduce((s, c) => s + c.costo, 0) - aFavor);
}
