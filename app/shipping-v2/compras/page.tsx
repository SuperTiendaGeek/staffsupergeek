import { redirect } from "next/navigation";
import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { perfilShippingV2 } from "@/lib/shipping-v2/access";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { puedeComprar } from "@/lib/compras/reglas";
import { filasBandeja, type FilaBandeja } from "@/lib/compras/servidor";
import { BandejaComprasClient } from "./BandejaComprasClient";

export const dynamic = "force-dynamic";

// Bandeja "Por comprar" (auditoría ops, Fase 2: puntos 9, 3, 8 y 12). Lo que
// hay que comprar para clientes nace solo al aprobar; aquí Staff lo compra
// (Registrar compra), lo aparta si ya existe, o lo cancela con motivo.
export default async function ComprasPage() {
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "compras");
  const access = await getShippingV2AccessContextForSession(session);
  if (!puedeComprar(perfilShippingV2(access))) redirect("/shipping-v2");

  let filas: FilaBandeja[] = [];
  let error = "";
  try {
    filas = await filasBandeja();
  } catch (e) {
    console.error("[shipping-v2/compras]", e);
    error = "No se pudo leer la bandeja. Recarga la página.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/compras" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
        <ShippingV2Pestanas />
        <BandejaComprasClient filas={filas} error={error} />
      </div>
    </StaffAppShell>
  );
}
