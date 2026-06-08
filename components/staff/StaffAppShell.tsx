import { StaffAppFrame } from "@/components/staff/StaffAppFrame";
import { getVisibleStaffApps } from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";

type StaffAppShellProps = {
  children: React.ReactNode;
  activeHref?: string;
  sectionLabel?: string;
  headerSubtitle?: string;
};

export async function StaffAppShell({ children, activeHref, sectionLabel = "Portal Staff", headerSubtitle }: StaffAppShellProps) {
  const session = await getSessionFromCookie();
  const visibleApps = getVisibleStaffApps(session);

  return (
    <StaffAppFrame activeHref={activeHref} sectionLabel={sectionLabel} headerSubtitle={headerSubtitle} user={session?.user} apps={visibleApps}>
      {children}
    </StaffAppFrame>
  );
}
