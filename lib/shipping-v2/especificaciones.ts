// Datos técnicos propios de cada categoría, y la línea que va en la etiqueta.
//
// Por qué existe:
//
//   LA FICHA TÉCNICA ESTÁ HECHA PARA COMPUTADORES.
//
// CPU, RAM, pantalla, batería. Un SSD NVMe no tenía dónde anotar su formato
// (2242, 2280) ni su interfaz; un monitor de 27" no cabía en "Pantalla tamaño",
// cuyas opciones llegan a 17.3". Y lo que el técnico averiguaba con el equipo
// en la mano no llegaba al estante: la etiqueta SKU solo decía el SKU.
//
// Aquí cada categoría define sus campos, cuáles van impresos en la etiqueta y
// cómo se escriben ahí. Laptop, Desktop y All in One NO pasan por aquí: usan la
// ficha de siempre, y su línea de etiqueta se arma desde esa ficha.
//
// Módulo puro: sin red, sin React, sin Airtable. El servidor valida con lo
// mismo que dibuja la pantalla.

export type TipoCampoEspec = "select" | "texto" | "numero";

export type CampoEspec = {
  id: string;
  etiqueta: string;
  tipo: TipoCampoEspec;
  opciones?: readonly string[];
  /** Se pega al número en la etiqueta: "65" + "W" → "65W". */
  unidad?: string;
  /** Singular y plural para cantidades: 1 control, 2 controles. */
  plural?: readonly [string, string];
  /** Cómo se escribe cada opción en la etiqueta. "" = no se imprime. */
  enResumen?: Readonly<Record<string, string>>;
  /** ¿Va impreso en la etiqueta? */
  enEtiqueta?: boolean;
  placeholder?: string;
  /** Texto de capacidad de almacenamiento: "512" → "512GB", "1 tb" → "1TB". */
  capacidad?: boolean;
};

type DefCategoria = {
  campos: CampoEspec[];
  /** Separador de la línea de etiqueta. Por defecto " · ". */
  unir?: string;
};

export type ValoresEspec = Record<string, string>;

// ─── Opciones compartidas ───────────────────────────────────────────────────

const RESOLUCIONES = ["HD", "HD+", "FHD", "WUXGA", "QHD", "WQHD", "4K"] as const;
const ALMACENAMIENTO_MOVIL = ["16GB", "32GB", "64GB", "128GB", "256GB", "512GB", "1TB"] as const;
const SI_NO = ["Sí", "No"] as const;

// ─── Definición por categoría ───────────────────────────────────────────────
//
// La clave es el nombre de la categoría sin tildes y en minúsculas. Categoría
// que no esté aquí = sin datos técnicos: su etiqueta lleva SKU y precio.

const CATEGORIAS: Record<string, DefCategoria> = {
  "ssd": { campos: [
    { id: "capacidad", etiqueta: "Capacidad", tipo: "texto", placeholder: "512GB", enEtiqueta: true, capacidad: true },
    { id: "interfaz", etiqueta: "Interfaz", tipo: "select", opciones: ["NVMe Gen3", "NVMe Gen4", "NVMe Gen5", "SATA", "mSATA"], enEtiqueta: true },
    { id: "formato", etiqueta: "Formato", tipo: "select", opciones: ["2230", "2242", "2260", "2280", "22110", "2.5\""], enEtiqueta: true },
    { id: "lectura", etiqueta: "Lectura", tipo: "numero", unidad: "MB/s", placeholder: "3500" },
    { id: "escritura", etiqueta: "Escritura", tipo: "numero", unidad: "MB/s", placeholder: "3000" },
  ] },
  "hdd": { campos: [
    { id: "capacidad", etiqueta: "Capacidad", tipo: "texto", placeholder: "1TB", enEtiqueta: true, capacidad: true },
    { id: "formato", etiqueta: "Formato", tipo: "select", opciones: ["2.5\"", "3.5\""], enEtiqueta: true },
    { id: "rpm", etiqueta: "RPM", tipo: "select", opciones: ["5400", "7200", "10000"], unidad: "rpm", enEtiqueta: true },
  ] },
  "disco externo": { campos: [
    { id: "capacidad", etiqueta: "Capacidad", tipo: "texto", placeholder: "2TB", enEtiqueta: true, capacidad: true },
    { id: "tipo", etiqueta: "Tipo", tipo: "select", opciones: ["HDD", "SSD"], enEtiqueta: true },
    { id: "conexion", etiqueta: "Conexión", tipo: "select", opciones: ["USB 2.0", "USB 3.0", "USB-C", "Thunderbolt"], enEtiqueta: true },
  ] },
  "ram": { campos: [
    { id: "capacidad", etiqueta: "Capacidad", tipo: "select", opciones: ["2GB", "4GB", "8GB", "16GB", "32GB", "64GB"], enEtiqueta: true },
    { id: "tipo", etiqueta: "Tipo", tipo: "select", opciones: ["DDR2", "DDR3", "DDR3L", "DDR4", "DDR5"], enEtiqueta: true },
    { id: "velocidad", etiqueta: "Velocidad (MHz)", tipo: "numero", placeholder: "3200", enEtiqueta: true },
    { id: "formato", etiqueta: "Formato", tipo: "select", opciones: ["SODIMM", "DIMM"], enEtiqueta: true },
  ] },
  "monitor": { campos: [
    { id: "tamano", etiqueta: "Tamaño", tipo: "numero", unidad: "\"", placeholder: "24", enEtiqueta: true },
    { id: "resolucion", etiqueta: "Resolución", tipo: "select", opciones: RESOLUCIONES, enEtiqueta: true },
    { id: "frecuencia", etiqueta: "Frecuencia", tipo: "numero", unidad: "Hz", placeholder: "75", enEtiqueta: true },
    { id: "panel", etiqueta: "Panel", tipo: "select", opciones: ["IPS", "VA", "TN", "OLED"] },
    { id: "puertos", etiqueta: "Puertos", tipo: "texto", placeholder: "HDMI, DisplayPort, VGA" },
  ] },
  "tarjeta grafica": { campos: [
    { id: "modelo", etiqueta: "Modelo", tipo: "texto", placeholder: "GTX 1650", enEtiqueta: true },
    { id: "vram", etiqueta: "VRAM", tipo: "select", opciones: ["1GB", "2GB", "3GB", "4GB", "6GB", "8GB", "10GB", "12GB", "16GB", "24GB"], enEtiqueta: true },
    { id: "memoria", etiqueta: "Tipo de memoria", tipo: "select", opciones: ["GDDR3", "GDDR5", "GDDR5X", "GDDR6", "GDDR6X", "HBM2"] },
  ] },
  "fuente de poder": { campos: [
    { id: "watts", etiqueta: "Potencia", tipo: "numero", unidad: "W", placeholder: "650", enEtiqueta: true },
    { id: "certificacion", etiqueta: "Certificación", tipo: "select",
      opciones: ["Sin certificación", "80+", "80+ Bronze", "80+ Silver", "80+ Gold", "80+ Platinum", "80+ Titanium"],
      enResumen: { "Sin certificación": "" }, enEtiqueta: true },
    { id: "modular", etiqueta: "Modular", tipo: "select", opciones: ["No modular", "Semi modular", "Modular"], enEtiqueta: true },
  ] },
  "bateria": { campos: [
    { id: "parte", etiqueta: "Número de parte", tipo: "texto", placeholder: "L19M3PD1", enEtiqueta: true },
    { id: "capacidad", etiqueta: "Capacidad", tipo: "numero", unidad: "Wh", placeholder: "57", enEtiqueta: true },
    { id: "salud", etiqueta: "Salud", tipo: "numero", unidad: "%", placeholder: "92", enEtiqueta: true },
  ] },
  "cargador": { campos: [
    { id: "watts", etiqueta: "Potencia", tipo: "numero", unidad: "W", placeholder: "65", enEtiqueta: true },
    { id: "punta", etiqueta: "Tipo de punta", tipo: "select",
      opciones: ["USB-C", "MagSafe", "MagSafe 2", "MagSafe 3", "Barrel 4.5mm", "Barrel 5.5mm", "Barrel 7.4mm", "Rectangular (Lenovo)", "Surface Connect", "Otra"],
      enResumen: { "Otra": "" }, enEtiqueta: true },
  ] },
  "pantalla": { campos: [
    { id: "tamano", etiqueta: "Tamaño", tipo: "numero", unidad: "\"", placeholder: "15.6", enEtiqueta: true },
    { id: "resolucion", etiqueta: "Resolución", tipo: "select", opciones: RESOLUCIONES, enEtiqueta: true },
    { id: "conector", etiqueta: "Conector", tipo: "select", opciones: ["30 pin", "40 pin", "LVDS"], enEtiqueta: true },
    { id: "tactil", etiqueta: "Táctil", tipo: "select", opciones: SI_NO, enResumen: { "Sí": "Táctil", "No": "" }, enEtiqueta: true },
  ] },
  "teclado": { campos: [
    { id: "idioma", etiqueta: "Idioma", tipo: "select", opciones: ["Español", "Inglés US", "Inglés UK", "Otro"], enResumen: { "Otro": "" }, enEtiqueta: true },
    { id: "retroiluminado", etiqueta: "Retroiluminado", tipo: "select", opciones: SI_NO, enResumen: { "Sí": "Retroiluminado", "No": "" }, enEtiqueta: true },
  ] },
  "mainboard": { campos: [
    { id: "socket", etiqueta: "Socket o CPU", tipo: "texto", placeholder: "LGA1151 o i7-9750H integrado", enEtiqueta: true },
    { id: "formato", etiqueta: "Formato", tipo: "select", opciones: ["ATX", "Micro-ATX", "Mini-ITX", "Laptop", "Otro"], enResumen: { "Otro": "" }, enEtiqueta: true },
    { id: "slotsRam", etiqueta: "Slots de RAM", tipo: "numero", placeholder: "2" },
  ] },
  "tablet": { campos: [
    { id: "almacenamiento", etiqueta: "Almacenamiento", tipo: "select", opciones: ALMACENAMIENTO_MOVIL, enEtiqueta: true },
    { id: "pantalla", etiqueta: "Pantalla", tipo: "numero", unidad: "\"", placeholder: "8", enEtiqueta: true },
    { id: "conectividad", etiqueta: "Conectividad", tipo: "select", opciones: ["Wi-Fi", "Wi-Fi + LTE"], enEtiqueta: true },
  ] },
  "celular": { campos: [
    { id: "almacenamiento", etiqueta: "Almacenamiento", tipo: "select", opciones: ALMACENAMIENTO_MOVIL, enEtiqueta: true },
    { id: "salud", etiqueta: "Salud de batería", tipo: "numero", unidad: "%", placeholder: "89", enEtiqueta: true },
    { id: "liberado", etiqueta: "Operador", tipo: "select", opciones: ["Liberado", "Bloqueado a operador"], enEtiqueta: true },
  ] },
  "consola": { campos: [
    { id: "almacenamiento", etiqueta: "Almacenamiento", tipo: "texto", placeholder: "1TB", enEtiqueta: true, capacidad: true },
    { id: "controles", etiqueta: "Controles incluidos", tipo: "numero", plural: ["control", "controles"], placeholder: "1", enEtiqueta: true },
  ] },
  "audio": { campos: [
    { id: "tipo", etiqueta: "Tipo", tipo: "select",
      opciones: ["Parlante", "Audífonos", "Interfaz de audio", "Micrófono", "Amplificador", "Grabadora", "Pedal / efectos", "Otro"],
      enResumen: { "Otro": "" }, enEtiqueta: true },
    { id: "conexion", etiqueta: "Conexión", tipo: "select",
      opciones: ["Bluetooth", "Cable 3.5mm", "USB", "XLR", "Firewire", "Óptico", "Wi-Fi", "Otra"],
      enResumen: { "Otra": "" }, enEtiqueta: true },
    { id: "potencia", etiqueta: "Potencia", tipo: "numero", unidad: "W", placeholder: "20", enEtiqueta: true },
  ] },
  "smart home": { campos: [
    { id: "ecosistema", etiqueta: "Ecosistema", tipo: "select",
      opciones: ["Alexa", "Google", "HomeKit", "SmartThings", "Wyze", "Ring", "Otro"], enResumen: { "Otro": "" }, enEtiqueta: true },
    { id: "conexion", etiqueta: "Conexión", tipo: "select", opciones: ["Wi-Fi", "Bluetooth", "Zigbee", "Z-Wave", "Thread / Matter"], enEtiqueta: true },
  ] },
  "impresora": { campos: [
    { id: "tecnologia", etiqueta: "Tecnología", tipo: "select", opciones: ["Térmica", "Tinta", "Láser"], enEtiqueta: true },
    { id: "color", etiqueta: "Color", tipo: "select", opciones: ["Monocromática", "Color"], enResumen: { "Monocromática": "Mono" }, enEtiqueta: true },
    { id: "conexion", etiqueta: "Conexión", tipo: "select", opciones: ["USB", "Wi-Fi", "Ethernet", "Serial", "Paralelo", "Bluetooth"], enEtiqueta: true },
  ] },
  "red / wi-fi": { campos: [
    { id: "tipo", etiqueta: "Tipo", tipo: "select", opciones: ["Router", "Repetidor", "Mesh", "Access point", "Switch", "Adaptador"], enEtiqueta: true },
    { id: "estandar", etiqueta: "Estándar", tipo: "select",
      opciones: ["Wi-Fi 4 (N)", "Wi-Fi 5 (AC)", "Wi-Fi 6 (AX)", "Wi-Fi 6E", "Wi-Fi 7"],
      enResumen: { "Wi-Fi 4 (N)": "Wi-Fi 4", "Wi-Fi 5 (AC)": "Wi-Fi 5", "Wi-Fi 6 (AX)": "Wi-Fi 6" }, enEtiqueta: true },
    { id: "velocidad", etiqueta: "Velocidad", tipo: "texto", placeholder: "AX1800", enEtiqueta: true },
  ] },
  "camara / seguridad": { campos: [
    { id: "resolucion", etiqueta: "Resolución", tipo: "select", opciones: ["720p", "1080p", "2K", "4K"], enEtiqueta: true },
    { id: "conexion", etiqueta: "Conexión", tipo: "select", opciones: ["Wi-Fi", "PoE", "Cableada", "Batería + Wi-Fi"], enEtiqueta: true },
    { id: "nocturna", etiqueta: "Visión nocturna", tipo: "select", opciones: SI_NO, enResumen: { "Sí": "Visión nocturna", "No": "" }, enEtiqueta: true },
  ] },
  "energia / proteccion": { campos: [
    { id: "tipo", etiqueta: "Tipo", tipo: "select",
      opciones: ["Supresor", "UPS", "Extensión", "Estación de energía", "Regleta", "Temporizador"], enEtiqueta: true },
    { id: "capacidad", etiqueta: "Capacidad", tipo: "texto", placeholder: "1080J · 600VA · 512Wh", enEtiqueta: true },
    { id: "tomas", etiqueta: "Tomas", tipo: "numero", plural: ["toma", "tomas"], placeholder: "4", enEtiqueta: true },
  ] },
  "adaptador / dock / lector": { unir: " → ", campos: [
    { id: "entrada", etiqueta: "Conexión de entrada", tipo: "texto", placeholder: "USB 3.0", enEtiqueta: true },
    { id: "salida", etiqueta: "Conexión de salida", tipo: "texto", placeholder: "SATA", enEtiqueta: true },
  ] },
};

/** Categorías que usan la ficha técnica completa en vez de especificaciones. */
const CATEGORIAS_CON_FICHA = new Set(["laptop", "desktop", "all in one"]);

// ─── Normalización ──────────────────────────────────────────────────────────

export function claveCategoria(categoria?: string | null): string {
  return (categoria || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

export function usaFichaTecnica(categoria?: string | null): boolean {
  return CATEGORIAS_CON_FICHA.has(claveCategoria(categoria));
}

/** Campos de esta categoría. Vacío = la categoría no lleva datos técnicos. */
export function camposDeCategoria(categoria?: string | null): CampoEspec[] {
  return CATEGORIAS[claveCategoria(categoria)]?.campos ?? [];
}

const MAX_TEXTO = 60;

/**
 * "512" → "512GB", "1 tb" → "1TB", "500 Gb" → "500GB", "1.5TB" → "1.5TB".
 *
 * Un número suelto se lee como GB si es 16 o más, y como TB si es menor: no
 * existe un disco de 2GB que se venda, y sí uno de 2TB. Si el texto no parece
 * una capacidad ("1TB + 256GB"), se deja como lo escribió el técnico.
 */
export function normalizarCapacidad(texto: string): string {
  const m = texto.trim().match(/^(\d+(?:[.,]\d+)?)\s*(gb|tb|g|t)?$/i);
  if (!m) return texto.trim();
  const numero = m[1].replace(",", ".");
  const unidad = (m[2] || "").toLowerCase();
  if (unidad.startsWith("t")) return `${numero}TB`;
  if (unidad.startsWith("g")) return `${numero}GB`;
  return Number(numero) >= 16 ? `${numero}GB` : `${numero}TB`;
}

/**
 * Deja un valor en la forma que se guarda, o "" si no sirve.
 *
 * Un select solo acepta sus opciones exactas: si Airtable recibiera cualquier
 * texto, el resumen de la etiqueta imprimiría basura. Un número acepta coma
 * decimal ("15,6") porque así lo escribe cualquiera en Ecuador.
 */
export function normalizarValor(campo: CampoEspec, bruto: unknown): string {
  const texto = typeof bruto === "number" ? String(bruto) : typeof bruto === "string" ? bruto : "";
  const limpio = texto.trim().replace(/\s+/g, " ");
  if (!limpio) return "";

  if (campo.tipo === "select") {
    return (campo.opciones ?? []).includes(limpio) ? limpio : "";
  }
  if (campo.tipo === "numero") {
    const soloNumero = limpio.replace(",", ".").replace(/[^\d.]/g, "");
    // Sin ningún dígito no hay número: Number("") da 0, y un "abc" no puede
    // guardarse como "0 W" en la etiqueta.
    if (!/\d/.test(soloNumero)) return "";
    const numero = Number(soloNumero);
    if (!Number.isFinite(numero) || numero < 0) return "";
    // Sin ceros de adorno: "15.60" → "15.6", "3200.0" → "3200".
    return String(Math.round(numero * 100) / 100);
  }
  const recortado = limpio.slice(0, MAX_TEXTO);
  return campo.capacidad ? normalizarCapacidad(recortado) : recortado;
}

// ─── Lo que se guarda ───────────────────────────────────────────────────────

export type RespaldoEspec = {
  version: 1;
  valores: ValoresEspec;
  actualizadoPor?: string;
  actualizadoEn?: string;
};

/**
 * Lee el campo de Airtable. NUNCA lanza: es texto libre y cualquiera puede
 * escribir ahí. Lo que no se entiende se descarta y se conserva lo bueno.
 */
export function parsearEspecificaciones(bruto: unknown): RespaldoEspec {
  const vacio: RespaldoEspec = { version: 1, valores: {} };
  if (typeof bruto !== "string" || !bruto.trim()) return vacio;
  let datos: unknown;
  try {
    datos = JSON.parse(bruto);
  } catch {
    return vacio;
  }
  if (!datos || typeof datos !== "object") return vacio;
  const obj = datos as Record<string, unknown>;
  const valores: ValoresEspec = {};
  if (obj.valores && typeof obj.valores === "object") {
    for (const [clave, valor] of Object.entries(obj.valores as Record<string, unknown>)) {
      if (typeof valor === "string" && valor.trim()) valores[clave] = valor.trim();
    }
  }
  return {
    version: 1,
    valores,
    actualizadoPor: typeof obj.actualizadoPor === "string" ? obj.actualizadoPor : undefined,
    actualizadoEn: typeof obj.actualizadoEn === "string" ? obj.actualizadoEn : undefined,
  };
}

/**
 * Aplica cambios sobre lo guardado.
 *
 * - Solo se aceptan campos de la categoría actual, validados.
 * - "" borra ese campo.
 * - Los campos que NO son de la categoría actual se CONSERVAN. Si alguien
 *   cambia la categoría por error y la vuelve a poner, los datos siguen ahí.
 *   Para mostrar y para la etiqueta se filtran por categoría igual.
 */
export function aplicarCambiosEspec(
  actual: RespaldoEspec,
  categoria: string | null | undefined,
  cambios: Record<string, unknown>,
  firma: { actor: string; ahora: string }
): RespaldoEspec {
  const campos = new Map(camposDeCategoria(categoria).map((c) => [c.id, c]));
  const valores: ValoresEspec = { ...actual.valores };
  for (const [id, bruto] of Object.entries(cambios)) {
    const campo = campos.get(id);
    if (!campo) continue;
    const valor = normalizarValor(campo, bruto);
    if (valor) valores[id] = valor;
    else delete valores[id];
  }
  return { version: 1, valores, actualizadoPor: firma.actor, actualizadoEn: firma.ahora };
}

export function serializarEspecificaciones(respaldo: RespaldoEspec): string {
  return JSON.stringify(respaldo);
}

// ─── Valores iniciales desde la ficha ───────────────────────────────────────

type FichaParcial = {
  almacenamientoPrincipal?: string | null;
  ramCapacidad?: string | null;
  ramTipo?: string | null;
  bateriaSalud?: number | string | null;
  pantallaTamano?: string | null;
  cpuModelo?: string | null;
  almacenamientoTipo?: string | null;
};

/**
 * Lo que la ficha ya sabe, para no hacer escribir al técnico dos veces.
 *
 * Hasta 2026-09 la inspección de un SSD o una RAM cargaba la capacidad en los
 * campos de ficha. Esos datos siguen en Airtable: se usan como punto de
 * partida. Solo rellenan huecos, nunca pisan una especificación guardada.
 */
export function sugerenciasDesdeFicha(categoria: string | null | undefined, ficha: FichaParcial): ValoresEspec {
  const clave = claveCategoria(categoria);
  const s: ValoresEspec = {};
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
  const numeroDe = (v: unknown) => {
    const m = texto(v).match(/\d+(?:[.,]\d+)?/);
    return m ? m[0].replace(",", ".") : "";
  };

  if (clave === "ssd" || clave === "hdd" || clave === "disco externo") {
    if (texto(ficha.almacenamientoPrincipal)) s.capacidad = texto(ficha.almacenamientoPrincipal);
  }
  if (clave === "ram") {
    if (texto(ficha.ramCapacidad)) s.capacidad = texto(ficha.ramCapacidad);
    if (texto(ficha.ramTipo)) s.tipo = texto(ficha.ramTipo);
  }
  if (clave === "bateria" && numeroDe(ficha.bateriaSalud)) s.salud = numeroDe(ficha.bateriaSalud);
  if ((clave === "monitor" || clave === "pantalla") && numeroDe(ficha.pantallaTamano)) {
    s.tamano = numeroDe(ficha.pantallaTamano);
  }

  // Pasan por la misma validación que lo que escribe el técnico: una ficha con
  // "RAM tipo: LPDDR4" no puede meter una opción que la RAM suelta no tiene.
  const campos = new Map(camposDeCategoria(categoria).map((c) => [c.id, c]));
  const validas: ValoresEspec = {};
  for (const [id, valor] of Object.entries(s)) {
    const campo = campos.get(id);
    const normal = campo ? normalizarValor(campo, valor) : "";
    if (normal) validas[id] = normal;
  }
  return validas;
}

/**
 * Lo que se muestra y lo que se imprime: lo guardado, con los huecos cubiertos
 * por la ficha, y solo los campos de la categoría actual.
 */
export function especificacionesEfectivas(
  categoria: string | null | undefined,
  guardadas: ValoresEspec,
  ficha: FichaParcial = {}
): ValoresEspec {
  const campos = camposDeCategoria(categoria);
  const sugeridas = sugerenciasDesdeFicha(categoria, ficha);
  const salida: ValoresEspec = {};
  for (const campo of campos) {
    const valor = normalizarValor(campo, guardadas[campo.id]) || sugeridas[campo.id] || "";
    if (valor) salida[campo.id] = valor;
  }
  return salida;
}

// ─── La línea de la etiqueta ────────────────────────────────────────────────

function formatearParaEtiqueta(campo: CampoEspec, valor: string): string {
  if (campo.enResumen && valor in campo.enResumen) return campo.enResumen[valor];
  if (campo.plural) {
    const n = Number(valor);
    return `${valor} ${n === 1 ? campo.plural[0] : campo.plural[1]}`;
  }
  if (campo.unidad) return `${valor}${campo.unidad}`;
  return valor;
}

/**
 * La línea corta de datos: "8GB · DDR4 · 3200 · SODIMM".
 *
 * Lo que falta se omite — en 2.5 cm de alto no se imprime "sin dato". Si no
 * hay nada, devuelve "" y la etiqueta queda con SKU y precio.
 */
export function resumenTecnico(categoria: string | null | undefined, valores: ValoresEspec): string {
  const def = CATEGORIAS[claveCategoria(categoria)];
  if (!def) return "";
  const partes = def.campos
    .filter((c) => c.enEtiqueta)
    .map((c) => {
      const valor = normalizarValor(c, valores[c.id]);
      return valor ? formatearParaEtiqueta(c, valor) : "";
    })
    .filter(Boolean);
  return partes.join(def.unir ?? " · ");
}

/**
 * Para laptops, desktops y All in One: la línea sale de la ficha.
 * "i5-8250U · 8GB · 256GB SSD".
 */
export function resumenDesdeFicha(ficha: FichaParcial): string {
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const util = (v: string) => Boolean(v) && !/^(no aplica|no especificado|otro|-)$/i.test(v);
  const disco = [texto(ficha.almacenamientoPrincipal), texto(ficha.almacenamientoTipo)].filter(util).join(" ");
  return [texto(ficha.cpuModelo), texto(ficha.ramCapacidad), disco].filter(util).join(" · ");
}

/** La línea de etiqueta de cualquier item, venga de la ficha o de las especificaciones. */
export function lineaEtiqueta(
  categoria: string | null | undefined,
  guardadas: ValoresEspec,
  ficha: FichaParcial = {}
): string {
  if (usaFichaTecnica(categoria)) return resumenDesdeFicha(ficha);
  return resumenTecnico(categoria, especificacionesEfectivas(categoria, guardadas, ficha));
}

/** Todas las categorías con datos técnicos. Para pruebas y para revisar. */
export function categoriasConEspecificaciones(): string[] {
  return Object.keys(CATEGORIAS);
}
