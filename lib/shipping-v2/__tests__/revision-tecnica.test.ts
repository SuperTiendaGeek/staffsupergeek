// Contrato de los puntos de revisión técnica.
// Ejecutar: npx tsx lib/shipping-v2/__tests__/revision-tecnica.test.ts

import {
  camposFichaDeZonas,
  claveOpcion,
  construirZonasRevision,
  generarPuntoDeclarado,
  getPerfilRevision,
  resolverEstadoInspeccion,
  resolverEstadoZona,
  type OpcionDeclarada,
  type ResultadoPunto,
  type ZonaRevision,
} from "../revision-tecnica";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const buscarPunto = (zonas: ZonaRevision[], texto: string) =>
  zonas.flatMap((z) => z.puntos).find((p) => p.texto === texto);
const buscarZona = (zonas: ZonaRevision[], id: string) => zonas.find((z) => z.id === id);

// ─── Perfiles ───────────────────────────────────────────────────────────────

assert(getPerfilRevision("Laptop") === "laptop", "Laptop tiene su propio perfil");
assert(getPerfilRevision("Mini PC") === "desktop", "Mini PC se revisa como desktop");
assert(getPerfilRevision("Torre") === "desktop", "Torre se revisa como desktop");
assert(getPerfilRevision("SSD") === "disco", "SSD y HDD comparten perfil de disco");
assert(getPerfilRevision("HDD") === "disco", "HDD también");
assert(getPerfilRevision("Tarjeta gráfica") === "grafica", "Con tilde se reconoce igual");
assert(getPerfilRevision("Cable") === "generico", "Una categoría sin perfil propio cae en genérico");
assert(getPerfilRevision(null) === "generico", "Sin categoría, perfil genérico");
assert(getPerfilRevision("Desktop Torre HP") === "desktop", "Un texto libre que contiene la palabra sirve igual");

// ─── Declarar genera el punto ───────────────────────────────────────────────
//
// Esta es LA regla del módulo. Si se rompe, vuelve el agujero: alguien anota
// que el equipo trae lector de huella y nadie lo prueba.

const sinDeclarar = construirZonasRevision("Laptop", []);
assert(!buscarPunto(sinDeclarar, "Lector de huella reconoce"), "Sin declarar Touch ID, no existe su punto");

const conHuella = construirZonasRevision("Laptop", [{ nombre: "Touch ID", grupo: "extra" }]);
assert(!!buscarPunto(conHuella, "Lector de huella reconoce"), "Declarar Touch ID crea su punto de prueba");
assert(
  buscarPunto(conHuella, "Lector de huella reconoce")?.origen === "declarado",
  "El punto queda marcado como generado, no como base"
);
assert(
  buscarPunto(conHuella, "Lector de huella reconoce")?.declaradoDe === "Touch ID",
  "El punto recuerda qué opción lo generó"
);

// Y al revés: quitar la declaración quita el punto.
assert(
  construirZonasRevision("Laptop", []).flatMap((z) => z.puntos).length <
  conHuella.flatMap((z) => z.puntos).length,
  "Quitar la declaración quita el punto"
);

// ─── Alias y tildes ─────────────────────────────────────────────────────────

assert(claveOpcion("Cámara") === "camara", "Las tildes no cambian la clave");
assert(claveOpcion("WiFi") === "wi-fi", "WiFi y Wi-Fi son lo mismo");
assert(claveOpcion("RJ45") === "ethernet", "RJ45 es Ethernet");
assert(claveOpcion("  USB C ") === "usb-c", "Espacios de sobra no importan");
assert(claveOpcion("Lector de huella") === "touch id", "El alias en español apunta al mismo punto");

const conWifiRaro = construirZonasRevision("Laptop", [{ nombre: "wifi", grupo: "conectividad" }]);
assert(!!buscarPunto(conWifiRaro, "Wi-Fi conecta a la red"), "Escrito distinto, genera el mismo punto");

// ─── El fallback: nunca perder una opción ───────────────────────────────────
//
// El dueño puede crear opciones nuevas en el catálogo cuando quiera. Una
// opción que nadie mapeó NO puede desaparecer en silencio.

const inventada = construirZonasRevision("Laptop", [
  { nombre: "Sensor de detección facial", grupo: "extra" },
]);
const puntoInventado = inventada.flatMap((z) => z.puntos).find((p) => p.declaradoDe === "Sensor de detección facial");
assert(!!puntoInventado, "Una opción desconocida igual genera su punto");
assert(
  puntoInventado?.texto === "Probar: Sensor de detección facial",
  "El punto genérico dice qué hay que probar"
);
assert(puntoInventado?.critico === false, "Un punto inventado no se asume crítico");

// ─── Zona que no existe en el perfil ────────────────────────────────────────
//
// Un monitor no tiene touchpad. Si alguien declara Touch ID en un monitor, el
// punto no puede caer en una zona inexistente y perderse.

const monitorRaro = construirZonasRevision("Monitor", [{ nombre: "Touch ID", grupo: "extra" }]);
const enMonitor = monitorRaro.flatMap((z) => z.puntos).find((p) => p.declaradoDe === "Touch ID");
assert(!!enMonitor, "En un monitor, un extra sin zona propia no se pierde");
assert(
  !!buscarZona(monitorRaro, "extras")?.puntos.some((p) => p.declaradoDe === "Touch ID"),
  "Cae en la zona del grupo, no en una zona inexistente"
);

// ─── Sin duplicados ─────────────────────────────────────────────────────────

const dobleEthernet = construirZonasRevision("Laptop", [
  { nombre: "Ethernet", grupo: "conectividad" },
  { nombre: "Ethernet", grupo: "puerto" },
]);
const cuantos = dobleEthernet.flatMap((z) => z.puntos).filter((p) => p.declaradoDe === "Ethernet").length;
assert(cuantos === 1, "Ethernet declarado en dos catálogos se prueba una sola vez");

// ─── Zonas vacías no se muestran ────────────────────────────────────────────

const laptopPelada = construirZonasRevision("Laptop", []);
assert(!buscarZona(laptopPelada, "conectividad"), "Sin nada declarado, la zona Conectividad no aparece");
assert(!!buscarZona(laptopPelada, "pantalla"), "Las zonas con puntos fijos sí aparecen siempre");
assert(
  laptopPelada.every((z) => z.puntos.length > 0),
  "Ninguna zona visible queda sin puntos"
);
assert(
  laptopPelada.map((z) => z.numero).join(",") === laptopPelada.map((_, i) => i + 1).join(","),
  "La numeración es correlativa sobre las zonas visibles"
);

// ─── Criticidad ─────────────────────────────────────────────────────────────

assert(
  generarPuntoDeclarado("Pantalla táctil", "extra", new Set(["pantalla"])).critico === true,
  "El táctil declarado es crítico: si no funciona, no se vende como táctil"
);
assert(
  generarPuntoDeclarado("Bluetooth", "conectividad", new Set(["conectividad"])).critico === false,
  "Bluetooth no bloquea la venta"
);
assert(
  buscarZona(laptopPelada, "bateria")?.critica === true,
  "Una zona con algún punto crítico es crítica"
);

// ─── Captura de ficha ───────────────────────────────────────────────────────

const campos = camposFichaDeZonas(laptopPelada).map((c) => c.campo);
for (const esperado of ["pantallaTamano", "pantallaResolucion", "ramCapacidad", "ramTipo",
  "almacenamientoPrincipal", "almacenamientoTipo", "bateriaSalud", "sistemaOperativo"]) {
  assert(campos.includes(esperado), `La inspección de laptop captura ${esperado} para la ficha`);
}
// La capacidad de almacenamiento se captura, no solo el tipo. (Se me había escapado.)
assert(
  buscarZona(laptopPelada, "disco")?.captura.some((c) => c.campo === "almacenamientoPrincipal") === true,
  "El almacenamiento captura capacidad además de tipo"
);
// Un equipo con SSD de arranque + HDD de datos tiene que caber entero.
assert(
  buscarZona(laptopPelada, "disco")?.captura.some((c) => c.campo === "almacenamiento2") === true,
  "Se puede anotar una segunda unidad de almacenamiento"
);
assert(
  buscarZona(laptopPelada, "disco")?.captura.some((c) => c.campo === "almacenamiento2Tipo") === true,
  "...con su propio tipo"
);
// Un monitor no tiene batería ni RAM que anotar.
const monitor = construirZonasRevision("Monitor", []);
assert(!camposFichaDeZonas(monitor).some((c) => c.campo === "bateriaSalud"), "Un monitor no captura salud de batería");

// ─── Estado de zona ─────────────────────────────────────────────────────────

const zPantalla = buscarZona(laptopPelada, "pantalla")!;
const ids = zPantalla.puntos.map((p) => p.id);
assert(resolverEstadoZona(zPantalla, {}) === "", "Sin nada marcado, la zona está vacía");
assert(resolverEstadoZona(zPantalla, { [ids[0]]: "ok" }) === "parcial", "Marcada a medias es parcial");

const todoOk: Record<string, ResultadoPunto> = {};
ids.forEach((id) => { todoOk[id] = "ok"; });
assert(resolverEstadoZona(zPantalla, todoOk) === "ok", "Todo OK deja la zona conforme");

const conFalla = { ...todoOk, [ids[1]]: "falla" as ResultadoPunto };
assert(resolverEstadoZona(zPantalla, conFalla) === "falla", "Una sola falla marca la zona con falla");

const todoNa: Record<string, ResultadoPunto> = {};
ids.forEach((id) => { todoNa[id] = "na"; });
assert(resolverEstadoZona(zPantalla, todoNa) === "na", "Todo N/A deja la zona como no aplica");

// ─── Estado de la inspección ────────────────────────────────────────────────

function marcarTodo(zonas: ZonaRevision[], valor: ResultadoPunto) {
  const r: Record<string, ResultadoPunto> = {};
  zonas.forEach((z) => z.puntos.forEach((p) => { r[p.id] = valor; }));
  return r;
}

const nada = resolverEstadoInspeccion({ zonas: laptopPelada, resultados: {}, equipamientoConfirmado: false });
assert(!nada.completa, "Sin nada hecho la inspección no está completa");
assert(nada.motivo.includes("confirmar"), "El primer motivo que se muestra es confirmar el equipamiento");

const soloConfirmado = resolverEstadoInspeccion({ zonas: laptopPelada, resultados: {}, equipamientoConfirmado: true });
assert(!soloConfirmado.completa, "Confirmar el equipamiento no basta");
assert(soloConfirmado.zonasPendientes.length === laptopPelada.length, "Todas las zonas quedan pendientes");

const sinConfirmar = resolverEstadoInspeccion({
  zonas: laptopPelada, resultados: marcarTodo(laptopPelada, "ok"), equipamientoConfirmado: false,
});
assert(!sinConfirmar.completa, "Probar todo sin confirmar el equipamiento no cierra la inspección");

const listo = resolverEstadoInspeccion({
  zonas: laptopPelada, resultados: marcarTodo(laptopPelada, "ok"), equipamientoConfirmado: true,
});
assert(listo.completa, "Confirmado y todo probado: la inspección está completa");
assert(listo.zonasResueltas === laptopPelada.length, "Cuenta bien las zonas resueltas");

// El punto clave: una FALLA no impide cerrar. Es un resultado, no un pendiente.
const conFallaCritica = { ...marcarTodo(laptopPelada, "ok") };
const puntoCritico = laptopPelada.flatMap((z) => z.puntos).find((p) => p.critico)!;
conFallaCritica[puntoCritico.id] = "falla";
const cerrable = resolverEstadoInspeccion({
  zonas: laptopPelada, resultados: conFallaCritica, equipamientoConfirmado: true,
});
assert(cerrable.completa, "Una falla crítica NO impide cerrar la inspección: es un resultado");
assert(cerrable.fallasCriticas.length === 1, "Pero la falla crítica queda listada");
assert(
  cerrable.motivo.includes("publicación"),
  "El mensaje explica que lo que se bloquea es la publicación, no el cierre"
);

// Un punto sin marcar SÍ impide cerrar. Sin marcar no es falla.
const unoSinMarcar = { ...marcarTodo(laptopPelada, "ok") };
delete unoSinMarcar[laptopPelada[0].puntos[0].id];
assert(
  !resolverEstadoInspeccion({ zonas: laptopPelada, resultados: unoSinMarcar, equipamientoConfirmado: true }).completa,
  "Un punto sin marcar sí deja la inspección incompleta"
);

// Todo N/A también cierra: "no aplica" es una respuesta.
assert(
  resolverEstadoInspeccion({
    zonas: laptopPelada, resultados: marcarTodo(laptopPelada, "na"), equipamientoConfirmado: true,
  }).completa,
  "Marcar todo como No aplica también completa la inspección"
);

// ─── Los repuestos tienen su propia revisión ────────────────────────────────

const ssd = construirZonasRevision("SSD", []);
assert(ssd.length > 0, "Un SSD tiene puntos de revisión");
assert(
  !!buscarPunto(ssd, "Borrado seguro de datos del dueño anterior"),
  "Un disco que se vende suelto SÍ exige borrado seguro: los datos se van con él"
);
assert(
  !buscarPunto(laptopPelada, "Borrado seguro de datos del dueño anterior"),
  "En una laptop no se pide, porque instalar Windows limpio ya formatea"
);

const cable = construirZonasRevision("Cable", []);
assert(cable.length === 1, "Un cable tiene una sola zona");
assert(cable[0].puntos.length >= 3, "Pero igual tiene sus puntos: nada queda sin revisar");

// ── Categorías creadas en 2026-09 ──────────────────────────────────────────
// "Disco externo" usa el perfil de disco. Las demás todavía no tienen perfil
// propio y caen en genérico — y NINGUNA puede caer por accidente en otro perfil
// por el atajo de "el nombre contiene la palabra" (p. ej. "cámara" y "ram").
// Cada categoría nueva tiene ya su perfil propio (2026-09-20).
for (const [categoria, perfil] of [
  ["Disco externo", "disco-externo"], ["Smart Home", "smarthome"], ["Audio", "audio"],
  ["Adaptador / Dock / Lector", "adaptador"], ["Insumo", "insumo"], ["Impresora", "impresora"],
  ["Energía / Protección", "energia"], ["Red / Wi-Fi", "red"], ["Cámara / Seguridad", "camara"],
  ["Celular", "celular"],
] as [string, string][]) {
  assert(getPerfilRevision(categoria) === perfil, `${categoria} usa el perfil ${perfil}`);
  const zonas = construirZonasRevision(categoria, []);
  assert(zonas.length > 0, `${categoria} tiene zonas de inspección`);
  assert(zonas.every((z) => z.puntos.length > 0), `${categoria}: ninguna zona queda vacía sin nada declarado`);
  assert(zonas.some((z) => z.critica), `${categoria} tiene al menos un punto crítico`);
}

// Puntos que definen a cada categoría: si desaparecen, algo se rompió.
const buscaTexto = (categoria: string, texto: string) =>
  construirZonasRevision(categoria, []).flatMap((z) => z.puntos).some((p) => p.texto === texto);
assert(buscaTexto("Celular", "IMEI sin reporte"), "Un celular se revisa contra reporte de IMEI");
assert(buscaTexto("Impresora", "Imprime página de prueba"), "Una impresora imprime una página de prueba");
assert(buscaTexto("Disco externo", "Borrado seguro de datos del dueño anterior"),
  "Un disco externo también se borra: se lleva los datos del dueño anterior");
assert(buscaTexto("Insumo", "Empaque sellado y sin daño"), "Un insumo se revisa por empaque, no por funcionamiento");

// El rescate de puntos declarados: un perfil sin zona "conectividad" no puede
// tragarse el punto de un Bluetooth declarado.
{
  const conBluetooth = construirZonasRevision("RAM", [{ nombre: "Bluetooth", grupo: "conectividad" }]);
  const textos = conBluetooth.flatMap((z) => z.puntos).map((p) => p.texto);
  assert(
    textos.some((t) => /bluetooth/i.test(t)),
    `Lo declarado nunca se pierde, aunque el perfil no tenga esa zona (vino: ${textos.join(", ")})`
  );
}

// ── El caso de LAP-000048 (2026-09-20) ─────────────────────────────────────
// Una laptop vieja, sin conectividad, puertos ni extras declarados. Alexis
// marcó los 25 puntos y el botón Finalizar seguía apagado: faltaba confirmar
// el equipamiento, y desde el pie de página no había manera de llegar ahí.
{
  const laptopVacia = construirZonasRevision("Laptop", []);
  assert(
    laptopVacia.every((z) => z.puntos.length > 0),
    "Sin nada declarado, no queda ninguna zona vacía (una zona sin puntos sería imposible de resolver)"
  );

  const todoOk: Record<string, ResultadoPunto> = {};
  for (const zona of laptopVacia) for (const punto of zona.puntos) todoOk[punto.id] = "ok";

  const sinConfirmar = resolverEstadoInspeccion({
    zonas: laptopVacia, resultados: todoOk, equipamientoConfirmado: false,
  });
  assert(!sinConfirmar.completa, "Con todo marcado pero sin confirmar, todavía no se puede firmar");
  assert(sinConfirmar.zonasPendientes.length === 0, "…y el motivo NO son zonas pendientes: están todas resueltas");
  assert(
    /confirmar/i.test(sinConfirmar.motivo),
    `El motivo dice que falta confirmar (vino "${sinConfirmar.motivo}")`
  );

  const confirmada = resolverEstadoInspeccion({
    zonas: laptopVacia, resultados: todoOk, equipamientoConfirmado: true,
  });
  assert(confirmada.completa, "Al confirmar el equipamiento, la inspección se puede firmar");
}

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}
console.log("✅ revision-tecnica.test.ts — todos los asserts pasaron");
