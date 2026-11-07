import { NextResponse } from "next/server";
import { aplicarCompraDeLicencia } from "@/lib/compras/servidor";
import { solicitudPorId } from "@/lib/compras/airtable";
import { puedeComprar } from "@/lib/compras/reglas";
import { listarLineas } from "@/lib/tecnicos/presupuesto/airtable";
import { CATEGORIA_LICENCIA_DIGITAL, costoDeFila, errorFilaLicencia, errorSolicitudDeFila } from "@/lib/productos-digitales/compra";
import { credencialesDelTipo, errorCredenciales } from "@/lib/productos-digitales/reglas";
import { perfilShippingV2 } from "@/lib/shipping-v2/access";
import { ORIGEN_TIENDA } from "@/lib/shipping-v2/item-origen";
import {
  canShippingV2,
  createShippingV2Item,
  deshacerArticuloDeLicencia,
  getShippingV2AccessContextForSession,
  getShippingV2ProveedorById,
} from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { createProductoDigital, fetchCatalogoProductoDigitalById } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

// POST /api/shipping-v2/licencias — una licencia de "Registrar compra" en modo
// Producto digital (auditoría ops, punto 5B-2 · 7-nov-2026). La orden de
// compra ya existe (la crea el formulario antes) y el pago se registra al
// final contra la orden por su total, igual que una compra de artículos.
//
// Crea, en este orden:
//   1. el artículo de Shipping (categoría "Licencia digital", ya en la tienda,
//      dentro de su orden de compra) → lleva el costo y entra al Kardex;
//   2. la unidad DIG con sus credenciales, enlazada a ese artículo. Si falla,
//      el artículo se deshace (nunca un costo sin licencia);
//   3. si viene de una solicitud, la licencia se entrega en su línea de la
//      orden y la solicitud queda "Comprada". Si esto falla, la compra ya
//      existe: se avisa y la licencia queda libre para "Usar una del inventario".
// Solo Staff y Administradores (decisión del dueño).

type Cuerpo = {
  ordenCompraId?: string;
  proveedorId?: string;
  catalogoId?: string;
  costo?: number | null;
  precio?: number | null;
  reposicion?: boolean;
  claveActivacion?: string | null;
  usuarioCorreo?: string | null;
  contrasena?: string | null;
  duracion?: string | null;
  fechaCompra?: string | null;
  observaciones?: string | null;
  solicitudId?: string | null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export async function POST(request: Request) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canEditItems") || !puedeComprar(perfilShippingV2(access))) {
      return NextResponse.json({ success: false, error: "Las licencias las compran Staff o un Administrador." }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Cuerpo;
    const ordenCompraId = String(body.ordenCompraId ?? "").trim();
    const proveedorId = String(body.proveedorId ?? "").trim();
    const catalogoId = String(body.catalogoId ?? "").trim();
    if (!ordenCompraId) return NextResponse.json({ success: false, error: "Falta la orden de compra." }, { status: 400 });
    if (!proveedorId) return NextResponse.json({ success: false, error: "Elige el proveedor." }, { status: 400 });

    const fila = { catalogoId, costo: num(body.costo), precio: num(body.precio), reposicion: body.reposicion === true };
    const catalogo = catalogoId ? await fetchCatalogoProductoDigitalById(catalogoId) : null;
    const errFila = errorFilaLicencia(fila, catalogo);
    if (errFila) return NextResponse.json({ success: false, error: errFila }, { status: 400 });
    const entrada = { claveActivacion: body.claveActivacion, usuarioCorreo: body.usuarioCorreo, contrasena: body.contrasena };
    const errCred = errorCredenciales(catalogo!.tipo, entrada);
    if (errCred) return NextResponse.json({ success: false, error: errCred }, { status: 400 });
    const cred = credencialesDelTipo(catalogo!.tipo, entrada);

    // La solicitud se valida ANTES de crear nada: mismo producto, por comprar.
    const solicitudId = String(body.solicitudId ?? "").trim();
    if (solicitudId) {
      const s = await solicitudPorId(solicitudId);
      const linea = s?.ordenId && s.lineaId ? (await listarLineas(s.ordenId)).find((l) => l.id === s.lineaId) : undefined;
      const err = errorSolicitudDeFila(s, linea?.productoCatalogoId ?? null, catalogoId);
      if (err) return NextResponse.json({ success: false, error: err }, { status: 409 });
    }

    const proveedor = await getShippingV2ProveedorById(proveedorId);
    if (!proveedor) return NextResponse.json({ success: false, error: "El proveedor no existe." }, { status: 400 });
    const usuario = getShippingV2SessionName(session);
    const costo = costoDeFila(fila);

    // 1. El artículo (costo, orden de compra, Kardex).
    const item = await createShippingV2Item({
      nombre: catalogo!.productoBase,
      descripcion: "",
      tipoOperacion: fila.reposicion ? "Regalo de proveedor" : "Compra a proveedor",
      tipoItem: "",
      categoria: CATEGORIA_LICENCIA_DIGITAL,
      estado: "",
      proveedorId,
      proveedorLogisticoId: "",
      requierePago: false,
      requierePacking: false,
      afectaInventario: true,
      disponibleVenta: false,
      requiereInspeccion: false,
      sku: "",
      skuProveedor: "",
      modelo: "",
      marca: catalogo!.marca ?? "",
      numeroSerie: "",
      seguimiento: "Unidad",
      skuCompartido: "",
      condicion: "Nuevo",
      cantidad: 1,
      unidad: "",
      costoProveedor: fila.reposicion ? null : costo,
      precioVentaSugerido: fila.precio,
      precioVenta: fila.precio,
      ubicacionActual: "",
      observacionesInternas: String(body.observaciones ?? "").trim(),
      observacionVenta: "",
      estadoRevision: "",
      estadoTriangulacion: "",
      estadoDespiece: "",
      modoLogistico: "",
      trackingDirecto: "",
      origenArticulo: ORIGEN_TIENDA,
      trackingHaciaIntermediario: "",
      trackingDesdeIntermediario: "",
      transportistaOrigenId: "",
      transportistaEcuadorId: "",
      packingDestinoId: "",
      usoLocal: false,
    }, {
      registradoPor: usuario,
      ordenCompraId,
      // "Licencia digital" se crea como opción de Categoría la primera vez.
      typecast: true,
      eventDescription: "Licencia digital comprada desde Registrar compra.",
    });

    // 2. La licencia (credenciales), enlazada al artículo.
    let producto;
    try {
      producto = await createProductoDigital({
        catalogoId,
        articuloId: item.id,
        estado: "Disponible",
        proveedor: proveedor.nombre,
        costoProveedor: costo,
        precioVenta: fila.precio,
        claveActivacion: cred.claveActivacion,
        usuarioCorreo: cred.usuarioCorreo,
        contraseña: cred.contrasena,
        duracion: String(body.duracion ?? "").trim() || null,
        fechaCompra: String(body.fechaCompra ?? "").trim() || null,
        observacionesInternas: [fila.reposicion ? "Reposición del proveedor ($0)." : "", String(body.observaciones ?? "").trim()].filter(Boolean).join(" ") || null,
      });
    } catch (e) {
      await deshacerArticuloDeLicencia(item.id, usuario).catch((err) => console.error("[licencias] deshacer artículo", item.id, err));
      throw new Error(`No se pudo registrar la licencia (no se creó nada): ${e instanceof Error ? e.message : "error inesperado"}`);
    }
    // El artículo nunca se ofrece en Facturación: se vende su licencia.
    const { sincronizarArticulosDeLicencias } = await import("@/lib/productos-digitales/articulo-servidor");
    await sincronizarArticulosDeLicencias([producto.id]);

    // 3. La solicitud: se entrega en su línea.
    let aviso = "";
    let entregadaEn = "";
    if (solicitudId) {
      try {
        const r = await aplicarCompraDeLicencia({ solicitudId, itemId: item.id, productoId: producto.id, ordenCompraId, usuario, usuarioId: session?.user.userId ?? null });
        entregadaEn = r.codigo;
      } catch (e) {
        aviso = `${producto.sku || "La licencia"} quedó comprada, pero no se pudo entregar en su orden: ${e instanceof Error ? e.message : "error inesperado"}. En la orden usa "Usar una del inventario".`;
      }
    }

    return NextResponse.json({
      success: true,
      data: { itemId: item.id, itemSku: item.sku, productoId: producto.id, sku: producto.sku, solicitud: entregadaEn || null },
      warning: aviso || undefined,
    }, { status: 201 });
  } catch (error) {
    console.error("[licencias POST]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
