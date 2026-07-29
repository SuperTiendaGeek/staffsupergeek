import { moduloMudadoAOperaciones } from "@/lib/modulo-mudado";

export const dynamic = "force-dynamic";

// Congelada: Cotizaciones se fusionó en Operaciones Comerciales y las tablas de
// Airtable que usaba esta ruta ya no existen. Ver lib/modulo-mudado.ts.

export async function POST() {
  return moduloMudadoAOperaciones("Cotizaciones");
}
