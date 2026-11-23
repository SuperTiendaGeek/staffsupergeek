// Motivos de ingreso — plan para pasar las órdenes viejas a chips (rediseño
// R7). PURO: el script `scripts/rediseno-r7-motivos.ts` lo usa con lo que lee
// de Airtable. Vuelve a correrse sin repetir nada: los motivos que ya existen
// (mismo nombre sin tildes) no se crean y las órdenes que ya tienen motivos no
// se tocan. «Ingresa Por» no se cambia: queda como «lo que dijo el cliente».

import { plano } from "./reglas";
import { CATALOGO_INICIAL, clasificarIngreso, type MotivoSemilla } from "./semilla";

export type OrdenParaMotivos = { id: string; codigo: string; ingresaPor: string; motivoIds: string[] };
export type PlanMotivos = {
  crear: MotivoSemilla[];
  ligar: Array<{ ordenId: string; codigo: string; ingresaPor: string; nombres: string[] }>;
  sinMotivo: Array<{ codigo: string; ingresaPor: string }>;
  yaTenian: number;
};

const clave = (s: string) => plano(s).replace(/\s+/g, " ").trim();

export function planMigracionMotivos(o: {
  existentes: Array<{ id: string; nombre: string }>;
  ordenes: OrdenParaMotivos[];
  catalogo?: MotivoSemilla[];
}): PlanMotivos {
  const catalogo = o.catalogo ?? CATALOGO_INICIAL;
  const hay = new Set(o.existentes.map((m) => clave(m.nombre)));
  const crear = catalogo.filter((m) => !hay.has(clave(m.nombre)));
  const ligar: PlanMotivos["ligar"] = [];
  const sinMotivo: PlanMotivos["sinMotivo"] = [];
  let yaTenian = 0;
  for (const ord of o.ordenes) {
    if (ord.motivoIds.length) { yaTenian++; continue; }
    const nombres = clasificarIngreso(ord.ingresaPor, catalogo);
    if (nombres.length) ligar.push({ ordenId: ord.id, codigo: ord.codigo, ingresaPor: ord.ingresaPor, nombres });
    else sinMotivo.push({ codigo: ord.codigo, ingresaPor: ord.ingresaPor });
  }
  return { crear, ligar, sinMotivo, yaTenian };
}

/** Acciones pendientes (la vista previa final debe dar 0). */
export const accionesPendientes = (p: PlanMotivos) => p.crear.length + p.ligar.length;

/** Ids de los motivos por nombre (sin tildes), con los ya existentes y los recién creados. */
export function idsPorNombre(nombres: string[], motivos: Array<{ id: string; nombre: string }>): string[] {
  const mapa = new Map(motivos.map((m) => [clave(m.nombre), m.id]));
  return nombres.map((n) => mapa.get(clave(n))).filter((x): x is string => !!x);
}
