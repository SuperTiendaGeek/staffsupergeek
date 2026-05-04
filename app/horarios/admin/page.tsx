import { redirect } from "next/navigation";
import { PortalShell } from "@/components/PortalShell";
import { getAdminSession } from "@/lib/admin-auth";
import { listHorariosRegistrosByDate } from "@/lib/horarios/airtable";

export const dynamic = "force-dynamic";

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function formatTime(value?: string) {
  if (!value) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("es-EC", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusClasses(status: string) {
  if (status === "Finalizado") {
    return "border-geek-lime/30 bg-geek-lime/10 text-geek-lime";
  }

  if (status === "En almuerzo") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }

  return "border-white/10 bg-white/[0.05] text-zinc-300";
}

export default async function HorariosAdminPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/acceso-denegado");
  }

  let error = "";
  let fecha = "";
  let registros: Awaited<ReturnType<typeof listHorariosRegistrosByDate>>["registros"] = [];

  try {
    const result = await listHorariosRegistrosByDate();
    fecha = result.fecha;
    registros = result.registros;
  } catch (loadError) {
    console.error("Error al cargar vista admin de horarios:", loadError);
    error = "No se pudo cargar la vista administrativa de horarios.";
  }

  return (
    <PortalShell
      eyebrow="Administración"
      title="Horarios del equipo"
      description="Vista rápida de las jornadas registradas hoy."
    >
      <section className="w-full max-w-6xl space-y-5 text-left">
        <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-sm text-zinc-400">Fecha</p>
          <p className="mt-1 text-xl font-semibold text-white">{fecha || "Hoy"}</p>
        </div>

        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/20 backdrop-blur">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Empleado</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Entrada</th>
                  <th className="px-4 py-3 font-semibold">Almuerzo</th>
                  <th className="px-4 py-3 font-semibold">Regreso</th>
                  <th className="px-4 py-3 font-semibold">Salida</th>
                  <th className="px-4 py-3 font-semibold">Horas</th>
                  <th className="px-4 py-3 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {registros.length ? (
                  registros.map((registro) => (
                    <tr key={registro.id} className="text-zinc-200">
                      <td className="px-4 py-4">
                        <p className="font-medium text-white">{registro.empleado}</p>
                        <p className="text-xs text-zinc-500">{registro.correo}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses(registro.estadoDia)}`}>
                          {registro.estadoDia}
                        </span>
                      </td>
                      <td className="px-4 py-4">{formatTime(registro.entrada)}</td>
                      <td className="px-4 py-4">{formatTime(registro.salidaAlmuerzo)}</td>
                      <td className="px-4 py-4">{formatTime(registro.regresoAlmuerzo)}</td>
                      <td className="px-4 py-4">{formatTime(registro.salidaFinal)}</td>
                      <td className="px-4 py-4 font-semibold text-white">{registro.horasTrabajadas.toFixed(2)}</td>
                      <td className="px-4 py-4 font-semibold text-geek-lime">{formatMoney(registro.totalEstimadoDia)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">
                      No hay registros de horarios para hoy.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </PortalShell>
  );
}
