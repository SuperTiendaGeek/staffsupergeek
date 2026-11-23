// Motivos de ingreso — catálogo inicial y clasificación de las órdenes viejas
// (rediseño R7). PURO: lo usa el script `scripts/rediseno-r7-motivos.ts`.
//
// La lista salió de leer los 574 «Ingresa Por» del taller (23-nov-2026):
// 27 motivos en 4 grupos (menos de 30, como recomiendan los sistemas de
// códigos de falla). «palabras» = palabras parecidas que se guardan en el
// motivo (las usa el buscador); «frases» = solo para clasificar lo viejo.

import { plano, type GrupoMotivo } from "./reglas";

export type MotivoSemilla = {
  nombre: string;
  grupo: GrupoMotivo;
  palabras: string[];
  frases: string[];
  /** Palabras parecidas que sirven al buscador pero engañan al clasificar lo viejo. */
  soloBuscador?: string[];
};

export const CATALOGO_INICIAL: MotivoSemilla[] = [
  // ── Falla ──
  { nombre: "No enciende", grupo: "Falla", palabras: ["no prende", "muerto", "sin signos de vida"],
    frases: ["signos de vida", "no enciende", "no encendia", "no encendio", "no se prende", "no se enciende", "ya no enciende", "no muestra signos", "tratar de encender", "boton de encendido"] },
  { nombre: "Enciende sin imagen", grupo: "Falla", palabras: ["no da video", "no da imagen", "pantalla negra"],
    frases: ["no hay imagen", "sin imagen", "no da pantalla", "deja de dar pantalla", "en negro", "pantalla no enciende", "pantallazo negro"] },
  { nombre: "Se apaga solo", grupo: "Falla", palabras: ["se apaga", "apagones", "apagados"],
    frases: ["apagado repentino", "enciende y se apaga", "se enciende y se apaga"] },
  { nombre: "Se calienta", grupo: "Falla", palabras: ["sobrecalentamiento", "temperatura", "ventilador"],
    frases: ["calienta"] },
  { nombre: "Lentitud", grupo: "Falla", palabras: ["lento", "rendimiento"], frases: [] },
  { nombre: "Se cuelga o pantalla azul", grupo: "Falla", palabras: ["cuelgues", "congela", "pantallazo azul"],
    frases: ["cuelga", "cuelges", "pantalla azul", "pantallazos", "colgada", "colgando", "glitches", "congelamiento"] },
  { nombre: "No arranca el sistema", grupo: "Falla", palabras: ["no arranca windows", "boot device", "error de arranque"],
    frases: ["no arranca", "no arraca", "no arracan", "no bootea", "bootable", "problemas de arranque", "problema de arranque", "falla al arrancar",
      "sistema operativo no carga", "no inicia", "software de arranque", "fallo en sistema operativo", "fallo en el s.o"] },
  { nombre: "Pantalla rota o con fallas", grupo: "Falla", palabras: ["display", "lcd", "trizada", "lineas en pantalla", "parpadea"],
    frases: ["pantalla rota", "cambio de pantalla", "cotizar pantalla", "nueva pantalla", "reemplazo de pantalla", "parpadeo", "parpadear", "distorsion",
      "distorsionada", "sin brillo", "flex", "lamparas", "pantalla tactil", "problema en pantalla", "problema en la imagen", "errores de imagen", "linea horizontal", "lineas blancas"] },
  { nombre: "Bisagras o carcasa rotas", grupo: "Falla", palabras: ["bisagra", "carcasa", "palmrest", "tapa"],
    frases: ["carcaza", "palm", "tapa de", "tapa posterior", "esquina", "marco de pantalla", "seguros de carcasa"] },
  { nombre: "Teclado o touchpad", grupo: "Falla", palabras: ["teclas", "trackpad", "mouse"],
    frases: ["teclado", "tecla", "touchpad", "botones de click", "botones", "touchscreen"] },
  { nombre: "Batería", grupo: "Falla", palabras: ["bateria no carga", "se descarga", "bateria inflada"], frases: ["bateria"] },
  { nombre: "No carga (pin o cargador)", grupo: "Falla", palabras: ["pin de carga", "cargador", "adaptador"],
    frases: ["adaptador de corriente", "no carga, no enciende", "no carga, puerto", "jack de carga", "no recibe carga", "no reciben carga", "puertos usb de carga"] },
  { nombre: "Derrame de líquido", grupo: "Falla", palabras: ["mojado", "agua", "cafe", "corrosion"], frases: ["derrame", "liquido", "humedad"] },
  { nombre: "Audio, cámara o micrófono", grupo: "Falla", palabras: ["sonido", "parlante", "microfono", "camara"],
    frases: ["audio", "parlantes", "audifono", "jack de audifonos"] },
  { nombre: "Wi-Fi, Bluetooth o puertos", grupo: "Falla", palabras: ["wifi", "internet", "usb", "hdmi"],
    frases: ["wi-fi", "bluetooth", "puerto hdmi", "puertos", "probar red", "conectividad", "conexion wi-fi"] },
  { nombre: "Disco duro con fallas", grupo: "Falla", palabras: ["disco no detectado", "ssd danado"],
    frases: ["disco duro no", "disco duro no detectado", "no detecta el disco", "fallo en el disco"] },
  { nombre: "Placa madre", grupo: "Falla", palabras: ["mainboard", "motherboard", "cortocircuito", "microelectronica"],
    frases: ["modeboard", "placa madre", "corto", "corte", "banco de memoria"] },
  { nombre: "Impresora no imprime", grupo: "Falla", palabras: ["impresora", "cabezal", "atasco de papel"], soloBuscador: ["impresora", "cabezal"],
    frases: ["no imprime", "no imprimen", "problema en cabezal", "cabezal presenta problema", "bloqueo de cabezales", "cabezales tapados",
      "problemas en los cabezales", "error e3", "almohadilla", "hoja trabada", "descarrila"] },
  // ── Mantenimiento ──
  { nombre: "Mantenimiento y pasta térmica", grupo: "Mantenimiento", palabras: ["limpieza", "pasta termica", "preventivo"],
    frases: ["mantenimiento", "pasta", "manteminieto", "mantinimiento", "mnatenimiento", "mantenimient", "mantienimiento"] },
  { nombre: "Mantenimiento de impresora", grupo: "Mantenimiento", palabras: ["limpieza de cabezales", "tintas", "drenaje"],
    frases: ["cambio de tinta", "sistema de tinta", "mantenimiento de los cabezales"] },
  // ── Software ──
  { nombre: "Formateo e instalación del sistema", grupo: "Software", palabras: ["formatear", "windows", "linux", "macos", "virus"], soloBuscador: ["windows"],
    frases: ["formateo", "formate", "instalacion de windows", "instalacion de s.o", "instalacion de sistema", "windows 11", "windows 10",
      "sistema operativo corrupto", "s.o. corrompido", "reinstalar", "cambio de sistema"] },
  { nombre: "Respaldo o recuperación de información", grupo: "Software", palabras: ["respaldo", "recuperar archivos", "fotos"],
    frases: ["respaldar", "recuperar informacion", "recuperacion de informacion", "extraccion", "pasar informacion"] },
  { nombre: "Office, antivirus y programas", grupo: "Software", palabras: ["office", "antivirus", "licencia", "programas"],
    frases: ["libre office", "libreoffice", "onlyoffice", "bitdefender", "bitdenfer", "mcafee", "winrar", "aplicaciones", "productos digitales"] },
  { nombre: "Contraseña o BIOS bloqueada", grupo: "Software", palabras: ["clave olvidada", "bios bloqueada", "desbloqueo"],
    frases: ["contrasena de bios", "password", "recuperacion de contrasena", "contrasrna"] },
  { nombre: "Configuración y drivers", grupo: "Software", palabras: ["drivers", "controladores", "configurar", "actualizacion"],
    frases: ["driver", "configuracion", "idioma", "firmware", "actualizar bios"] },
  // ── Otro servicio ──
  { nombre: "Mejora de RAM o disco", grupo: "Otro servicio", palabras: ["aumento de ram", "ssd", "repotenciacion", "upgrade"],
    frases: ["aumentar la ram", "memoria ram", "cambio de ram", "cambio de disco", "almacenamiento", "aumento de rendimiento", "mejoras", "m.2",
      "grafica", "intercambio de ram", "colocar ram", "reemplazo de disco"] },
  { nombre: "Revisión general", grupo: "Otro servicio", palabras: ["diagnostico", "revisar", "no funciona"],
    frases: ["revision general", "revision", "varios problemas", "evaluacion", "inspeccion", "funciona intermitente", "mensaje de error"] },
];

/** Frases que engañan a la clasificación (se borran antes de buscar). */
const NO_CUENTAN = ["no enciende backlit", "led de carga enciende pero", "sin respaldo", "informacion actual no importa"];
const DE_IMPRESORA = ["cabezal", "cabezales", "tinta", "tintas", "imprime", "impresora", "almohadilla"];

function textoPlano(t: string): string {
  return ` ${plano(t).replace(/\s+/g, " ")} `;
}

/** La frase aparece como palabra(s) completa(s); acepta plural (s / es). */
export function contieneFrase(textoNormalizado: string, frase: string): boolean {
  const f = plano(frase).trim().replace(/[.*+?^${}()|\\]/g, "\\$&").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  return new RegExp(`(?<![a-z0-9ñ])${f}(e?s)?(?![a-z0-9ñ])`).test(textoNormalizado);
}

/**
 * Motivos (por nombre) que corresponden a un «Ingresa Por» viejo. Reglas:
 * de impresora → mantenimiento de impresora (no de pasta térmica);
 * «Revisión general» solo si no hay otro motivo.
 */
export function clasificarIngreso(ingresaPor: string, catalogo: MotivoSemilla[] = CATALOGO_INICIAL): string[] {
  let t = textoPlano(ingresaPor);
  for (const x of NO_CUENTAN) t = t.split(x).join(" ");
  const frasesDe = (m: MotivoSemilla) => [m.nombre, ...m.palabras.filter((p) => !m.soloBuscador?.includes(p)), ...m.frases];
  const elegidos = catalogo.filter((m) => frasesDe(m).some((f) => contieneFrase(t, f))).map((m) => m.nombre);
  const impresora = DE_IMPRESORA.some((f) => contieneFrase(t, f));
  let r = elegidos;
  if (impresora && r.includes("Mantenimiento y pasta térmica")) {
    r = r.filter((n) => n !== "Mantenimiento y pasta térmica");
    if (!r.includes("Mantenimiento de impresora")) r.push("Mantenimiento de impresora");
  }
  if (r.length > 1) r = r.filter((n) => n !== "Revisión general");
  return r;
}
