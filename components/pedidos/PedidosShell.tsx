import { StaffAppShell } from "@/components/staff/StaffAppShell";

type Props = {
  title: string;
  pageTitle?: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
};

export async function PedidosShell({ title, pageTitle, subtitle, children, actions }: Props) {
  const heading = pageTitle ?? title;
  const showHeading = heading !== "Pedidos";

  return (
    <StaffAppShell activeHref="/pedidos" sectionLabel="Pedidos">
      <div className="space-y-3">
        {showHeading || actions ? (
          <div className="flex flex-col gap-3 rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
            {showHeading ? (
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-normal text-white sm:text-2xl">{heading}</h1>
                {subtitle ? <p className="mt-1 text-sm font-medium text-zinc-400 sm:text-base">{subtitle}</p> : null}
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
