import { StaffAppShell } from "@/components/staff/StaffAppShell";

type Props = {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
};

export async function OperacionesShell({ title, children, actions }: Props) {
  return (
    <StaffAppShell activeHref="/operaciones" sectionLabel="Operaciones">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 shadow-xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal text-[#F5F5F5] sm:text-2xl">
              {title}
            </h1>
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>
          ) : null}
        </div>
        {children}
      </div>
    </StaffAppShell>
  );
}
