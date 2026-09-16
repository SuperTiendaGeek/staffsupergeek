"use client";

// Pantalla de inspección técnica.
//
// Es una vista completa y no un modal a propósito: una laptop tiene 30 puntos
// de control, y dentro de un modal quedarían con scroll interno donde el
// técnico se pierde.
//
// La regla que ordena todo: NO SE BLOQUEA LA ENTRADA, SE BLOQUEA LA SALIDA. Se
// puede entrar a cualquier paso en el orden que sea; lo que no se puede es
// firmar sin haber confirmado qué trae el equipo y sin haber resuelto todas
// las zonas. Un candado en la entrada dejaría atrapado al técnico que descubre
// a media inspección que el equipo trae algo que nadie declaró.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SHIPPING_V2_ITEM_SELECT_OPTIONS } from "@/lib/shipping-v2/schema.generated";
import type {
  ShippingV2InspeccionGrupo,
  ShippingV2InspeccionTecnica,
  ShippingV2Intervencion,
} from "@/lib/shipping-v2/airtable";
import type { ResultadoPunto, ZonaRevision } from "@/lib/shipping-v2/revision-tecnica";
import { getPerfilRevision } from "@/lib/shipping-v2/revision-tecnica";
import type { SnapshotRevision } from "@/lib/shipping-v2/revision-tecnica-snapshot";
import { DibujoEquipo, COORDENADAS } from "./DibujoEquipo";

type RepuestoDisponible = { id: string; sku: string; nombre: string; stock: number; costo: number };

type Props = {
  inicial: ShippingV2InspeccionTecnica;
  repuestos: RepuestoDisponible[];
  usuario: string;
  puedeEditarItems: boolean;
  puedeCrearNovedades: boolean;
};

type Pestana = "equipo" | "inspeccion" | "mantenimientos" | "mejoras";

// Los trabajos que se ofrecen salen del servidor (`inicial.trabajos`), no de
// una lista fija aquí: a un disco NVMe no se le ajustan las bisagras y a un
// monitor no se le cambia la pasta térmica. Es el mismo módulo que valida al
// guardar, así que la pantalla nunca ofrece algo que el servidor rechace.

const OPCIONES_FICHA: Record<string, readonly string[]> = {
  pantallaTamano: SHIPPING_V2_ITEM_SELECT_OPTIONS.pantallaTamano,
  pantallaResolucion: SHIPPING_V2_ITEM_SELECT_OPTIONS.pantallaResolucion,
  ramCapacidad: SHIPPING_V2_ITEM_SELECT_OPTIONS.ramCapacidad,
  ramTipo: SHIPPING_V2_ITEM_SELECT_OPTIONS.ramTipo,
  almacenamientoTipo: SHIPPING_V2_ITEM_SELECT_OPTIONS.almacenamientoTipo,
  almacenamiento2Tipo: SHIPPING_V2_ITEM_SELECT_OPTIONS.almacenamientoTipo,
  sistemaOperativo: SHIPPING_V2_ITEM_SELECT_OPTIONS.sistemaOperativo,
};

function estadoDeZona(zona: ZonaRevision, snapshot: SnapshotRevision): "" | "parcial" | "ok" | "falla" | "na" {
  const valores = zona.puntos.map((p) => snapshot.puntos[p.id]?.r).filter(Boolean) as ResultadoPunto[];
  if (!valores.length) return "";
  if (valores.length < zona.puntos.length) return "parcial";
  if (valores.includes("falla")) return "falla";
  if (valores.every((v) => v === "na")) return "na";
  return "ok";
}

function fecha(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-EC", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function ShippingV2InspeccionClient({
  inicial, repuestos, usuario, puedeEditarItems, puedeCrearNovedades,
}: Props) {
  const [datos, setDatos] = useState(inicial);
  const [pestana, setPestana] = useState<Pestana>(
    inicial.estado.completa ? "inspeccion" : inicial.snapshot.equipamiento.confirmadoPor ? "inspeccion" : "equipo"
  );
  const [zonaSel, setZonaSel] = useState(inicial.zonas[0]?.id ?? "");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [aviso, setAviso] = useState("");

  const { item, zonas, snapshot, estado, grupos, intervenciones, novedadesAbiertas } = datos;
  const perfil = getPerfilRevision(item.categoria);
  const coordenadas = COORDENADAS[perfil] ?? {};

  const zona = useMemo(() => zonas.find((z) => z.id === zonaSel) ?? zonas[0], [zonas, zonaSel]);

  // Si al recargar la zona elegida ya no existe (se desmarcó lo que la creaba),
  // no dejar la pantalla en blanco.
  useEffect(() => {
    if (zonas.length && !zonas.some((z) => z.id === zonaSel)) setZonaSel(zonas[0].id);
  }, [zonas, zonaSel]);

  // Cola de guardado: cada petición espera a que termine la anterior.
  const cola = useRef<Promise<unknown>>(Promise.resolve());

  const guardar = useCallback((cambios: Record<string, unknown>, textoAviso?: string) => {
    const siguiente = cola.current.then(() => enviar(cambios, textoAviso));
    // Un fallo no puede romper la cadena: la siguiente petición debe correr igual.
    cola.current = siguiente.catch(() => undefined);
    return siguiente;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const enviar = useCallback(async (cambios: Record<string, unknown>, textoAviso?: string) => {
    setGuardando(true);
    setMensaje("");
    try {
      const respuesta = await fetch(`/api/shipping-v2/recepcion/inspeccion/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      const payload = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || !payload.success) throw new Error(String(payload.error || "No se pudo guardar."));
      setDatos((actual) => {
        const item = payload.data.item as ShippingV2InspeccionTecnica["item"];
        const conectividad = new Set(item.technicalSheet.connectivityV2Ids);
        const puertos = new Set(item.technicalSheet.portV2Ids);
        const extras = new Set(item.technicalSheet.extraFeatureV2Ids);
        return {
          ...actual,
          item,
          zonas: payload.data.zonas,
          snapshot: payload.data.snapshot,
          estado: payload.data.estado,
          // Los chips se reafirman contra lo que dice Airtable: si el PATCH
          // falló, el estado optimista no puede quedarse mintiendo.
          grupos: actual.grupos.map((g) => {
            const marcadas = g.grupo === "conectividad" ? conectividad : g.grupo === "puerto" ? puertos : extras;
            return { ...g, opciones: g.opciones.map((o) => ({ ...o, declarada: marcadas.has(o.id) })) };
          }),
        };
      });
      if (textoAviso) setAviso(textoAviso);
      return true;
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "Error inesperado.");
      return false;
    } finally {
      setGuardando(false);
    }
  }, [item.id]);

  // ── Equipamiento ──
  const idsDeclarados = useMemo(() => {
    const salida: Record<string, string[]> = { conectividad: [], puerto: [], extra: [] };
    for (const grupo of grupos) {
      salida[grupo.grupo] = grupo.opciones.filter((o) => o.declarada).map((o) => o.id);
    }
    return salida;
  }, [grupos]);

  function cuerpoEquipamiento(ids: Record<string, string[]>, confirmar = false) {
    return {
      equipamiento: {
        conectividadIds: ids.conectividad,
        puertosIds: ids.puerto,
        extrasIds: ids.extra,
        confirmar,
      },
    };
  }

  async function alternarOpcion(grupo: ShippingV2InspeccionGrupo, opcionId: string) {
    const actuales = { ...idsDeclarados };
    const lista = new Set(actuales[grupo.grupo]);
    if (lista.has(opcionId)) lista.delete(opcionId); else lista.add(opcionId);
    actuales[grupo.grupo] = [...lista];
    // Optimista en la UI local: el servidor devuelve la verdad enseguida.
    setDatos((d) => ({
      ...d,
      grupos: d.grupos.map((g) => g.grupo !== grupo.grupo ? g
        : { ...g, opciones: g.opciones.map((o) => o.id === opcionId ? { ...o, declarada: !o.declarada } : o) }),
    }));
    await guardar(cuerpoEquipamiento(actuales));
  }

  async function confirmarEquipo() {
    await guardar(cuerpoEquipamiento(idsDeclarados, true), "Equipamiento confirmado. Ya puedes inspeccionar.");
    setPestana("inspeccion");
  }

  // ── Puntos ──
  async function marcar(puntoId: string, valor: ResultadoPunto) {
    const actual = snapshot.puntos[puntoId]?.r;
    await guardar({ puntos: [{ puntoId, resultado: actual === valor ? null : valor }] });
  }
  async function marcarTodoConforme() {
    if (!zona) return;
    await guardar({ puntos: zona.puntos.map((p) => ({ puntoId: p.id, resultado: "ok" })) });
  }

  // ── Observación, con guardado diferido para no pegarle al servidor por tecla ──
  const [obsLocal, setObsLocal] = useState("");
  // Lo que falta por guardar: qué zona y qué texto. Guardarlo aparte permite
  // vaciarlo antes de cambiar de zona o de desmontar, sin perder el texto.
  const obsPendiente = useRef<{ zonaId: string; nota: string } | null>(null);
  const obsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vaciarObservacion = useCallback(() => {
    if (obsTimer.current) { clearTimeout(obsTimer.current); obsTimer.current = null; }
    const pendiente = obsPendiente.current;
    obsPendiente.current = null;
    if (pendiente) void guardar({ observaciones: [pendiente] });
  }, [guardar]);

  // Al cambiar de zona se guarda lo que quedó escrito en la anterior. Sin
  // esto, escribir una observación y hacer clic en otra zona antes de 900 ms
  // la perdía sin aviso.
  useEffect(() => {
    vaciarObservacion();
    setObsLocal(zona ? snapshot.observaciones[zona.id] ?? "" : "");
    // Solo al cambiar de zona: `snapshot.observaciones` es un objeto nuevo en
    // cada respuesta y volvería a pisar lo que el técnico está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zona?.id]);

  // Si el técnico cierra la pestaña dentro de la ventana de 900 ms, se guarda.
  useEffect(() => () => { vaciarObservacion(); }, [vaciarObservacion]);

  function cambiarObservacion(valor: string) {
    setObsLocal(valor);
    if (!zona) return;
    const zonaId = zona.id;
    obsPendiente.current = { zonaId, nota: valor };
    if (obsTimer.current) clearTimeout(obsTimer.current);
    obsTimer.current = setTimeout(() => { vaciarObservacion(); }, 900);
  }

  // ── Ficha ──
  async function cambiarFicha(campo: string, valor: string) {
    const numero = campo === "bateriaSalud";
    await guardar({ ficha: { [campo]: numero ? (valor === "" ? null : Number(valor)) : valor } });
  }

  // ── Firmar ──
  async function firmar() {
    setGuardando(true);
    setMensaje("");
    try {
      const respuesta = await fetch(`/api/shipping-v2/recepcion/inspeccion/${item.id}/firmar`, { method: "POST" });
      const payload = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || !payload.success) throw new Error(String(payload.error || "No se pudo firmar."));
      setDatos((d) => ({ ...d, item: payload.data }));
      setAviso("Inspección firmada. El equipo ya puede publicarse si no quedan novedades bloqueantes.");
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setGuardando(false);
    }
  }

  async function reabrir() {
    setGuardando(true);
    setMensaje("");
    try {
      const respuesta = await fetch(`/api/shipping-v2/recepcion/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reviewed", value: false }),
      });
      const payload = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || !payload.success) throw new Error(String(payload.error || "No se pudo reabrir la inspección."));
      setDatos((d) => ({ ...d, item: payload.data }));
      setAviso("Inspección reabierta. Corrige lo que haga falta y vuelve a finalizarla.");
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setGuardando(false);
    }
  }

  // ── Novedad desde una falla ──
  async function crearNovedad(zonaNombre: string, puntoTexto: string) {
    setGuardando(true);
    setMensaje("");
    try {
      const respuesta = await fetch(`/api/shipping-v2/recepcion/items/${item.id}/novedades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "Dañado",
          descripcion: `${zonaNombre} — ${puntoTexto}`,
          responsable: "SUPER GEEK",
          packingId: "",
        }),
      });
      const payload = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || !payload.success) throw new Error(String(payload.error || "No se pudo registrar la novedad."));
      setDatos((d) => ({ ...d, novedadesAbiertas: [payload.novedad, ...d.novedadesAbiertas] }));
      setAviso("Novedad registrada. Agrégale la foto desde la pantalla de Novedades.");
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setGuardando(false);
    }
  }

  // ── Intervenciones ──
  const MANTENIMIENTOS = inicial.trabajos.mantenimientos;
  const MEJORAS = inicial.trabajos.mejoras;
  const [mantTipo, setMantTipo] = useState(MANTENIMIENTOS[0]);
  const [mantNota, setMantNota] = useState("");
  const [mejTipo, setMejTipo] = useState(MEJORAS[0]);
  const [mejRepuesto, setMejRepuesto] = useState(repuestos[0]?.id ?? "");
  const [mejNota, setMejNota] = useState("");

  async function registrarIntervencion(cuerpo: Record<string, unknown>, limpiar: () => void) {
    setGuardando(true);
    setMensaje("");
    try {
      const respuesta = await fetch(`/api/shipping-v2/recepcion/inspeccion/${item.id}/intervenciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const payload = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || !payload.success) throw new Error(String(payload.error || "No se pudo registrar."));
      setDatos((d) => ({ ...d, intervenciones: payload.intervenciones as ShippingV2Intervencion[] }));
      limpiar();
      setAviso(payload.repuestoDescontado
        ? `Registrado. Se descontó 1 unidad de ${payload.repuestoDescontado}.`
        : "Mantenimiento registrado.");
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setGuardando(false);
    }
  }

  const repuestoElegido = repuestos.find((r) => r.id === mejRepuesto);
  const conteos = useMemo(() => {
    let ok = 0, falla = 0, na = 0;
    for (const z of zonas) {
      const e = estadoDeZona(z, snapshot);
      if (e === "ok") ok++; else if (e === "falla") falla++; else if (e === "na") na++;
    }
    const campos = zonas.flatMap((z) => z.captura);
    const llenos = campos.filter((c) => {
      const v = (item.technicalSheet as unknown as Record<string, unknown>)[c.campo];
      return v !== undefined && v !== null && v !== "";
    }).length;
    return { ok, falla, na, resueltas: ok + falla + na, ficha: `${llenos}/${campos.length}` };
  }, [zonas, snapshot, item.technicalSheet]);

  const firmado = item.revisadoFisicamente === true;

  return (
    <div className="w-full space-y-2.5">
      {/* ── Cabecera ── */}
      <section className="rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/20">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#F5F5F5]">Inspección técnica</h2>
            <p className="mt-0.5 truncate text-sm text-[#A7A7A7]">
              <span className="font-mono font-semibold text-[#D7FF4F]">{item.sku}</span> · {item.nombre}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#3A3A36] bg-[#20211D] px-3 py-1 text-xs font-semibold text-[#A7A7A7]">
              {item.categoria || "Sin categoría"}
            </span>
            {firmado ? (
              <span className="rounded-full border border-[#7BE495]/45 bg-[#7BE495]/12 px-3 py-1 text-xs font-bold text-[#7BE495]">
                Firmada
              </span>
            ) : null}
            <Link href="/shipping-v2/recepcion"
              className="rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 py-1.5 text-sm font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/45">
              ← Recepción
            </Link>
          </div>
        </div>
      </section>

      {mensaje ? (
        <div className="rounded-xl border border-[#FF7A6B]/40 bg-[#FF7A6B]/10 px-3 py-2.5 text-sm text-[#FFB3A9]">{mensaje}</div>
      ) : null}
      {aviso ? (
        <div className="rounded-xl border border-[#D7FF4F]/35 bg-[#D7FF4F]/8 px-3 py-2.5 text-sm text-[#D7FF4F]">{aviso}</div>
      ) : null}

      {/* ── Pestañas ── */}
      <nav className="flex gap-1 overflow-x-auto border-b border-[#2E2F28]" role="tablist">
        {([
          ["equipo", "1", "Qué trae el equipo", grupos.reduce((s, g) => s + g.opciones.filter((o) => o.declarada).length, 0)],
          ["inspeccion", "2", "Inspección", `${conteos.resueltas}/${zonas.length}`],
          ["mantenimientos", "", "Mantenimientos", intervenciones.filter((i) => i.tipo === "Mantenimiento").length],
          ["mejoras", "", "Mejoras", intervenciones.filter((i) => i.tipo === "Mejora").length],
        ] as const).map(([clave, paso, titulo, badge]) => {
          const activa = pestana === clave;
          const listo = clave === "equipo"
            ? Boolean(snapshot.equipamiento.confirmadoPor)
            : clave === "inspeccion" ? estado.completa : false;
          return (
            <button key={clave} type="button" role="tab" aria-selected={activa} onClick={() => setPestana(clave)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-t-lg border border-b-0 px-3.5 py-2 text-sm font-semibold transition ${
                activa ? "border-[#2E2F28] bg-[#1B1C17] text-[#F5F5F5]" : "border-transparent text-[#7E7F76] hover:text-[#B4B5AC]"}`}>
              {paso ? (
                <span className={`grid h-[17px] w-[17px] place-items-center rounded-full font-mono text-[10px] font-bold ${
                  listo ? "bg-[#7BE495] text-[#10261A]" : "bg-[#2A2B23] text-[#7E7F76]"}`}>{paso}</span>
              ) : null}
              {titulo}
              <span className={`rounded-full px-1.5 font-mono text-[11px] ${
                activa ? "bg-[#D7FF4F] text-[#141510]" : "bg-[#2A2B23] text-[#B4B5AC]"}`}>{badge}</span>
            </button>
          );
        })}
      </nav>

      {/* ══ PASO 1 ══ */}
      {pestana === "equipo" ? (
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
          <section className="rounded-xl border border-[#2E2F28] bg-[#1B1C17] p-3.5">
            {firmado ? (
              <p className="mb-3.5 rounded-lg border border-[#7BE495]/35 bg-[#7BE495]/8 px-3 py-2.5 text-[12.5px] leading-relaxed text-[#9FEFB3]">
                Esta inspección ya está firmada, así que el equipamiento no se puede cambiar. Para corregirlo,
                usa “Reabrir inspección” en la barra de abajo.
              </p>
            ) : null}
            <p className="mb-3.5 rounded-lg border border-[#2E2F28] bg-[#22231C] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#B4B5AC]">
              Confirma contra el equipo físico qué trae.{" "}
              <b className="font-semibold text-[#D7FF4F]">Lo que marques aquí se convierte en un punto obligatorio
              de inspección.</b> Si el catálogo dice que trae algo que este equipo no tiene, desmárcalo y el punto
              desaparece.
            </p>
            {grupos.map((grupo) => (
              <div key={grupo.grupo} className="mb-4">
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#B4B5AC]">{grupo.titulo}</h3>
                <p className="mb-2 text-[11.5px] text-[#7E7F76]">Opciones de {grupo.catalogo}</p>
                <div className="flex flex-wrap gap-1.5">
                  {grupo.opciones.map((opcion) => (
                    <button key={opcion.id} type="button" disabled={guardando || firmado}
                      aria-pressed={opcion.declarada}
                      onClick={() => void alternarOpcion(grupo, opcion.id)}
                      className={`rounded-full border px-3 py-1.5 text-[12.5px] transition disabled:opacity-50 ${
                        opcion.declarada
                          ? "border-[#D7FF4F] bg-[#D7FF4F]/15 font-semibold text-[#D7FF4F]"
                          : "border-[#3A3A36] bg-[#141510] text-[#7E7F76] hover:border-[#A8C93B] hover:text-[#B4B5AC]"}`}>
                      {opcion.nombre}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-[#2E2F28] bg-[#1B1C17] p-3.5">
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#B4B5AC]">Qué se va a probar</h3>
            <div className="rounded-lg border border-[#D7FF4F]/30 bg-[#D7FF4F]/8 px-3 py-2.5 text-sm text-[#F5F5F5]">
              <b className="font-mono text-[#D7FF4F]">{zonas.reduce((s, z) => s + z.puntos.length, 0)}</b> puntos en{" "}
              <b className="font-mono text-[#D7FF4F]">{zonas.length}</b> zonas, según la categoría y lo que confirmaste.
            </div>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <button type="button" disabled={guardando || firmado} onClick={() => void confirmarEquipo()}
                className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-2 text-sm font-bold text-[#141510] transition hover:brightness-105 disabled:opacity-50">
                {snapshot.equipamiento.confirmadoPor ? "Volver a confirmar" : "Confirmar equipamiento"}
              </button>
              <button type="button" onClick={() => setPestana("inspeccion")}
                className="rounded-lg border border-[#3A3A36] bg-[#2A2B23] px-3 py-2 text-sm font-semibold text-[#F5F5F5] transition hover:border-[#A8C93B]">
                Ir a la inspección →
              </button>
            </div>
            <div className={`mt-3.5 flex items-center gap-2 rounded-lg border px-3 py-2 text-[11.5px] ${
              snapshot.equipamiento.confirmadoPor
                ? "border-[#7BE495]/35 bg-[#22231C] text-[#B4B5AC]"
                : "border-[#2E2F28] bg-[#22231C] text-[#B4B5AC]"}`}>
              {snapshot.equipamiento.confirmadoPor ? (
                <span>Confirmado por <b className="font-semibold text-[#D7FF4F]">{snapshot.equipamiento.confirmadoPor}</b>
                  {" · "}{fecha(snapshot.equipamiento.confirmadoEn)}. Cada cambio se vuelve a firmar.</span>
              ) : (
                <span>Sin confirmar. Puedes inspeccionar igual, pero <b>no se puede firmar la inspección</b> hasta
                  que alguien confirme qué trae el equipo.</span>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {/* ══ PASO 2 ══ */}
      {pestana === "inspeccion" ? (
        <div className="grid gap-3.5 xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)_minmax(300px,400px)] lg:grid-cols-[minmax(240px,1fr)_minmax(0,1.4fr)]">
          <section className="rounded-xl border border-[#2E2F28] bg-[#1B1C17]">
            <div className="flex items-baseline gap-2 px-3.5 pb-2 pt-3">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#F5F5F5]">Puntos de control</h3>
              <span className="ml-auto font-mono text-[13px] text-[#B4B5AC]">{conteos.resueltas} / {zonas.length}</span>
            </div>
            <div className="mx-3.5 mb-3 flex h-[5px] overflow-hidden rounded-full bg-[#2A2B23]">
              <i className="block h-full bg-[#7BE495]" style={{ width: `${(conteos.ok / Math.max(1, zonas.length)) * 100}%` }} />
              <i className="block h-full bg-[#FF7A6B]" style={{ width: `${(conteos.falla / Math.max(1, zonas.length)) * 100}%` }} />
              <i className="block h-full bg-[#7E7F76]" style={{ width: `${(conteos.na / Math.max(1, zonas.length)) * 100}%` }} />
            </div>
            <ul className="max-h-[62vh] overflow-y-auto px-3.5 pb-3.5">
              {zonas.map((z) => {
                const e = estadoDeZona(z, snapshot);
                const hechos = z.puntos.filter((p) => snapshot.puntos[p.id]).length;
                const sub = e === "ok" ? "Conforme" : e === "falla" ? "Con falla" : e === "na" ? "No aplica"
                  : `${hechos} de ${z.puntos.length} puntos`;
                return (
                  <li key={z.id}>
                    <button type="button" onClick={() => setZonaSel(z.id)} aria-current={z.id === zona?.id}
                      className={`flex w-full items-center gap-2.5 rounded-lg border-b border-[#2E2F28] px-2 py-2.5 text-left transition hover:bg-[#22231C] ${
                        z.id === zona?.id ? "bg-[#22231C] shadow-[inset_2px_0_0_#D7FF4F]" : ""}`}>
                      <span className={`grid h-[23px] w-[23px] flex-none place-items-center rounded-full border font-mono text-[11px] font-semibold ${
                        e === "ok" ? "border-[#7BE495] bg-[#7BE495] text-[#10261A]"
                        : e === "falla" ? "border-[#FF7A6B] bg-[#FF7A6B] text-[#2B0D09]"
                        : e === "na" ? "border-[#7E7F76] bg-[#7E7F76] text-[#15160F]"
                        : "border-[#3A3A36] bg-[#2A2B23] text-[#B4B5AC]"}`}>{z.numero}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-[#F5F5F5]">{z.nombre}</span>
                        <span className="block text-[11px] text-[#7E7F76]">{sub}</span>
                      </span>
                      {z.captura.length ? (
                        <span className="rounded border border-[#F4C95B]/45 px-1 text-[9px] font-bold text-[#F4C95B]">FICHA</span>
                      ) : null}
                      {z.critica ? (
                        <span className="rounded border border-[#FF7A6B]/45 px-1 text-[9px] font-bold text-[#FF7A6B]">CRÍTICA</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-[#2E2F28] bg-[#1B1C17]">
            <div className="flex items-baseline gap-2 px-3.5 pb-2 pt-3">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#F5F5F5]">
                {item.categoria || "Equipo"} · {zona?.nombre ?? "guía visual"}
              </h3>
            </div>
            <DibujoEquipo
              perfil={perfil}
              zonas={zonas.map((z) => ({
                id: z.id, numero: z.numero, nombre: z.nombre, estado: estadoDeZona(z, snapshot),
              }))}
              coordenadas={coordenadas}
              zonaActiva={zona?.id ?? ""}
              onElegir={setZonaSel}
            />
          </section>

          <section className="rounded-xl border border-[#2E2F28] bg-[#1B1C17] xl:col-auto lg:col-span-full">
            <div className="px-3.5 pb-2 pt-3">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#F5F5F5]">
                {zona ? `${zona.numero}. ${zona.nombre}` : "Detalle"}
              </h3>
            </div>
            <div className="max-h-[62vh] overflow-y-auto px-3.5 pb-3.5">
              {!zona ? <p className="py-8 text-center text-sm text-[#7E7F76]">Elige una zona.</p> : (
                <>
                  {zona.puntos.map((p) => {
                    const val = snapshot.puntos[p.id]?.r;
                    const etiquetaNovedad = `${zona.nombre} — ${p.texto}`;
                    const novedadHecha = novedadesAbiertas.some(
                      (n) => (n.descripcion || "").trim() === etiquetaNovedad
                    );
                    return (
                      <div key={p.id} className="border-b border-[#2E2F28] py-2 last:border-b-0">
                        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                          <span className="text-[13px] text-[#F5F5F5]">
                            {p.texto}{" "}
                            {p.critico ? <span className="rounded border border-[#FF7A6B]/45 px-1 text-[9px] font-bold text-[#FF7A6B]">CRÍTICO</span> : null}{" "}
                            {p.origen === "declarado" ? <span className="rounded border border-[#D7FF4F]/40 px-1 text-[9px] font-bold text-[#D7FF4F]">DECLARADO</span> : null}
                          </span>
                          <span className="flex gap-0.5 rounded-lg border border-[#3A3A36] bg-[#141510] p-0.5">
                            {(["ok", "falla", "na"] as const).map((v) => (
                              <button key={v} type="button" disabled={guardando || firmado}
                                aria-pressed={val === v} onClick={() => void marcar(p.id, v)}
                                className={`rounded px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
                                  val === v && v === "ok" ? "bg-[#7BE495] text-[#10261A]"
                                  : val === v && v === "falla" ? "bg-[#FF7A6B] text-[#2B0D09]"
                                  : val === v ? "bg-[#7E7F76] text-[#15160F]"
                                  : "text-[#7E7F76] hover:text-[#F5F5F5]"}`}>
                                {v === "ok" ? "OK" : v === "falla" ? "Falla" : "N/A"}
                              </button>
                            ))}
                          </span>
                        </div>
                        {val === "falla" && p.critico && puedeCrearNovedades ? (
                          <div className="mt-2 rounded-lg border border-[#FF7A6B]/45 bg-[#FF7A6B]/8 px-3 py-2.5">
                            <p className="text-[11.5px] leading-relaxed text-[#E2A79E]">
                              {novedadHecha
                                ? "Ya hay una novedad registrada para este punto. Agrégale la foto desde Novedades."
                                : "Falla crítica: esto bloquea la publicación del equipo hasta resolverse. Registra la novedad para dejar el reclamo con su evidencia."}
                            </p>
                            {!novedadHecha ? (
                              <button type="button" disabled={guardando}
                                onClick={() => void crearNovedad(zona.nombre, p.texto)}
                                className="mt-2 rounded-lg border border-[#FF7A6B]/55 px-3 py-1.5 text-[12px] font-semibold text-[#FF7A6B] transition hover:bg-[#FF7A6B]/12 disabled:opacity-50">
                                Registrar novedad
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  {zona.captura.length ? (
                    <div className="mt-3.5 rounded-lg border border-[#F4C95B]/32 bg-[#22231C] px-3 py-2.5">
                      <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[#F4C95B]">
                        Esto llena la ficha técnica
                      </h4>
                      <p className="mb-1 text-[11.5px] text-[#7E7F76]">
                        Lo anotas con el equipo en la mano. Nadie lo vuelve a escribir después.
                      </p>
                      <div className={zona.captura.length > 1 ? "grid gap-2.5 sm:grid-cols-2" : ""}>
                        {zona.captura.map((c) => {
                          const valor = (item.technicalSheet as unknown as Record<string, unknown>)[c.campo];
                          const texto = valor === null || valor === undefined ? "" : String(valor);
                          const opciones = OPCIONES_FICHA[c.campo];
                          return (
                            <label key={c.campo} className="mt-2 block">
                              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#7E7F76]">{c.etiqueta}</span>
                              {opciones ? (
                                <select value={texto} disabled={guardando || firmado}
                                  onChange={(e) => void cambiarFicha(c.campo, e.target.value)}
                                  className="w-full rounded-lg border border-[#3A3A36] bg-[#141510] px-2.5 py-2 text-[13px] text-[#F5F5F5] outline-none focus:border-[#A8C93B] disabled:opacity-50">
                                  <option value="">— sin dato —</option>
                                  {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                              ) : (
                                <input type={c.tipo === "numero" ? "number" : "text"} defaultValue={texto}
                                  disabled={guardando || firmado}
                                  onBlur={(e) => void cambiarFicha(c.campo, e.target.value)}
                                  placeholder={c.tipo === "numero" ? "0 – 100" : "Ej: 512 GB"}
                                  className="w-full rounded-lg border border-[#3A3A36] bg-[#141510] px-2.5 py-2 text-[13px] text-[#F5F5F5] outline-none focus:border-[#A8C93B] disabled:opacity-50" />
                              )}
                            </label>
                          );
                        })}
                      </div>
                      {zona.id === "bateria" && item.technicalSheet.bateriaEstado ? (
                        <p className="mt-2 text-[12px] text-[#B4B5AC]">
                          Batería estado: <b className="font-semibold text-[#F4C95B]">{item.technicalSheet.bateriaEstado}</b> — lo calcula el sistema.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <label className="mt-3 block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#7E7F76]">Observación</span>
                    <textarea value={obsLocal} disabled={firmado}
                      onChange={(e) => cambiarObservacion(e.target.value)}
                      onBlur={() => vaciarObservacion()}
                      placeholder="Qué encontraste, con el detalle que le servirá a quien lo lea después."
                      className="min-h-[58px] w-full resize-y rounded-lg border border-[#3A3A36] bg-[#141510] px-2.5 py-2 text-[13px] text-[#F5F5F5] outline-none focus:border-[#A8C93B] disabled:opacity-50" />
                  </label>

                  {!firmado ? (
                    <button type="button" disabled={guardando} onClick={() => void marcarTodoConforme()}
                      className="mt-3 rounded-lg border border-[#3A3A36] bg-[#2A2B23] px-3 py-2 text-[13px] font-semibold text-[#F5F5F5] transition hover:border-[#A8C93B] disabled:opacity-50">
                      Marcar todo conforme
                    </button>
                  ) : null}

                  <div className="mt-3.5 flex items-center gap-2 rounded-lg border border-[#2E2F28] bg-[#22231C] px-3 py-2 text-[11.5px] text-[#B4B5AC]">
                    {zona.puntos.some((p) => snapshot.puntos[p.id]) ? (
                      <span>Revisado por{" "}
                        <b className="font-semibold text-[#D7FF4F]">
                          {zona.puntos.map((p) => snapshot.puntos[p.id]?.por).find(Boolean) ?? usuario}
                        </b>
                        {" · "}{fecha(zona.puntos.map((p) => snapshot.puntos[p.id]?.en).find(Boolean))}
                      </span>
                    ) : (
                      <span>Al marcar el primer punto queda firmado por <b className="font-semibold text-[#D7FF4F]">{usuario}</b>.</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {/* ══ MANTENIMIENTOS ══ */}
      {pestana === "mantenimientos" ? (
        <div className="grid gap-3.5 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
          <section className="rounded-xl border border-[#2E2F28] bg-[#1B1C17] p-3.5">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#F5F5F5]">Registrar mantenimiento</h3>
            <p className="mb-2 text-[11.5px] text-[#7E7F76]">Conserva lo que el equipo ya es. No cambia sus características.</p>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#7E7F76]">Tipo de trabajo</span>
              <select value={mantTipo} onChange={(e) => setMantTipo(e.target.value)}
                className="w-full rounded-lg border border-[#3A3A36] bg-[#141510] px-2.5 py-2 text-[13px] text-[#F5F5F5] outline-none focus:border-[#A8C93B]">
                {MANTENIMIENTOS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="mt-2.5 block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#7E7F76]">Qué se hizo</span>
              <textarea value={mantNota} onChange={(e) => setMantNota(e.target.value)}
                placeholder="Ej: se retiró polvo del disipador y se cambió la pasta térmica del CPU."
                className="min-h-[58px] w-full resize-y rounded-lg border border-[#3A3A36] bg-[#141510] px-2.5 py-2 text-[13px] text-[#F5F5F5] outline-none focus:border-[#A8C93B]" />
            </label>
            <button type="button" disabled={guardando}
              onClick={() => void registrarIntervencion(
                { tipo: "Mantenimiento", detalle: mantTipo, nota: mantNota.trim() },
                () => setMantNota(""))}
              className="mt-3 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-2 text-sm font-bold text-[#141510] transition hover:brightness-105 disabled:opacity-50">
              Registrar mantenimiento
            </button>
            <p className="mt-3 rounded-lg border border-[#2E2F28] bg-[#22231C] px-3 py-2 text-[11.5px] text-[#B4B5AC]">
              Firmado por <b className="font-semibold text-[#D7FF4F]">{usuario}</b>, con fecha y hora automáticas.
            </p>
          </section>
          <ListaIntervenciones titulo="Historial" registros={intervenciones.filter((i) => i.tipo === "Mantenimiento")} />
        </div>
      ) : null}

      {/* ══ MEJORAS ══ */}
      {pestana === "mejoras" ? (
        <div className="grid gap-3.5 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
          <section className="rounded-xl border border-[#2E2F28] bg-[#1B1C17] p-3.5">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#F5F5F5]">Registrar mejora</h3>
            <p className="mb-2 text-[11.5px] text-[#7E7F76]">Cambia lo que el equipo es, y consume una pieza del inventario.</p>
            {!repuestos.length ? (
              <p className="rounded-lg border border-[#2E2F28] bg-[#22231C] px-3 py-2.5 text-[12.5px] text-[#B4B5AC]">
                No hay repuestos con stock en el inventario. Registra primero el repuesto como item.
              </p>
            ) : !puedeEditarItems ? (
              <p className="rounded-lg border border-[#FF7A6B]/40 bg-[#FF7A6B]/8 px-3 py-2.5 text-[12.5px] text-[#FFB3A9]">
                Registrar una mejora descuenta stock del inventario, y tu usuario no tiene permiso para editar items.
              </p>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#7E7F76]">Tipo de mejora</span>
                  <select value={mejTipo} onChange={(e) => setMejTipo(e.target.value)}
                    className="w-full rounded-lg border border-[#3A3A36] bg-[#141510] px-2.5 py-2 text-[13px] text-[#F5F5F5] outline-none focus:border-[#A8C93B]">
                    {MEJORAS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label className="mt-2.5 block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#7E7F76]">Repuesto del inventario</span>
                  <select value={mejRepuesto} onChange={(e) => setMejRepuesto(e.target.value)}
                    className="w-full rounded-lg border border-[#3A3A36] bg-[#141510] px-2.5 py-2 text-[13px] text-[#F5F5F5] outline-none focus:border-[#A8C93B]">
                    {repuestos.map((r) => (
                      <option key={r.id} value={r.id}>{r.sku} · {r.nombre} — stock {r.stock}</option>
                    ))}
                  </select>
                </label>
                <label className="mt-2.5 block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#7E7F76]">Nota</span>
                  <input type="text" value={mejNota} onChange={(e) => setMejNota(e.target.value)}
                    placeholder="Ej: se pasó de 8 GB a 16 GB en el slot libre."
                    className="w-full rounded-lg border border-[#3A3A36] bg-[#141510] px-2.5 py-2 text-[13px] text-[#F5F5F5] outline-none focus:border-[#A8C93B]" />
                </label>
                {repuestoElegido ? (
                  <div className="mt-2.5 rounded-lg border border-dashed border-[#3A3A36] bg-[#22231C] px-3 py-2.5 text-[12px] text-[#B4B5AC]">
                    <div>En stock: <b className="text-[#F5F5F5]">{repuestoElegido.stock}</b> · Costo unitario:{" "}
                      <b className="text-[#F5F5F5]">${repuestoElegido.costo.toFixed(2)}</b></div>
                    <div className="mt-1.5 border-t border-[#2E2F28] pt-1.5 text-[#D7FF4F]">
                      Al registrar se descuenta <b>1 unidad</b> de {repuestoElegido.sku}. El costo del equipo no cambia;
                      queda guardado qué repuesto se usó y cuánto costaba.
                    </div>
                  </div>
                ) : null}
                <button type="button" disabled={guardando}
                  onClick={() => void registrarIntervencion(
                    { tipo: "Mejora", detalle: mejTipo, nota: mejNota.trim(), repuestoId: mejRepuesto, cantidadUsada: 1 },
                    () => setMejNota(""))}
                  className="mt-3 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-2 text-sm font-bold text-[#141510] transition hover:brightness-105 disabled:opacity-50">
                  Registrar mejora
                </button>
              </>
            )}
          </section>
          <ListaIntervenciones titulo="Mejoras aplicadas" registros={intervenciones.filter((i) => i.tipo === "Mejora")} />
        </div>
      ) : null}

      {/* ── Barra de cierre ── */}
      <footer className="sticky bottom-0 mt-auto flex flex-wrap items-center gap-3 rounded-t-xl border border-[#2E2F28] bg-[#1B1C17] px-3.5 py-2.5"
        style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom, 0px))" }}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-[#D7FF4F] text-[12px] font-bold text-[#141510]">
            {usuario.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
          </span>
          <div>
            <div className="text-[13px] font-semibold text-[#F5F5F5]">{usuario}</div>
            <div className="text-[11px] text-[#7E7F76]">Responsable de esta inspección</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-[#B4B5AC]">
          <span>Conformes <b className="font-mono text-[#F5F5F5]">{conteos.ok}</b></span>
          <span>Con falla <b className="font-mono text-[#F5F5F5]">{conteos.falla}</b></span>
          <span>Novedades <b className="font-mono text-[#F5F5F5]">{novedadesAbiertas.length}</b></span>
          <span>Ficha <b className="font-mono text-[#F4C95B]">{conteos.ficha}</b></span>
        </div>
        <div className="ml-auto flex gap-2">
          <Link href="/shipping-v2/recepcion"
            className="rounded-lg border border-[#3A3A36] bg-[#2A2B23] px-3 py-2 text-sm font-semibold text-[#F5F5F5] transition hover:border-[#A8C93B]">
            Guardar y seguir después
          </Link>
          {firmado ? (
            <button type="button" disabled={guardando} onClick={() => void reabrir()}
              className="rounded-lg border border-[#F4C95B]/55 bg-[#F4C95B]/10 px-3 py-2 text-sm font-semibold text-[#F4C95B] transition hover:border-[#F4C95B] disabled:opacity-50">
              Reabrir inspección
            </button>
          ) : null}
          <button type="button" disabled={!estado.completa || guardando || firmado} onClick={() => void firmar()}
            className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-2 text-sm font-bold text-[#141510] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40">
            {firmado ? "Inspección firmada" : "Finalizar inspección"}
          </button>
        </div>
        <p className="w-full text-[11.5px] text-[#7E7F76]">
          {firmado
            ? `Firmada por ${item.revisadoPor || usuario}${item.fechaRevision ? ` · ${fecha(item.fechaRevision)}` : ""}.`
            : estado.motivo}
        </p>
      </footer>
    </div>
  );
}

function ListaIntervenciones({ titulo, registros }: { titulo: string; registros: ShippingV2Intervencion[] }) {
  return (
    <section className="rounded-xl border border-[#2E2F28] bg-[#1B1C17]">
      <div className="flex items-baseline gap-2 px-3.5 pb-2 pt-3">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#F5F5F5]">{titulo}</h3>
        <span className="ml-auto font-mono text-[13px] text-[#B4B5AC]">{registros.length}</span>
      </div>
      <div className="px-3.5 pb-3.5">
        {!registros.length ? (
          <p className="py-7 text-center text-[13px] text-[#7E7F76]">Todavía no se registró nada.</p>
        ) : registros.map((r) => (
          <div key={r.id} className="flex gap-2.5 border-b border-[#2E2F28] py-2.5 last:border-b-0">
            <span aria-hidden="true" className={`grid h-7 w-7 flex-none place-items-center rounded-lg text-[13px] ${
              r.tipo === "Mejora" ? "bg-[#C99BFF]/16 text-[#C99BFF]" : "bg-[#5BC8F5]/16 text-[#5BC8F5]"}`}>
              {r.tipo === "Mejora" ? "⬆" : "🛠"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-[#F5F5F5]">{r.detalle || r.tipo}</div>
              {r.nota ? <div className="mt-0.5 text-[12px] text-[#B4B5AC]">{r.nota}</div> : null}
              <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-[#7E7F76]">
                <span>Por <b className="text-[#B4B5AC]">{r.realizadoPor || "—"}</b></span>
                <span>{fecha(r.fecha)}</span>
                {r.cantidadUsada ? <span className="font-mono text-[#D7FF4F]">−{r.cantidadUsada} unidad(es)</span> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
