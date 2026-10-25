// Punto 18 (25-oct-2026): QUÉ SE MUESTRA y EN QUÉ ORDEN en la ficha del
// artículo de cada perfil. Es la "configuración en código" que el dueño eligió
// en lugar del editor visual (que se puede montar más adelante sobre esta
// misma tabla).
//
// IMPORTANTE: esto solo ordena y elige secciones. NO da permisos ni datos:
// lo que cada perfil recibe lo decide el servidor (ficha-articulo.ts y
// ficha-articulo-servidor.ts). Si aquí se pusiera una sección que el perfil no
// puede ver, simplemente saldría vacía: el dato nunca llegó al navegador.

export type PestanaFichaInterna = "general" | "costos" | "logistica" | "pago" | "packing" | "observaciones" | "despiece" | "intervenciones" | "kardex";
export type BloqueFichaInterna = "recorrido" | "publicaciones" | "pestanas" | "novedades";

export type ConfigFichaInterna = {
  /** El precio de venta se edita (solo Administrador; el servidor también lo exige). */
  precioEditable: boolean;
  /** Botón "Administrar" (activos, baja, corregir estado, eliminar). */
  administrar: boolean;
  bloques: readonly BloqueFichaInterna[];
  pestanas: readonly PestanaFichaInterna[];
};

export type PestanaFichaTecnica = "datos" | "mejoras" | "despiece";
export type BloqueFichaTecnica = "inspeccion" | "origen" | "pestanas" | "novedades";

export type BloqueFichaProveedor = "compra" | "envio" | "pagos" | "observaciones";

const PESTANAS_INTERNAS: readonly PestanaFichaInterna[] = ["general", "costos", "logistica", "pago", "packing", "observaciones", "despiece", "intervenciones", "kardex"];

export const FICHA_ADMIN: ConfigFichaInterna = {
  precioEditable: true,
  administrar: true,
  bloques: ["recorrido", "publicaciones", "pestanas", "novedades"],
  pestanas: PESTANAS_INTERNAS,
};

/** STAFF (25-oct): ve lo operativo y comercial; el precio solo se lee y no hay "Administrar". */
export const FICHA_STAFF: ConfigFichaInterna = {
  precioEditable: false,
  administrar: false,
  bloques: ["recorrido", "publicaciones", "pestanas", "novedades"],
  pestanas: PESTANAS_INTERNAS,
};

/** Técnico (25-oct): solo su trabajo técnico. */
export const FICHA_TECNICO = {
  bloques: ["inspeccion", "origen", "pestanas", "novedades"] as readonly BloqueFichaTecnica[],
  pestanas: ["mejoras", "despiece", "datos"] as readonly PestanaFichaTecnica[],
};

/** Proveedor (25-oct): solo su relación comercial con SUPER GEEK. */
export const FICHA_PROVEEDOR = {
  bloques: ["compra", "envio", "pagos", "observaciones"] as readonly BloqueFichaProveedor[],
};

export function configFichaInterna(perfil: "admin" | "staff"): ConfigFichaInterna {
  return perfil === "admin" ? FICHA_ADMIN : FICHA_STAFF;
}
