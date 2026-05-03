import Link from "next/link";
import { PortalShell } from "@/components/PortalShell";

export default function AccesoDenegadoPage() {
  return (
    <PortalShell
      eyebrow="Permisos"
      title="Acceso denegado"
      description="No tienes permisos para acceder a este módulo."
    >
      <Link
        href="/dashboard"
        className="rounded-md bg-geek-lime px-5 py-3 text-sm font-semibold text-geek-black transition hover:bg-white"
      >
        Volver al dashboard
      </Link>
    </PortalShell>
  );
}
