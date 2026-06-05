import { StaffAppFrame } from "@/components/staff/StaffAppFrame";
import { getSessionFromCookie } from "@/lib/session";

type StaffAppShellProps = {
  children: React.ReactNode;
  activeHref?: string;
  sectionLabel?: string;
  headerSubtitle?: string;
};

export async function StaffAppShell({ children, activeHref, sectionLabel = "Portal Staff", headerSubtitle }: StaffAppShellProps) {
  const session = await getSessionFromCookie();

  return (
    <StaffAppFrame activeHref={activeHref} sectionLabel={sectionLabel} headerSubtitle={headerSubtitle} user={session?.user}>
      {children}
    </StaffAppFrame>
  );
}
