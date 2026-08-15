// Guardián de red para las pruebas que hablan de verdad con Airtable y/o el
// SRI (no con dobles/mocks). Existe porque facturación está en producción
// desde el 14 de agosto de 2026 (ver
// docs/BITACORA_CORTE_PRODUCCION_FACTURACION_2026-08-14.md): correr una de
// estas pruebas sin querer, con las variables de entorno equivocadas, no
// falla en silencio — emite o consulta un documento tributario real, o
// escribe en la única base de Airtable que existe (SUPER GEEK ADM, no hay
// base de pruebas separada). El propio README de la bitácora contaba 2
// pruebas así; al inventariarlas de verdad (¿leen .env.local? ¿llaman a
// api.airtable.com o al SRI sin reemplazar fetch por un doble?) resultaron
// ser 7 — de ahí este guardián y la corrección en la bitácora.
//
// Dos candados, en este orden:
//
//   1. SRI_AMBIENTE === "2" → portazo absoluto, sin variable que lo salte.
//      "2" es PRODUCCIÓN: cualquier llamada al SRI en ese ambiente emite o
//      consulta un documento tributario real, sin importar qué diga
//      PRUEBAS_CON_RED. No existe caso de uso legítimo para correr estos
//      scripts sueltos contra producción — la emisión real pasa por el
//      portal, no por `npx tsx`.
//   2. PRUEBAS_CON_RED !== "1" → hay que pedirlo a propósito. Protege del
//      caso más común: correr "todas las pruebas" con un bucle o un
//      copy-paste y golpear Airtable/SRI sin querer.
//
// Se llama DESPUÉS de cargar .env.local (necesita SRI_AMBIENTE ya leído) y
// ANTES de la primera llamada de red de la prueba.
export function assertPruebaConRedPermitida(nombre: string): void {
  if (process.env.SRI_AMBIENTE === "2") {
    console.error(
      `❌  "${nombre}" usa el SRI de PRODUCCIÓN (SRI_AMBIENTE=2) — emitiría o ` +
      `consultaría documentos tributarios reales. Esto no se puede saltar: ` +
      `cambia SRI_AMBIENTE en el entorno donde corres la prueba.`
    );
    process.exit(1);
  }

  if (process.env.PRUEBAS_CON_RED !== "1") {
    console.error(
      `❌  "${nombre}" habla de verdad con Airtable y/o el SRI usando las ` +
      `credenciales reales de .env.local. No existe una base de Airtable de ` +
      `pruebas: escribe en SUPER GEEK ADM tal cual. Para correrla a propósito, ` +
      `antepón PRUEBAS_CON_RED=1, por ejemplo:\n` +
      `    PRUEBAS_CON_RED=1 NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/${nombre}.test.ts`
    );
    process.exit(1);
  }
}
