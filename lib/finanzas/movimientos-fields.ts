import type { Movimiento, RubrosMonto } from "@/types/finanzas";
import { cleanString, firstLinkedId, firstNumber, linkedIds, type AirtableRecord } from "./airtable-client";

// Nombres de campo de "Movimientos Financieros" — solo los campos NUEVOS de
// esta fase (§1.3 del diseño). Los campos viejos (`Cuenta origen` select,
// `Estado de integración`) se dejan intactos y este módulo nunca los toca
// (Corrección 3 — ver docs/DISENO_FASE20_1_FUNDACION.md §1.2b).
export const MOVIMIENTOS_FIELDS = {
  // Primario — el renombrado cosmético a "Movimiento ID" queda para la
  // limpieza final; el código ya genera valores con prefijo MOV- para
  // registros nuevos sin necesidad de que el campo cambie de nombre.
  movimientoId: "Movimiento Shipping ID",
  origen: "Origen",
  tipo: "Tipo de movimiento",
  categoria: "Categoría",
  estado: "Estado del Movimiento",
  // Airtable trata los nombres de campo como case-insensitive para unicidad
  // — "Cuenta Origen" chocaba con el "Cuenta origen" (select) legacy que
  // Corrección 3 deja intacto. Se resolvió con el sufijo " (Finanzas)" en
  // ambos, por simetría (decisión tomada al ejecutar el checklist real).
  cuentaOrigen: "Cuenta Origen (Finanzas)",
  cuentaDestino: "Cuenta Destino (Finanzas)",
  rubroCapital: "Rubro Capital",
  rubroUtilidad: "Rubro Utilidad",
  rubroIva: "Rubro IVA",
  rubroRepuestoExterno: "Rubro Repuesto Externo",
  estadoDistribucion: "Estado Distribución",
  alertaDescuadre: "Alerta Descuadre",
  monto: "Monto",
  montoBruto: "Monto Bruto",
  montoNeto: "Monto Neto",
  comision: "Comisión",
  fecha: "Fecha del movimiento",
  metodo: "Método",
  transaccionId: "Transacción ID",
  comprobante: "Comprobante",
  observacion: "Observación",
  registradoPor: "Registrado por",
  fechaCreacion: "Fecha de creación",
  fechaAnulacion: "Fecha de anulación",
  motivoAnulacion: "Motivo de anulación",
  abono: "Abono",
  facturaElectronica: "Factura Electrónica",
  horariosPago: "Horarios Pago",
  cliente: "Cliente",
  proveedor: "Proveedor",
  pagoShippingRelacionado: "Pago Shipping relacionado",
  reversaA: "Reversa a",
} as const;

export function mapMovimiento(record: AirtableRecord): Movimiento {
  const f = record.fields;
  const F = MOVIMIENTOS_FIELDS;
  const rubros: RubrosMonto = {
    capital: firstNumber(f[F.rubroCapital]) ?? 0,
    utilidad: firstNumber(f[F.rubroUtilidad]) ?? 0,
    iva: firstNumber(f[F.rubroIva]) ?? 0,
    repuestoExterno: firstNumber(f[F.rubroRepuestoExterno]) ?? 0,
  };
  return {
    id: record.id,
    movimientoId: cleanString(f[F.movimientoId]) || record.id,
    origen: cleanString(f[F.origen]),
    tipo: cleanString(f[F.tipo]),
    categoria: cleanString(f[F.categoria]),
    estado: cleanString(f[F.estado]),
    estadoDistribucion: cleanString(f[F.estadoDistribucion]),
    cuentaOrigenId: firstLinkedId(f[F.cuentaOrigen]),
    cuentaDestinoId: firstLinkedId(f[F.cuentaDestino]),
    monto: firstNumber(f[F.monto]) ?? 0,
    rubros,
    alertaDescuadre: f[F.alertaDescuadre] === true,
    metodo: cleanString(f[F.metodo]) || undefined,
    fecha: cleanString(f[F.fecha]) || record.createdTime || "",
    transaccionId: cleanString(f[F.transaccionId]) || undefined,
    observacion: cleanString(f[F.observacion]) || undefined,
    registradoPor: cleanString(f[F.registradoPor]) || undefined,
    fechaCreacion: cleanString(f[F.fechaCreacion]) || record.createdTime || undefined,
    fechaAnulacion: cleanString(f[F.fechaAnulacion]) || undefined,
    motivoAnulacion: cleanString(f[F.motivoAnulacion]) || undefined,
    montoBruto: firstNumber(f[F.montoBruto]),
    montoNeto: firstNumber(f[F.montoNeto]),
    comision: firstNumber(f[F.comision]),
    abonoIds: linkedIds(f[F.abono]),
    facturaElectronicaIds: linkedIds(f[F.facturaElectronica]),
    horariosPagoIds: linkedIds(f[F.horariosPago]),
    clienteIds: linkedIds(f[F.cliente]),
    proveedorIds: linkedIds(f[F.proveedor]),
    pagoShippingIds: linkedIds(f[F.pagoShippingRelacionado]),
    reversaAId: firstLinkedId(f[F.reversaA]),
  };
}

export const ESTADOS_QUE_CUENTAN_PARA_SALDO = ["Confirmado", "Acreditado"] as const;
