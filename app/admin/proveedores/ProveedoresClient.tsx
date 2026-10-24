"use client";

// Administrar › Proveedores (auditoría Shipping V2, punto 11, 22-oct-2026).
// Lista compacta + panel lateral para crear y editar. Todo lo que el sistema
// lee del proveedor se edita aquí; los cambios se ven en todo el portal en la
// siguiente carga (no hay caché).

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Ellipsis,
  ExternalLink,
  History,
  ImageUp,
  MessageCircle,
  Plus,
  Power,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
  UserPlus,
  Warehouse,
  X,
} from "lucide-react";
import {
  DATOS_VACIOS,
  DISENOS_FACTURA,
  ESTADO_INACTIVO,
  ETIQUETA_DISENO,
  LOGO_TIPOS,
  PAISES_PROVEEDOR,
  PERMISOS_PORTAL,
  TIPOS_PROVEEDOR,
  buscarDuplicados,
  camposCambiados,
  enlaceDePrueba,
  erroresDeDuplicados,
  limpiarDatosProveedor,
  resumenUso,
  sePuedeEliminar,
  validarDatosProveedor,
  validarLogo,
  type ErroresProveedor,
  type EventoProveedor,
  type ProveedorAdmin,
  type ProveedorDatos,
} from "@/lib/shipping-v2/proveedores-admin";

export type UsuarioPortalResumen = { nombre: string; rol: string; activo: boolean };

type FiltroEstado = "activos" | "inactivos" | "todos";

// ─── Utilidades ──────────────────────────────────────────────────────────────

function normalizar(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const esActivo = (p: Pick<ProveedorAdmin, "estado">) => p.estado !== ESTADO_INACTIVO;

function porNombre(a: ProveedorAdmin, b: ProveedorAdmin) {
  return a.datos.nombre.localeCompare(b.datos.nombre, "es", { sensitivity: "base" });
}

function enlaceWhatsapp(telefono: string): string | null {
  let d = telefono.replace(/\D/g, "");
  if (d.length < 9) return null;
  if (d.length === 10 && d.startsWith("0")) d = `593${d.slice(1)}`;
  return `https://wa.me/${d}`;
}

function enlaceWeb(v: string): string {
  const t = v.trim().replace(/\.$/, "");
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function fechaCorta(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-EC", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Etiquetas cortas de los permisos del portal (el nombre completo va en la ayuda). */
const PERMISO_CORTO: Record<string, string> = {
  "Ver artículos": "Artículos",
  "Ver packings": "Cajas",
  "Ver ubicación del packing": "Ubicación de la caja",
  "Ver factura del packing": "Factura de la caja",
  "Ver pagos": "Pagos",
  "Ver novedades": "Novedades",
  "Ver su costo de proveedor": "Su costo",
  "Editar nombre y observaciones": "Nombre y notas del artículo",
  "Editar peso del packing": "Peso de la caja",
  "Editar tracking, transportista USA y notas del packing": "Rastreo y notas de la caja",
  "Agregar artículos al packing": "Agregar a la caja",
  "Cerrar packing": "Cerrar caja",
  "Responder novedades": "Responder novedades",
};
const PERMISOS_VER = PERMISOS_PORTAL.filter((p) => p.startsWith("Ver "));
const PERMISOS_HACER = PERMISOS_PORTAL.filter((p) => !p.startsWith("Ver "));

type RespuestaApi<T> = { success: boolean; data?: T; error?: string; errores?: ErroresProveedor };

async function llamar<T>(url: string, init?: RequestInit): Promise<RespuestaApi<T>> {
  try {
    const res = await fetch(url, init);
    const json = (await res.json().catch(() => ({}))) as RespuestaApi<T>;
    if (!res.ok || !json.success) return { success: false, error: json.error || "No se pudo completar.", errores: json.errores };
    return json;
  } catch {
    return { success: false, error: "Sin conexión. Intenta de nuevo." };
  }
}

// ─── Controles compactos ─────────────────────────────────────────────────────

const INPUT =
  "h-8 w-full rounded-md border bg-[#151515] px-2.5 text-sm text-[#F5F5F5] outline-none transition-colors placeholder:text-[#5F605A] focus:border-[#D7FF4F]/70";

function bordeDe(error?: string) {
  return error ? "border-[#FF8A7A]/70" : "border-[#3A3A36]";
}

function Campo({ label, error, children, className = "", ayuda, grupo = false }: { label: string; error?: string; children: ReactNode; className?: string; ayuda?: string; grupo?: boolean }) {
  // grupo: varios botones (chips, segmentos). Va en <div> para que tocar la
  // etiqueta no active el primer botón.
  const Contenedor = grupo ? "div" : "label";
  return (
    <Contenedor className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-[11px] font-medium text-[#8E8F86]" title={ayuda}>{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[11px] text-[#FF8A7A] animate-[sg-entrada_160ms_ease-out]">{error}</span> : null}
    </Contenedor>
  );
}

function Interruptor({ activo, onChange, etiqueta, ayuda }: { activo: boolean; onChange: (v: boolean) => void; etiqueta: string; ayuda?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      title={ayuda}
      onClick={() => onChange(!activo)}
      className="group inline-flex items-center gap-2 text-[13px] text-[#CFCFCB]"
    >
      <span className={`relative h-[18px] w-8 rounded-full border transition-colors duration-200 ${activo ? "border-[#D7FF4F] bg-[#D7FF4F]/25" : "border-[#3A3A36] bg-[#1E1F1C]"}`}>
        <span className={`absolute top-[2px] h-3 w-3 rounded-full transition-all duration-200 ease-out ${activo ? "left-[15px] bg-[#D7FF4F]" : "left-[2px] bg-[#7E7F76]"}`} />
      </span>
      <span className={activo ? "text-[#F5F5F5]" : ""}>{etiqueta}</span>
    </button>
  );
}

function Chip({ activo, onClick, children, titulo }: { activo: boolean; onClick: () => void; children: ReactNode; titulo?: string }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-pressed={activo}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-[3px] text-[12px] font-medium transition-all duration-150 active:scale-95 ${
        activo ? "border-[#D7FF4F]/70 bg-[#D7FF4F]/15 text-[#E9FF9E]" : "border-[#30312D] bg-[#171814] text-[#A7A7A7] hover:border-[#4A4B44] hover:text-[#E5E5E0]"
      }`}
    >
      {activo ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function Seccion({ titulo, children, extra }: { titulo: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-[#26271F] pt-3 first:border-t-0 first:pt-0 animate-[sg-entrada_180ms_ease-out]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#7E7F76]">{titulo}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

function TipoChips({ tipos, casillero }: { tipos: string[]; casillero: boolean }) {
  return (
    <span className="flex flex-wrap gap-1">
      {tipos.map((t) => (
        <span key={t} className="rounded border border-[#30312D] bg-[#171814] px-1.5 py-px text-[11px] text-[#BDBDB7]">{t}</span>
      ))}
      {casillero ? (
        <span className="inline-flex items-center gap-1 rounded border border-[#8B73FF]/40 bg-[#8B73FF]/12 px-1.5 py-px text-[11px] text-[#C9BFFF]">
          <Warehouse className="h-3 w-3" aria-hidden="true" />Casillero
        </span>
      ) : null}
    </span>
  );
}

function Avatar({ p, grande = false }: { p: Pick<ProveedorAdmin, "logo" | "datos">; grande?: boolean }) {
  const tam = grande ? "h-9 w-9 text-sm" : "h-6 w-6 text-[11px]";
  if (p.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.logo.thumbnailUrl} alt="" className={`${tam} shrink-0 rounded-md bg-white object-contain p-0.5`} />;
  }
  return (
    <span className={`${tam} inline-flex shrink-0 items-center justify-center rounded-md border border-[#30312D] bg-[#1A1B17] font-bold text-[#8E8F86]`}>
      {(p.datos.nombre || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

// ─── Pantalla ────────────────────────────────────────────────────────────────

export function ProveedoresClient({
  inicial,
  usuarios,
  usuariosCargados,
}: {
  inicial: ProveedorAdmin[];
  usuarios: Record<string, UsuarioPortalResumen>;
  usuariosCargados: boolean;
}) {
  const [proveedores, setProveedores] = useState<ProveedorAdmin[]>(() => [...inicial].sort(porNombre));
  const [buscar, setBuscar] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("activos");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null); // id | "nuevo"
  const [animarEntrada, setAnimarEntrada] = useState(true);
  const [avisoPanel, setAvisoPanel] = useState<string | null>(null);
  const [destellos, setDestellos] = useState<Record<string, number>>({});
  const [saliendo, setSaliendo] = useState<Set<string>>(new Set());
  const buscarRef = useRef<HTMLInputElement>(null);

  // "/" lleva al buscador (uso diario).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !abierto && t && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        e.preventDefault();
        buscarRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto]);

  const conteo = useMemo(() => {
    const activos = proveedores.filter(esActivo).length;
    return { activos, inactivos: proveedores.length - activos, todos: proveedores.length };
  }, [proveedores]);

  const visibles = useMemo(() => {
    const q = normalizar(buscar);
    return proveedores.filter((p) => {
      // El que está abierto no desaparece mientras se edita (se ve el cambio).
      const fijo = p.id === abierto;
      if (!fijo && filtroEstado === "activos" && !esActivo(p)) return false;
      if (!fijo && filtroEstado === "inactivos" && esActivo(p)) return false;
      if (filtroTipo && !p.datos.tipos.includes(filtroTipo)) return false;
      if (!q) return true;
      const d = p.datos;
      return normalizar([d.nombre, d.email, d.telefono, d.website, d.pais, d.tipos.join(" "), d.esCasillero ? "casillero" : "", d.notas].join(" ")).includes(q);
    });
  }, [proveedores, buscar, filtroEstado, filtroTipo, abierto]);

  const seleccionado = abierto && abierto !== "nuevo" ? proveedores.find((p) => p.id === abierto) ?? null : null;

  const destellar = useCallback((id: string) => setDestellos((d) => ({ ...d, [id]: (d[id] ?? 0) + 1 })), []);

  const alGuardar = useCallback((p: ProveedorAdmin, esNuevo: boolean) => {
    setProveedores((lista) => [...lista.filter((x) => x.id !== p.id), p].sort(porNombre));
    destellar(p.id);
    if (esNuevo) {
      setAnimarEntrada(false);
      setAvisoPanel("Proveedor creado");
      setAbierto(p.id);
    }
  }, [destellar]);

  const alEliminar = useCallback((id: string) => {
    setAbierto(null);
    setSaliendo((s) => new Set(s).add(id));
    window.setTimeout(() => {
      setProveedores((lista) => lista.filter((x) => x.id !== id));
      setSaliendo((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, 260);
  }, []);

  function abrir(id: string) {
    setAnimarEntrada(true);
    setAvisoPanel(null);
    setAbierto(id);
  }

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-[#30312D] bg-[#11120F] p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-1 text-[15px] font-semibold text-[#F5F5F5]">Proveedores</h1>
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#696A64]" aria-hidden="true" />
            <input
              ref={buscarRef}
              type="search"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar nombre, email, teléfono, web…  ( / )"
              className="h-8 w-full rounded-lg border border-[#3A3A36] bg-[#151515] pl-8 pr-3 text-sm text-[#F5F5F5] outline-none placeholder:text-[#696A64] focus:border-[#D7FF4F]/70"
            />
          </div>
          <div className="flex rounded-md border border-[#30312D] bg-[#171814] p-0.5" role="tablist">
            {(["activos", "inactivos", "todos"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filtroEstado === f}
                onClick={() => setFiltroEstado(f)}
                className={`rounded px-2.5 py-1 text-[13px] font-semibold capitalize transition-colors duration-150 ${filtroEstado === f ? "bg-[#D7FF4F] text-[#151515]" : "text-[#A7A7A7] hover:text-[#D7FF4F]"}`}
              >
                {f} <span className="ml-0.5 font-mono text-xs opacity-80">{conteo[f]}</span>
              </button>
            ))}
          </div>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            aria-label="Qué provee"
            className="h-8 rounded-md border border-[#3A3A36] bg-[#151515] px-2 text-[13px] text-[#CFCFCB] outline-none focus:border-[#D7FF4F]/70"
          >
            <option value="">Provee: todo</option>
            {TIPOS_PROVEEDOR.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            type="button"
            onClick={() => abrir("nuevo")}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1 text-[13px] font-bold text-[#151515] transition hover:brightness-105 active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />Nuevo
          </button>
        </div>

        <div className="mt-2 overflow-x-auto">
          {!visibles.length ? (
            <p className="py-8 text-center text-sm text-[#696A64]">{proveedores.length ? "Sin resultados." : "Sin proveedores."}</p>
          ) : (
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#30312D] text-[11px] uppercase text-[#A7A7A7]">
                  <th className="px-2 py-1.5 font-semibold">Proveedor</th>
                  <th className="px-2 py-1.5 font-semibold">Provee</th>
                  <th className="px-2 py-1.5 font-semibold">País</th>
                  <th className="px-2 py-1.5 font-semibold" title="Enlace de rastreo web">Rastreo</th>
                  <th className="px-2 py-1.5 font-semibold">Portal</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Uso</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const d = p.datos;
                  const activo = esActivo(p);
                  const sinUsuario = usuariosCargados && d.portal && d.email && !usuarios[d.email.toLowerCase()];
                  const resumen = resumenUso(p.uso);
                  const anim = saliendo.has(p.id)
                    ? "animate-[sg-salida_260ms_ease-in_forwards]"
                    : destellos[p.id] ? "animate-[sg-destello_900ms_ease-out]" : "";
                  return (
                    <tr
                      key={`${p.id}-${destellos[p.id] ?? 0}`}
                      onClick={() => abrir(p.id)}
                      className={`cursor-pointer border-b border-[#23241F] transition-[opacity,background-color] duration-300 last:border-b-0 hover:bg-[#171814] ${abierto === p.id ? "bg-[#1A1C14] shadow-[inset_2px_0_0_#D7FF4F]" : ""} ${activo ? "" : "opacity-55"} ${anim}`}
                    >
                      <td className="px-2 py-1.5">
                        <span className="flex items-center gap-2">
                          <Avatar p={p} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-semibold text-[#F5F5F5]">{d.nombre || "Sin nombre"}</span>
                              {!activo ? <span className="rounded-full border border-[#3A3A36] bg-[#1E1E1E] px-1.5 text-[10px] font-semibold text-[#A7A7A7]">Inactivo</span> : null}
                            </span>
                            {d.email || d.telefono ? (
                              <span className="block truncate text-[11px] text-[#696A64]">{[d.email, d.telefono].filter(Boolean).join(" · ")}</span>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-1.5"><TipoChips tipos={d.tipos} casillero={d.esCasillero} /></td>
                      <td className="px-2 py-1.5 text-[13px] text-[#A7A7A7]">{d.pais || "—"}</td>
                      <td className="px-2 py-1.5 text-[13px]">
                        {d.permiteRastreoWeb && (d.plantillaUrlRastreo || d.urlRastreo)
                          ? <span className="inline-flex items-center gap-1 text-[#9FEFB3]" title={d.plantillaUrlRastreo || d.urlRastreo}><Check className="h-3.5 w-3.5" aria-hidden="true" />Web</span>
                          : <span className="text-[#5F605A]">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-[13px]">
                        {d.portal ? (
                          <span className="inline-flex items-center gap-1" title={d.permisosPortal.join("\n")}>
                            <span className="text-[#E9FF9E]">✓ {d.permisosPortal.length}</span>
                            {sinUsuario ? <TriangleAlert className="h-3.5 w-3.5 text-[#F4C95B]" aria-label="Sin usuario del portal" /> : null}
                          </span>
                        ) : <span className="text-[#5F605A]">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[12px]" title={resumen || "Nunca se usó: se puede eliminar"}>
                        {p.uso.articulos > 0
                          ? <span className="font-mono text-[#CFCFCB]">{p.uso.articulos} art.</span>
                          : resumen ? <span className="text-[#A7A7A7]">{resumen.split(" · ")[0]}</span> : <span className="text-[#5F605A]">Sin uso</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {abierto ? (
        <PanelProveedor
          key={abierto}
          proveedor={seleccionado}
          todos={proveedores}
          usuarios={usuarios}
          usuariosCargados={usuariosCargados}
          animarEntrada={animarEntrada}
          avisoInicial={avisoPanel}
          onAbrir={abrir}
          onGuardado={alGuardar}
          onEliminado={alEliminar}
          onCerrar={() => setAbierto(null)}
        />
      ) : null}
    </div>
  );
}

// ─── Panel lateral (crear / editar) ──────────────────────────────────────────

type Confirmar = null | "desactivar" | "eliminar" | "descartar";

function PanelProveedor({
  proveedor,
  todos,
  usuarios,
  usuariosCargados,
  animarEntrada,
  avisoInicial,
  onAbrir,
  onGuardado,
  onEliminado,
  onCerrar,
}: {
  proveedor: ProveedorAdmin | null;
  todos: ProveedorAdmin[];
  usuarios: Record<string, UsuarioPortalResumen>;
  usuariosCargados: boolean;
  animarEntrada: boolean;
  avisoInicial: string | null;
  onAbrir: (id: string) => void;
  onGuardado: (p: ProveedorAdmin, esNuevo: boolean) => void;
  onEliminado: (id: string) => void;
  onCerrar: () => void;
}) {
  const esNuevo = !proveedor;
  const base = proveedor?.datos ?? DATOS_VACIOS;
  const [datos, setDatos] = useState<ProveedorDatos>(base);
  const [olvidarColumnas, setOlvidarColumnas] = useState(false);
  const [erroresServidor, setErroresServidor] = useState<ErroresProveedor>({});
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tono: "ok" | "error"; texto: string } | null>(avisoInicial ? { tono: "ok", texto: avisoInicial } : null);
  const [confirmar, setConfirmar] = useState<Confirmar>(null);
  const [sacudir, setSacudir] = useState(0);
  const [menu, setMenu] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [historial, setHistorial] = useState<EventoProveedor[] | null>(null);
  const [facturaAbierta, setFacturaAbierta] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Al guardar, el proveedor que llega del servidor pasa a ser la nueva base.
  useEffect(() => {
    if (proveedor) setDatos(proveedor.datos);
  }, [proveedor]);

  const limpio = useMemo(() => limpiarDatosProveedor(datos), [datos]);
  const cambios = useMemo(() => camposCambiados(base, limpio).length + (olvidarColumnas ? 1 : 0), [base, limpio, olvidarColumnas]);
  const sucio = esNuevo ? camposCambiados(DATOS_VACIOS, limpio).length > 0 : cambios > 0;

  const otros = useMemo(() => todos.map((p) => ({ id: p.id, datos: p.datos })), [todos]);
  const duplicados = useMemo(() => buscarDuplicados(limpio, otros, proveedor?.id), [limpio, otros, proveedor?.id]);
  const erroresDup = useMemo(() => erroresDeDuplicados(duplicados), [duplicados]);
  const dupNombre = duplicados.find((d) => d.campo === "nombre");
  const erroresValidacion = useMemo(() => (intentado ? validarDatosProveedor(limpio) : {}), [intentado, limpio]);
  const errores: ErroresProveedor = { ...erroresValidacion, ...erroresServidor, ...erroresDup };

  const logistico = datos.tipos.includes("Logístico");
  const usuario = datos.email ? usuarios[datos.email.trim().toLowerCase()] : undefined;
  const usoTexto = proveedor ? resumenUso(proveedor.uso) : "";
  const eliminable = proveedor ? sePuedeEliminar(proveedor.uso) : false;
  const activo = proveedor ? esActivo(proveedor) : true;
  const pruebaRastreo = enlaceDePrueba(limpio);

  function set<K extends keyof ProveedorDatos>(campo: K, valor: ProveedorDatos[K]) {
    setDatos((d) => ({ ...d, [campo]: valor }));
    setMensaje(null);
    if (erroresServidor[campo]) setErroresServidor((e) => ({ ...e, [campo]: undefined }));
  }

  function alternar(campo: "tipos" | "permisosPortal", valor: string) {
    const actual = datos[campo];
    set(campo, actual.includes(valor) ? actual.filter((v) => v !== valor) : [...actual, valor]);
  }

  const cerrar = useCallback(() => {
    if (sucio && !guardando) setConfirmar("descartar");
    else onCerrar();
  }, [sucio, guardando, onCerrar]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (confirmar) setConfirmar(null);
        else if (menu) setMenu(false);
        else cerrar();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cerrar, confirmar, menu]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setIntentado(true);
    const errs = { ...validarDatosProveedor(limpio), ...erroresDup };
    if (Object.keys(errs).length) {
      setSacudir((n) => n + 1);
      setMensaje({ tono: "error", texto: Object.values(errs)[0] ?? "Revisa los datos." });
      return;
    }
    if (!esNuevo && !cambios) return;
    setGuardando(true);
    setMensaje(null);
    const r = esNuevo
      ? await llamar<ProveedorAdmin>("/api/admin/proveedores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ datos: limpio }),
        })
      : await llamar<ProveedorAdmin>(`/api/admin/proveedores/${proveedor!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ datos: limpio, olvidarColumnas }),
        });
    setGuardando(false);
    if (!r.success || !r.data) {
      if (r.errores) setErroresServidor(r.errores);
      setSacudir((n) => n + 1);
      setMensaje({ tono: "error", texto: r.error || "No se pudo guardar." });
      return;
    }
    setOlvidarColumnas(false);
    setErroresServidor({});
    setIntentado(false);
    setHistorial(null);
    onGuardado(r.data, esNuevo);
    setMensaje({ tono: "ok", texto: esNuevo ? "Proveedor creado" : "Guardado" });
  }

  async function cambiarEstado() {
    if (!proveedor) return;
    setGuardando(true);
    const r = await llamar<ProveedorAdmin>(`/api/admin/proveedores/${proveedor.id}/estado`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !activo }),
    });
    setGuardando(false);
    setConfirmar(null);
    if (!r.success || !r.data) {
      setMensaje({ tono: "error", texto: r.error || "No se pudo cambiar el estado." });
      return;
    }
    setHistorial(null);
    onGuardado(r.data, false);
    setMensaje({ tono: "ok", texto: activo ? "Desactivado" : "Reactivado" });
  }

  async function eliminar() {
    if (!proveedor) return;
    setGuardando(true);
    const r = await llamar<{ eliminado: boolean }>(`/api/admin/proveedores/${proveedor.id}`, { method: "DELETE" });
    setGuardando(false);
    setConfirmar(null);
    if (!r.success) {
      setMensaje({ tono: "error", texto: r.error || "No se pudo eliminar." });
      return;
    }
    onEliminado(proveedor.id);
  }

  async function subirLogo(archivo: File) {
    if (!proveedor) return;
    const motivo = validarLogo({ type: archivo.type, size: archivo.size });
    if (motivo) {
      setMensaje({ tono: "error", texto: motivo });
      return;
    }
    setSubiendoLogo(true);
    const form = new FormData();
    form.append("logo", archivo);
    const r = await llamar<ProveedorAdmin>(`/api/admin/proveedores/${proveedor.id}/logo`, { method: "POST", body: form });
    setSubiendoLogo(false);
    if (!r.success || !r.data) {
      setMensaje({ tono: "error", texto: r.error || "No se pudo subir el logo." });
      return;
    }
    setHistorial(null);
    onGuardado(r.data, false);
  }

  async function quitarLogo() {
    if (!proveedor) return;
    setSubiendoLogo(true);
    const r = await llamar<ProveedorAdmin>(`/api/admin/proveedores/${proveedor.id}/logo`, { method: "DELETE" });
    setSubiendoLogo(false);
    if (r.success && r.data) {
      setHistorial(null);
      onGuardado(r.data, false);
    } else setMensaje({ tono: "error", texto: r.error || "No se pudo quitar el logo." });
  }

  async function cargarHistorial() {
    if (!proveedor || historial) return;
    const r = await llamar<EventoProveedor[]>(`/api/admin/proveedores/${proveedor.id}/historial`);
    setHistorial(r.success && r.data ? r.data : []);
  }

  const nombreVisible = datos.nombre.trim() || (esNuevo ? "Nuevo proveedor" : "Sin nombre");
  const enlaceUsuario = `/admin/usuarios?nuevo=${encodeURIComponent(limpio.email)}&nombre=${encodeURIComponent(limpio.nombre)}&rol=Proveedor`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={nombreVisible}>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={cerrar}
        className={`absolute inset-0 cursor-default bg-black/45 ${animarEntrada ? "animate-[sg-velo_180ms_ease-out]" : ""}`}
      />
      <form
        ref={formRef}
        onSubmit={guardar}
        noValidate
        className={`relative flex h-full w-full max-w-[540px] flex-col border-l border-[#30312D] bg-[#11120F] shadow-2xl shadow-black/60 ${animarEntrada ? "animate-[sg-panel_220ms_cubic-bezier(0.2,0.8,0.2,1)]" : ""}`}
      >
        {/* Cabecera */}
        <header className="flex items-center gap-2.5 border-b border-[#26271F] px-4 py-2.5">
          <Avatar p={{ logo: proveedor?.logo ?? null, datos: limpio }} grande />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-[15px] font-semibold text-[#F5F5F5]">{nombreVisible}</h2>
              {proveedor ? (
                <span
                  key={proveedor.estado}
                  className={`rounded-full border px-1.5 text-[10px] font-semibold animate-[sg-entrada_200ms_ease-out] ${activo ? "border-[#9FEFB3]/40 bg-[#9FEFB3]/10 text-[#9FEFB3]" : "border-[#3A3A36] bg-[#1E1E1E] text-[#A7A7A7]"}`}
                >
                  {proveedor.estado}
                </span>
              ) : null}
            </div>
            <p className="truncate text-[11px] text-[#7E7F76]">{esNuevo ? "Se crea activo" : usoTexto || "Nunca se usó"}</p>
          </div>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="rounded-md p-1 text-[#8E8F86] transition hover:bg-[#1E1F1C] hover:text-[#F5F5F5]">
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Cuerpo */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <Seccion titulo="Datos">
            <Campo label="Nombre" error={dupNombre ? undefined : errores.nombre}>
              <input autoFocus={esNuevo} value={datos.nombre} onChange={(e) => set("nombre", e.target.value)} className={`${INPUT} ${bordeDe(errores.nombre)}`} placeholder="eBay, Laarbox, DTC…" />
              {dupNombre ? (
                <span className="mt-1 flex items-center gap-1.5 text-[11px] text-[#FF8A7A] animate-[sg-entrada_160ms_ease-out]">
                  Ya existe: {dupNombre.proveedor}.
                  <button type="button" onClick={() => onAbrir(dupNombre.proveedorId)} className="font-semibold text-[#D7FF4F] hover:underline">Abrir</button>
                </span>
              ) : null}
            </Campo>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Campo label="Provee" error={errores.tipos} grupo>
                <span className="flex flex-wrap gap-1">
                  {TIPOS_PROVEEDOR.map((t) => (
                    <Chip key={t} activo={datos.tipos.includes(t)} onClick={() => alternar("tipos", t)}>{t}</Chip>
                  ))}
                </span>
              </Campo>
              <Campo label="País" error={errores.pais} ayuda="Ecuador = local. Cualquier otro = extranjero (pasa por casillero).">
                <span className="flex items-center gap-1.5">
                  <select value={datos.pais} onChange={(e) => set("pais", e.target.value)} className={`${INPUT} ${bordeDe(errores.pais)} w-[150px] px-2`}>
                    <option value="">Elegir…</option>
                    {PAISES_PROVEEDOR.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {datos.pais ? (
                    <span key={datos.pais} className="text-[11px] text-[#8E8F86] animate-[sg-entrada_160ms_ease-out]">{datos.pais === "Ecuador" ? "Local" : "Extranjero"}</span>
                  ) : null}
                </span>
              </Campo>
            </div>
            {logistico ? (
              <div className="animate-[sg-entrada_180ms_ease-out]">
                <Interruptor
                  activo={datos.esCasillero}
                  onChange={(v) => set("esCasillero", v)}
                  etiqueta="Casillero"
                  ayuda="Recibe en el exterior las compras y las envía a Ecuador (ej. Laarbox). Aparece al registrar compras de importación."
                />
              </div>
            ) : null}
            {proveedor && proveedor.columnasRecordadas > 0 ? (
              <p className="flex items-center gap-2 text-[12px] text-[#8E8F86]">
                <span className={olvidarColumnas ? "line-through opacity-60" : ""}>Columnas recordadas para cargar listas: {proveedor.columnasRecordadas}</span>
                <button type="button" onClick={() => setOlvidarColumnas((v) => !v)} className="text-[#D7FF4F] hover:underline">
                  {olvidarColumnas ? "Deshacer" : "Olvidar"}
                </button>
              </p>
            ) : null}
          </Seccion>

          <Seccion titulo="Contacto">
            <div className="grid gap-2 sm:grid-cols-2">
              <Campo label="Email" error={errores.email} ayuda="Con este email entra al portal y recibe los avisos de novedades.">
                <input type="email" value={datos.email} onChange={(e) => set("email", e.target.value)} className={`${INPUT} ${bordeDe(errores.email)}`} placeholder="ventas@proveedor.com" />
              </Campo>
              <Campo label="Teléfono / WhatsApp" error={errores.telefono}>
                <span className="relative block">
                  <input value={datos.telefono} onChange={(e) => set("telefono", e.target.value)} className={`${INPUT} ${bordeDe(errores.telefono)} pr-8`} placeholder="+593 99 123 4567" />
                  {enlaceWhatsapp(datos.telefono) ? (
                    <a href={enlaceWhatsapp(datos.telefono)!} target="_blank" rel="noreferrer" title="Abrir WhatsApp" className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9FEFB3] hover:brightness-125">
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </span>
              </Campo>
            </div>
            <Campo label="Sitio web" error={errores.website}>
              <span className="relative block">
                <input value={datos.website} onChange={(e) => set("website", e.target.value)} className={`${INPUT} ${bordeDe(errores.website)} pr-8`} placeholder="proveedor.com" />
                {limpio.website && !errores.website ? (
                  <a href={enlaceWeb(limpio.website)} target="_blank" rel="noreferrer" title="Abrir" className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8E8F86] hover:text-[#D7FF4F]">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </span>
            </Campo>
            <Campo label="Notas">
              <textarea value={datos.notas} onChange={(e) => set("notas", e.target.value)} rows={2} className={`${INPUT} ${bordeDe()} h-auto min-h-[52px] resize-y py-1.5 leading-5`} />
            </Campo>
          </Seccion>

          {logistico ? (
            <Seccion
              titulo="Rastreo"
              extra={<Interruptor activo={datos.permiteRastreoWeb} onChange={(v) => set("permiteRastreoWeb", v)} etiqueta="Rastreo web" ayuda="Muestra el enlace de rastreo en las cajas y artículos que viajan con este transportista." />}
            >
              <Campo label="Enlace con nº" error={errores.plantillaUrlRastreo} ayuda="Pon {TRACKING} donde va el número de guía.">
                <span className="flex gap-1.5">
                  <input value={datos.plantillaUrlRastreo} onChange={(e) => set("plantillaUrlRastreo", e.target.value)} className={`${INPUT} ${bordeDe(errores.plantillaUrlRastreo)} font-mono text-[12px]`} placeholder="https://…/track?num={TRACKING}" />
                  {pruebaRastreo && !errores.plantillaUrlRastreo && !errores.urlRastreo ? (
                    <a href={pruebaRastreo} target="_blank" rel="noreferrer" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-[#30312D] px-2 text-[12px] text-[#CFCFCB] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">
                      Probar<ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </span>
              </Campo>
              <Campo label="Página de rastreo (si no hay enlace con nº)" error={errores.urlRastreo}>
                <input value={datos.urlRastreo} onChange={(e) => set("urlRastreo", e.target.value)} className={`${INPUT} ${bordeDe(errores.urlRastreo)} font-mono text-[12px]`} placeholder="https://…" />
              </Campo>
            </Seccion>
          ) : null}

          <Seccion
            titulo="Portal del proveedor"
            extra={<Interruptor activo={datos.portal} onChange={(v) => set("portal", v)} etiqueta="Acceso" ayuda="Si se apaga, se quitan sus permisos y no ve nada en el portal." />}
          >
            {datos.portal ? (
              <div className="space-y-2 animate-[sg-entrada_180ms_ease-out]">
                <p className="text-[12px]">
                  {!limpio.email ? (
                    <span className="text-[#F4C95B]">Falta el email (con él entra).</span>
                  ) : usuario ? (
                    <span className="text-[#A7A7A7]">
                      Usuario: <b className="font-semibold text-[#E5E5E0]">{usuario.nombre || limpio.email}</b> · {usuario.rol}
                      {!usuario.activo ? <span className="ml-1 text-[#F4C95B]">(inactivo)</span> : null}
                    </span>
                  ) : usuariosCargados ? (
                    <span className="inline-flex flex-wrap items-center gap-1.5 text-[#F4C95B]">
                      <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />Sin usuario del portal
                      {esNuevo || sucio ? (
                        <span className="text-[#8E8F86]">· guarda y créalo</span>
                      ) : (
                        <a href={enlaceUsuario} className="inline-flex items-center gap-1 rounded border border-[#F4C95B]/40 px-1.5 py-px text-[#F4C95B] hover:bg-[#F4C95B]/10">
                          <UserPlus className="h-3 w-3" />Crear usuario
                        </a>
                      )}
                    </span>
                  ) : null}
                </p>
                {[["Ve", PERMISOS_VER], ["Puede", PERMISOS_HACER]].map(([titulo, lista]) => (
                  <div key={titulo as string} className="flex gap-2">
                    <span className="w-11 shrink-0 pt-1 text-[11px] text-[#7E7F76]">{titulo as string}</span>
                    <span className="flex flex-wrap gap-1">
                      {(lista as string[]).map((p) => (
                        <Chip key={p} titulo={p} activo={datos.permisosPortal.includes(p)} onClick={() => alternar("permisosPortal", p)}>
                          {PERMISO_CORTO[p] ?? p}
                        </Chip>
                      ))}
                    </span>
                  </div>
                ))}
                <p className="flex items-center gap-3 text-[11px]">
                  <button type="button" className="text-[#D7FF4F] hover:underline" onClick={() => set("permisosPortal", [...PERMISOS_PORTAL])}>Todos</button>
                  <button type="button" className="text-[#8E8F86] hover:underline" onClick={() => set("permisosPortal", [])}>Ninguno</button>
                  {errores.permisosPortal ? <span className="text-[#FF8A7A]">{errores.permisosPortal}</span> : null}
                </p>
              </div>
            ) : null}
          </Seccion>

          <section className="border-t border-[#26271F] pt-3">
            <button type="button" onClick={() => setFacturaAbierta((v) => !v)} className="flex w-full items-center justify-between text-left" aria-expanded={facturaAbierta}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#7E7F76]" title="Cómo se ve la factura de sus cajas (portal del proveedor)">Diseño de su factura</h3>
              <span className="flex items-center gap-2 text-[11px] text-[#696A64]">
                {!facturaAbierta ? [proveedor?.logo ? "Logo" : "", ETIQUETA_DISENO[datos.disenoFactura] ?? ""].filter(Boolean).join(" · ") : ""}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${facturaAbierta ? "rotate-180" : ""}`} />
              </span>
            </button>
            {facturaAbierta ? (
              <div className="mt-2 space-y-2 animate-[sg-entrada_180ms_ease-out]">
                <div className="flex items-center gap-2">
                  {proveedor?.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proveedor.logo.thumbnailUrl} alt="Logo" className="h-10 w-20 rounded bg-white object-contain p-1" />
                  ) : (
                    <span className="flex h-10 w-20 items-center justify-center rounded border border-dashed border-[#3A3A36] text-[11px] text-[#5F605A]">Sin logo</span>
                  )}
                  {proveedor ? (
                    <>
                      <input
                        ref={archivoRef}
                        type="file"
                        accept={LOGO_TIPOS.join(",")}
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void subirLogo(f);
                        }}
                      />
                      <button type="button" disabled={subiendoLogo} onClick={() => archivoRef.current?.click()} className="inline-flex h-7 items-center gap-1 rounded-md border border-[#30312D] px-2 text-[12px] text-[#CFCFCB] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:opacity-50">
                        <ImageUp className="h-3.5 w-3.5" />{subiendoLogo ? "Subiendo…" : proveedor.logo ? "Cambiar" : "Subir"}
                      </button>
                      {proveedor.logo ? (
                        <button type="button" disabled={subiendoLogo} onClick={() => void quitarLogo()} className="h-7 rounded-md px-2 text-[12px] text-[#8E8F86] hover:text-[#FF8A7A] disabled:opacity-50">Quitar</button>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-[11px] text-[#696A64]">El logo se sube después de crear.</span>
                  )}
                </div>
                <Campo label="Diseño" grupo>
                  <span className="inline-flex rounded-md border border-[#30312D] bg-[#171814] p-0.5">
                    {DISENOS_FACTURA.map((d) => {
                      const elegido = (datos.disenoFactura || "Estándar") === d;
                      return (
                        <button key={d} type="button" onClick={() => set("disenoFactura", d === "Estándar" && !base.disenoFactura ? "" : d)} className={`rounded px-2.5 py-0.5 text-[12px] font-semibold transition-colors ${elegido ? "bg-[#D7FF4F] text-[#151515]" : "text-[#A7A7A7] hover:text-[#D7FF4F]"}`}>
                          {ETIQUETA_DISENO[d]}
                        </button>
                      );
                    })}
                  </span>
                </Campo>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Campo label="Nombre comercial" ayuda="Si en la factura va un nombre distinto (ej. LV Electronics Recycling).">
                    <input value={datos.nombreComercialFactura} onChange={(e) => set("nombreComercialFactura", e.target.value)} className={`${INPUT} ${bordeDe()}`} />
                  </Campo>
                  <Campo label="Eslogan">
                    <input value={datos.esloganFactura} onChange={(e) => set("esloganFactura", e.target.value)} className={`${INPUT} ${bordeDe()}`} />
                  </Campo>
                </div>
                <Campo label="Datos de empresa (una línea por dato)">
                  <textarea value={datos.datosEmpresaFactura} onChange={(e) => set("datosEmpresaFactura", e.target.value)} rows={3} className={`${INPUT} ${bordeDe()} h-auto resize-y py-1.5 leading-5`} />
                </Campo>
                <Campo label="Pie de factura">
                  <textarea value={datos.pieFactura} onChange={(e) => set("pieFactura", e.target.value)} rows={3} className={`${INPUT} ${bordeDe()} h-auto resize-y py-1.5 font-mono text-[12px] leading-5`} />
                </Campo>
              </div>
            ) : null}
          </section>

          {proveedor ? (
            <details className="border-t border-[#26271F] pt-3" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void cargarHistorial(); }}>
              <summary className="flex cursor-pointer list-none items-center justify-between">
                <h3 className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#7E7F76]"><History className="h-3.5 w-3.5" />Historial</h3>
                <ChevronDown className="h-3.5 w-3.5 text-[#696A64]" />
              </summary>
              <div className="mt-2 animate-[sg-entrada_180ms_ease-out]">
                {historial === null ? (
                  <p className="text-[12px] text-[#696A64]">Cargando…</p>
                ) : !historial.length ? (
                  <p className="text-[12px] text-[#696A64]">Sin cambios registrados desde esta pantalla.</p>
                ) : (
                  <ol className="space-y-1.5">
                    {historial.map((ev) => (
                      <li key={ev.id} className="text-[12px] leading-5">
                        <span className="text-[#7E7F76]">{fechaCorta(ev.fecha)} · {ev.registradoPor || "—"}</span>
                        <span className="block whitespace-pre-line text-[#CFCFCB]">{ev.descripcion || ev.accion}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </details>
          ) : null}
        </div>

        {/* Pie: confirmaciones y acciones */}
        <footer className="border-t border-[#26271F] bg-[#11120F] px-4 py-2.5">
          {confirmar ? (
            <div className="flex flex-wrap items-center gap-2 text-[13px] animate-[sg-entrada_160ms_ease-out]">
              <span className="min-w-0 flex-1 text-[#E5E5E0]">
                {confirmar === "descartar" && "¿Descartar los cambios?"}
                {confirmar === "desactivar" && (activo
                  ? <>¿Desactivar <b>{proveedor?.datos.nombre}</b>? Deja de salir al registrar compras y envíos; su historia se conserva.</>
                  : <>¿Reactivar <b>{proveedor?.datos.nombre}</b>?</>)}
                {confirmar === "eliminar" && <>¿Eliminar <b>{proveedor?.datos.nombre}</b>? No se puede deshacer.</>}
              </span>
              <button type="button" onClick={() => setConfirmar(null)} className="h-8 rounded-md px-3 text-[13px] text-[#A7A7A7] hover:text-[#F5F5F5]">No</button>
              <button
                type="button"
                disabled={guardando}
                onClick={() => {
                  if (confirmar === "descartar") onCerrar();
                  else if (confirmar === "desactivar") void cambiarEstado();
                  else void eliminar();
                }}
                className={`h-8 rounded-md px-3 text-[13px] font-bold transition active:scale-95 disabled:opacity-50 ${confirmar === "eliminar" ? "bg-[#FF8A7A] text-[#151515]" : confirmar === "desactivar" && activo ? "bg-[#F4C95B] text-[#151515]" : "bg-[#D7FF4F] text-[#151515]"}`}
              >
                {guardando ? "…" : confirmar === "descartar" ? "Descartar" : confirmar === "eliminar" ? "Eliminar" : activo ? "Desactivar" : "Reactivar"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {proveedor ? (
                <div className="relative">
                  <button type="button" onClick={() => setMenu((v) => !v)} aria-label="Más acciones" aria-expanded={menu} className="flex h-8 w-8 items-center justify-center rounded-md border border-[#30312D] text-[#A7A7A7] hover:text-[#F5F5F5]">
                    <Ellipsis className="h-4 w-4" />
                  </button>
                  {menu ? (
                    <div className="absolute bottom-10 left-0 z-10 min-w-[220px] rounded-lg border border-[#3A3B35] bg-[#171814] p-1 shadow-xl shadow-black/40 animate-[sg-entrada_150ms_ease-out]">
                      <button type="button" onClick={() => { setMenu(false); setConfirmar("desactivar"); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[#E5E5E0] hover:bg-[#22231E]">
                        {activo ? <Power className="h-3.5 w-3.5 text-[#F4C95B]" /> : <RotateCcw className="h-3.5 w-3.5 text-[#9FEFB3]" />}
                        {activo ? "Desactivar" : "Reactivar"}
                      </button>
                      <button
                        type="button"
                        disabled={!eliminable}
                        title={eliminable ? undefined : `Ya se usó (${usoTexto}): solo se puede desactivar.`}
                        onClick={() => { setMenu(false); setConfirmar("eliminar"); }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[#FF8A7A] hover:bg-[#22231E] disabled:cursor-not-allowed disabled:text-[#5F605A] disabled:hover:bg-transparent"
                      >
                        <Trash2 className="h-3.5 w-3.5" />Eliminar
                        {!eliminable ? <span className="ml-auto text-[11px]">ya se usó</span> : null}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <span className="min-w-0 flex-1 truncate text-[12px]">
                {mensaje ? (
                  <span key={mensaje.texto + sacudir} className={`inline-flex items-center gap-1 animate-[sg-entrada_180ms_ease-out] ${mensaje.tono === "ok" ? "text-[#9FEFB3]" : "text-[#FF8A7A]"}`}>
                    {mensaje.tono === "ok" ? <Check className="h-3.5 w-3.5" /> : null}{mensaje.texto}
                  </span>
                ) : !esNuevo && cambios ? (
                  <span className="text-[#8E8F86]">{cambios} cambio{cambios === 1 ? "" : "s"} sin guardar</span>
                ) : null}
              </span>
              <button type="button" onClick={cerrar} className="h-8 rounded-md px-3 text-[13px] text-[#A7A7A7] hover:text-[#F5F5F5]">Cerrar</button>
              <button
                key={sacudir}
                type="submit"
                disabled={guardando || (!esNuevo && !cambios)}
                className={`h-8 rounded-md bg-[#D7FF4F] px-3.5 text-[13px] font-bold text-[#151515] transition hover:brightness-105 active:scale-95 disabled:opacity-40 ${sacudir ? "animate-[sg-sacudir_380ms_ease-in-out]" : ""}`}
              >
                {guardando ? "Guardando…" : esNuevo ? "Crear" : "Guardar"}
              </button>
            </div>
          )}
        </footer>
      </form>
    </div>
  );
}
