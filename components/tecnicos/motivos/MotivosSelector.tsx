"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { buscarMotivos, frecuentes, motivoIgual, type GrupoMotivo, type Motivo, type MotivoCorto } from "@/lib/tecnicos/motivos/reglas";

// Motivo de ingreso con chips (rediseño R7, tablero 7 aprobado el 22-nov):
// A · elegir de los más usados · B · buscar al instante («pasta ter») ·
// C · crear uno nuevo; antes de crearlo la IA pregunta «¿Es lo mismo que…?».

// El catálogo se pide una vez por pantalla (lo comparten el registro, la orden y el regreso).
let pedido: Promise<Motivo[]> | null = null;
function cargarCatalogo(forzar = false): Promise<Motivo[]> {
  if (!pedido || forzar) {
    pedido = fetch("/api/tecnicos/motivos", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.success ? (j.data.motivos as Motivo[]) : []))
      .catch(() => { pedido = null; return []; });
  }
  return pedido;
}

type Aviso = { texto: string; motivo: Motivo; grupo: GrupoMotivo | null };

const MAXIMO = 8;

const corto = (m: Motivo): MotivoCorto => ({ id: m.id, nombre: m.nombre, grupo: m.grupo });

function Resaltado({ texto, marcas }: { texto: string; marcas: Array<[number, number]> }) {
  if (!marcas.length) return <>{texto}</>;
  const partes: React.ReactNode[] = [];
  let i = 0;
  marcas.forEach(([a, b], k) => {
    if (a > i) partes.push(texto.slice(i, a));
    partes.push(<b key={k} className="font-extrabold text-[#D7FF4F]">{texto.slice(a, b)}</b>);
    i = b;
  });
  partes.push(texto.slice(i));
  return <>{partes}</>;
}

export function MotivosSelector({ valor, onCambio, autoFocus = false, deshabilitado = false, invalido = false }: {
  valor: MotivoCorto[];
  onCambio: (motivos: MotivoCorto[]) => void;
  autoFocus?: boolean;
  deshabilitado?: boolean;
  /** Se intentó guardar sin motivo: el borde se pone rojo. */
  invalido?: boolean;
}) {
  const [catalogo, setCatalogo] = useState<Motivo[]>([]);
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [verTodos, setVerTodos] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cerca del borde de abajo (formularios en ventanas con desplazamiento) la lista se abre hacia arriba.
  const [arriba, setArriba] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const idLista = useId();

  useEffect(() => { let vivo = true; void cargarCatalogo().then((c) => { if (vivo) setCatalogo(c); }); return () => { vivo = false; }; }, []);

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const elegidos = valor.map((m) => m.id);
  // El límite se respeta al elegir (no al guardar).
  const lleno = valor.length >= MAXIMO;
  const resultados = useMemo(
    () => buscarMotivos(catalogo, texto, 6).filter((r) => !elegidos.includes(r.motivo.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogo, texto, valor],
  );
  const exacto = useMemo(() => motivoIgual(catalogo, texto), [catalogo, texto]);
  const puedeCrear = texto.trim().length >= 3 && !exacto;
  const opciones = resultados.length + (puedeCrear ? 1 : 0);
  const sugeridos = frecuentes(catalogo, elegidos, verTodos ? 99 : 6);
  const restantes = catalogo.filter((m) => m.activo && !elegidos.includes(m.id)).length - sugeridos.length;

  function agregar(m: Motivo | MotivoCorto) {
    if (!elegidos.includes(m.id)) onCambio([...valor, { id: m.id, nombre: m.nombre, grupo: m.grupo }]);
    setTexto("");
    setActivo(0);
    setAviso(null);
    setError(null);
    entrada.current?.focus();
  }

  function quitar(id: string) {
    onCambio(valor.filter((m) => m.id !== id));
    entrada.current?.focus();
  }

  async function crear(forzar = false, grupo: GrupoMotivo | null = null) {
    const nombre = (aviso?.texto ?? texto).trim();
    if (nombre.length < 3 || creando) return;
    setCreando(true);
    setError(null);
    try {
      const res = await fetch("/api/tecnicos/motivos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, forzar, grupo }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo crear el motivo.");
      const r = j.data as { tipo: "existente" | "parecido" | "creado"; motivo: Motivo; grupo?: GrupoMotivo | null };
      if (r.tipo === "parecido") { setAviso({ texto: nombre, motivo: r.motivo, grupo: r.grupo ?? null }); setAbierto(false); return; }
      if (r.tipo === "creado") setCatalogo(await cargarCatalogo(true));
      agregar(r.motivo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el motivo.");
    } finally {
      setCreando(false);
    }
  }

  function usarParecido(a: Aviso) {
    agregar(a.motivo);
    // Lo escrito queda como palabra parecida: la próxima vez el buscador lo encuentra.
    void fetch(`/api/tecnicos/motivos/${encodeURIComponent(a.motivo.id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agregarPalabra: a.texto }),
    }).then(() => cargarCatalogo(true)).then(setCatalogo).catch(() => {});
  }

  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setActivo((a) => Math.min(a + 1, Math.max(opciones - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      if (!texto.trim()) return;
      e.preventDefault();
      if (exacto && !elegidos.includes(exacto.id)) agregar(exacto);
      else if (activo < resultados.length) agregar(resultados[activo].motivo);
      else if (puedeCrear) void crear();
    } else if (e.key === "Escape") { setAbierto(false); setTexto(""); }
    else if (e.key === "Backspace" && !texto && valor.length) quitar(valor[valor.length - 1].id);
  }

  const chip = "inline-flex h-[26px] items-center rounded-full border border-[#3A3A36] bg-[#252622] px-2.5 text-xs font-semibold text-[#F0F0EC] transition hover:border-[#D7FF4F] disabled:opacity-50";

  return (
    <div ref={caja} className="relative space-y-2">
      <div
        onClick={() => entrada.current?.focus()}
        className={`flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-[9px] border bg-[#151613] px-2 py-1.5 transition focus-within:border-[#D7FF4F] focus-within:shadow-[0_0_0_3px_rgba(215,255,79,.12)] ${invalido && !valor.length ? "border-[#FF7A70]" : "border-[#3A3A36]"} ${deshabilitado ? "pointer-events-none opacity-60" : ""}`}
      >
        {valor.map((m) => (
          <span key={m.id} className="inline-flex h-6 items-center gap-1 rounded-full border border-[rgba(215,255,79,.55)] bg-[rgba(215,255,79,.12)] pl-2.5 pr-1 text-xs font-semibold text-[#D7FF4F] animate-[sg-entrada_140ms_ease-out]">
            {m.nombre}
            <button type="button" onClick={(e) => { e.stopPropagation(); quitar(m.id); }} aria-label={`Quitar ${m.nombre}`}
              className="grid h-4 w-4 place-items-center rounded-full text-[13px] leading-none hover:bg-[rgba(215,255,79,.2)]">×</button>
          </span>
        ))}
        <input
          ref={entrada}
          autoFocus={autoFocus}
          value={texto}
          disabled={deshabilitado || lleno}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true); setActivo(0); setAviso(null); setError(null); }}
          onFocus={() => {
            setAbierto(true);
            const r = caja.current?.getBoundingClientRect();
            if (r) setArriba(r.bottom + 300 > window.innerHeight && r.top > 320);
          }}
          onKeyDown={teclas}
          role="combobox"
          aria-expanded={abierto && !!texto.trim()}
          aria-controls={idLista}
          aria-label="Motivo de ingreso: buscar o crear"
          placeholder={lleno ? `Máximo ${MAXIMO}` : valor.length ? "" : "Buscar o crear…"}
          className="h-6 min-w-[8rem] flex-1 bg-transparent text-sm text-[#F0F0EC] outline-none placeholder:text-[#8A8A84]"
        />
      </div>

      {abierto && texto.trim() && (
        <ul id={idLista} role="listbox"
          className={`absolute inset-x-0 z-[70] overflow-hidden rounded-[10px] border border-[#3A3A36] bg-[#191A17] shadow-2xl animate-[sg-entrada_120ms_ease-out] ${arriba ? "bottom-[calc(100%-4px)]" : "top-[calc(100%-4px)]"}`}>
          {resultados.map((r, i) => (
            <li key={r.motivo.id} role="option" aria-selected={i === activo}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => agregar(r.motivo)} onMouseEnter={() => setActivo(i)}
                className={`flex w-full items-center gap-2.5 border-t border-[#2C2D29] px-3 py-2 text-left text-sm first:border-t-0 ${i === activo ? "bg-[rgba(215,255,79,.06)]" : ""}`}>
                <span className="min-w-0 flex-1 truncate text-[#F0F0EC]"><Resaltado texto={r.motivo.nombre} marcas={r.marcas} /></span>
                {i === activo && <span className="rounded border border-[#4A4A45] px-1.5 text-[10px] font-bold text-[#B5B5AE]">↵</span>}
              </button>
            </li>
          ))}
          {puedeCrear && (
            <li role="option" aria-selected={activo === resultados.length}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void crear()} onMouseEnter={() => setActivo(resultados.length)} disabled={creando}
                className={`flex w-full items-center gap-2 border-t border-[#2C2D29] px-3 py-2 text-left text-sm text-[#B5B5AE] first:border-t-0 ${activo === resultados.length ? "bg-[rgba(215,255,79,.06)]" : ""}`}>
                {creando ? "Revisando…" : <>+ Crear «{texto.trim()}»</>}
              </button>
            </li>
          )}
        </ul>
      )}

      {aviso && (
        <div role="alert" className="space-y-2 rounded-[10px] border border-[rgba(255,181,71,.4)] bg-[rgba(255,181,71,.08)] p-2.5 animate-[sg-entrada_160ms_ease-out]">
          <p className="text-sm font-bold text-[#FFB547]">
            ¿Es lo mismo que «{aviso.motivo.nombre}»?{aviso.motivo.usos > 0 && <span className="font-medium text-[#B5B5AE]"> · {aviso.motivo.usos} usos</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => usarParecido(aviso)} className="inline-flex h-7 items-center rounded-lg bg-[#D7FF4F] px-3 text-xs font-bold text-[#151613]">Usar «{aviso.motivo.nombre}»</button>
            <button type="button" onClick={() => void crear(true, aviso.grupo)} disabled={creando} className="inline-flex h-7 items-center rounded-lg border border-[#3A3A36] bg-[#252622] px-3 text-xs font-semibold text-[#F0F0EC] disabled:opacity-50">
              {creando ? "Creando…" : "Crear nuevo"}
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-[#FF7A70] animate-[sg-sacudir_240ms_ease-out]">{error}</p>}

      {!texto.trim() && !aviso && !lleno && sugeridos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sugeridos.map((m) => (
            <button key={m.id} type="button" disabled={deshabilitado} onClick={() => agregar(corto(m))} className={chip}>{m.nombre}</button>
          ))}
          {!verTodos && restantes > 0 && (
            <button type="button" onClick={() => setVerTodos(true)} className={`${chip} border-dashed text-[#B5B5AE]`}>+ {restantes}</button>
          )}
        </div>
      )}
    </div>
  );
}
