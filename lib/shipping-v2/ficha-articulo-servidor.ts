import "server-only";

// Punto 18 (25-oct-2026): UN solo cargador para la ficha del artículo.
//
// Lo usan la página /shipping-v2/items/[id] (entrada directa o recarga) y la
// ruta GET /api/shipping-v2/items/[id]/ficha (la ventana que se abre encima de
// las listas). Antes de leer el artículo decide quién es la sesión
// (Administrador, Staff, Técnico o Proveedor) y arma un paquete con SOLO los
// datos de ese perfil (listas en ficha-articulo.ts). Lo que un perfil no puede
// ver nunca sale del servidor: la pantalla no tiene nada que esconder después.

import { canAccessApp, isAdministratorRole } from "@/lib/apps";
import { camposConEstado, ocultarCamposDeObjeto } from "@/lib/permissions/campos";
import type { StaffSession } from "@/lib/session";
import type { ShippingV2NovedadRol } from "@/lib/shipping-v2/novedades";
import type { ShippingV2ResolvedItem } from "@/lib/shipping-v2/item-list-view";
import type { ShippingV2AccessContext, ShippingV2Item, ShippingV2Proveedor } from "@/types/shipping-v2";
import {
  getShippingV2AccessContextForSession,
  getShippingV2ItemById,
  getShippingV2NovedadesForItem,
  getShippingV2PackingById,
  getShippingV2PagoById,
  getShippingV2Proveedores,
  getShippingV2PublicacionesDeSku,
  getShippingV2RelacionComercialParaProveedor,
  getShippingV2SituacionPagoDeItem,
  getShippingV2TrazabilidadDeItem,
  getShippingV2UnidadesDelProducto,
} from "@/lib/shipping-v2/airtable";
import { canShippingV2, perfilShippingV2, puedeInspeccionarShippingV2 } from "@/lib/shipping-v2/access";
import { vieneDeAfuera } from "@/lib/shipping-v2/item-origen";
import { rutaUnidad } from "@/lib/shipping-v2/unidades-serie";
import { createShippingV2ProveedorLabelMap, resolveShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import {
  novedadParaTecnico,
  recortarItemProveedor,
  recortarItemTecnico,
  resumenPublicaciones,
  type FichaArticulo,
  type FichaInterna,
  type FichaProveedor,
  type FichaTecnica,
  type ResultadoFicha,
} from "@/lib/shipping-v2/ficha-articulo";

const ID_REGISTRO = /^rec[A-Za-z0-9]{14}$/;

function avisar(que: string) {
  return (error: unknown) => {
    console.warn(`[ficha del artículo] No se pudo cargar ${que}:`, error);
    return null;
  };
}

function rolNovedadesDe(access: ShippingV2AccessContext): ShippingV2NovedadRol {
  if (access.isAdmin) return access.isSiteAdmin ? "admin" : "staff";
  return access.providerId && access.permissions.canRespondNovedades ? "proveedor" : "ninguno";
}

function resolver(item: ShippingV2Item, proveedores: ShippingV2Proveedor[]): ShippingV2ResolvedItem {
  const etiquetas = createShippingV2ProveedorLabelMap(proveedores);
  return {
    ...item,
    proveedorCompraDisplay: resolveShippingV2ProveedorLabel(item.proveedorId, etiquetas),
    proveedorLogisticoDisplay: resolveShippingV2ProveedorLabel(item.proveedorLogisticoId, etiquetas),
  };
}

async function fichaInterna(item: ShippingV2Item, access: ShippingV2AccessContext, session: StaffSession): Promise<FichaInterna> {
  // Personalización por usuario (Campos restringidos). Un Administrador nunca queda restringido.
  const esAdmin = isAdministratorRole(session.user.rol);
  const restringidos = esAdmin ? {} : session.user.camposRestringidos;
  const camposOcultos = camposConEstado(restringidos, "shipping-v2", "items", "oculto");
  const camposSoloLectura = camposConEstado(restringidos, "shipping-v2", "items", "solo-lectura");

  const [proveedores, novedades, situacionPago] = await Promise.all([
    getShippingV2Proveedores(),
    getShippingV2NovedadesForItem(item.id, access).catch(() => []),
    getShippingV2SituacionPagoDeItem(item).catch(() => undefined),
  ]);
  const resuelto = ocultarCamposDeObjeto(resolver({ ...item, situacionPago }, proveedores), camposOcultos);
  const [pago, packing, trazabilidad, hermanas, publicaciones] = await Promise.all([
    resuelto.pagoId ? getShippingV2PagoById(resuelto.pagoId, access).catch(avisar("el pago")) : Promise.resolve(null),
    resuelto.packingId
      ? getShippingV2PackingById(resuelto.packingId, access, { includeItems: false, includeAiName: false }).catch(avisar("la caja"))
      : Promise.resolve(null),
    getShippingV2TrazabilidadDeItem(resuelto).catch(avisar("el recorrido")),
    getShippingV2UnidadesDelProducto(resuelto.sku, access).catch(() => []),
    resuelto.sku ? getShippingV2PublicacionesDeSku(resuelto.sku).catch(() => []) : Promise.resolve([]),
  ]);

  return {
    item: resuelto,
    proveedores,
    pago,
    packing,
    novedades,
    permissions: access.permissions,
    rolNovedades: rolNovedadesDe(access),
    trazabilidad,
    hermanas,
    enlaces: {
      facturacion: canAccessApp(session, "Facturación"),
      operaciones: canAccessApp(session, "Operaciones"),
      tecnicos: canAccessApp(session, "Técnicos"),
    },
    camposOcultos: [...camposOcultos],
    camposSoloLectura: [...camposSoloLectura],
    publicaciones: resumenPublicaciones(resuelto, publicaciones),
    costosTraerlo: canShippingV2(access, "canViewCosts") && !resuelto.packingId && vieneDeAfuera(resuelto.origenArticulo),
  };
}

async function fichaTecnica(item: ShippingV2Item, access: ShippingV2AccessContext, session: StaffSession): Promise<FichaTecnica> {
  const [novedades, hermanas, trazabilidad] = await Promise.all([
    getShippingV2NovedadesForItem(item.id, access).catch(() => []),
    getShippingV2UnidadesDelProducto(item.sku, access).catch(() => []),
    // Solo se usa "de dónde salió" (despiece o mejora); lo comercial no viaja.
    getShippingV2TrazabilidadDeItem(item).catch(avisar("el origen")),
  ]);
  const puedeInspeccionar = puedeInspeccionarShippingV2(access);
  return {
    item: recortarItemTecnico(item),
    novedades: novedades.map(novedadParaTecnico),
    rolNovedades: rolNovedadesDe(access),
    puedeRegistrarNovedades: canShippingV2(access, "canCreateNovedades"),
    hermanas,
    origen: {
      ...(trazabilidad?.itemPadre ? { itemPadre: trazabilidad.itemPadre } : {}),
      ...(trazabilidad?.origenMejora ? { origenMejora: trazabilidad.origenMejora } : {}),
    },
    puedeInspeccionar,
    ...(puedeInspeccionar && item.recibido === true ? { inspeccionHref: rutaUnidad(item, "inspeccion") } : {}),
    enlaces: { tecnicos: canAccessApp(session, "Técnicos") },
  };
}

async function fichaProveedor(item: ShippingV2Item, access: ShippingV2AccessContext): Promise<FichaProveedor> {
  const verCosto = canShippingV2(access, "canViewProviderCost");
  const puedeEditar = canShippingV2(access, "canEditProviderItemFields");
  const relacion = await getShippingV2RelacionComercialParaProveedor(item, access);
  return {
    item: recortarItemProveedor(item, { verCosto, verObservaciones: puedeEditar }),
    puedeEditar,
    verCosto,
    compra: relacion.compra,
    envio: relacion.envio,
    pagos: relacion.pagos,
    ...(relacion.estadoPago ? { estadoPago: relacion.estadoPago } : {}),
  };
}

/**
 * Valida la sesión y el acceso ANTES de leer nada y devuelve el paquete del
 * perfil, o el motivo por el que no se puede abrir.
 */
export async function cargarFichaArticulo(id: string, session: StaffSession | null): Promise<ResultadoFicha> {
  if (!session) return { ok: false, estado: 401, mensaje: "Inicia sesión para ver el artículo." };
  if (!canAccessApp(session, "Shipping")) return { ok: false, estado: 403, mensaje: "No tienes acceso a Shipping." };
  // Misma regla que puedeVerPantalla() (lib/permissions/pantallas.ts), escrita
  // aquí para no arrastrar next/navigation a un módulo de servidor que se prueba solo.
  if ((session.user.pantallasRestringidas?.["shipping-v2"] ?? []).includes("items")) {
    return { ok: false, estado: 403, mensaje: "No tienes acceso a los artículos." };
  }
  const recordId = String(id ?? "").trim();
  if (!ID_REGISTRO.test(recordId)) return { ok: false, estado: 404, mensaje: "No existe un artículo con ese código." };

  let access: ShippingV2AccessContext;
  try {
    access = await getShippingV2AccessContextForSession(session);
  } catch (error) {
    console.error("[ficha del artículo] No se pudo leer el acceso:", error);
    return { ok: false, estado: 500, mensaje: "No se pudo comprobar tu acceso. Intenta de nuevo." };
  }
  const perfil = perfilShippingV2(access);
  if (perfil === "ninguno" || !canShippingV2(access, "canViewItems")) {
    return { ok: false, estado: 403, mensaje: "No tienes acceso a los artículos." };
  }

  let item: ShippingV2Item;
  try {
    item = await getShippingV2ItemById(recordId, { access });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "";
    if (mensaje.includes("error 404")) return { ok: false, estado: 404, mensaje: "No existe un artículo con ese código." };
    // Un proveedor que pide un artículo ajeno recibe lo mismo que si no existiera.
    if (mensaje.includes("No tienes acceso")) return { ok: false, estado: 404, mensaje: "No existe un artículo con ese código." };
    console.error("[ficha del artículo] No se pudo cargar:", error);
    return { ok: false, estado: 500, mensaje: "No se pudo cargar el artículo. Intenta de nuevo." };
  }

  try {
    let ficha: FichaArticulo;
    if (perfil === "tecnico") ficha = { perfil, datos: await fichaTecnica(item, access, session) };
    else if (perfil === "proveedor") ficha = { perfil, datos: await fichaProveedor(item, access) };
    else ficha = { perfil, datos: await fichaInterna(item, access, session) };
    return { ok: true, ficha };
  } catch (error) {
    console.error("[ficha del artículo] No se pudo armar la ficha:", error);
    return { ok: false, estado: 500, mensaje: "No se pudo cargar el artículo. Intenta de nuevo." };
  }
}
