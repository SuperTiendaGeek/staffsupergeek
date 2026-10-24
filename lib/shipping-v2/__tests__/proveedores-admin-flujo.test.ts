/**
 * Administrar › Proveedores de punta a punta (punto 11, 22-oct-2026) contra el
 * doble de Airtable: crear, duplicado bloqueado, editar con historial,
 * desactivar, eliminar solo sin uso y lo que ve el resto del sistema.
 * Ejecutar: npm test proveedores-admin-flujo
 */
import {
  actualizarProveedorAdmin,
  cambiarEstadoProveedorAdmin,
  crearProveedorAdmin,
  eliminarProveedorAdmin,
  getHistorialProveedorAdmin,
  getProveedoresAdmin,
  getShippingV2Proveedores,
} from "../airtable";
import { CAMPOS_PROVEEDOR as C, ErrorValidacionProveedor } from "../proveedores-admin";
import { canBeItemLogisticsProvider, canBePurchaseProvider } from "../provider-rules";
import { SHIPPING_V2_TABLES } from "../schema.generated";
import {
  activarEnvFalso,
  construirFetchDouble,
  crearEstadoDouble,
  crearRegistroDouble,
  registrarTablaDouble,
} from "../../finanzas/__tests__/_airtableDouble";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}
async function rechaza(fn: () => Promise<unknown>, fragmento: string, msg: string) {
  try {
    await fn();
    assert(false, `${msg} (debía fallar)`);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    assert(m.includes(fragmento), m.includes(fragmento) ? msg : `${msg} → recibido: ${m}`);
  }
}

const T = SHIPPING_V2_TABLES;
const TABLA_DIGITALES = "Productos Digitales";

activarEnvFalso();
const state = crearEstadoDouble("Movimientos Financieros");
for (const t of [T.proveedores, T.eventos, TABLA_DIGITALES]) registrarTablaDouble(state, t);
const ebay = crearRegistroDouble(state, T.proveedores, {
  [C.proveedorId]: "eBay-Hardware", [C.nombre]: "eBay", [C.estado]: "Activo", [C.tipos]: ["Hardware"], [C.pais]: "USA",
  "Shipping Items (Proveedor de compra)": ["recItem1", "recItem2"],
});
crearRegistroDouble(state, T.proveedores, { [C.nombre]: "G2A", [C.estado]: "Activo", [C.tipos]: ["Software"], [C.pais]: "Internacional" });
crearRegistroDouble(state, TABLA_DIGITALES, { Proveedor: "G2A" });

const base = construirFetchDouble(state);
const proveedores = () => state.otras.get(T.proveedores)!;
global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const seg = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  const tabla = seg[2];
  const metodo = (init?.method ?? "GET").toUpperCase();
  if (metodo === "DELETE") {
    state.otras.get(tabla)?.delete(seg[3]);
    return new Response(JSON.stringify({ deleted: true, id: seg[3] }), { status: 200 });
  }
  const formula = url.searchParams.get("filterByFormula") ?? "";
  const digitales = formula.match(/^LOWER\(TRIM\(\{Proveedor\}&''\)\)='([^']*)'$/);
  if (metodo === "GET" && digitales) {
    const records = [...(state.otras.get(tabla)?.values() ?? [])].filter((r) => String(r.fields.Proveedor ?? "").trim().toLowerCase() === digitales[1]);
    return new Response(JSON.stringify({ records }), { status: 200 });
  }
  const res = await base(input as string, init);
  // Airtable mantiene el vínculo inverso "Shipping Eventos" del proveedor.
  if (metodo === "POST" && tabla === T.eventos) {
    for (const ev of state.otras.get(T.eventos)!.values()) {
      for (const pid of (ev.fields["Proveedor relacionado"] as string[] | undefined) ?? []) {
        const p = proveedores().get(pid);
        if (!p) continue;
        const lista = (p.fields[C.eventos] as string[] | undefined) ?? [];
        if (!lista.includes(ev.id)) p.fields[C.eventos] = [...lista, ev.id];
      }
    }
  }
  return res;
}) as typeof fetch;

async function main() {
  const quien = { registradoPor: "Alexis Bolaños" };

  console.log("— Crear —");
  const nuevo = await crearProveedorAdmin(
    { nombre: "MiamiBox", tipos: ["Logístico"], pais: "Miami / Casillero", esCasillero: true, email: "OPS@miamibox.com", permiteRastreoWeb: true, plantillaUrlRastreo: "https://miamibox.com/t?g={TRACKING}" },
    quien
  );
  assert(nuevo.estado === "Activo", "Nace activo");
  assert(nuevo.datos.email === "ops@miamibox.com" && nuevo.datos.esCasillero, "Guarda email limpio y casillero");
  const registro = proveedores().get(nuevo.id)!;
  assert(!(C.telefono in registro.fields), "No escribe campos vacíos");
  const lista = await getShippingV2Proveedores();
  const miami = lista.find((p) => p.id === nuevo.id)!;
  assert(miami.label === "MiamiBox", "El resto del sistema lo ve con su nombre");
  assert(canBeItemLogisticsProvider(miami), "Ya sirve como casillero al registrar una importación");
  assert(!canBePurchaseProvider(miami), "Un logístico puro no es proveedor de compra");
  assert(lista.find((p) => p.id === ebay)?.label === "eBay", "eBay ya no se ve como eBay-Hardware");

  await rechaza(() => crearProveedorAdmin({ nombre: "E-BAY", tipos: ["Hardware"], pais: "USA" }, quien), "Ya existe: eBay", "Nombre duplicado bloqueado");
  await rechaza(() => crearProveedorAdmin({ nombre: "Otro", tipos: ["Hardware"], pais: "USA", email: "ops@MiamiBox.com" }, quien), "MiamiBox", "Email duplicado bloqueado");
  await rechaza(() => crearProveedorAdmin({ nombre: "", tipos: [], pais: "" }, quien), "Escribe el nombre", "Datos incompletos");
  try {
    await crearProveedorAdmin({ nombre: "Sin país", tipos: ["Otro"] }, quien);
  } catch (e) {
    assert(e instanceof ErrorValidacionProveedor && Boolean(e.errores.pais), "El error dice qué campo falta");
  }

  console.log("\n— Editar con historial —");
  const editado = await actualizarProveedorAdmin(nuevo.id, { ...nuevo.datos, telefono: "0991234567", portal: true, permisosPortal: ["Ver packings"] }, quien);
  assert(editado.datos.telefono === "0991234567" && editado.datos.portal, "Guarda teléfono y portal");
  const sinCambios = await actualizarProveedorAdmin(nuevo.id, editado.datos, quien);
  assert(sinCambios.datos.telefono === "0991234567", "Guardar sin cambios no rompe");
  const historial = await getHistorialProveedorAdmin(nuevo.id);
  assert(historial.length === 2, `Historial: creado + 1 cambio (hay ${historial.length})`);
  assert(historial.some((h) => h.descripcion.includes("Teléfono: — → 0991234567") && h.registradoPor === "Alexis Bolaños"), "El historial dice qué cambió y quién");
  const apagar = await actualizarProveedorAdmin(nuevo.id, { ...editado.datos, portal: false }, quien);
  assert(!apagar.datos.portal && apagar.datos.permisosPortal.length === 0, "Apagar el portal quita los permisos");

  console.log("\n— Desactivar y eliminar —");
  const inactivo = await cambiarEstadoProveedorAdmin(ebay, false, quien);
  assert(inactivo.estado === "Inactivo", "Desactivar");
  const ebaySistema = (await getShippingV2Proveedores()).find((p) => p.id === ebay)!;
  assert(!canBePurchaseProvider(ebaySistema), "Desactivado no sale al registrar compras");
  await rechaza(() => eliminarProveedorAdmin(ebay, quien), "solo se puede desactivar", "eBay tiene artículos: no se elimina");
  const g2a = (await getProveedoresAdmin()).find((p) => p.datos.nombre === "G2A")!;
  await rechaza(() => eliminarProveedorAdmin(g2a.id, quien), "producto digital", "G2A tiene productos digitales con su nombre: no se elimina");
  const r = await eliminarProveedorAdmin(nuevo.id, quien);
  assert(r.eliminado && !proveedores().has(nuevo.id), "Proveedor sin uso se elimina");
  const reactivado = await cambiarEstadoProveedorAdmin(ebay, true, quien);
  assert(reactivado.estado === "Activo", "Reactivar");

  if (fallos) {
    console.error(`\n${fallos} prueba(s) fallaron`);
    process.exit(1);
  }
  console.log("\nFlujo de Administrar › Proveedores OK.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
