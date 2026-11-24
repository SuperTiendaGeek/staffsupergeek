// Lecturas compartidas (incidente de lentitud del 24-nov-2026,
// docs/incidentes/2026-11-24-lentitud.md).
//
// A las 10:00 alguien abrió «Por comprar» 31 veces en 3 minutos porque no cargaba.
// Cada clic volvía a leer las ~101 llamadas de la bandeja y se ponía al final de
// la fila: la espera pasó de 5 minutos. Con esto, si una lectura igual ya está en
// curso en esta instancia, el pedido nuevo espera ESA misma respuesta en vez de
// empezar otra.
//
// No es una caché: cuando la lectura termina se olvida, y el siguiente pedido lee
// de nuevo. Y si desde que empezó hubo una escritura a Airtable en esta instancia
// (por ejemplo «Registrar compra»), no se comparte: se lee otra vez, para no
// mostrar algo de antes del cambio.

import { generacionEscrituras } from "./airtable-ritmo";

type EnCurso = { generacion: number; promesa: Promise<unknown> };
const enCurso = new Map<string, EnCurso>();

export function compartirLectura<T>(clave: string, leer: () => Promise<T>): Promise<T> {
  const generacion = generacionEscrituras();
  const actual = enCurso.get(clave);
  if (actual && actual.generacion === generacion) return actual.promesa as Promise<T>;
  const promesa: Promise<T> = leer().finally(() => {
    if (enCurso.get(clave)?.promesa === promesa) enCurso.delete(clave);
  });
  enCurso.set(clave, { generacion, promesa });
  return promesa;
}

/** Solo para pruebas. */
export function lecturasEnCurso(): number {
  return enCurso.size;
}
