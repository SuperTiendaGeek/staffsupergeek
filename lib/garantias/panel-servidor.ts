import "server-only";

// Pantalla "Garantías" — LECTURA (auditoría ops, punto 20). Reglas en ./panel.ts.

import { porIds, numero, texto } from "@/lib/estado-cuenta/airtable";
import { lineasConGarantia } from "@/lib/tecnicos/presupuesto/airtable";
import { hoyEcuador } from "@/lib/saldo-favor/servidor";
import { armarFilas, resumenDelMes, type FilaGarantia, type ResumenPanel } from "./panel";

export async function panelDeGarantias(): Promise<{ filas: FilaGarantia[]; resumen: ResumenPanel; mes: string }> {
  const lineas = await lineasConGarantia();
  const [ordenes, items] = await Promise.all([
    porIds("Órdenes de Reparación", lineas.map((l) => l.ordenId).filter((x): x is string => !!x), ["ID", "ClienteTXT", "Equipo"]),
    porIds("Shipping Items", lineas.map((l) => l.itemId).filter((x): x is string => !!x), ["SKU", "Costo total unidad", "Costo proveedor"]),
  ]);
  const filas = armarFilas({
    lineas,
    ordenes: new Map([...ordenes].map(([id, o]) => [id, { codigo: texto(o.fields["ID"]) || id, cliente: texto(o.fields["ClienteTXT"]), equipo: texto(o.fields["Equipo"]) }])),
    articulos: new Map([...items].map(([id, it]) => {
      const total = it.fields["Costo total unidad"];
      const prov = it.fields["Costo proveedor"];
      const costo = typeof total === "number" ? total : typeof prov === "number" ? numero(prov) : null;
      return [id, { sku: texto(it.fields["SKU"]), costo }];
    })),
  });
  const mes = hoyEcuador().slice(0, 7);
  return { filas, resumen: resumenDelMes(filas, mes), mes };
}
