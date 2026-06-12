import Link from "next/link";
import { StaffAppShell } from "@/components/staff/StaffAppShell";

export default function AccesoDenegadoPage() {
  return (
    <StaffAppShell activeHref="" sectionLabel="Portal Staff">
      <Link
        href="/dashboard"
        className="rounded-md bg-geek-lime px-5 py-3 text-sm font-semibold text-geek-black transition hover:bg-white"
      >
        Volver al dashboard
      </Link>
    </StaffAppShell>
  );
}
