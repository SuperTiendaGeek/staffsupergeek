/**
 * Prueba REAL del almacén de reservas contra Vercel Blob (etapa D2).
 * Demuestra que el servicio garantiza "una sola reserva" con procesos simultáneos.
 * Escribe archivos temporales en pagos-en-linea/reservas/_prueba/ y los borra al final.
 * No toca Airtable, ni DeUna, ni PayPhone. No imprime credenciales.
 *
 *   NODE_USE_ENV_PROXY=1 NODE_OPTIONS="--conditions react-server" npx tsx --env-file=.env.local scripts/prueba-reservas-blob.ts
 */
import { del } from "@vercel/blob";
import { almacenBlob } from "@/lib/pagos-en-linea/una-vez-blob";
import { registrarUnaVez, type Reserva } from "@/lib/pagos-en-linea/una-vez";

const base = `pagos-en-linea/reservas/_prueba/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const r = (codigo: string): Reserva => ({ codigo, ficha: codigo, estado: "en_curso", desde: new Date().toISOString() });
let fallos = 0;
const ok = (c: boolean, m: string) => { if (!c) fallos++; console.log(c ? "✓" : "✗", m); };

const corte = setTimeout(() => { console.error("✗ sin respuesta de Vercel Blob en 90 s"); process.exit(2); }, 90_000);
(async () => {
  const creadas: string[] = [];
  try {
    // 1. Diez "crear" simultáneos del mismo archivo: el servicio deja crear UNO.
    const k1 = `${base}/crear.json`; creadas.push(k1);
    const res = await Promise.all(Array.from({ length: 10 }, (_, i) => almacenBlob.crear(k1, r(`P${i}`)).catch((e) => ({ estado: "error", e }))));
    const nCreadas = res.filter((x) => x.estado === "creada").length;
    const nExiste = res.filter((x) => x.estado === "existe").length;
    ok(nCreadas === 1 && nExiste === 9, `10 simultáneos → creadas ${nCreadas}, ya existía ${nExiste}, errores ${res.length - nCreadas - nExiste}`);

    // 2. Cinco "reemplazar" simultáneos con el MISMO ETag: el servicio acepta UNO.
    const actual = await almacenBlob.leer(k1);
    ok(!!actual, "se lee la reserva sin caché");
    const rem = await Promise.all(Array.from({ length: 5 }, (_, i) => almacenBlob.reemplazar(k1, r(`R${i}`), actual!.etag).catch(() => ({ estado: "error" }))));
    const nOk = rem.filter((x) => x.estado === "ok").length;
    ok(nOk === 1 && rem.filter((x) => x.estado === "cambio").length === 4, `5 reemplazos con el mismo ETag → aceptados ${nOk}`);

    // 3. El algoritmo completo con 8 procesos simultáneos y un "abono" falso: UN abono.
    const k2 = `${base}/completo.json`; creadas.push(k2);
    const abonos: string[] = [];
    const out = await Promise.all(Array.from({ length: 8 }, (_, i) => registrarUnaVez({
      clave: k2, codigo: "PL-PRUEBA", ficha: `f${i}`, almacen: almacenBlob,
      buscarAbono: async () => abonos[0] ?? null,
      crearAbono: async () => { await new Promise((s) => setTimeout(s, 300)); abonos.push(`abono${abonos.length + 1}`); return abonos[abonos.length - 1]; },
    }).catch(() => ({ tipo: "error" as const }))));
    ok(abonos.length === 1, `8 procesos simultáneos con Blob real → abonos creados: ${abonos.length}`);
    const fin = await almacenBlob.leer(k2);
    ok(fin?.valor.estado === "hecho" && fin.valor.abonoId === abonos[0], "la reserva quedó 'hecho' con ese abono");
    console.log("resultados:", out.map((x) => x.tipo).join(", "));
  } finally {
    await del(creadas).catch(() => undefined);
    console.log("archivos de prueba borrados");
  }
  clearTimeout(corte);
  process.exit(fallos ? 1 : 0);
})();
