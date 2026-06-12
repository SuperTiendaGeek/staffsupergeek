import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HorarioJornadaRevisionClient } from "@/components/horarios/HorarioJornadaRevisionClient";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { isAdministratorRole } from "@/lib/apps";
import { fetchHorarioRegistroById } from "@/lib/horarios/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

const HORARIOS_TIME_ZONE = "America/Guayaquil";

function formatTime(value?: string) {
  if (!value) {
    return "--:--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: HORARIOS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

export default async function HorarioJornadaRevisionPage({ params }: PageProps) {
  const session = await getSessionFromCookie();

  if (!session) {
    redirect("/login");
  }

  if (!isAdministratorRole(session.user.rol)) {
    redirect("/acceso-denegado");
  }

  const { id } = await params;
  const jornada = await fetchHorarioRegistroById(id);

  if (!jornada) {
    notFound();
  }

  return (
    <StaffAppShell activeHref="/horarios" sectionLabel="Horarios">
      <section className="w-full space-y-3 text-left">
        <Link href="/horarios/admin" className="text-sm font-semibold text-geek-lime transition hover:text-white">
          Volver a horarios y pagos
        </Link>

        <section className="rounded-lg border border-[#30312D] bg-[#151613] px-3 py-2.5 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-zinc-400">Empleado</p>
              <h2 className="mt-1 text-xl font-semibold text-white">{jornada.empleado}</h2>
              <p className="mt-1 text-sm text-zinc-500">{jornada.correo || jornada.usuarioId}</p>
              <p className="mt-2 text-sm text-zinc-300">Fecha: {jornada.fecha}</p>
            </div>
            <span className="inline-flex rounded-md border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-xs font-semibold text-amber-100">
              {jornada.estadoDia}
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-[#30312D] bg-black/20 px-3 py-2">
              <p className="text-xs uppercase tracking-normal text-zinc-500">Entrada</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatTime(jornada.entrada)}</p>
            </div>
            <div className="rounded-lg border border-[#30312D] bg-black/20 px-3 py-2">
              <p className="text-xs uppercase tracking-normal text-zinc-500">Salida almuerzo</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatTime(jornada.salidaAlmuerzo)}</p>
            </div>
            <div className="rounded-lg border border-[#30312D] bg-black/20 px-3 py-2">
              <p className="text-xs uppercase tracking-normal text-zinc-500">Regreso almuerzo</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatTime(jornada.regresoAlmuerzo)}</p>
            </div>
            <div className="rounded-lg border border-[#30312D] bg-black/20 px-3 py-2">
              <p className="text-xs uppercase tracking-normal text-zinc-500">Salida final</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatTime(jornada.salidaFinal)}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[#30312D] bg-black/20 px-3 py-2">
              <p className="text-xs uppercase tracking-normal text-zinc-500">Horas actuales</p>
              <p className="mt-2 text-lg font-semibold text-white">{jornada.horasTrabajadas.toFixed(2)} h</p>
            </div>
            <div className="rounded-lg border border-[#30312D] bg-black/20 px-3 py-2">
              <p className="text-xs uppercase tracking-normal text-zinc-500">Total actual</p>
              <p className="mt-2 text-lg font-semibold text-geek-lime">{formatMoney(jornada.totalEstimadoDia)}</p>
            </div>
            <div className="rounded-lg border border-[#30312D] bg-black/20 px-3 py-2">
              <p className="text-xs uppercase tracking-normal text-zinc-500">Valor hora</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatMoney(jornada.valorHora)}</p>
            </div>
          </div>
        </section>

        <HorarioJornadaRevisionClient jornada={jornada} />
      </section>
    </StaffAppShell>
  );
}
