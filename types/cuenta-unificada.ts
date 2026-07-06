// Tipos de la cuenta unificada Orden↔Operación (Fase 11).
// Ver lib/cuenta-unificada/index.ts para la implementación del servicio.

export type ModoRepuestos = "legacy" | "v2";

export type CuentaUnificadaItemOrigen = "pedido" | "stock";

export interface CuentaUnificadaItem {
  id: string;
  nombre: string;
  origen: CuentaUnificadaItemOrigen;
  precio: number;
  cubierto: number;
  saldo: number;
}

export interface CuentaUnificadaServicio {
  id: string;
  nombre: string;
  costo: number;
}

// Renglón de la tabla legacy "Repuestos por Orden". Se muestra SIEMPRE que
// existan filas (pestaña "Repuestos históricos"), independientemente de si
// el monto ya cuenta o no en el total — eso lo indica
// CuentaUnificada.repuestosHistoricosCuentanParaTotal (un solo valor para
// toda la orden, no por renglón).
export interface CuentaUnificadaRepuestoHistorico {
  id: string;
  nombre: string;
  cantidad: number | null;
  precioCliente: number | null;
  subtotal: number;
}

export type CuentaUnificadaAbonoOrigen = "orden" | "operacion";

export interface CuentaUnificadaAbono {
  id: string;
  idAbono: string | null;
  fecha: string | null;
  monto: number;
  metodoPago: string | null;
  estado: string;
  origen: CuentaUnificadaAbonoOrigen;
  observacion: string | null;
}

export interface CuentaUnificada {
  ordenId: string | null;
  ordenIdVisible: string | null;
  operacionId: string | null;
  operacionCodigo: string | null;
  // null cuando no hay orden vinculada (el modo de repuestos solo aplica a la orden).
  modoRepuestos: ModoRepuestos | null;
  items: CuentaUnificadaItem[];
  servicios: CuentaUnificadaServicio[];
  // Siempre poblado si la orden tiene filas en "Repuestos por Orden", sin
  // importar el modo — es de solo lectura, nunca se escribe desde Etapa 2.
  repuestosHistoricos: CuentaUnificadaRepuestoHistorico[];
  // true solo si esos renglones históricos efectivamente suman en totalCuenta
  // (orden modo legacy, sin operación vinculada). En cualquier otro caso son
  // referencia histórica y no suman.
  repuestosHistoricosCuentanParaTotal: boolean;
  // Incluye abonos anulados (con su estado) para que la UI los pueda mostrar tachados;
  // los totales de abajo ya los excluyen.
  abonos: CuentaUnificadaAbono[];
  totalCuenta: number;
  totalAbonado: number;
  // Positivo = saldo pendiente. Negativo = saldo a favor del cliente.
  saldo: number;
}

export type GetCuentaUnificadaInput = { ordenId: string } | { operacionId: string };
