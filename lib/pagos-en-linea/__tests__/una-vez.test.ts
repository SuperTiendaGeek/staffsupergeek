/**
 * Test — "un solo abono por pago" (etapa D2, revisión de Codex punto 3).
 * Concurrencia (10 procesos a la vez) y cortes antes y después del abono.
 * Ejecutar: npm test pagos-en-linea
 */
import { MINUTOS_RESERVA_VENCIDA, registrarUnaVez, type AlmacenReservas, type Reserva } from "../una-vez";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
const azar = () => Math.floor(Math.random() * 8);

/** Almacén en memoria con las MISMAS reglas que Blob: crear-si-no-existe y reemplazar-si-ETag. Con demoras al azar. */
function almacenFalso() {
  const datos = new Map<string, { valor: Reserva; etag: string }>();
  let n = 0;
  const a: AlmacenReservas & { datos: typeof datos; caido: boolean } = {
    datos, caido: false,
    async crear(clave, valor) {
      await pausa(azar());
      if (a.caido) throw new Error("Blob caído");
      if (datos.has(clave)) return { estado: "existe" };
      const etag = `e${++n}`;
      datos.set(clave, { valor: { ...valor }, etag });
      return { estado: "creada", etag };
    },
    async leer(clave) {
      await pausa(azar());
      if (a.caido) throw new Error("Blob caído");
      const d = datos.get(clave);
      return d ? { valor: { ...d.valor }, etag: d.etag } : null;
    },
    async reemplazar(clave, valor, etag) {
      await pausa(azar());
      if (a.caido) throw new Error("Blob caído");
      const d = datos.get(clave);
      if (!d || d.etag !== etag) return { estado: "cambio" };
      const nuevo = `e${++n}`;
      datos.set(clave, { valor: { ...valor }, etag: nuevo });
      return { estado: "ok", etag: nuevo };
    },
  };
  return a;
}

/** Tabla de abonos falsa: busca por número de pago y crea (con demora). */
function abonosFalsos() {
  const lista: string[] = [];
  return {
    lista,
    buscar: async () => { await pausa(azar()); return lista[0] ?? null; },
    crear: async () => { await pausa(5 + azar()); const id = `rec${lista.length + 1}`; lista.push(id); return id; },
  };
}

class Corte extends Error {}

(async () => {
  const CLAVE = "pagos-en-linea/reservas/deuna-qa/abc.json";

  // ─── 1. Concurrencia: 10 procesos a la vez (aviso + consulta + conciliación + …) ───
  for (let vuelta = 1; vuelta <= 20; vuelta++) {
    const almacen = almacenFalso();
    const abonos = abonosFalsos();
    const r = await Promise.all(Array.from({ length: 10 }, (_, i) => registrarUnaVez({
      clave: CLAVE, codigo: "PL-000027", ficha: `f${i}`, almacen, buscarAbono: abonos.buscar, crearAbono: abonos.crear,
    })));
    if (abonos.lista.length !== 1) { assert(false, `vuelta ${vuelta}: ${abonos.lista.length} abonos (debía ser 1)`); continue; }
    if (vuelta === 20) {
      assert(true, "20 vueltas × 10 procesos simultáneos: siempre UN solo abono");
      assert(r.filter((x) => x.tipo === "registrado" && x.nuevo).length === 1, "solo uno de los 10 lo creó; los demás 'ocupado' o lo encontraron");
      assert(almacen.datos.get(CLAVE)?.valor.estado === "hecho", "la reserva queda 'hecho' con el abono");
    }
  }

  // ─── 2. Corte DESPUÉS de reservar y ANTES del abono ───
  {
    let reloj = new Date("2026-11-26T15:00:00Z");
    const almacen = almacenFalso();
    const abonos = abonosFalsos();
    const r1 = await registrarUnaVez({
      clave: CLAVE, codigo: "PL-1", ficha: "a", almacen, ahora: () => reloj, buscarAbono: abonos.buscar,
      crearAbono: async () => { throw new Corte("se cayó"); },
    }).catch((e) => e);
    assert(r1 instanceof Corte && abonos.lista.length === 0, "corte antes del abono: no hay abono y la reserva queda 'en curso'");
    const r2 = await registrarUnaVez({ clave: CLAVE, codigo: "PL-1", ficha: "b", almacen, ahora: () => reloj, buscarAbono: abonos.buscar, crearAbono: abonos.crear });
    assert(r2.tipo === "ocupado" && abonos.lista.length === 0, "dentro de 5 min nadie más registra (podría estar trabajando)");
    reloj = new Date(reloj.getTime() + (MINUTOS_RESERVA_VENCIDA + 1) * 60_000);
    const [r3, r4] = await Promise.all([
      registrarUnaVez({ clave: CLAVE, codigo: "PL-1", ficha: "c", almacen, ahora: () => reloj, buscarAbono: abonos.buscar, crearAbono: abonos.crear }),
      registrarUnaVez({ clave: CLAVE, codigo: "PL-1", ficha: "d", almacen, ahora: () => reloj, buscarAbono: abonos.buscar, crearAbono: abonos.crear }),
    ]);
    assert(abonos.lista.length === 1, "pasados 5 min, dos procesos la retoman a la vez: solo uno gana y hay UN abono");
    assert([r3, r4].filter((x) => x.tipo === "registrado").length >= 1, "el que la retomó la deja registrada");
  }

  // ─── 3. Corte DESPUÉS del abono y ANTES de marcar "hecho" ───
  {
    let reloj = new Date("2026-11-26T15:00:00Z");
    const almacen = almacenFalso();
    const abonos = abonosFalsos();
    const original = almacen.reemplazar;
    almacen.reemplazar = async () => { throw new Corte("se cayó al marcar"); };
    const r1 = await registrarUnaVez({ clave: CLAVE, codigo: "PL-2", ficha: "a", almacen, ahora: () => reloj, buscarAbono: abonos.buscar, crearAbono: abonos.crear });
    almacen.reemplazar = original;
    assert(r1.tipo === "registrado" && abonos.lista.length === 1 && almacen.datos.get(CLAVE)?.valor.estado === "en_curso", "corte al marcar: el abono existe pero la reserva sigue 'en curso'");
    reloj = new Date(reloj.getTime() + (MINUTOS_RESERVA_VENCIDA + 1) * 60_000);
    const r2 = await registrarUnaVez({ clave: CLAVE, codigo: "PL-2", ficha: "b", almacen, ahora: () => reloj, buscarAbono: abonos.buscar, crearAbono: abonos.crear });
    assert(r2.tipo === "registrado" && !r2.nuevo && abonos.lista.length === 1, "quien la retoma ENCUENTRA el abono y no crea otro");
    assert(almacen.datos.get(CLAVE)?.valor.estado === "hecho", "y la deja 'hecho'");
  }

  // ─── 4. Después de "hecho": todos ven el mismo abono ───
  {
    const almacen = almacenFalso();
    const abonos = abonosFalsos();
    await registrarUnaVez({ clave: CLAVE, codigo: "PL-3", ficha: "a", almacen, buscarAbono: abonos.buscar, crearAbono: abonos.crear });
    const r = await registrarUnaVez({ clave: CLAVE, codigo: "PL-3", ficha: "b", almacen, buscarAbono: async () => null, crearAbono: abonos.crear });
    assert(r.tipo === "registrado" && r.abonoId === "rec1" && abonos.lista.length === 1, "reserva 'hecho' → se usa ese abono aunque la búsqueda no lo vea aún");
  }

  // ─── 5. Abono ya registrado a mano en el mostrador (mismo N.º de transferencia) ───
  {
    const almacen = almacenFalso();
    const abonos = abonosFalsos();
    abonos.lista.push("recMano");
    const r = await registrarUnaVez({ clave: CLAVE, codigo: "PL-4", almacen, buscarAbono: abonos.buscar, crearAbono: abonos.crear });
    assert(r.tipo === "registrado" && r.abonoId === "recMano" && !r.nuevo && abonos.lista.length === 1, "abono a mano: se enlaza, no se duplica");
  }

  // ─── 6. Blob caído: no se registra NADA ───
  {
    const almacen = almacenFalso();
    almacen.caido = true;
    const abonos = abonosFalsos();
    const r = await registrarUnaVez({ clave: CLAVE, codigo: "PL-5", almacen, buscarAbono: abonos.buscar, crearAbono: abonos.crear }).catch((e) => e);
    assert(r instanceof Error && abonos.lista.length === 0, "sin almacén no hay abono (queda para la conciliación)");
  }

  // ─── 7. Reintento de red de la propia escritura ───
  {
    const almacen = almacenFalso();
    const abonos = abonosFalsos();
    await almacen.crear(CLAVE, { codigo: "PL-6", ficha: "mia", estado: "en_curso", desde: new Date().toISOString() });
    const r = await registrarUnaVez({ clave: CLAVE, codigo: "PL-6", ficha: "mia", almacen, buscarAbono: abonos.buscar, crearAbono: abonos.crear });
    assert(r.tipo === "registrado" && abonos.lista.length === 1, "si la reserva ya es mía (la red reintentó), sigo sin esperar 5 min");
  }

  if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
  console.log("\nTodo bien.");
})();
