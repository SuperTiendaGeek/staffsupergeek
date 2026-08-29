import { SHIPPING_V2_ITEM_EDIT_FIELDS, type ShippingV2ItemEditFieldConfig } from "@/lib/shipping-v2/item-edit-config";
import type { ModuloConPantallas } from "@/lib/permissions/pantallas";

// Fase 2 de personalizar el acceso: control por CAMPO dentro de una pantalla.
// Se construye sobre la Fase 1 (lib/permissions/pantallas.ts) — una pantalla
// oculta ya bloquea todos sus campos sin que este archivo tenga que saberlo.
//
// Tres estados por campo, no dos: "oculto" (no se ve el dato), "solo-lectura"
// (se ve, no se edita) y el implícito "editable" (ausente del JSON = como
// siempre). Es justo lo que Cantidad NO usa: ese campo se quedó con el
// candado absoluto de adminOnly (ver item-edit-config.ts) porque siempre
// debe requerir Administrador, sin que un admin pueda soltarlo por accidente
// configurando este panel. Por eso los campos adminOnly quedan FUERA del
// catálogo configurable de abajo — no tiene sentido ofrecer "solo-lectura"
// sobre un campo que ya es más estricto que eso.

export type EstadoCampoPersonalizado = "oculto" | "solo-lectura";

export type CampoDef = { key: string; label: string };

// modulo -> pantalla -> campoKey -> estado. Igual que PantallasRestringidas,
// sin tipar el modulo/pantalla a los catálogos actuales: así un valor viejo
// (pantalla renombrada, módulo retirado) no se pierde al guardar, solo queda
// inerte.
export type CamposRestringidos = Record<string, Record<string, Record<string, EstadoCampoPersonalizado>>>;

const CAMPO_VACIO: CamposRestringidos = {};

// El catálogo de "items" sale de la config existente de la ficha del item —
// una sola fuente de verdad, para que agregar/quitar un campo ahí no
// requiera acordarse de duplicar el cambio aquí.
const CAMPOS_ITEMS_EDITABLES: readonly CampoDef[] = (Object.values(SHIPPING_V2_ITEM_EDIT_FIELDS) as ShippingV2ItemEditFieldConfig[])
  .filter((f) => (f.category === "normal" || f.category === "special") && !f.adminOnly)
  .map((f) => ({ key: f.key, label: f.label }));

// La tarjeta "Resumen rápido" del item (costo/ganancia) es JSX a mano, no
// pasa por SHIPPING_V2_ITEM_EDIT_FIELDS — de ahí que estas claves no tengan
// config de edición propia. "costoTotalUnidad" y "costoLogisticoAsignado" SÍ
// son propiedades reales de ShippingV2Item (ocultarCamposDeObjeto las
// redacta solas); "costoTotalStock", "gananciaUnidad" y "gananciaStock" son
// valores que la pantalla calcula al vuelo a partir de esas dos más
// costoProveedor/precioVenta/cantidad — no existen como propiedad del item,
// así que "oculto" en ellas solo controla si la FILA se dibuja, no redacta
// ningún dato (no hay ningún dato propio que redactar: ocultando sus
// insumos ya cae en "—" de todas formas).
const CAMPOS_ITEMS_RESUMEN_COSTOS: readonly CampoDef[] = [
  { key: "costoTotalUnidad", label: "Costo total unitario" },
  { key: "costoLogisticoAsignado", label: "Costo logístico" },
  { key: "costoTotalStock", label: "Costo total del stock" },
  { key: "gananciaUnidad", label: "Ganancia por unidad" },
  { key: "gananciaStock", label: "Ganancia total del stock" },
];

const CAMPOS_ITEMS_CONFIGURABLES: readonly CampoDef[] = [
  ...CAMPOS_ITEMS_EDITABLES,
  ...CAMPOS_ITEMS_RESUMEN_COSTOS,
];

// Solo "items" tiene hoy un renderizado de campos genérico y data-driven
// (DetailSection en ShippingV2ItemsClient.tsx). Recepción/Packings/Pagos son
// pantallas hechas a medida sin ese catálogo — agregarlas es trabajo aparte,
// no solo registrar la entrada acá.
export const CAMPOS_POR_PANTALLA: Partial<Record<ModuloConPantallas, Partial<Record<string, readonly CampoDef[]>>>> = {
  "shipping-v2": {
    items: CAMPOS_ITEMS_CONFIGURABLES,
  },
};

export function camposConfigurables(modulo: ModuloConPantallas, pantalla: string): readonly CampoDef[] {
  return CAMPOS_POR_PANTALLA[modulo]?.[pantalla] ?? [];
}

function esEstadoValido(value: unknown): value is EstadoCampoPersonalizado {
  return value === "oculto" || value === "solo-lectura";
}

/** Parseo defensivo del JSON guardado en Airtable — nunca lanza. */
export function parseCamposRestringidos(raw: string | null | undefined): CamposRestringidos {
  if (!raw || !raw.trim()) return CAMPO_VACIO;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return CAMPO_VACIO;
    const result: CamposRestringidos = {};
    for (const [modulo, pantallas] of Object.entries(parsed as Record<string, unknown>)) {
      if (!pantallas || typeof pantallas !== "object" || Array.isArray(pantallas)) continue;
      const pantallasLimpias: Record<string, Record<string, EstadoCampoPersonalizado>> = {};
      for (const [pantalla, campos] of Object.entries(pantallas as Record<string, unknown>)) {
        if (!campos || typeof campos !== "object" || Array.isArray(campos)) continue;
        const camposLimpios: Record<string, EstadoCampoPersonalizado> = {};
        for (const [campo, estado] of Object.entries(campos as Record<string, unknown>)) {
          if (esEstadoValido(estado)) camposLimpios[campo] = estado;
        }
        if (Object.keys(camposLimpios).length > 0) pantallasLimpias[pantalla] = camposLimpios;
      }
      if (Object.keys(pantallasLimpias).length > 0) result[modulo] = pantallasLimpias;
    }
    return result;
  } catch {
    return CAMPO_VACIO;
  }
}

export function serializeCamposRestringidos(value: CamposRestringidos): string {
  // Los mismos vacíos que parseCamposRestringidos ya descarta al leer, para
  // no ir acumulando ramas muertas en el JSON con cada guardado.
  return Object.keys(value).length > 0 ? JSON.stringify(value) : "";
}

/** Estado configurado para un campo — null si no se restringió (editable, como siempre). */
export function estadoCampo(
  restringidos: CamposRestringidos,
  modulo: ModuloConPantallas,
  pantalla: string,
  campo: string
): EstadoCampoPersonalizado | null {
  return restringidos[modulo]?.[pantalla]?.[campo] ?? null;
}

export function puedeVerCampo(
  restringidos: CamposRestringidos,
  modulo: ModuloConPantallas,
  pantalla: string,
  campo: string
): boolean {
  return estadoCampo(restringidos, modulo, pantalla, campo) !== "oculto";
}

export function puedeEditarCampo(
  restringidos: CamposRestringidos,
  modulo: ModuloConPantallas,
  pantalla: string,
  campo: string
): boolean {
  return estadoCampo(restringidos, modulo, pantalla, campo) === null;
}

/** Claves de campo con un estado dado, para pasar a las funciones de lectura/escritura del servidor. */
export function camposConEstado(
  restringidos: CamposRestringidos,
  modulo: ModuloConPantallas,
  pantalla: string,
  estado: EstadoCampoPersonalizado
): string[] {
  const campos = restringidos[modulo]?.[pantalla] ?? {};
  return Object.entries(campos)
    .filter(([, v]) => v === estado)
    .map(([key]) => key);
}

/**
 * Redacta campos "oculto" de un objeto antes de que salga hacia el usuario
 * que no debe verlos — la puerta fuerte de LECTURA, hermana de
 * puedeEditarCampo() para escritura. Se llama en la frontera de API (page.tsx
 * y las rutas GET/PATCH de items), nunca dentro de getShippingV2ItemById():
 * esa función la reutilizan cálculos internos (despiece, packing, etc.) que
 * necesitan el dato real sin importar quién esté mirando la pantalla.
 *
 * Vacía cada campo según su tipo runtime, sin asumir su forma declarada —
 * así nunca deja un valor a medias (ej. un string vacío sigue siendo un
 * string válido para cualquier .trim()/.toUpperCase() que ya exista).
 */
export function ocultarCamposDeObjeto<T extends Record<string, unknown>>(objeto: T, camposOcultos: string[]): T {
  if (camposOcultos.length === 0) return objeto;
  const result: Record<string, unknown> = { ...objeto };
  for (const key of camposOcultos) {
    if (!(key in result)) continue;
    const actual = result[key];
    if (typeof actual === "string") result[key] = "";
    else if (typeof actual === "number") result[key] = null;
    else if (typeof actual === "boolean") result[key] = false;
    else if (Array.isArray(actual)) result[key] = [];
    else result[key] = null;
  }
  return result as T;
}
