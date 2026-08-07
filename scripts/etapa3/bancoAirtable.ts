/**
 * Banco de pruebas aislado para Airtable.
 *
 * ─── Para qué existe ─────────────────────────────────────────────────────────
 *
 * Seis mecanismos del módulo de facturación viven detrás del candado
 * `if (ambiente !== "2") return;`: el puente contable, el descuento de
 * inventario, el cierre de reserva, el reverso de la nota de crédito, los
 * efectos del recibo y el reverso de la anulación. Nunca han corrido. El día
 * que se cambie SRI_AMBIENTE a "2" se encienden los seis a la vez, y lo hacen
 * sobre documentos tributarios reales que no se pueden deshacer.
 *
 * Este banco los despierta con ambiente="2" SIN tocar la base real: intercepta
 * `fetch` y responde con datos de mentira definidos por cada escenario. Las
 * escrituras no salen a ninguna parte — se registran y se pueden inspeccionar.
 *
 * ─── Qué SÍ verifica ─────────────────────────────────────────────────────────
 *
 *   · Que la lógica de producción se ejecuta de verdad (el candado se abre).
 *   · Exactamente QUÉ TABLA y QUÉ CAMPOS escribiría cada mecanismo. Como el
 *     portal referencia Airtable por nombre, un campo mal escrito es un fallo
 *     silencioso en producción — aquí queda a la vista.
 *   · Los valores concretos: cuánto stock descuenta, qué monto contable crea.
 *   · Idempotencia: correr dos veces no debe duplicar nada.
 *
 * ─── Qué NO verifica ─────────────────────────────────────────────────────────
 *
 * Que esos nombres existan en la base real. Eso lo hace el paso siguiente
 * (`verificarEsquema.ts`), contrastando lo capturado aquí contra el esquema
 * vivo de Airtable, en solo lectura.
 *
 * NADA de este archivo escribe en Airtable. Si alguna vez ves una petición
 * salir de aquí, es un bug.
 */

export type Registro = { id: string; fields: Record<string, unknown> };

/** Una escritura capturada. Es la evidencia que después se revisa. */
export type Escritura = {
  metodo:  "POST" | "PATCH" | "DELETE";
  tabla:   string;
  /** recordId cuando la ruta lo lleva (PATCH /tabla/recXXX). */
  recordId?: string;
  /** Un elemento por registro afectado. */
  registros: Array<{ id?: string; fields: Record<string, unknown> }>;
};

export type Lectura = { tabla: string; filtro: string | null; recordId?: string };

export type BancoOpciones = {
  /** Contenido inicial de la base falsa: nombre de tabla → registros. */
  tablas: Record<string, Registro[]>;
};

export class BancoAirtable {
  readonly escrituras: Escritura[] = [];
  readonly lecturas:   Lectura[]   = [];
  private tablas: Record<string, Registro[]>;
  private fetchOriginal: typeof globalThis.fetch;
  private contador = 0;

  constructor(opciones: BancoOpciones) {
    this.tablas = JSON.parse(JSON.stringify(opciones.tablas));
    this.fetchOriginal = globalThis.fetch;
  }

  // ─── Ciclo de vida ─────────────────────────────────────────────────────────

  instalar(): void {
    globalThis.fetch = ((entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url;

      if (!url.includes("api.airtable.com")) {
        // Cualquier cosa que no sea Airtable se corta en seco: en este banco
        // nada debe salir a la red. Un intento de llegar al SRI, a Blob o al
        // correo es un error del escenario, no algo que haya que dejar pasar.
        throw new Error(`[banco] petición de red no permitida: ${url}`);
      }

      return Promise.resolve(this.responder(url, init));
    }) as typeof globalThis.fetch;
  }

  desinstalar(): void {
    globalThis.fetch = this.fetchOriginal;
  }

  // ─── Motor ─────────────────────────────────────────────────────────────────

  private responder(url: string, init?: RequestInit): Response {
    const u      = new URL(url);
    // /v0/<baseId>/<tabla>[/<recordId>]
    const partes = u.pathname.split("/").filter(Boolean);
    const tabla  = decodeURIComponent(partes[2] ?? "");
    const recordId = partes[3] ? decodeURIComponent(partes[3]) : undefined;
    const metodo = (init?.method ?? "GET").toUpperCase();

    if (metodo === "GET") {
      this.lecturas.push({ tabla, filtro: u.searchParams.get("filterByFormula"), recordId });
      return this.responderLectura(tabla, u, recordId);
    }

    const cuerpo = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const registros = Array.isArray(cuerpo.records)
      ? (cuerpo.records as Array<{ id?: string; fields: Record<string, unknown> }>)
      : [{ id: recordId, fields: (cuerpo.fields ?? {}) as Record<string, unknown> }];

    this.escrituras.push({ metodo: metodo as Escritura["metodo"], tabla, recordId, registros });

    // Se aplica al estado en memoria para que una segunda pasada vea el
    // resultado de la primera — así se puede comprobar la idempotencia.
    this.aplicar(tabla, metodo, registros);

    const devueltos = registros.map((r) => ({
      id: r.id ?? this.nuevoId(),
      createdTime: new Date().toISOString(),
      fields: r.fields,
    }));

    return this.json(
      Array.isArray(cuerpo.records) ? { records: devueltos } : devueltos[0]
    );
  }

  private responderLectura(tabla: string, u: URL, recordId?: string): Response {
    const registros = this.tablas[tabla] ?? [];

    if (recordId) {
      const r = registros.find((x) => x.id === recordId);
      return r
        ? this.json({ id: r.id, createdTime: new Date().toISOString(), fields: r.fields })
        : this.json({ error: "NOT_FOUND" }, 404);
    }

    // Filtro por RECORD_ID() — el patrón que usa fetchRecordsByIds y que el
    // proyecto exige en vez de filtrar por un campo de tipo link.
    const formula = u.searchParams.get("filterByFormula") ?? "";
    const ids     = [...formula.matchAll(/rec[A-Za-z0-9]{14}/g)].map((m) => m[0]);

    let salida = registros;
    if (ids.length > 0 && formula.includes("RECORD_ID()")) {
      salida = registros.filter((r) => ids.includes(r.id));
    }

    const max = parseInt(u.searchParams.get("maxRecords") ?? "", 10);
    if (Number.isFinite(max) && max > 0) salida = salida.slice(0, max);

    return this.json({
      records: salida.map((r) => ({ id: r.id, createdTime: new Date().toISOString(), fields: r.fields })),
    });
  }

  private aplicar(
    tabla: string,
    metodo: string,
    registros: Array<{ id?: string; fields: Record<string, unknown> }>
  ): void {
    this.tablas[tabla] ??= [];
    for (const r of registros) {
      if (metodo === "PATCH" && r.id) {
        const existente = this.tablas[tabla].find((x) => x.id === r.id);
        if (existente) Object.assign(existente.fields, r.fields);
      } else if (metodo === "POST") {
        this.tablas[tabla].push({ id: r.id ?? this.nuevoId(), fields: { ...r.fields } });
      } else if (metodo === "DELETE" && r.id) {
        this.tablas[tabla] = this.tablas[tabla].filter((x) => x.id !== r.id);
      }
    }
  }

  private nuevoId(): string {
    this.contador++;
    return `rec${String(this.contador).padStart(14, "0")}`;
  }

  private json(cuerpo: unknown, status = 200): Response {
    return new Response(JSON.stringify(cuerpo), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ─── Consultas sobre lo capturado ──────────────────────────────────────────

  /** Estado actual de una tabla falsa, tras aplicar las escrituras. */
  estado(tabla: string): Registro[] {
    return this.tablas[tabla] ?? [];
  }

  escriturasEn(tabla: string): Escritura[] {
    return this.escrituras.filter((e) => e.tabla === tabla);
  }

  /** Todos los campos escritos en una tabla, sin repetir. Para el contraste de esquema. */
  camposEscritos(tabla: string): string[] {
    const set = new Set<string>();
    for (const e of this.escriturasEn(tabla)) {
      for (const r of e.registros) for (const k of Object.keys(r.fields)) set.add(k);
    }
    return [...set].sort();
  }

  /** Mapa tabla → campos escritos. Es lo que consume verificarEsquema.ts. */
  inventarioEscrituras(): Record<string, string[]> {
    const salida: Record<string, string[]> = {};
    for (const e of this.escrituras) {
      salida[e.tabla] ??= [];
      for (const r of e.registros) {
        for (const k of Object.keys(r.fields)) {
          if (!salida[e.tabla].includes(k)) salida[e.tabla].push(k);
        }
      }
    }
    for (const t of Object.keys(salida)) salida[t].sort();
    return salida;
  }

  huboEscrituras(): boolean {
    return this.escrituras.length > 0;
  }

  resumen(): string {
    if (this.escrituras.length === 0) return "    (ninguna escritura)";
    return this.escrituras
      .map((e) => {
        const campos = e.registros.flatMap((r) => Object.keys(r.fields));
        return `    ${e.metodo.padEnd(6)} ${e.tabla.padEnd(28)} ${campos.join(", ")}`;
      })
      .join("\n");
  }
}

/** Corre `fn` con el banco instalado y garantiza que se desinstala siempre. */
export async function conBanco<T>(
  opciones: BancoOpciones,
  fn: (banco: BancoAirtable) => Promise<T>
): Promise<{ banco: BancoAirtable; resultado: T }> {
  const banco = new BancoAirtable(opciones);
  banco.instalar();
  try {
    const resultado = await fn(banco);
    return { banco, resultado };
  } finally {
    banco.desinstalar();
  }
}
