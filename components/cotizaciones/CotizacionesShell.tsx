import { StaffAppShell } from "@/components/staff/StaffAppShell";

type Props = {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
};

export async function CotizacionesShell({ title, children, actions }: Props) {
  const showHeading = title !== "Listado" && title !== "Cotizaciones";

  return (
    <StaffAppShell activeHref="/cotizaciones" sectionLabel="Cotizaciones">
      <div className="space-y-3">
        {showHeading || actions ? (
          <div className="flex flex-col gap-3 rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
            {showHeading ? (
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-normal text-white sm:text-2xl">{title}</h1>
              </div>
            ) : null}
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto">{actions}</div> : null}
          </div>
        ) : null}
        {children}
      </div>
    </StaffAppShell>
  );
}
