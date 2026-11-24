/**
 * Lecturas compartidas (incidente de lentitud del 24-nov-2026: 31 clics en «Por comprar»).
 * Ejecutar: npm test __tests__/compartir-lectura
 */
import { compartirLectura, lecturasEnCurso } from "../compartir-lectura";
import { RITMO, conRitmo } from "../airtable-ritmo";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
function demora<T>(valor: T) {
  let soltar!: () => void;
  const p = new Promise<T>((r) => { soltar = () => r(valor); });
  return { p, soltar };
}

async function main() {
  {
    let lecturas = 0;
    const d = demora(["fila"]);
    const leer = () => { lecturas++; return d.p; };
    const pedidos = Array.from({ length: 31 }, () => compartirLectura("prueba:bandeja", leer));
    d.soltar();
    const res = await Promise.all(pedidos);
    assert(lecturas === 1 && res.every((r) => r === res[0]), "31 pedidos iguales mientras una lectura está en curso = UNA sola lectura");
    assert(lecturasEnCurso() === 0, "al terminar se olvida (no es una caché)");
    await compartirLectura("prueba:bandeja", leer);
    assert(lecturas === 2, "el siguiente pedido, ya terminada la anterior, vuelve a leer");
  }

  {
    let lecturas = 0;
    const d1 = demora(1), d2 = demora(2);
    const leer = () => (++lecturas === 1 ? d1.p : d2.p);
    const a = compartirLectura("prueba:escritura", leer);
    // Una escritura a Airtable en esta instancia (por ejemplo «Registrar compra»).
    const f = conRitmo((async () => new Response("{}")) as unknown as typeof fetch, { ...RITMO, fila: false }, undefined, () => {});
    await f("https://api.airtable.com/v0/app/T", { method: "PATCH", body: "{}" });
    const b = compartirLectura("prueba:escritura", leer);
    d1.soltar(); d2.soltar();
    assert((await a) === 1 && (await b) === 2 && lecturas === 2, "si hubo una escritura después de empezar, no se comparte: se lee de nuevo");
  }

  {
    let lecturas = 0;
    const leer = async () => { lecturas++; if (lecturas === 1) throw new Error("Airtable 500"); return "ok"; };
    const [x, y] = await Promise.allSettled([compartirLectura("prueba:error", leer), compartirLectura("prueba:error", leer)]);
    const z = await compartirLectura("prueba:error", leer);
    assert(x.status === "rejected" && y.status === "rejected" && z === "ok" && lecturas === 2, "un error no se guarda: el siguiente pedido vuelve a intentar");
  }

  {
    let a = 0, b = 0;
    await Promise.all([compartirLectura("prueba:a", async () => ++a), compartirLectura("prueba:b", async () => ++b)]);
    assert(a === 1 && b === 1, "claves distintas no se mezclan");
  }

  const fs = await import("node:fs");
  const pagina = fs.readFileSync("app/shipping-v2/compras/page.tsx", "utf8");
  const apiCompras = fs.readFileSync("app/api/shipping-v2/compras/route.ts", "utf8");
  const pestanas = fs.readFileSync("app/api/shipping-v2/pestanas/route.ts", "utf8");
  assert(pagina.includes('compartirLectura("compras:bandeja", filasBandeja)') && apiCompras.includes('compartirLectura("compras:bandeja", filasBandeja)'),
    "«Por comprar» (página y API) comparte la lectura de la bandeja");
  assert(pestanas.includes('compartirLectura("shipping-v2:resumen-pestanas"') && pestanas.includes("{ ...compartido }") && pestanas.includes("access.providerId ? null"),
    "la barra de pestañas comparte el resumen, lo copia antes de agregarle datos y no lo comparte con proveedores");

  if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
  console.log("\nTodo bien.");
}
void main();
