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
  searchParams?: Promise<{
    returnTo?: string | string[];
  }>;
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

function statusBadgeClasses(estadoDia: string) {
  if (estadoDia === "Incompleto") return "border-red-400/30 bg-red-400/10 text-red-200";
  if (estadoDia === "En almuerzo") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  return "border-sky-300/30 bg-sky-300/10 text-sky-100";
}

function getSearchParamValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function getSafeReturnTo(value?: string | string[]) {
  const returnTo = getSearchParamValue(value)?.trim();

  if (returnTo?.startsWith("/horarios/")) {
    return returnTo;
  }

  return "/horarios/admin";
}

function getRevisionCopy(estadoDia: string) {
  if (estadoDia === "Incompleto") {
    return "Esta jornada esta marcada como incompleta. Revisa las marcaciones faltantes y usa el formulario de correccion a continuacion.";
  }

  if (estadoDia === "Finalizado" || estadoDia === "Revisado") {
    return "Esta jornada ya fue cerrada. Como administrador puedes ajustar sus marcaciones y recalcular horas si el registro quedo mal.";
  }

  return "Esta jornada sigue abierta o en pausa. Revisa el estado actual y usa el formulario si es necesario regularizarla.";
}

export default async function HorarioJornadaRevisionPage({ params, searchParams }: PageProps) {
  const session = await getSessionFromCookie();

  if (!session) {
    redirect("/login");
  }

  if (!isAdministratorRole(session.user.rol)) {
    redirect("/acceso-denegado");
  }

  const { id } = await params;
  const paramsValue = await searchParams;
  const returnTo = getSafeReturnTo(paramsValue?.returnTo);
  const jornada = await fetchHorarioRegistroById(id);

  if (!jornada) {
    notFound();
  }

  const marcas = [
    { label: "Entrada", value: jornada.entrada },
    { label: "Salida almuerzo", value: jornada.salidaAlmuerzo },
    { label: "Regreso almuerzo", value: jornada.regresoAlmuerzo },
    { label: "Salida final", value: jornada.salidaFinal }
  ];

  return (
    <StaffAppShell activeHref="/horarios" sectionLabel="Horarios">
      <section className="w-full space-y-3 text-left">
        <Link
          href={returnTo}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#CFCFCB] transition hover:text-[#D7FF4F]"
        >
          ← Volver a horarios y pagos
        </Link>

        <section className="rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5">
          {/* Empleado + estado */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Revisando jornada</p>
              <h2 className="mt-0.5 text-xl font-semibold text-[#F5F5F5]">{jornada.empleado}</h2>
              <p className="mt-0.5 text-sm text-[#A7A7A7]">{jornada.correo || jornada.usuarioId}</p>
              <p className="mt-2 text-sm text-[#CFCFCB]">
                Fecha:{" "}
                <span className="font-semibold text-[#F5F5F5]">{jornada.fecha}</span>
              </p>
            </div>
            <span className={`inline-flex h-fit w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClasses(jornada.estadoDia)}`}>
              {jornada.estadoDia}
            </span>
          </div>

          {/* Nota contextual */}
          <p className="mt-3 text-xs text-[#8F908A]">
            {getRevisionCopy(jornada.estadoDia)}
          </p>

          {/* Marcaciones del día */}
          <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-[#8F908A]">Marcaciones del día</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {marcas.map((marca) => (
              <div
                key={marca.label}
                className={`rounded-xl border px-3 py-2.5 ${
                  marca.value
                    ? "border-[#D7FF4F]/25 bg-[#1E1F1C]"
                    : "border-[#3A3A36] bg-[#1E1F1C]"
                }`}
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">{marca.label}</p>
                <p className={`mt-0.5 text-lg font-semibold ${marca.value ? "text-[#F5F5F5]" : "text-[#A7A7A7]"}`}>
                  {formatTime(marca.value)}
                </p>
                {marca.value ? (
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#D7FF4F]/70">Registrado</p>
                ) : (
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400/70">Faltante</p>
                )}
              </div>
            ))}
          </div>

          {/* Resumen */}
          <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-[#8F908A]">Resumen</p>
          <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Horas actuales</p>
              <p className="mt-0.5 text-lg font-semibold text-[#F5F5F5]">{jornada.horasTrabajadas.toFixed(2)} h</p>
            </div>
            <div className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Total estimado</p>
              <p className="mt-0.5 text-lg font-semibold text-[#D7FF4F]">{formatMoney(jornada.totalEstimadoDia)}</p>
            </div>
            <div className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Valor hora</p>
              <p className="mt-0.5 text-lg font-semibold text-[#F5F5F5]">{formatMoney(jornada.valorHora)}</p>
            </div>
          </div>
        </section>

        <HorarioJornadaRevisionClient jornada={jornada} returnTo={returnTo} />
      </section>
    </StaffAppShell>
  );
}
