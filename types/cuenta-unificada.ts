// Tipos de la cuenta unificada Orden↔Operación (Fase 11).
// Ver lib/cuenta-unificada/index.ts para la implementación del servicio.

export type ModoRepuestos = "legacy" | "v2";

export type CuentaUnificadaItemOrigen = "pedido" | "stock";

// Sin cobertura por renglón a propósito. El cliente le paga a la CUENTA, no a
// un renglón: el único saldo con sentido es CuentaUnificada.saldo.
//
// Hasta aquí se exponían `cubierto` y `saldo` leídos de los campos calculados
// de Airtable "Total Cubierto" y "Saldo Item". Ese par nunca repartió nada:
// "Total Cubierto" es un rollup del `Total Abonado` COMPLETO de la operación
// vinculada, así que (a) cada item de una operación recibía el abono íntegro
// sin prorratear, (b) los items de stock —que no tienen link a operación—
// quedaban siempre en cubierto 0, y (c) servicios y productos digitales nunca
// participaron. Resultado real en OR000382: la batería de $90 decía "Saldado ·
// Cubierto $135" y el ventilador de $20 decía "Pendiente $20", con el cliente
// habiendo pagado el total. Los campos siguen existiendo en Airtable; el
// código ya no los lee.
export interface CuentaUnificadaItem {
  id: string;
  nombre: string;
  origen: CuentaUnificadaItemOrigen;
  precio: number;
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

// "ambos" = el registro de Abonos lleva a la vez "Aplicado a: Orden" y
// "Aplicado a: Operación" (es lo que escriben createAbonoPorOrden y crearAbono
// cuando el par orden↔operación existe, y de lo que depende Finanzas para la
// referencia legible del movimiento). Es UN solo abono, no dos.
export type CuentaUnificadaAbonoOrigen = "orden" | "operacion" | "ambos";

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
  // Componentes de totalCuenta, expuestos para que las pantallas los pinten
  // sin recalcular nada (p.ej. el bloque "Repuestos"/"Servicios" del resumen
  // financiero de la orden). Se leen de rollups de Airtable donde ya existen
  // (Costo Total Servicios NV, Total Productos Digitales) en vez de sumar en
  // JS — el código lee, Airtable calcula donde ya hay rollup.
  totalRepuestos: number;
  totalServicios: number;
  totalProductosDigitales: number;
  totalCuenta: number;
  totalAbonado: number;
  // Positivo = saldo pendiente. Negativo = saldo a favor del cliente.
  saldo: number;
}

export type GetCuentaUnificadaInput = { ordenId: string } | { operacionId: string };
