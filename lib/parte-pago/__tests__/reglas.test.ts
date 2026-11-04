/**
 * Test — parte de pago (2-nov-2026).
 * Ejecutar: npm test parte-pago
 */
import fs from "fs";
import {
  CATEGORIA_FINANZAS_PARTE_DE_PAGO, METODO_PARTE_DE_PAGO,
  notaArticuloParteDePago, observacionParteDePago, validarAnularParteDePago, validarParteDePago,
} from "../reglas";
import { MAPA_METODO_PAGO_SRI } from "@/lib/facturacion/gancho/config";
import { calcularFormasPago } from "@/lib/facturacion/gancho/construccion";
import { METODOS_VIGENTES } from "@/lib/cobros/metodos";
import { tipoOperacionPermitido, TIPOS_OPERACION_POR_ORIGEN, TIPO_PARTE_DE_PAGO } from "@/lib/shipping-v2/item-origen";
import { getDefaultItemFlowByOperation } from "@/lib/shipping-v2/item-operation-rules";
import { requiereInspeccionPorDefecto } from "@/lib/shipping-v2/item-venta";
import { MOTIVOS_KARDEX } from "@/lib/shipping-v2/kardex";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const ctx = { porCobrar: 55, categorias: ["SSD", "Laptop"], condiciones: ["Usado", "Nuevo"] };

// ── OR000522: Curi Teran debía $55 y dejó su SSD de 180 GB por $20 ──────────
{
  const v = validarParteDePago({ descripcion: "  SSD 180 GB SATA 2.5\" ", categoria: "SSD", condicion: "Usado", valor: 20 }, ctx);
  assert(v.ok && v.valor === 20 && v.descripcion === "SSD 180 GB SATA 2.5\"", "parte de pago válida (descripción limpia)");
}
assert(!validarParteDePago({ descripcion: "SSD", categoria: "SSD", condicion: "Usado", valor: 60 }, ctx).ok, "no puede valer más de lo que falta cobrar");
assert(validarParteDePago({ descripcion: "SSD", categoria: "SSD", condicion: "Usado", valor: 55 }, ctx).ok, "puede cubrir todo lo que falta");
assert(!validarParteDePago({ descripcion: "SSD", categoria: "SSD", condicion: "Usado", valor: 0 }, ctx).ok, "valor $0: no");
assert(!validarParteDePago({ descripcion: "SSD", categoria: "SSD", condicion: "Usado", valor: 10 }, { ...ctx, porCobrar: 0 }).ok, "cuenta sin nada por cobrar: no");
assert(!validarParteDePago({ descripcion: "SSD", categoria: "Otra cosa", condicion: "Usado", valor: 10 }, ctx).ok, "categoría desconocida: no");
assert(!validarParteDePago({ descripcion: "SSD", categoria: "SSD", condicion: "", valor: 10 }, ctx).ok, "sin condición: no");
assert(!validarParteDePago({ descripcion: "x", categoria: "SSD", condicion: "Usado", valor: 10 }, ctx).ok, "sin descripción: no");

assert(observacionParteDePago("SSD 180 GB", "SSD-000030") === "Parte de pago: SSD 180 GB (SSD-000030)", "el abono dice qué y su SKU (así se encuentra al anular)");
assert(notaArticuloParteDePago({ cliente: "Curi Teran", referencia: "OR000522", valor: 20, registradoPor: "Maritza", fecha: "2026-10-26" }).includes("OR000522 por $20.00"), "nota del artículo: de quién y por cuánto");

// ── Anular: solo administrador y con el artículo libre ──────────────────────
const libre = { sku: "SSD-000030", estado: "Disponible", cantidad: 1, cantidadReservada: 0 };
assert(!validarAnularParteDePago({ esAdmin: false, articulo: libre }).ok, "un empleado no la anula");
assert(validarAnularParteDePago({ esAdmin: true, articulo: libre }).ok, "el administrador sí, si el artículo sigue libre");
assert(!validarAnularParteDePago({ esAdmin: true, articulo: { ...libre, estado: "Vendido", cantidad: 0 } }).ok, "ya vendido: no");
assert(!validarAnularParteDePago({ esAdmin: true, articulo: { ...libre, cantidadReservada: 1 } }).ok, "apartado para otro cliente: no");

// ── Dinero y SRI ─────────────────────────────────────────────────────────────
assert(METODO_PARTE_DE_PAGO === "Parte de pago" && CATEGORIA_FINANZAS_PARTE_DE_PAGO === "Parte de pago de cliente", "nombres fijos");
assert(!(METODOS_VIGENTES as readonly string[]).includes(METODO_PARTE_DE_PAGO), "no se ofrece en 'Registrar pago': tiene su propio botón");
assert(MAPA_METODO_PAGO_SRI[METODO_PARTE_DE_PAGO] === "15", "ante el SRI es compensación de deudas (15)");
{
  const pagos = calcularFormasPago([
    { metodoPago: "Efectivo", monto: 125, numeroTransaccion: null },
    { metodoPago: METODO_PARTE_DE_PAGO, monto: 20, numeroTransaccion: null },
    { metodoPago: "Tarjeta de crédito", monto: 5, numeroTransaccion: null },
  ], 150);
  assert(pagos.length === 3 && pagos[1].formaPago === "15" && pagos[1].total === 20, "la factura de OR000522 lleva $20 como compensación (15)");
}
const puente = fs.readFileSync("lib/finanzas/puentes/abonos.ts", "utf8");
assert(puente.includes('metodo === "Parte de pago"'), "el puente de abonos no crea un 'Anticipo Cliente' por la parte de pago");

// ── Inventario ───────────────────────────────────────────────────────────────
assert(tipoOperacionPermitido("Ya está en la tienda", TIPO_PARTE_DE_PAGO), "nace ya en la tienda");
assert(!tipoOperacionPermitido("Proveedor extranjero", TIPO_PARTE_DE_PAGO), "nunca viene de afuera");
assert(!TIPOS_OPERACION_POR_ORIGEN["Ya está en la tienda"].includes(TIPO_PARTE_DE_PAGO), "no aparece en 'Registrar compra'");
{
  const f = getDefaultItemFlowByOperation({ tipoOperacion: TIPO_PARTE_DE_PAGO });
  assert(!f.requierePago && !f.requierePacking && f.modoLogistico === "No aplica", "sin pago a proveedor ni logística");
}
assert(requiereInspeccionPorDefecto({ categoria: "Cargador", tipoOperacion: TIPO_PARTE_DE_PAGO }), "siempre se revisa antes de venderse");
assert((MOTIVOS_KARDEX as readonly string[]).includes("Parte de pago del cliente"), "entra al Kardex con su propio motivo");

// ── Pantalla y permisos ──────────────────────────────────────────────────────
const panel = fs.readFileSync("components/cuenta-unificada/CuentaUnificadaPanel.tsx", "utf8");
assert(panel.includes("<ParteDePagoAccion"), "la cuenta (orden y pedido) ofrece 'Parte de pago'");
const anular = fs.readFileSync("app/api/tecnicos/abonos-por-orden/[id]/route.ts", "utf8");
assert(anular.indexOf("prepararAnulacionParteDePago(") < anular.indexOf("anularAbonoPorOrden("), "anular revisa la parte de pago ANTES de anular el abono");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
