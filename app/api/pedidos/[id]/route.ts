import { moduloMudadoAOperaciones } from "@/lib/modulo-mudado";

export const dynamic = "force-dynamic";

// Congelada: Pedidos se fusionó en Operaciones Comerciales y las tablas de
// Airtable que usaba esta ruta ya no existen. Ver lib/modulo-mudado.ts.

export async function PATCH() {
  return moduloMudadoAOperaciones("Pedidos");
}
