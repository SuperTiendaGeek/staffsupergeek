import { redirect } from "next/navigation";
import { OperacionesShell } from "@/components/operaciones/OperacionesShell";
import { OperacionesBoardClient } from "@/components/operaciones/OperacionesBoardClient";
import { fetchOperaciones } from "@/lib/operaciones/airtable";
import { seguimientosDePedidos } from "@/lib/pedidos-especiales/seguimiento-servidor";
import { estadoComercial } from "@/lib/pedidos-especiales/reglas";
import { fechaDeLlegada } from "@/lib/pedidos-especiales/seguimiento";
import { debeLiberarse, hoyEcuador } from "@/lib/pedidos-especiales/retiro";
import { isAdministratorRole } from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";
import type { OperacionListado } from "@/types/operaciones";

export const dynamic = "force-dynamic";

export default async function OperacionesPage() {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");

  let items: OperacionListado[] = [];
  let error = "";

  try {
    items = await fetchOperaciones({ conCuenta: true });
    // Punto 10B: el paso actual de cada pedido aceptado (lecturas en bloque).
    const aceptados = items.filter((o) => estadoComercial(o.estado) === "Aceptado").map((o) => o.id);
    const seg = await seguimientosDePedidos(aceptados).catch((e) => { console.error("[operaciones] seguimiento:", e); return new Map(); });
    // Punto 10C-3b: lo que llegó hace más de 3 meses y no se retiró.
    const hoy = hoyEcuador();
    items = items.map((o) => {
      const s = seg.get(o.id);
      if (!s?.actual) return o;
      const porLiberar = debeLiberarse({ estado: estadoComercial(o.estado), llegoEn: fechaDeLlegada(s), hoy });
      return { ...o, hito: { titulo: s.actual.titulo, aviso: s.aviso }, porLiberar };
    });
  } catch (loadError) {
    console.error("Error al cargar operaciones:", loadError);
    error =
      loadError instanceof Error
        ? loadError.message
        : "No se pudieron cargar las operaciones.";
  }

  return (
    <OperacionesShell title="Operaciones Comerciales">
      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      <OperacionesBoardClient initialItems={items} esAdmin={isAdministratorRole(session.user.rol)} />
    </OperacionesShell>
  );
}
