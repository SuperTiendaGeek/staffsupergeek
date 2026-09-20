// Puntos de revisión técnica por categoría de item.
//
// La idea central del módulo, y la razón de que exista:
//
//   DECLARAR UNA CARACTERÍSTICA CREA LA OBLIGACIÓN DE PROBARLA.
//
// Antes, revisar y declarar eran dos actos separados: el técnico probaba lo
// que se le ocurría, y otra persona anotaba en la ficha lo que el equipo trae.
// Entre esos dos actos se caía la información: alguien anotaba "lector de
// huella" y nadie lo probaba nunca. Aquí no se puede: cada opción confirmada
// en Conectividad, Puertos o Características extras GENERA su punto de
// inspección. Si no está declarada, nadie afirmó que existe; si está
// declarada, tiene su prueba esperando.
//
// Módulo puro: sin red, sin React, sin Airtable. Todo lo que decide qué se
// prueba vive aquí y se puede probar solo.

export type ResultadoPunto = "ok" | "falla" | "na";

export type PuntoRevision = {
  /** Estable entre recargas: con esto se guarda y se relee el resultado. */
  id: string;
  texto: string;
  /** Un punto crítico que falla abre novedad bloqueante automáticamente. */
  critico: boolean;
  origen: "base" | "declarado";
  /** Nombre de la opción del catálogo que lo generó, si origen = declarado. */
  declaradoDe?: string;
};

/** Un dato de la ficha técnica que se captura mientras se inspecciona. */
export type CampoFichaEnZona = {
  campo: string;
  etiqueta: string;
  tipo: "select" | "texto" | "numero";
};

export type ZonaRevision = {
  id: string;
  numero: number;
  nombre: string;
  puntos: PuntoRevision[];
  /** Derivada: la zona es crítica si alguno de sus puntos lo es. */
  critica: boolean;
  captura: CampoFichaEnZona[];
};

export type EstadoZona = "" | "parcial" | "ok" | "falla" | "na";

// ─── Perfiles ───────────────────────────────────────────────────────────────
//
// Varias categorías de `Shipping Items` se revisan igual. Un perfil agrupa a
// las que comparten puntos, para no repetir 20 listas casi idénticas.

export type PerfilRevision =
  | "laptop" | "desktop" | "allinone" | "monitor" | "tablet" | "consola"
  | "ram" | "disco" | "grafica" | "mainboard" | "fuente" | "bateria"
  | "cargador" | "pantalla-repuesto" | "teclado-repuesto"
  // Categorías creadas en 2026-09 al vaciar "Otro".
  | "celular" | "disco-externo" | "smarthome" | "audio" | "impresora"
  | "red" | "camara" | "energia" | "adaptador" | "insumo"
  | "generico";

const PERFIL_POR_CATEGORIA: Record<string, PerfilRevision> = {
  "laptop": "laptop",
  "desktop": "desktop",
  "mini pc": "desktop",
  "torre": "desktop",
  "all in one": "allinone",
  "monitor": "monitor",
  "tablet": "tablet",
  "consola": "consola",
  "ram": "ram",
  "ssd": "disco",
  "hdd": "disco",
  // Un disco portátil comparte lo esencial con uno interno (SMART, capacidad,
  // borrado de datos) pero suma lo suyo: carcasa, cable y velocidad por USB.
  "disco externo": "disco-externo",
  "celular": "celular",
  "smart home": "smarthome",
  "audio": "audio",
  "impresora": "impresora",
  "red / wi-fi": "red",
  "camara / seguridad": "camara",
  "energia / proteccion": "energia",
  "adaptador / dock / lector": "adaptador",
  "insumo": "insumo",
  "tarjeta grafica": "grafica",
  "mainboard": "mainboard",
  "fuente de poder": "fuente",
  "bateria": "bateria",
  "cargador": "cargador",
  "pantalla": "pantalla-repuesto",
  "teclado": "teclado-repuesto",
};

function normalizar(valor?: string | null): string {
  // Sin tildes: "Energía / Protección" y "Cámara / Seguridad" no encontraban su
  // perfil y caían en el genérico. El resto del proyecto ya normaliza así.
  return (valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function getPerfilRevision(categoria?: string | null): PerfilRevision {
  const clave = normalizar(categoria);
  if (PERFIL_POR_CATEGORIA[clave]) return PERFIL_POR_CATEGORIA[clave];
  // Un texto libre que contiene la palabra sirve igual: "Desktop Torre HP".
  for (const [nombre, perfil] of Object.entries(PERFIL_POR_CATEGORIA)) {
    if (clave.includes(nombre)) return perfil;
  }
  return "generico";
}

// ─── Definición de zonas ────────────────────────────────────────────────────
//
// `[texto, crítico]`. Crítico significa: si falla, el equipo NO se publica
// hasta resolverlo. No significa "importante" — significa "bloquea la venta".

type DefZona = {
  id: string;
  nombre: string;
  base: [string, 0 | 1][];
  captura?: CampoFichaEnZona[];
};

const CAP = {
  pantallaTamano: { campo: "pantallaTamano", etiqueta: "Pantalla tamaño", tipo: "select" } as CampoFichaEnZona,
  pantallaResolucion: { campo: "pantallaResolucion", etiqueta: "Pantalla resolución", tipo: "select" } as CampoFichaEnZona,
  ramCapacidad: { campo: "ramCapacidad", etiqueta: "RAM capacidad", tipo: "select" } as CampoFichaEnZona,
  ramTipo: { campo: "ramTipo", etiqueta: "RAM tipo", tipo: "select" } as CampoFichaEnZona,
  almacenamientoPrincipal: { campo: "almacenamientoPrincipal", etiqueta: "Capacidad", tipo: "texto" } as CampoFichaEnZona,
  almacenamientoTipo: { campo: "almacenamientoTipo", etiqueta: "Tipo", tipo: "select" } as CampoFichaEnZona,
  // Segunda unidad: el caso real de casi toda laptop o torre con SSD de
  // arranque + HDD de datos. Se deja vacía cuando solo hay un disco.
  almacenamiento2: { campo: "almacenamiento2", etiqueta: "2ª unidad — capacidad", tipo: "texto" } as CampoFichaEnZona,
  almacenamiento2Tipo: { campo: "almacenamiento2Tipo", etiqueta: "2ª unidad — tipo", tipo: "select" } as CampoFichaEnZona,
  bateriaSalud: { campo: "bateriaSalud", etiqueta: "Batería salud %", tipo: "numero" } as CampoFichaEnZona,
  sistemaOperativo: { campo: "sistemaOperativo", etiqueta: "Sistema operativo", tipo: "select" } as CampoFichaEnZona,
  cpuModelo: { campo: "cpuModelo", etiqueta: "CPU modelo", tipo: "texto" } as CampoFichaEnZona,
};

const ZONAS_COMPUTADOR_COMUNES: DefZona[] = [
  {
    id: "arranque", nombre: "Arranque y sistema",
    base: [
      ["Completa el POST", 1],
      ["Windows instalado y licencia activa", 1],
      ["Sin contraseña de BIOS ni bloqueo MDM", 1],
    ],
    captura: [CAP.sistemaOperativo, CAP.cpuModelo],
  },
  {
    id: "ram", nombre: "RAM (memoria)",
    base: [["Capacidad real coincide con lo declarado", 1], ["Test de memoria sin errores", 1], ["Slots libres anotados", 0]],
    captura: [CAP.ramCapacidad, CAP.ramTipo],
  },
  {
    id: "disco", nombre: "Almacenamiento",
    base: [
      ["SMART sano en todas las unidades", 1],
      ["Capacidad real coincide", 1],
      ["Velocidad de lectura y escritura", 0],
    ],
    captura: [
      CAP.almacenamientoPrincipal, CAP.almacenamientoTipo,
      CAP.almacenamiento2, CAP.almacenamiento2Tipo,
    ],
  },
  {
    id: "ventilacion", nombre: "Ventilación y temperatura",
    base: [["Ventilador gira sin ruido", 0], ["Temperatura estable bajo carga", 1], ["Disipador limpio", 0]],
  },
  {
    id: "conectividad", nombre: "Conectividad",
    base: [],
  },
  {
    id: "puertos", nombre: "Puertos",
    base: [],
  },
  {
    id: "extras", nombre: "Otras características",
    base: [],
  },
];

const ZONAS: Record<PerfilRevision, DefZona[]> = {
  laptop: [
    {
      id: "pantalla", nombre: "Pantalla",
      base: [["Enciende sin líneas ni manchas", 1], ["Sin píxeles muertos ni retención", 1], ["Brillo uniforme y regulable", 0]],
      captura: [CAP.pantallaTamano, CAP.pantallaResolucion],
    },
    { id: "teclado", nombre: "Teclado", base: [["Todas las teclas responden", 1], ["Sin teclas hundidas ni faltantes", 0]] },
    { id: "touchpad", nombre: "Touchpad", base: [["Movimiento y clics", 1], ["Gestos de dos dedos", 0]] },
    { id: "chasis", nombre: "Bisagras y chasis", base: [["Bisagras firmes, sin holgura", 1], ["Sin fisuras en el marco", 1], ["Tapas y tornillos completos", 0]] },
    {
      id: "bateria", nombre: "Batería",
      base: [["Mantiene carga sin cargador", 1], ["Sin hinchazón (seguridad)", 1], ["Cargador incluido y carga", 0]],
      captura: [CAP.bateriaSalud],
    },
    ...ZONAS_COMPUTADOR_COMUNES,
  ],
  desktop: [
    { id: "fuente", nombre: "Fuente de poder", base: [["Enciende bajo carga", 1], ["Voltajes estables", 1], ["Ventilador de la fuente", 0]] },
    { id: "placa", nombre: "Placa base", base: [["Capacitores y socket sin daño", 1], ["Slots de RAM funcionan", 1], ["Pila CMOS mantiene la hora", 0]] },
    { id: "gpu", nombre: "Gráficos", base: [["Salidas de video dan imagen", 1], ["Test de carga estable", 0]] },
    { id: "gabinete", nombre: "Gabinete y limpieza", base: [["Sin piezas faltantes", 0], ["Limpieza interna hecha", 0], ["Cable de poder incluido", 0]] },
    ...ZONAS_COMPUTADOR_COMUNES,
  ],
  allinone: [
    {
      id: "pantalla", nombre: "Pantalla",
      base: [["Enciende sin líneas ni manchas", 1], ["Sin píxeles muertos", 1], ["Brillo uniforme", 0]],
      captura: [CAP.pantallaTamano, CAP.pantallaResolucion],
    },
    { id: "soporte", nombre: "Base y soporte", base: [["Base estable", 1], ["Anclaje VESA sin daño", 0]] },
    { id: "fuente", nombre: "Alimentación", base: [["Enciende con su fuente", 1], ["Cable incluido", 0]] },
    ...ZONAS_COMPUTADOR_COMUNES,
  ],
  monitor: [
    {
      id: "panel", nombre: "Panel",
      base: [["Enciende y da imagen", 1], ["Sin píxeles muertos ni manchas", 1], ["Sin retención de imagen", 0], ["Brillo uniforme", 0]],
      // Sin captura de ficha: estos datos van en las especificaciones de la
      // categoría (lib/shipping-v2/especificaciones.ts). Pedirlos también aquí
      // haría escribir lo mismo dos veces.
    },
    { id: "osd", nombre: "Botones y menú", base: [["Botones responden", 0], ["Menú OSD navega", 0]] },
    { id: "soporte", nombre: "Base y soporte", base: [["Base estable", 1], ["Anclaje VESA sin daño", 0]] },
    { id: "puertos", nombre: "Entradas de video", base: [] },
    { id: "extras", nombre: "Otras características", base: [] },
    { id: "accesorios", nombre: "Accesorios", base: [["Cable de poder incluido", 0], ["Cable de video incluido", 0]] },
  ],
  tablet: [
    {
      id: "pantalla", nombre: "Pantalla",
      base: [["Enciende sin manchas ni líneas", 1], ["Táctil responde en toda la superficie", 1]],
      // Sin captura de ficha: estos datos van en las especificaciones de la
      // categoría (lib/shipping-v2/especificaciones.ts). Pedirlos también aquí
      // haría escribir lo mismo dos veces.
    },
    { id: "cuentas", nombre: "Bloqueos de cuenta", base: [["Sin bloqueo iCloud / Google FRP", 1], ["Restaurada de fábrica", 1]] },
    {
      id: "bateria", nombre: "Batería y carga",
      base: [["Mantiene carga", 1], ["Puerto de carga funciona", 1], ["Sin hinchazón", 1]],
      captura: [CAP.bateriaSalud],
    },
    { id: "camaras", nombre: "Cámaras y audio", base: [["Cámara frontal", 0], ["Cámara trasera", 0], ["Altavoces y micrófono", 0]] },
    { id: "botones", nombre: "Botones y chasis", base: [["Botones físicos responden", 0], ["Chasis sin fisuras", 0]] },
    { id: "conectividad", nombre: "Conectividad", base: [] },
    { id: "extras", nombre: "Otras características", base: [] },
    { id: "accesorios", nombre: "Accesorios", base: [["Cargador incluido", 0]] },
  ],
  consola: [
    { id: "arranque", nombre: "Enciende y arranca", base: [["Enciende y llega al menú", 1], ["Salida HDMI da imagen", 1]] },
    { id: "cuentas", nombre: "Cuentas y baneo", base: [["Cuenta desvinculada", 1], ["Consola sin baneo", 1]] },
    { id: "lector", nombre: "Lector y almacenamiento", base: [["Lector de discos (si aplica)", 0], ["Almacenamiento reconocido", 1]] },
    { id: "controles", nombre: "Controles", base: [["Controles incluidos responden", 1], ["Se cargan o emparejan", 0]] },
    { id: "ventilacion", nombre: "Ventilación", base: [["Ventilación sin ruido excesivo", 0], ["Limpieza interna", 0]] },
    { id: "accesorios", nombre: "Accesorios", base: [["Cables incluidos", 0]] },
  ],
  ram: [
    {
      id: "modulo", nombre: "Módulo",
      base: [["Capacidad y velocidad reales", 1], ["Test de memoria sin errores", 1], ["Contactos sin daño ni óxido", 1]],
      // Sin captura de ficha: estos datos van en las especificaciones de la
      // categoría (lib/shipping-v2/especificaciones.ts). Pedirlos también aquí
      // haría escribir lo mismo dos veces.
    },
  ],
  disco: [
    {
      id: "unidad", nombre: "Unidad",
      base: [["SMART sano", 1], ["Capacidad real coincide", 1], ["Horas de uso y sectores reasignados anotados", 0],
        ["Velocidad de lectura y escritura", 0], ["Conector sin daño", 1], ["Borrado seguro de datos del dueño anterior", 1]],
      // Sin captura de ficha: estos datos van en las especificaciones de la
      // categoría (lib/shipping-v2/especificaciones.ts). Pedirlos también aquí
      // haría escribir lo mismo dos veces.
    },
  ],
  grafica: [
    { id: "tarjeta", nombre: "Tarjeta", base: [["Salidas de video dan imagen", 1], ["Test de carga estable", 1],
      ["Ventiladores giran", 1], ["Temperatura bajo carga", 0], ["Conectores de poder completos", 0]] },
  ],
  mainboard: [
    { id: "placa", nombre: "Placa", base: [["Completa el POST", 1], ["Socket y pines sin daño", 1],
      ["Capacitores sin abombamiento", 1], ["Slots de RAM funcionan", 1], ["Puertos traseros responden", 0]] },
  ],
  fuente: [
    { id: "fuente", nombre: "Fuente", base: [["Enciende bajo carga", 1], ["Voltajes estables", 1],
      ["Ventilador gira", 0], ["Cables incluidos", 0]] },
  ],
  bateria: [
    {
      id: "bateria", nombre: "Batería",
      base: [["Salud medida y anotada", 1], ["Sin hinchazón (seguridad)", 1], ["Ciclos anotados", 0], ["Conector sin daño", 1]],
      // Sin captura de ficha: estos datos van en las especificaciones de la
      // categoría (lib/shipping-v2/especificaciones.ts). Pedirlos también aquí
      // haría escribir lo mismo dos veces.
    },
  ],
  cargador: [
    { id: "cargador", nombre: "Cargador", base: [["Voltaje y amperaje correctos", 1], ["Carga efectivamente un equipo", 1],
      ["Punta compatible", 0], ["Cable sin cortes ni empalmes", 1]] },
  ],
  "pantalla-repuesto": [
    {
      id: "panel", nombre: "Panel",
      base: [["Sin píxeles muertos ni manchas", 1], ["Conector y flex sin daño", 1], ["Sin fisuras en el cristal", 1]],
      // Sin captura de ficha: estos datos van en las especificaciones de la
      // categoría (lib/shipping-v2/especificaciones.ts). Pedirlos también aquí
      // haría escribir lo mismo dos veces.
    },
  ],
  "teclado-repuesto": [
    { id: "teclado", nombre: "Teclado", base: [["Todas las teclas responden", 1], ["Conector flex sin daño", 1],
      ["Distribución e idioma anotados", 0]] },
  ],
  celular: [
    {
      id: "pantalla", nombre: "Pantalla",
      base: [["Enciende sin manchas ni líneas", 1], ["Táctil responde en toda la superficie", 1], ["Vidrio sin fisuras", 0]],
    },
    { id: "cuentas", nombre: "Bloqueos de cuenta",
      base: [["Sin bloqueo iCloud / Google FRP", 1], ["Restaurado de fábrica", 1]] },
    { id: "red", nombre: "Red y operador",
      base: [["Liberado de operador", 1], ["Hace y recibe llamadas", 1], ["IMEI sin reporte", 1], ["Datos móviles funcionan", 0]] },
    { id: "bateria", nombre: "Batería y carga",
      base: [["Salud de batería medida y anotada", 1], ["Puerto de carga funciona", 1], ["Sin hinchazón (seguridad)", 1]] },
    { id: "camaras", nombre: "Cámaras y audio",
      base: [["Cámara frontal", 0], ["Cámara trasera", 0], ["Altavoz y micrófono", 0]] },
    { id: "botones", nombre: "Botones y chasis",
      base: [["Botones físicos responden", 0], ["Chasis sin fisuras", 0], ["Lector de huella o rostro", 0]] },
    { id: "conectividad", nombre: "Conectividad", base: [] },
    { id: "puertos", nombre: "Puertos", base: [] },
    { id: "extras", nombre: "Otras características", base: [] },
    { id: "accesorios", nombre: "Accesorios", base: [["Cargador incluido", 0]] },
  ],
  "disco-externo": [
    {
      id: "unidad", nombre: "Unidad",
      base: [
        ["Se reconoce al conectarlo", 1],
        ["SMART sano", 1],
        ["Capacidad real coincide", 1],
        ["Velocidad de transferencia anotada", 0],
        ["Borrado seguro de datos del dueño anterior", 1],
      ],
    },
    { id: "carcasa", nombre: "Carcasa y cable",
      base: [["Conector sin daño", 1], ["Cable incluido", 0], ["Carcasa sin fisuras ni tornillos faltantes", 0]] },
  ],
  smarthome: [
    { id: "arranque", nombre: "Enciende y arranca",
      base: [["Enciende con su fuente", 1], ["Completa el arranque", 1], ["Fuente o cargador incluido", 0]] },
    { id: "cuentas", nombre: "Cuentas y reseteo",
      base: [["Desvinculado de la cuenta anterior", 1], ["Restaurado de fábrica", 1]] },
    { id: "conexion", nombre: "Conexión",
      base: [["Se conecta a Wi-Fi", 1], ["Responde desde la app", 1]] },
    { id: "funciones", nombre: "Funciones",
      base: [["Micrófono y altavoz responden", 0], ["Sensores o relé responden", 0]] },
    { id: "conectividad", nombre: "Conectividad", base: [] },
    { id: "puertos", nombre: "Puertos", base: [] },
    { id: "extras", nombre: "Otras características", base: [] },
  ],
  audio: [
    { id: "sonido", nombre: "Sonido",
      base: [["Suena por todos los canales", 1], ["Sin distorsión a volumen alto", 1], ["Sin ruido de fondo", 0]] },
    { id: "conexion", nombre: "Entradas y salidas",
      base: [["Entradas y salidas responden", 1], ["Empareja por Bluetooth", 0]] },
    { id: "controles", nombre: "Controles",
      base: [["Perillas y botones responden", 0], ["Pantalla o luces indicadoras", 0]] },
    { id: "alimentacion", nombre: "Alimentación",
      base: [["Enciende con su fuente", 1], ["Fuente o cable incluido", 0]] },
    { id: "fisico", nombre: "Estado físico",
      base: [["Conos, rejillas y almohadillas sin daño", 0], ["Cable sin cortes ni empalmes", 0]] },
    { id: "conectividad", nombre: "Conectividad", base: [] },
    { id: "puertos", nombre: "Puertos", base: [] },
    { id: "extras", nombre: "Otras características", base: [] },
  ],
  impresora: [
    { id: "arranque", nombre: "Enciende y arranca",
      base: [["Enciende y completa el arranque", 1], ["Panel o luces responden", 0]] },
    { id: "impresion", nombre: "Impresión",
      base: [["Imprime página de prueba", 1], ["Sin manchas ni líneas", 1], ["Sin atascos de papel", 1]] },
    { id: "insumos", nombre: "Insumos",
      base: [["Cartucho, tóner o cinta incluido", 0], ["Nivel de insumo anotado", 0], ["Contador de páginas anotado", 0]] },
    { id: "conexion", nombre: "Conexión",
      base: [["Puerto de datos responde", 1], ["Wi-Fi o red conecta", 0]] },
    { id: "conectividad", nombre: "Conectividad", base: [] },
    { id: "puertos", nombre: "Puertos", base: [] },
    { id: "extras", nombre: "Otras características", base: [] },
    { id: "accesorios", nombre: "Accesorios",
      base: [["Cable de poder incluido", 0], ["Cable de datos incluido", 0]] },
  ],
  red: [
    { id: "arranque", nombre: "Enciende y arranca",
      base: [["Enciende con su fuente", 1], ["Fuente incluida", 0]] },
    { id: "reseteo", nombre: "Reseteo y bloqueos",
      base: [["Restaurado de fábrica", 1], ["Sin bloqueo de operador", 0]] },
    { id: "wifi", nombre: "Wi-Fi",
      base: [["Emite red Wi-Fi", 1], ["Alcance razonable", 0], ["Entra al panel de administración", 0]] },
    { id: "puertos", nombre: "Puertos de red", base: [["Puertos LAN y WAN responden", 1]] },
    { id: "conectividad", nombre: "Conectividad", base: [] },
    { id: "extras", nombre: "Otras características", base: [] },
  ],
  camara: [
    { id: "arranque", nombre: "Enciende y arranca",
      base: [["Enciende con su fuente", 1], ["Fuente o batería incluida", 0]] },
    { id: "cuentas", nombre: "Cuentas y reseteo",
      base: [["Desvinculada de la cuenta anterior", 1], ["Restaurada de fábrica", 1]] },
    { id: "imagen", nombre: "Imagen",
      base: [["Da imagen nítida", 1], ["Visión nocturna funciona", 0], ["Lente sin rayas ni empañamiento", 0]] },
    { id: "conexion", nombre: "Conexión",
      base: [["Conecta a Wi-Fi o red", 1], ["Se ve desde la app", 1]] },
    { id: "sensores", nombre: "Audio y sensores",
      base: [["Micrófono y altavoz", 0], ["Detección de movimiento", 0], ["Ranura de memoria", 0]] },
    { id: "conectividad", nombre: "Conectividad", base: [] },
    { id: "puertos", nombre: "Puertos", base: [] },
    { id: "extras", nombre: "Otras características", base: [] },
    { id: "accesorios", nombre: "Accesorios",
      base: [["Soportes y tornillos incluidos", 0]] },
  ],
  energia: [
    { id: "funcionamiento", nombre: "Funcionamiento",
      base: [["Entrega corriente en todas las tomas", 1], ["Interruptores y luces responden", 0]] },
    { id: "proteccion", nombre: "Protección",
      base: [["Protección o fusible sin quemar", 1], ["Sin olor a quemado", 1]] },
    { id: "bateria", nombre: "Batería",
      base: [["Mantiene carga sin enchufe", 1], ["Autonomía anotada", 0], ["Sin hinchazón (seguridad)", 1]] },
    { id: "cable", nombre: "Cable y enchufe",
      base: [["Cable sin cortes ni empalmes", 1], ["Enchufe sin quemaduras ni pines flojos", 1]] },
  ],
  adaptador: [
    { id: "funcionamiento", nombre: "Funcionamiento",
      base: [["Se reconoce al conectarlo", 1], ["Transfiere datos o da imagen", 1], ["Todas las salidas y ranuras responden", 1]] },
    { id: "conectores", nombre: "Conectores",
      base: [["Conectores sin daño ni pines doblados", 1], ["Cable sin cortes ni empalmes", 0]] },
    { id: "accesorios", nombre: "Accesorios",
      base: [["Fuente incluida si la necesita", 0], ["Cables incluidos", 0]] },
    { id: "conectividad", nombre: "Conectividad", base: [] },
    { id: "puertos", nombre: "Puertos", base: [] },
    { id: "extras", nombre: "Otras características", base: [] },
  ],
  insumo: [
    { id: "recepcion", nombre: "Recepción",
      base: [
        ["Cantidad recibida coincide", 1],
        ["Empaque sellado y sin daño", 1],
        ["Sin derrames ni resecamiento", 1],
        ["Fecha de vencimiento anotada", 0],
      ],
    },
  ],
  generico: [
    { id: "funciona", nombre: "Funcionamiento", base: [["Funciona como debe", 1], ["Completo, sin piezas faltantes", 0],
      ["Cantidad recibida coincide", 0], ["Sin daños visibles", 0]] },
  ],
};

// ─── De lo declarado a su punto de prueba ───────────────────────────────────
//
// Las opciones vienen de catálogos de Airtable que el dueño puede editar. Por
// eso el mapa va por nombre normalizado y con alias, y por eso existe un
// FALLBACK: una opción nueva que nadie mapeó igual genera su punto genérico.
// Preferimos un punto impreciso a un agujero silencioso.

export type GrupoDeclarable = "conectividad" | "puerto" | "extra";

type Regla = { zona: string; texto: string; critico: 0 | 1 };

const REGLAS: Record<string, Regla> = {
  // Conectividad
  "wi-fi": { zona: "conectividad", texto: "Wi-Fi conecta a la red", critico: 1 },
  "bluetooth": { zona: "conectividad", texto: "Bluetooth empareja un dispositivo", critico: 0 },
  "ethernet": { zona: "conectividad", texto: "Ethernet conecta", critico: 0 },
  "lte-gsm": { zona: "conectividad", texto: "Módem LTE conecta con SIM", critico: 0 },
  "sim slot": { zona: "conectividad", texto: "La bandeja SIM abre y retiene", critico: 0 },
  // Puertos
  "usb 2.0": { zona: "puertos", texto: "USB 2.0 transfiere datos", critico: 1 },
  "usb 3.0": { zona: "puertos", texto: "USB 3.0 transfiere datos", critico: 1 },
  "usb-c": { zona: "puertos", texto: "USB-C transfiere y carga", critico: 1 },
  "micro-usb": { zona: "puertos", texto: "Micro-USB transfiere y carga", critico: 0 },
  "thunderbolt 2": { zona: "puertos", texto: "Thunderbolt reconoce un dispositivo", critico: 0 },
  "thunderbolt 3": { zona: "puertos", texto: "Thunderbolt reconoce un dispositivo", critico: 0 },
  "thunderbolt 4": { zona: "puertos", texto: "Thunderbolt reconoce un dispositivo", critico: 0 },
  "hdmi": { zona: "puertos", texto: "HDMI saca video a un monitor", critico: 0 },
  "micro hdmi": { zona: "puertos", texto: "Micro HDMI saca video", critico: 0 },
  "displayport": { zona: "puertos", texto: "DisplayPort saca video", critico: 0 },
  "mini displayport": { zona: "puertos", texto: "Mini DisplayPort saca video", critico: 0 },
  "vga": { zona: "puertos", texto: "VGA saca video", critico: 0 },
  "dvi": { zona: "puertos", texto: "DVI saca video", critico: 0 },
  "audio jack": { zona: "puertos", texto: "Jack de audio suena", critico: 0 },
  "sd/microsd": { zona: "puertos", texto: "Lector de tarjetas lee una SD", critico: 0 },
  "dvd drive": { zona: "puertos", texto: "Unidad óptica lee un disco", critico: 0 },
  "puerto serial": { zona: "puertos", texto: "Puerto serial responde", critico: 0 },
  // Características extras
  "camara": { zona: "extras", texto: "Cámara web da imagen", critico: 0 },
  "microfono": { zona: "extras", texto: "Micrófono capta audio", critico: 0 },
  "teclado retroiluminado": { zona: "teclado", texto: "Retroiluminación enciende y regula", critico: 0 },
  "teclado rgb": { zona: "teclado", texto: "Retroiluminación RGB enciende y cambia", critico: 0 },
  "pantalla tactil": { zona: "pantalla", texto: "Táctil responde en toda la superficie", critico: 1 },
  "pantalla oled": { zona: "pantalla", texto: "Sin retención de imagen (burn-in)", critico: 1 },
  "pantalla desplegable": { zona: "pantalla", texto: "El mecanismo despliega sin forzar", critico: 1 },
  "convertible 2 en 1": { zona: "chasis", texto: "Gira 360° y cambia de modo", critico: 1 },
  "lapiz optico": { zona: "pantalla", texto: "Lápiz empareja y escribe", critico: 0 },
  "touch bar": { zona: "teclado", texto: "Touch Bar responde", critico: 0 },
  "touch id": { zona: "touchpad", texto: "Lector de huella reconoce", critico: 0 },
  "unidad optica": { zona: "puertos", texto: "Unidad óptica lee un disco", critico: 0 },
  "spdif": { zona: "puertos", texto: "Salida SPDIF suena", critico: 0 },
};

/** Alias: cómo lo escribe la gente → cómo está en el mapa. */
const ALIAS: Record<string, string> = {
  "wifi": "wi-fi", "wi fi": "wi-fi", "wireless": "wi-fi",
  "bluetooh": "bluetooth", "bt": "bluetooth",
  "lan": "ethernet", "rj45": "ethernet", "rj-45": "ethernet",
  "usb c": "usb-c", "usbc": "usb-c", "tipo c": "usb-c",
  "usb a": "usb 3.0", "usb": "usb 3.0",
  "jack": "audio jack", "audio": "audio jack", "3.5mm": "audio jack",
  "sd": "sd/microsd", "microsd": "sd/microsd", "lector de tarjetas": "sd/microsd",
  "camara web": "camara", "webcam": "camara",
  "huella": "touch id", "lector de huella": "touch id", "windows hello": "touch id",
  "tactil": "pantalla tactil", "touchscreen": "pantalla tactil",
  "2 en 1": "convertible 2 en 1", "convertible": "convertible 2 en 1",
  "dvd": "dvd drive", "lector dvd": "dvd drive",
};

/** Quita tildes y signos para que "Cámara" y "camara" sean lo mismo. */
export function claveOpcion(nombre: string): string {
  const base = normalizar(nombre)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return ALIAS[base] ?? base;
}

const ZONA_POR_GRUPO: Record<GrupoDeclarable, string> = {
  conectividad: "conectividad",
  puerto: "puertos",
  extra: "extras",
};

/**
 * Traduce una opción declarada en el punto que hay que probar.
 *
 * Nunca devuelve null: una opción desconocida —porque el dueño acaba de
 * crearla en el catálogo— cae en un punto genérico dentro de la zona de su
 * grupo. Fallar en silencio aquí sería exactamente el agujero que este
 * módulo existe para cerrar.
 */
export function generarPuntoDeclarado(
  nombre: string,
  grupo: GrupoDeclarable,
  zonasDisponibles: ReadonlySet<string>
): { zona: string; texto: string; critico: boolean } {
  const regla = REGLAS[claveOpcion(nombre)];
  const zonaFallback = ZONA_POR_GRUPO[grupo];

  if (!regla) {
    return { zona: zonaFallback, texto: `Probar: ${nombre.trim()}`, critico: false };
  }
  // Si el perfil no tiene esa zona (un monitor no tiene "touchpad"), el punto
  // cae en la zona del grupo en vez de perderse.
  const zona = zonasDisponibles.has(regla.zona) ? regla.zona : zonaFallback;
  return { zona, texto: regla.texto, critico: regla.critico === 1 };
}

// ─── Construcción de las zonas de una inspección ────────────────────────────

export type OpcionDeclarada = { nombre: string; grupo: GrupoDeclarable };

function idPunto(zonaId: string, texto: string): string {
  return `${zonaId}:${claveOpcion(texto).replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`;
}

/**
 * Las zonas que el técnico va a ver, ya con los puntos generados por lo
 * declarado. Una zona sin ningún punto no se muestra: un monitor no tiene por
 * qué enseñar una zona "Conectividad" vacía.
 */
/**
 * Todos los ids de zona que un perfil PUEDE llegar a mostrar.
 *
 * Distinto de construirZonasRevision(), que devuelve las zonas de un item
 * concreto y esconde las que quedarían vacías (Conectividad, Puertos y Otras
 * características solo aparecen si el item declaró algo). La guía visual de la
 * inspección dibuja las condicionales igual, porque aparecen en cuanto el item
 * trae opciones; necesita saber cuáles son válidas sin inventarse un item.
 */
export function idsDeZonaDelPerfil(perfil: PerfilRevision): string[] {
  return ZONAS[perfil].map((d) => d.id);
}

export function construirZonasRevision(
  categoria: string | null | undefined,
  declaradas: readonly OpcionDeclarada[] = []
): ZonaRevision[] {
  const perfil = getPerfilRevision(categoria);
  const defs = ZONAS[perfil];
  const idsZona = new Set(defs.map((d) => d.id));

  const generados = new Map<string, PuntoRevision[]>();
  const yaVistos = new Set<string>();

  for (const opcion of declaradas) {
    const nombre = (opcion.nombre || "").trim();
    if (!nombre) continue;
    // Dos catálogos pueden traer "Ethernet" (puerto y conectividad). Se prueba
    // una sola vez: el técnico no tiene por qué enchufar el cable dos veces.
    const clave = claveOpcion(nombre);
    if (yaVistos.has(clave)) continue;
    yaVistos.add(clave);

    const { zona, texto, critico } = generarPuntoDeclarado(nombre, opcion.grupo, idsZona);
    const lista = generados.get(zona) ?? [];
    // Dos opciones distintas pueden producir el MISMO punto: "Thunderbolt 3" y
    // "Thunderbolt 4" se prueban igual, y "DVD Drive" y "Unidad óptica" son lo
    // mismo. Si se colaran las dos, quedarían dos filas con el mismo id y
    // marcar una marcaría la otra.
    const idNuevo = idPunto(zona, texto);
    if (lista.some((punto) => punto.id === idNuevo)) continue;
    lista.push({ id: idNuevo, texto, critico, origen: "declarado", declaradoDe: nombre });
    generados.set(zona, lista);
  }

  const zonas: ZonaRevision[] = [];
  let numero = 0;

  for (const def of defs) {
    const base: PuntoRevision[] = def.base.map(([texto, critico]) => ({
      id: idPunto(def.id, texto),
      texto,
      critico: critico === 1,
      origen: "base",
    }));
    const idsBase = new Set(base.map((p) => p.id));
    const puntos = [...base, ...(generados.get(def.id) ?? []).filter((p) => !idsBase.has(p.id))];
    if (!puntos.length) continue;

    numero += 1;
    zonas.push({
      id: def.id,
      numero,
      nombre: def.nombre,
      puntos,
      critica: puntos.some((p) => p.critico),
      captura: def.captura ?? [],
    });
  }

  // Rescate: un punto generado para una zona que este perfil NO tiene se
  // perdía en silencio. Pasaba en todos los perfiles de una sola zona (RAM,
  // disco, genérico…): declarar "Bluetooth" en un parlante creaba su punto en
  // la zona "conectividad", que ahí no existe, y desaparecía.
  //
  // Esto contradice la regla que sostiene el módulo —declarar crea la
  // obligación de probar—, así que lo suelto termina en una zona propia.
  const idsUsados = new Set(defs.map((d) => d.id));
  const huerfanos = [...generados.entries()]
    .filter(([zonaId]) => !idsUsados.has(zonaId))
    .flatMap(([, puntos]) => puntos);

  if (huerfanos.length) {
    const vistos = new Set(zonas.flatMap((z) => z.puntos.map((p) => p.id)));
    const puntos = huerfanos.filter((p) => !vistos.has(p.id));
    if (puntos.length) {
      zonas.push({
        id: "declarado",
        numero: numero + 1,
        nombre: "Otras características",
        puntos,
        critica: puntos.some((p) => p.critico),
        captura: [],
      });
    }
  }

  return zonas;
}

// ─── Estado derivado ────────────────────────────────────────────────────────
//
// Nada de esto se marca a mano. El estado de la inspección SE CALCULA, igual
// que el cierre de ciclo de un packing: el sistema decide si está completa, la
// persona solo la firma.

export function resolverEstadoZona(
  zona: ZonaRevision,
  resultados: Readonly<Record<string, ResultadoPunto | undefined>>
): EstadoZona {
  if (!zona.puntos.length) return "";
  const valores = zona.puntos.map((p) => resultados[p.id]).filter(Boolean) as ResultadoPunto[];
  if (!valores.length) return "";
  if (valores.length < zona.puntos.length) return "parcial";
  if (valores.includes("falla")) return "falla";
  if (valores.every((v) => v === "na")) return "na";
  return "ok";
}

export type EstadoInspeccion = {
  completa: boolean;
  totalZonas: number;
  zonasResueltas: number;
  zonasPendientes: string[];
  /** Puntos críticos marcados como falla: cada uno debería tener su novedad. */
  fallasCriticas: { zona: string; punto: string }[];
  motivo: string;
};

/**
 * ¿Se puede cerrar la inspección?
 *
 * Una falla NO impide cerrar: es un resultado, no un pendiente. El técnico
 * probó la bisagra y está mala — su trabajo terminó. Lo que queda abierto es
 * la novedad, y eso bloquea la PUBLICACIÓN del equipo, no el cierre de esta
 * pantalla. Si exigiéramos resolver la novedad para cerrar, el técnico
 * quedaría atado semanas esperando que conteste el proveedor.
 *
 * Lo que sí impide cerrar es un punto SIN MARCAR. Sin marcar no es lo mismo
 * que falla.
 */
export function resolverEstadoInspeccion(input: {
  zonas: readonly ZonaRevision[];
  resultados: Readonly<Record<string, ResultadoPunto | undefined>>;
  equipamientoConfirmado: boolean;
}): EstadoInspeccion {
  const { zonas, resultados, equipamientoConfirmado } = input;

  const pendientes: string[] = [];
  const fallasCriticas: { zona: string; punto: string }[] = [];
  let resueltas = 0;

  for (const zona of zonas) {
    const estado = resolverEstadoZona(zona, resultados);
    if (estado === "ok" || estado === "falla" || estado === "na") resueltas += 1;
    else pendientes.push(zona.nombre);

    for (const punto of zona.puntos) {
      if (punto.critico && resultados[punto.id] === "falla") {
        fallasCriticas.push({ zona: zona.nombre, punto: punto.texto });
      }
    }
  }

  const completa = equipamientoConfirmado && pendientes.length === 0 && zonas.length > 0;

  const motivo = !zonas.length
    ? "Esta categoría no tiene puntos de revisión definidos."
    : !equipamientoConfirmado
      ? "Falta confirmar qué trae el equipo."
      : pendientes.length
        ? `Faltan ${pendientes.length} zona(s) por resolver: ${pendientes.join(", ")}.`
        : fallasCriticas.length
          ? `Inspección lista. Quedan ${fallasCriticas.length} falla(s) crítica(s) con novedad abierta, que bloquean la publicación.`
          : "Inspección lista. El equipo puede publicarse.";

  return {
    completa,
    totalZonas: zonas.length,
    zonasResueltas: resueltas,
    zonasPendientes: pendientes,
    fallasCriticas,
    motivo,
  };
}

/** Los datos de ficha que esta categoría puede capturar mientras se inspecciona. */
export function camposFichaDeZonas(zonas: readonly ZonaRevision[]): CampoFichaEnZona[] {
  return zonas.flatMap((z) => z.captura);
}
