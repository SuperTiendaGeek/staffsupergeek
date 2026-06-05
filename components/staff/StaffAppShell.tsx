import { StaffAppFrame } from "@/components/staff/StaffAppFrame";
import { getSessionFromCookie } from "@/lib/session";

type StaffAppShellProps = {
  children: React.ReactNode;
  activeHref?: string;
  sectionLabel?: string;
};

export async function StaffAppShell({ children, activeHref, sectionLabel = "Portal Staff" }: StaffAppShellProps) {
  const session = await getSessionFromCookie();

  return (
    <StaffAppFrame activeHref={activeHref} sectionLabel={sectionLabel} user={session?.user}>
      {children}
    </StaffAppFrame>
  );
}
