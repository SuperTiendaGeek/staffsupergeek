import { redirect } from "next/navigation";
import { OperacionesShell } from "@/components/operaciones/OperacionesShell";
import { OperacionesBoardClient } from "@/components/operaciones/OperacionesBoardClient";
import { fetchOperaciones } from "@/lib/operaciones/airtable";
import { getSessionFromCookie } from "@/lib/session";
import type { OperacionListado } from "@/types/operaciones";

export const dynamic = "force-dynamic";

export default async function OperacionesPage() {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");

  let items: OperacionListado[] = [];
  let error = "";

  try {
    items = await fetchOperaciones();
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
      <OperacionesBoardClient initialItems={items} />
    </OperacionesShell>
  );
}
