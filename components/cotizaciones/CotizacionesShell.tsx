import { StaffAppShell } from "@/components/staff/StaffAppShell";

type Props = {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
};

export async function CotizacionesShell({ title, children, actions }: Props) {
  return (
    <StaffAppShell activeHref="/cotizaciones" sectionLabel="Cotizaciones">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-normal text-[#D7FF4F]">Cotizaciones</p>
            <h1 className="mt-1 text-xl font-semibold tracking-normal text-white sm:text-2xl">{title}</h1>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {children}
      </div>
    </StaffAppShell>
  );
}
