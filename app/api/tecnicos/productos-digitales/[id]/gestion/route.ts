import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import {
  anularProductoDigital,
  cambiarEstadoGestionProductoDigital,
  editarProductoDigital,
  fetchCatalogoProductoDigitalById,
  fetchProductoDigitalById,
} from "@/lib/tecnicos/airtable";
import { destinoReclamo, errorGestion, TEXTO_RESOLUCION, type AccionGestion, type ResolucionReclamo } from "@/lib/productos-digitales/compra";
import { credencialesDelTipo } from "@/lib/productos-digitales/reglas";
import { puedeGestionarLicencias } from "@/lib/productos-digitales/permiso-servidor";

export const dynamic = "force-dynamic";

// POST /api/tecnicos/productos-digitales/[id]/gestion (punto 5B-2).
// Lo que Staff y Administradores pueden hacer con una licencia:
//   editar   → corrige credenciales mal escritas (solo las de su tipo) + nota.
//   reclamo  → "En reclamo": la licencia libre no se ofrece mientras el proveedor revisa.
//   resolver → funcionó (vuelve a Disponible) · el proveedor la repuso o no
//              (queda Anulada; la nueva se registra en $0 en Registrar compra).
//   anular   → con motivo.
// Las reglas: lib/productos-digitales/compra.ts (accionesDeGestion, errorGestion).

type Params = { params: Promise<{ id: string }> };
const ACCIONES: AccionGestion[] = ["editar", "reclamo", "resolver", "anular"];
const RESOLUCIONES: ResolucionReclamo[] = ["funciono", "repuesta", "no_repuesta"];

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  if (!(await puedeGestionarLicencias(session))) {
    return NextResponse.json({ success: false, error: "Solo Staff o un Administrador gestiona las licencias." }, { status: 403 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    accion?: string; motivo?: string; resolucion?: string;
    claveActivacion?: string; usuarioCorreo?: string; contrasena?: string;
  };
  const accion = ACCIONES.find((a) => a === body.accion);
  if (!accion) return NextResponse.json({ success: false, error: "Acción no válida." }, { status: 400 });
  const motivo = String(body.motivo ?? "").trim();
  const por = session.user.nombre || "Portal";

  try {
    const pd = await fetchProductoDigitalById(id);
    if (!pd) return NextResponse.json({ success: false, error: "Licencia no encontrada." }, { status: 404 });
    const err = errorGestion(accion, pd, accion === "editar" ? "x" : motivo);
    if (err) return NextResponse.json({ success: false, error: err }, { status: 409 });

    if (accion === "editar") {
      const cat = pd.catalogoId ? await fetchCatalogoProductoDigitalById(pd.catalogoId) : null;
      const cred = credencialesDelTipo(cat?.tipo ?? pd.tipoProducto, { claveActivacion: body.claveActivacion, usuarioCorreo: body.usuarioCorreo, contrasena: body.contrasena });
      await editarProductoDigital({ productoId: id, claveActivacion: cred.claveActivacion, usuarioCorreo: cred.usuarioCorreo, contrasena: cred.contrasena, nota: motivo, por });
      return NextResponse.json({ success: true });
    }
    if (accion === "reclamo") {
      await cambiarEstadoGestionProductoDigital({ productoId: id, estado: "En reclamo", nota: `Reclamo al proveedor${pd.proveedor ? ` (${pd.proveedor})` : ""}: ${motivo}`, por });
      return NextResponse.json({ success: true });
    }
    if (accion === "anular") {
      await anularProductoDigital({ productoId: id, motivo, por });
      return NextResponse.json({ success: true });
    }
    const resolucion = RESOLUCIONES.find((r) => r === body.resolucion);
    if (!resolucion) return NextResponse.json({ success: false, error: "Elige cómo se resolvió el reclamo." }, { status: 400 });
    const texto = `${TEXTO_RESOLUCION[resolucion]}. ${motivo}`;
    if (destinoReclamo(resolucion) === "Disponible") {
      await cambiarEstadoGestionProductoDigital({ productoId: id, estado: "Disponible", nota: `Reclamo resuelto — ${texto}`, por });
    } else {
      await anularProductoDigital({ productoId: id, motivo: `Reclamo resuelto — ${texto}`, por });
    }
    return NextResponse.json({
      success: true,
      // La nueva licencia que entregó el proveedor se registra en $0 ("Reposición").
      registrarReposicion: resolucion === "repuesta" ? "/shipping-v2/items/nuevo?tipo=digital" : undefined,
    });
  } catch (e) {
    console.error("[productos-digitales gestion]", id, accion, e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}
