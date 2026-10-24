/**
 * Administrar › Proveedores (auditoría Shipping V2, punto 11, 22-oct-2026).
 * Reglas puras: limpieza, validación, duplicados, uso/eliminación, escritura
 * a Airtable, historial y la regla del casillero.
 * Ejecutar: npm test proveedores-admin
 */
import {
  CAMPOS_PROVEEDOR as C,
  DATOS_VACIOS,
  buscarDuplicados,
  camposParaAirtable,
  claveNombre,
  claveTelefono,
  claveWebsite,
  datosDesdeCampos,
  describirCambios,
  enlaceDePrueba,
  erroresDeDuplicados,
  limpiarDatosProveedor,
  proveedorAdminDesdeRegistro,
  resumenUso,
  sePuedeEliminar,
  usoDesdeCampos,
  validarDatosProveedor,
  validarLogo,
  type ProveedorDatos,
} from "../proveedores-admin";
import { canBeItemLogisticsProvider, canBePurchaseProvider } from "../provider-rules";
import { getShippingV2ProveedorLabel } from "../provider-labels";
import type { ShippingV2Proveedor } from "@/types/shipping-v2";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const datos = (p: Partial<ProveedorDatos>): ProveedorDatos => ({ ...DATOS_VACIOS, ...p });

console.log("— Limpieza —");
{
  const d = limpiarDatosProveedor({
    nombre: "  Nuevo   Casillero ", tipos: ["Logístico", "Inventado", "Logístico"], pais: "Marte", esCasillero: true,
    email: " VENTAS@X.COM ", portal: false, permisosPortal: ["Ver pagos"], disenoFactura: "Raro",
  });
  assert(d.nombre === "Nuevo Casillero", "Recorta y junta espacios del nombre");
  assert(d.tipos.length === 1 && d.tipos[0] === "Logístico", "Solo tipos válidos y sin repetir");
  assert(d.pais === "", "País desconocido queda vacío");
  assert(d.esCasillero === true, "Logístico puede ser casillero");
  assert(d.email === "ventas@x.com", "Email en minúsculas");
  assert(d.permisosPortal.length === 0, "Sin portal no quedan permisos (apagarlo corta el acceso)");
  assert(d.disenoFactura === "", "Diseño desconocido queda vacío");
  const h = limpiarDatosProveedor({ nombre: "eBay", tipos: ["Hardware"], esCasillero: true });
  assert(h.esCasillero === false, "Un proveedor que no es logístico no puede ser casillero");
  const p = limpiarDatosProveedor({ portal: true, permisosPortal: ["Ver pagos", "Permiso falso", "Ver artículos"] });
  assert(p.permisosPortal.join("|") === "Ver artículos|Ver pagos", "Permisos válidos, en el orden de siempre");
  assert(limpiarDatosProveedor(null).nombre === "", "Entrada vacía no rompe");
}

console.log("\n— Validación —");
{
  const e = validarDatosProveedor(datos({}));
  assert(Boolean(e.nombre && e.tipos && e.pais), "Nombre, Provee y País son obligatorios");
  const ok = datos({ nombre: "Laarbox", tipos: ["Logístico"], pais: "Internacional" });
  assert(Object.keys(validarDatosProveedor(ok)).length === 0, "Proveedor mínimo válido");
  assert(Boolean(validarDatosProveedor({ ...ok, email: "no-es-email" }).email), "Email inválido");
  assert(Boolean(validarDatosProveedor({ ...ok, telefono: "12" }).telefono), "Teléfono demasiado corto");
  assert(!validarDatosProveedor({ ...ok, telefono: "+593 99 123 4567" }).telefono, "Teléfono con +593 y espacios es válido");
  assert(!validarDatosProveedor({ ...ok, website: "www.3rtechnology.com." }).website, "Sitio web con punto final (dato real de 3R) es válido");
  assert(Boolean(validarDatosProveedor({ ...ok, website: "no es web" }).website), "Sitio web inválido");
  assert(Boolean(validarDatosProveedor({ ...ok, plantillaUrlRastreo: "https://ups.com/track" }).plantillaUrlRastreo), "Enlace con nº sin {TRACKING}");
  assert(!validarDatosProveedor({ ...ok, plantillaUrlRastreo: "https://www.ups.com/track?tracknum={TRACKING}" }).plantillaUrlRastreo, "Enlace con {TRACKING} válido");
  assert(Boolean(validarDatosProveedor({ ...ok, permiteRastreoWeb: true }).plantillaUrlRastreo), "Rastreo web sin enlace no se permite");
  assert(Boolean(validarDatosProveedor({ ...ok, portal: true, permisosPortal: ["Ver pagos"] }).email), "Portal exige email");
  assert(Boolean(validarDatosProveedor({ ...ok, portal: true, email: "a@b.com" }).permisosPortal), "Portal exige al menos un permiso");
  assert(Boolean(validarDatosProveedor({ ...ok, nombre: "A|B" }).nombre), "El nombre no admite | (lo usa el filtro de Artículos)");
}

console.log("\n— Duplicados —");
{
  assert(claveNombre("E-Bay ") === claveNombre("ebay"), "Nombre: sin mayúsculas, guiones ni espacios");
  assert(claveNombre("Logístico") === "logistico", "Nombre: sin tildes");
  assert(claveTelefono("+593 99 123 4567") === claveTelefono("0991234567"), "Teléfono: +593 y 0 son el mismo número");
  assert(claveWebsite("https://www.3rtechnology.com/tienda") === claveWebsite("3RTECHNOLOGY.com."), "Web: sin https, www, ruta ni punto final");
  const otros = [
    { id: "recEBAY", datos: { nombre: "eBay", email: "", telefono: "", website: "" } },
    { id: "recROB", datos: { nombre: "Roberto", email: "affordablesalesebay@gmail.com", telefono: "503-610-3188", website: "" } },
    { id: "rec3R", datos: { nombre: "3R Technology", email: "", telefono: "", website: "www.3rtechnology.com." } },
    { id: "recAMZ", datos: { nombre: "Amazon", email: "", telefono: "", website: "" } },
  ];
  const d = buscarDuplicados({ nombre: "EBAY", email: "AffordableSalesEbay@gmail.com", telefono: "", website: "https://3rtechnology.com" }, otros);
  assert(d.some((x) => x.campo === "nombre" && x.proveedor === "eBay"), "Detecta nombre repetido");
  assert(d.some((x) => x.campo === "email" && x.proveedor === "Roberto"), "Detecta email repetido");
  assert(d.some((x) => x.campo === "website" && x.proveedor === "3R Technology"), "Detecta sitio web repetido");
  assert(buscarDuplicados({ nombre: "Amazon Logistics", email: "", telefono: "", website: "" }, otros).length === 0, "Amazon Logistics no es duplicado de Amazon");
  assert(buscarDuplicados({ nombre: "eBay", email: "", telefono: "", website: "" }, otros, "recEBAY").length === 0, "No se compara consigo mismo al editar");
  assert(buscarDuplicados({ nombre: "X", email: "", telefono: "5036103188", website: "" }, otros).some((x) => x.campo === "telefono"), "Detecta teléfono repetido aunque cambie el formato");
  const e = erroresDeDuplicados(d);
  assert(e.nombre === "Ya existe: eBay.", "Mensaje corto con el nombre del otro proveedor");
}

console.log("\n— Uso y eliminación —");
{
  const f = {
    "Shipping Items (Proveedor de compra)": ["rec1", "rec2"],
    "Shipping Items (Proveedor logístico / intermediario)": ["rec2", "rec3"],
    "Shipping Packings 2": ["recP"],
    "Shipping Pagos": ["recPay"],
    Opciones: ["recOp"],
    "Shipping Eventos": ["recEv1", "recEv2"],
  };
  const u = usoDesdeCampos(f);
  assert(u.articulos === 3, "Artículos sin contar dos veces el mismo");
  assert(u.cajas === 1 && u.pagos === 1 && u.opciones === 1, "Cuenta cajas, pagos y opciones de repuestos");
  assert(resumenUso(u) === "3 artículos · 1 caja · 1 pago · 1 opción", "Resumen legible del uso");
  assert(!sePuedeEliminar(u), "Usado: no se elimina");
  const soloEventos = usoDesdeCampos({ "Shipping Eventos": ["recEv1"] });
  assert(sePuedeEliminar(soloEventos), "El historial propio no cuenta como uso");
  assert(!sePuedeEliminar({ ...soloEventos, productosDigitales: 1 }), "Productos digitales con su nombre bloquean eliminar");
}

console.log("\n— Lectura de Airtable (datos reales de Roberto y Laarbox) —");
{
  const roberto = proveedorAdminDesdeRegistro({
    id: "recf2hX9g5AQYMmjx",
    createdTime: "2026-05-22T15:04:21.000Z",
    fields: {
      [C.nombre]: "Roberto", [C.estado]: "Activo", [C.tipos]: ["Hardware"], [C.pais]: "USA",
      [C.email]: "affordablesalesebay@gmail.com", [C.portal]: true,
      [C.permisosPortal]: ["Ver pagos", "Ver artículos"], [C.disenoFactura]: "Estilo_Roberto_LV",
      [C.logo]: [{ url: "https://x/logo.png", filename: "logo.png", thumbnails: { large: { url: "https://x/l.png" } } }],
      [C.columnasImportacion]: JSON.stringify({ nombre: "nombre", qty: "cantidad" }),
      "Shipping Items (Proveedor de compra)": ["a", "b"],
    },
  });
  assert(roberto.datos.permisosPortal[0] === "Ver artículos", "Permisos en orden estable");
  assert(roberto.logo?.thumbnailUrl === "https://x/l.png", "Miniatura del logo");
  assert(roberto.columnasRecordadas === 2, "Cuenta las columnas recordadas");
  assert(roberto.uso.articulos === 2, "Uso desde los vínculos");
  const laarbox = datosDesdeCampos({ [C.nombre]: "Laarbox", [C.tipos]: ["Logístico"], [C.esCasillero]: true, [C.permiteRastreoWeb]: true, [C.plantillaUrlRastreo]: "https://fenix.laarcourier.com/Tracking/?guia={TRACKING}" });
  assert(laarbox.esCasillero && laarbox.permiteRastreoWeb, "Casillero con rastreo web");
  assert(enlaceDePrueba(laarbox, "ABC 1")?.endsWith("guia=ABC%201") === true, "Probar arma el enlace con un número");
  assert(enlaceDePrueba(datos({ urlRastreo: "https://www.ups.com/track" })) === "https://www.ups.com/track", "Sin plantilla, usa la página de rastreo");
}

console.log("\n— Escritura a Airtable —");
{
  const nuevo = limpiarDatosProveedor({ nombre: "Courier X", tipos: ["Logístico"], pais: "Ecuador", email: "", notas: "" });
  const alCrear = camposParaAirtable(nuevo);
  assert(alCrear[C.nombre] === "Courier X" && Array.isArray(alCrear[C.tipos]), "Al crear manda nombre y tipos");
  assert(!(C.email in alCrear) && !(C.portal in alCrear), "Al crear no manda vacíos ni casillas apagadas");
  const despues = { ...nuevo, email: "ops@courier.ec", notas: "" };
  const alEditar = camposParaAirtable(despues, nuevo);
  assert(Object.keys(alEditar).length === 1 && alEditar[C.email] === "ops@courier.ec", "Al editar solo manda lo que cambió");
  const borrar = camposParaAirtable({ ...despues, email: "" }, despues);
  assert(borrar[C.email] === null, "Borrar un dato manda null");
  const lineas = describirCambios(
    datos({ nombre: "Roberto", portal: true, permisosPortal: ["Ver artículos", "Cerrar packing"] }),
    datos({ nombre: "Roberto", portal: true, permisosPortal: ["Ver artículos", "Ver pagos"] })
  );
  assert(lineas.length === 1 && lineas[0] === "Permisos: + Ver pagos · − Cerrar packing", "Historial de permisos con + y −");
  const l2 = describirCambios(datos({ email: "" }), datos({ email: "a@b.com" }));
  assert(l2[0] === "Email: — → a@b.com", "Historial antes → después");
}

console.log("\n— Logo —");
assert(validarLogo({ type: "image/png", size: 1000 }) === null, "PNG pequeño válido");
assert(validarLogo({ type: "application/pdf", size: 1000 }) !== null, "PDF no es logo");
assert(validarLogo({ type: "image/png", size: 5 * 1024 * 1024 }) !== null, "Más de 4 MB no");

console.log("\n— Reglas en el resto del sistema —");
{
  const base = { id: "rec", label: "", permisosPortal: [], logoProveedor: [], permiteAccesoPortalProveedor: null, permiteRastreoWeb: null } as unknown as ShippingV2Proveedor;
  const casilleroNuevo = { ...base, nombre: "MiamiBox", estado: "Activo", tiposProveedor: ["Logístico"], esCasillero: true } as ShippingV2Proveedor;
  assert(canBeItemLogisticsProvider(casilleroNuevo), "Un casillero nuevo sirve para registrar importaciones (antes fallaba)");
  assert(!canBeItemLogisticsProvider({ ...casilleroNuevo, estado: "Inactivo" }), "Un casillero inactivo no");
  assert(!canBeItemLogisticsProvider({ ...base, nombre: "Roberto", estado: "Activo", tiposProveedor: ["Hardware"] } as ShippingV2Proveedor), "Roberto (proveedor de compra) no es intermediario");
  assert(canBePurchaseProvider({ ...base, nombre: "eBay", estado: "Activo", tiposProveedor: ["Hardware"] } as ShippingV2Proveedor), "eBay es proveedor de compra");
  assert(!canBePurchaseProvider({ ...base, nombre: "eBay", estado: "Inactivo", tiposProveedor: ["Hardware"] } as ShippingV2Proveedor), "Desactivado no sale al registrar compras");
  assert(getShippingV2ProveedorLabel({ ...base, nombre: "Roberto", proveedorId: "Roberto-Hardware" } as ShippingV2Proveedor) === "Roberto", "Se muestra solo el nombre");
}

if (fallos) {
  console.error(`\n${fallos} prueba(s) fallaron`);
  process.exit(1);
}
console.log("\nTodas las pruebas de proveedores-admin pasaron.");
