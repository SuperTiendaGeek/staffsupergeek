/**
 * F-26 — dos apartados simultáneos sobre el mismo artículo.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/__tests__/concurrencia.test.ts
 *
 * El caso real: DES-000005 terminó con DOS reservas activas de dos clientes
 * distintos. Entre leer "¿quedan unidades libres?" y escribir "ahora hay una
 * menos" hay una ventana; si dos peticiones entran a la vez, ambas leen el
 * mismo estado y ambas creen tener derecho a la unidad.
 *
 * Airtable no tiene transacciones ni escrituras condicionales, así que esto no
 * se puede cerrar del todo. Se defiende en dos capas y este test comprueba las
 * dos por separado:
 *   1. `withLock` — serializa dentro del proceso (mismo empleado, doble clic).
 *   2. `verificarEscrituraUnica` — detecta lo que la capa 1 no ve (dos
 *      instancias distintas en Vercel).
 */

import { EscrituraConcurrenteError, verificarEscrituraUnica, withLock } from "../concurrencia";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  // ── 1. Sin turno, dos apartados simultáneos se pisan ───────────────────────
  // Reproduce el bug: ambos leen 0 comprometidas y ambos escriben 1.
  {
    let contador = 0;
    const apartarSinTurno = async () => {
      const leido = contador;      // lee
      await dormir(5);             // ventana (viaje de red a Airtable)
      contador = leido + 1;        // escribe
    };
    await Promise.all([apartarSinTurno(), apartarSinTurno()]);
    assert(contador === 1, `SIN turno, dos apartados dejan el contador en 1 en vez de 2 — el bug (vino ${contador})`);
  }

  // ── 2. Con turno, se serializan ────────────────────────────────────────────
  {
    let contador = 0;
    const apartarConTurno = () =>
      withLock("item:REP-000017", async () => {
        const leido = contador;
        await dormir(5);
        contador = leido + 1;
      });
    await Promise.all([apartarConTurno(), apartarConTurno(), apartarConTurno()]);
    assert(contador === 3, `CON turno, tres apartados cuentan 3 (vino ${contador})`);
  }

  // ── 3. El turno es por artículo, no global ─────────────────────────────────
  // Apartar dos artículos distintos no debe hacer cola: bloquearía el mostrador.
  {
    const orden: string[] = [];
    await Promise.all([
      withLock("item:A", async () => { await dormir(20); orden.push("A"); }),
      withLock("item:B", async () => { await dormir(1); orden.push("B"); }),
    ]);
    assert(orden[0] === "B", "Artículos distintos NO hacen cola entre sí (B terminó antes que A)");
  }

  // ── 4. Un fallo dentro del turno no deja el candado trabado ────────────────
  {
    await withLock("item:C", async () => { throw new Error("falla simulada"); }).catch(() => {});
    let entro = false;
    await withLock("item:C", async () => { entro = true; });
    assert(entro, "Tras un error, el siguiente en la fila SÍ entra (el candado se suelta)");
  }

  // ── 5. La verificación detecta la escritura perdida ────────────────────────
  {
    let detectado = false;
    try {
      // Escribimos esperando 2, pero al releer hay 1: otra instancia nos pisó.
      verificarEscrituraUnica(1, 2, "apartar recTEST");
    } catch (e) {
      detectado = e instanceof EscrituraConcurrenteError;
      const msg = e instanceof Error ? e.message : "";
      assert(
        msg.includes("Vuelve a intentarlo"),
        `El mensaje le dice a la persona qué hacer (vino: "${msg}")`
      );
    }
    assert(detectado, "Se detecta que otra persona escribió al mismo tiempo");
  }

  // ── 6. Sin conflicto, no molesta ───────────────────────────────────────────
  {
    let lanzo = false;
    try { verificarEscrituraUnica(3, 3, "apartar recTEST"); } catch { lanzo = true; }
    assert(!lanzo, "Cuando el valor coincide, no interrumpe");

    let lanzoVacio = false;
    try { verificarEscrituraUnica(null, 0, "liberar recTEST"); } catch { lanzoVacio = true; }
    assert(!lanzoVacio, "Un campo vacío en Airtable se lee como 0, no como conflicto");
  }

  if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
  console.log("\n✅ concurrencia.test.ts — todos los asserts pasaron");
}

void main();
