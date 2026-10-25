import type { ReactNode } from "react";
import { FichaArticuloProveedor } from "@/components/shipping-v2/ficha-articulo/FichaArticuloProveedor";

/**
 * Punto 18 (25-oct-2026): todas las pantallas de Shipping V2 comparten la
 * ventana única de la ficha del artículo. Cada página sigue armando su propio
 * StaffAppShell; este layout solo agrega la ventana (y el "?ficha=" de la
 * dirección) sin cambiar nada más.
 */
export default function ShippingV2Layout({ children }: { children: ReactNode }) {
  return <FichaArticuloProveedor>{children}</FichaArticuloProveedor>;
}
