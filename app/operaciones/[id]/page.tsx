import { notFound, redirect } from "next/navigation";
import { OperacionesShell } from "@/components/operaciones/OperacionesShell";
import { OperacionDetalleClient } from "@/components/operaciones/OperacionDetalleClient";
import { fetchOperacionDetalle } from "@/lib/operaciones/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function OperacionDetallePage({ params }: Props) {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");

  const { id } = await params;
  const operacion = await fetchOperacionDetalle(id).catch((err) => {
    console.error("[operaciones/[id]] Error al cargar detalle:", err);
    return null;
  });

  if (!operacion) notFound();

  return (
    <OperacionesShell title={operacion.codigo}>
      <OperacionDetalleClient operacion={operacion} />
    </OperacionesShell>
  );
}
