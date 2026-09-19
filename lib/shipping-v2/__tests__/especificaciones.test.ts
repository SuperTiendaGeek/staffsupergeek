// Contrato de los datos técnicos por categoría y de la línea de etiqueta.
// Ejecutar: npx tsx lib/shipping-v2/__tests__/especificaciones.test.ts

import {
  aplicarCambiosEspec,
  camposDeCategoria,
  categoriasConEspecificaciones,
  especificacionesEfectivas,
  lineaEtiqueta,
  normalizarCapacidad,
  normalizarValor,
  parsearEspecificaciones,
  resumenTecnico,
  serializarEspecificaciones,
  usaFichaTecnica,
} from "../especificaciones";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const igual = (real: string, esperado: string, msg: string) =>
  assert(real === esperado, `${msg} (vino "${real}")`);

const firma = { actor: "Técnico", ahora: "2026-09-19T12:00:00.000Z" };

// ── Las líneas de etiqueta aprobadas por Alexis ─────────────────────────────
igual(resumenTecnico("RAM", { capacidad: "8GB", tipo: "DDR4", velocidad: "3200", formato: "SODIMM" }),
  "8GB · DDR4 · 3200 · SODIMM", "RAM");
igual(resumenTecnico("SSD", { capacidad: "512GB", interfaz: "NVMe Gen3", formato: "2280", lectura: "3500" }),
  "512GB · NVMe Gen3 · 2280", "SSD: la velocidad se guarda pero no va en la etiqueta");
igual(resumenTecnico("HDD", { capacidad: "1TB", formato: "2.5\"", rpm: "5400" }), "1TB · 2.5\" · 5400rpm", "HDD");
igual(resumenTecnico("Disco externo", { capacidad: "2TB", tipo: "HDD", conexion: "USB 3.0" }), "2TB · HDD · USB 3.0", "Disco externo");
igual(resumenTecnico("Monitor", { tamano: "24", resolucion: "FHD", frecuencia: "75", panel: "IPS" }), "24\" · FHD · 75Hz", "Monitor");
igual(resumenTecnico("Fuente de poder", { watts: "650", certificacion: "80+ Bronze", modular: "No modular" }),
  "650W · 80+ Bronze · No modular", "Fuente");
igual(resumenTecnico("Cargador", { watts: "65", punta: "USB-C" }), "65W · USB-C", "Cargador");
igual(resumenTecnico("Teclado", { idioma: "Español", retroiluminado: "Sí" }), "Español · Retroiluminado", "Teclado");
igual(resumenTecnico("Consola", { almacenamiento: "1TB", controles: "2" }), "1TB · 2 controles", "Consola, plural");
igual(resumenTecnico("Consola", { almacenamiento: "1TB", controles: "1" }), "1TB · 1 control", "Consola, singular");
igual(resumenTecnico("Adaptador / Dock / Lector", { entrada: "USB 3.0", salida: "SATA" }), "USB 3.0 → SATA", "Adaptador usa flecha");
igual(resumenTecnico("Impresora", { tecnologia: "Láser", color: "Monocromática", conexion: "Wi-Fi" }), "Láser · Mono · Wi-Fi", "Impresora abrevia Mono");
igual(resumenTecnico("Red / Wi-Fi", { tipo: "Repetidor", estandar: "Wi-Fi 6 (AX)", velocidad: "AX1800" }),
  "Repetidor · Wi-Fi 6 · AX1800", "Red abrevia el estándar");

// ── Lo que falta no se imprime ──────────────────────────────────────────────
igual(resumenTecnico("RAM", { capacidad: "8GB", formato: "SODIMM" }), "8GB · SODIMM", "Un hueco no deja ' ·  · '");
igual(resumenTecnico("Teclado", { idioma: "Español", retroiluminado: "No" }), "Español", "Un 'No' no se imprime");
igual(resumenTecnico("Pantalla", { tamano: "15.6", tactil: "No" }), "15.6\"", "Táctil = No no ocupa espacio");
igual(resumenTecnico("RAM", {}), "", "Sin datos, sin línea");
igual(resumenTecnico("Accesorio", { cualquier: "cosa" }), "", "Una categoría sin datos técnicos no imprime nada");

// ── Validación: lo que entra a Airtable ─────────────────────────────────────
const ram = camposDeCategoria("RAM");
const tipoRam = ram.find((c) => c.id === "tipo")!;
igual(normalizarValor(tipoRam, "DDR4"), "DDR4", "Una opción válida pasa");
igual(normalizarValor(tipoRam, "ddr4 pirata"), "", "Un select no acepta texto inventado");
const velocidad = ram.find((c) => c.id === "velocidad")!;
igual(normalizarValor(velocidad, "3200.0"), "3200", "Un número pierde los ceros de adorno");
igual(normalizarValor(velocidad, "abc"), "", "Texto en un número no pasa");
igual(normalizarValor(velocidad, "-5"), "5", "El signo se ignora: una velocidad no es negativa");
const tamano = camposDeCategoria("Monitor").find((c) => c.id === "tamano")!;
igual(normalizarValor(tamano, "23,8"), "23.8", "Coma decimal, como se escribe en Ecuador");

// ── Capacidades ─────────────────────────────────────────────────────────────
igual(normalizarCapacidad("512"), "512GB", "512 suelto es GB");
igual(normalizarCapacidad("2"), "2TB", "2 suelto es TB");
igual(normalizarCapacidad("1 tb"), "1TB", "1 tb → 1TB");
igual(normalizarCapacidad("500 Gb"), "500GB", "500 Gb → 500GB");
igual(normalizarCapacidad("1.5TB"), "1.5TB", "Decimales se respetan");
igual(normalizarCapacidad("1TB + 256GB"), "1TB + 256GB", "Lo que no parece capacidad se deja como está");
const capSsd = camposDeCategoria("SSD").find((c) => c.id === "capacidad")!;
igual(normalizarValor(capSsd, "512"), "512GB", "El caso real: el técnico escribió 512");

// ── Guardar ─────────────────────────────────────────────────────────────────
let r = parsearEspecificaciones("");
r = aplicarCambiosEspec(r, "RAM", { capacidad: "8GB", tipo: "DDR4", inventado: "x" }, firma);
assert(r.valores.capacidad === "8GB" && r.valores.tipo === "DDR4", "Guarda los campos de la categoría");
assert(!("inventado" in r.valores), "Un campo que no es de la categoría no entra");
assert(r.actualizadoPor === "Técnico", "Queda firmado quién lo cargó");
r = aplicarCambiosEspec(r, "RAM", { tipo: "" }, firma);
assert(!("tipo" in r.valores) && r.valores.capacidad === "8GB", "'' borra solo ese campo");

// Cambio de categoría por error: nada se pierde.
const deDisco = aplicarCambiosEspec(parsearEspecificaciones(""), "SSD", { formato: "2280" }, firma);
const comoRam = aplicarCambiosEspec(deDisco, "RAM", { capacidad: "8GB" }, firma);
assert(comoRam.valores.formato === "2280", "Los datos de otra categoría se conservan en el respaldo");
igual(resumenTecnico("RAM", comoRam.valores), "8GB", "…pero no se imprimen en la etiqueta equivocada");

// Ida y vuelta por Airtable.
const vuelta = parsearEspecificaciones(serializarEspecificaciones(r));
assert(vuelta.valores.capacidad === "8GB", "Lo serializado se vuelve a leer igual");

// ── Leer nunca lanza ────────────────────────────────────────────────────────
for (const basura of ["{roto", "null", "[]", "42", "{\"valores\": 5}", "{\"valores\": {\"a\": 3, \"b\": \"ok\"}}"]) {
  let lanzo = false;
  try { parsearEspecificaciones(basura); } catch { lanzo = true; }
  assert(!lanzo, `Basura en el campo no rompe la lectura: ${basura}`);
}
assert(parsearEspecificaciones("{\"valores\": {\"a\": 3, \"b\": \"ok\"}}").valores.b === "ok", "De la basura parcial se conserva lo bueno");

// ── La ficha como punto de partida ──────────────────────────────────────────
const efSsd = especificacionesEfectivas("SSD", {}, { almacenamientoPrincipal: "512" });
igual(efSsd.capacidad ?? "", "512GB", "Lo que el técnico cargó en la ficha aparece como capacidad");
const efSsd2 = especificacionesEfectivas("SSD", { capacidad: "1TB" }, { almacenamientoPrincipal: "512" });
igual(efSsd2.capacidad ?? "", "1TB", "Una especificación guardada nunca la pisa la ficha");
const efRam = especificacionesEfectivas("RAM", {}, { ramCapacidad: "16GB", ramTipo: "LPDDR4" });
assert(efRam.capacidad === "16GB" && !efRam.tipo, "Un tipo de la ficha que la RAM suelta no tiene, no se cuela");
const efMon = especificacionesEfectivas("Monitor", {}, { pantallaTamano: "15.6\"" });
igual(efMon.tamano ?? "", "15.6", "El tamaño de la ficha se aprovecha como número");

// ── Computadores: la línea sale de la ficha ─────────────────────────────────
assert(usaFichaTecnica("Laptop") && usaFichaTecnica("All in One") && !usaFichaTecnica("Monitor"), "Quién usa ficha");
igual(lineaEtiqueta("Laptop", {}, { cpuModelo: "i5-8250U", ramCapacidad: "8GB", almacenamientoPrincipal: "256GB", almacenamientoTipo: "SSD" }),
  "i5-8250U · 8GB · 256GB SSD", "Laptop");
igual(lineaEtiqueta("Desktop", {}, { cpuModelo: "i7-9700", ramCapacidad: "No especificado", almacenamientoTipo: "No aplica" }),
  "i7-9700", "Los 'No aplica' de la ficha no se imprimen");
igual(lineaEtiqueta("SSD", {}, { almacenamientoPrincipal: "512" }), "512GB", "Un SSD recién heredado de la ficha ya tiene línea");
// El caso real de LAP-000060: la ficha decía "512" y "Core i7-1265U".
igual(lineaEtiqueta("Laptop", {}, { cpuModelo: "Core i7-1265U", ramCapacidad: "16GB", almacenamientoPrincipal: "512", almacenamientoTipo: "NVMe SSD" }),
  "i7-1265U · 16GB · 512GB NVMe SSD", "Laptop: capacidad con unidad y sin la palabra Core");
igual(lineaEtiqueta("Laptop", {}, { cpuModelo: "Intel Core i5-8250U" }), "i5-8250U", "También sin 'Intel Core'");
igual(lineaEtiqueta("Laptop", {}, { cpuModelo: "Ryzen 5 5500U" }), "Ryzen 5 5500U", "Un Ryzen queda como está");
igual(lineaEtiqueta("Laptop", {}, { cpuModelo: "M1" }), "M1", "Un Apple M1 queda como está");

// ── Integridad del catálogo ─────────────────────────────────────────────────
for (const clave of categoriasConEspecificaciones()) {
  const campos = camposDeCategoria(clave);
  const ids = campos.map((c) => c.id);
  assert(campos.length > 0, `${clave}: tiene campos`);
  assert(new Set(ids).size === ids.length, `${clave}: sin ids repetidos`);
  assert(campos.some((c) => c.enEtiqueta), `${clave}: algo va a la etiqueta`);
  for (const c of campos) {
    if (c.tipo === "select") {
      assert((c.opciones ?? []).length > 0, `${clave}.${c.id}: un select tiene opciones`);
      for (const clavesResumen of Object.keys(c.enResumen ?? {})) {
        assert((c.opciones ?? []).includes(clavesResumen), `${clave}.${c.id}: el resumen de "${clavesResumen}" es una opción real`);
      }
    }
  }
}
// Las categorías reales de Airtable que llevan datos técnicos, escritas como allá.
for (const categoria of [
  "SSD", "HDD", "Disco externo", "RAM", "Monitor", "Tarjeta gráfica", "Fuente de poder", "Batería",
  "Cargador", "Pantalla", "Teclado", "Mainboard", "Tablet", "Celular", "Consola", "Audio", "Smart Home",
  "Impresora", "Red / Wi-Fi", "Cámara / Seguridad", "Energía / Protección", "Adaptador / Dock / Lector",
]) {
  assert(camposDeCategoria(categoria).length > 0, `"${categoria}" (con tildes, como en Airtable) encuentra sus campos`);
}
for (const categoria of ["Accesorio", "Cable", "Insumo", "Repuesto", "Otro", "Laptop", "Desktop", "All in One"]) {
  assert(camposDeCategoria(categoria).length === 0, `"${categoria}" no tiene especificaciones propias`);
}

console.log(fallos ? `\n${fallos} fallo(s)` : "\n✅ especificaciones.test.ts — todos los asserts pasaron");
process.exit(fallos ? 1 : 0);
