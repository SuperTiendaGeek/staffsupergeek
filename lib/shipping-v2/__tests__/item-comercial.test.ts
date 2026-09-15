// Contrato: la disponibilidad comercial NO depende de la etapa logística.
// Ejecutar: npx tsx lib/shipping-v2/__tests__/item-comercial.test.ts

import {
  calcularDisponibleVenta,
  evaluarDisponibilidadComercial,
  tieneVeredictoBloqueante,
  VEREDICTOS_BLOQUEANTES,
} from "../item-comercial";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ─── La etapa logística NO bloquea ───────────────────────────────────────────
//
// SUPER GEEK vende importaciones bajo pedido: un cliente puede apartar algo
// que todavía está en eBay o en la caja de Roberto.

const ETAPAS = [
  "Registrado",
  "Pendiente de pago",
  "Pagado",
  "Pendiente de packing",
  "En packing",
  "En tránsito",
  "Recibido",
  "En revisión",
  "Disponible",
  "Reservado",
];

for (const estado of ETAPAS) {
  assert(
    evaluarDisponibilidadComercial({ estado }).apartable,
    `Un artículo en "${estado}" SÍ se puede apartar`
  );
}

// ─── Lo que sí bloquea ───────────────────────────────────────────────────────

const SALIDAS = ["Vendido", "Usado en reparación", "Destinado a partes", "Migrado", "Cancelado", "Archivado", "Devuelto"];
for (const estado of SALIDAS) {
  const resultado = evaluarDisponibilidadComercial({ estado });
  assert(!resultado.apartable, `Un artículo "${estado}" NO se puede apartar: ya salió del inventario`);
}
assert(
  evaluarDisponibilidadComercial({ estado: "Vendido" }).apartable === false,
  "Vendido sigue bloqueado (protección que ya existía)"
);

for (const veredicto of VEREDICTOS_BLOQUEANTES) {
  const resultado = evaluarDisponibilidadComercial({ estado: "En revisión", estadoRevision: veredicto });
  assert(!resultado.apartable, `Veredicto "${veredicto}" bloquea el apartado`);
  assert(
    !resultado.apartable && resultado.motivo === "revision-bloqueante",
    `Veredicto "${veredicto}" se reporta como problema de revisión`
  );
}

assert(
  evaluarDisponibilidadComercial({ estado: "En revisión", estadoRevision: "Recibido correctamente" }).apartable,
  "Un veredicto bueno no bloquea"
);
assert(
  evaluarDisponibilidadComercial({ estado: "En revisión", estadoRevision: "Aceptado con observación" }).apartable,
  "Aceptado con observación no bloquea: llegó bien con un detalle menor"
);

const conNovedad = evaluarDisponibilidadComercial({ estado: "Recibido", novedadesAbiertas: 2 });
assert(!conNovedad.apartable, "Una novedad abierta bloquea el apartado");
assert(!conNovedad.apartable && conNovedad.motivo === "novedades-abiertas", "El motivo distingue la novedad abierta");

assert(
  !evaluarDisponibilidadComercial({ estado: "Recibido", usoLocal: true }).apartable,
  "Uso local no se vende"
);
assert(
  evaluarDisponibilidadComercial({ estado: "Repuesto" }).apartable,
  "Un repuesto SÍ se puede comprometer: se monta en órdenes de reparación"
);

// "Con novedad" seguía bloqueando antes vía la lista de estados de
// facturación; al dejar de bloquear por etapa hubo que reponerlo aquí.
const conProblema = evaluarDisponibilidadComercial({ estado: "Con novedad" });
assert(!conProblema.apartable, "Un artículo Con novedad NO se puede apartar");
assert(!conProblema.apartable && conProblema.motivo === "estado-con-problema", "Se reporta como problema abierto, no como salida de inventario");
assert(
  !evaluarDisponibilidadComercial({ estado: "En garantía con proveedor" }).apartable,
  "Un artículo en garantía con el proveedor NO se puede apartar"
);

assert(tieneVeredictoBloqueante({ estadoRevision: "Dañado" }), "Dañado es veredicto bloqueante");
assert(!tieneVeredictoBloqueante({ estadoRevision: "Recibido correctamente" }), "Recibido correctamente no lo es");
assert(!tieneVeredictoBloqueante({}), "Sin veredicto no hay bloqueo");
assert(tieneVeredictoBloqueante({ estadoRevision: "danado" }), "Tolera el veredicto sin tilde");

// ─── Bandera derivada "Disponible para venta" ────────────────────────────────

assert(
  calcularDisponibleVenta({ estado: "En tránsito", unidadesLibres: 1 }),
  "En tránsito con unidades libres → disponible para venta"
);
assert(
  !calcularDisponibleVenta({ estado: "En tránsito", unidadesLibres: 0 }),
  "Sin unidades libres la bandera baja, aunque el artículo sea bueno"
);
assert(
  !calcularDisponibleVenta({ estado: "Recibido", estadoRevision: "Dañado", unidadesLibres: 5 }),
  "Con veredicto bloqueante la bandera baja aunque sobren unidades"
);
assert(
  !calcularDisponibleVenta({ estado: "Recibido", novedadesAbiertas: 1, unidadesLibres: 5 }),
  "Con novedad abierta la bandera baja aunque sobren unidades"
);

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}

console.log("✅ item-comercial.test.ts — todos los asserts pasaron");
