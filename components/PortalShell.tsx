import { StaffAppShell } from "@/components/staff/StaffAppShell";

type PortalShellProps = {
  children: React.ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  density?: "default" | "compact";
  activeHref?: string;
  sectionLabel?: string;
  headerSubtitle?: string;
  hidePageHeader?: boolean;
};

function inferActiveHref(title: string, eyebrow?: string) {
  const value = `${eyebrow || ""} ${title}`.toLowerCase();

  if (value.includes("shipping")) return "/shipping-v2";
  if (value.includes("dashboard")) return "/dashboard";
  if (value.includes("acceso denegado")) return "";
  if (value.includes("usuario")) return "/admin/usuarios";
  if (value.includes("notific")) return "/notificaciones";
  if (value.includes("horario") || value.includes("jornada") || value.includes("periodo")) return "/horarios";
  if (value.includes("finanza")) return "/finanzas";
  if (value.includes("factur")) return "/facturacion";

  return "/dashboard";
}

export async function PortalShell({
  children,
  eyebrow,
  title,
  description,
  density = "default",
  activeHref,
  sectionLabel,
  headerSubtitle,
  hidePageHeader = false,
}: PortalShellProps) {
  const isCompact = density === "compact";
  const resolvedSectionLabel = sectionLabel || eyebrow || title;

  return (
    <StaffAppShell activeHref={activeHref || inferActiveHref(title, eyebrow)} sectionLabel={resolvedSectionLabel} headerSubtitle={headerSubtitle}>
      <div className={isCompact ? "space-y-3" : "space-y-5"}>
        {hidePageHeader ? null : (
          <div className="flex flex-col gap-2 rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/20 sm:px-4 sm:py-3">
            {eyebrow ? <p className="text-[12px] font-bold uppercase tracking-normal text-[#D7FF4F]">{eyebrow}</p> : null}
            <div className="min-w-0">
              <h1 className={`${isCompact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"} font-semibold tracking-normal text-white`}>{title}</h1>
              {description ? <p className="mt-1 max-w-4xl text-sm leading-6 text-zinc-300 sm:text-base">{description}</p> : null}
            </div>
          </div>
        )}

        {children}
      </div>
    </StaffAppShell>
  );
}
