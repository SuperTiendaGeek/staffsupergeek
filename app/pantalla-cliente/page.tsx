import { redirect } from "next/navigation";
import { getSessionFromCookie } from "@/lib/session";
import { PantallaClienteApp } from "@/components/pantalla-cliente/PantallaClienteApp";
import { configPantalla } from "@/lib/pantalla-cliente/config-servidor";
import { puedeUsarPantalla } from "@/lib/pantalla-cliente/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pantalla del cliente · SUPER GEEK", robots: { index: false, follow: false } };

// Pantalla del cliente (10E-B/C): la ventana que se abre en el monitor del
// mostrador. La abre un empleado con sesión y permiso (Administrar decide
// qué roles: dueño, 18-nov → Administradores y Staff).
export default async function Page() {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");
  const c = await configPantalla();
  if (!puedeUsarPantalla(session.user.rol, c)) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#151613] p-6 text-center text-[#B5B5AE]">
        <p>{c.activa ? "Tu usuario no puede usar la pantalla del cliente." : "La pantalla del cliente está apagada en Administrar."}</p>
      </main>
    );
  }
  return <PantallaClienteApp ajustes={{ segundosGracias: c.segundosGracias, minutosSinActividad: c.minutosSinActividad, textoReposo: c.textoReposo }} />;
}
