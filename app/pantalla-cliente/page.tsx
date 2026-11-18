import { redirect } from "next/navigation";
import { getSessionFromCookie } from "@/lib/session";
import { PantallaClienteApp } from "@/components/pantalla-cliente/PantallaClienteApp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pantalla del cliente · SUPER GEEK", robots: { index: false, follow: false } };

// Pantalla del cliente (10E-B): la ventana que se abre en el monitor del
// mostrador. La abre un empleado con sesión; sin sesión, al login.
export default async function Page() {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");
  return <PantallaClienteApp />;
}
