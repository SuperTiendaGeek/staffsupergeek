import type { CrearMovimientoInput, CrearMovimientoOptions, ListarMovimientosFiltros, Movimiento, RubrosMonto } from "@/types/finanzas";
import {
  airtableMutation,
  airtableRequest,
  attachmentFromUrl,
  cleanString,
  compactFields,
  fetchRecordById,
  getClient,
  tableUrl,
  type AirtableListResponse,
  type AirtableMutationResponse,
} from "./airtable-client";
import { fetchCuentaById } from "./cuentas";
import { MOVIMIENTOS_FIELDS, mapMovimiento } from "./movimientos-fields";
import { calcularSaldoCuenta } from "./saldos";
import { conResolucionDeTablaMovimientos } from "./table-names";
import {
  RUBROS_VACIOS,
  evaluarSaldoParaEgresoOMovimientoInterno,
  inferirEstadoDistribucion,
  round2,
  validarCuentaActiva,
  validarCuentasPorTipo,
  validarSumaRubros,
  validarTransferenciaPermitida,
} from "./validaciones";

export function generarMovimientoId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = String(now.getTime()).slice(-5);
  return `MOV-${date}-${time}`;
}

function normalizarRubros(rubros?: Partial<RubrosMonto>): RubrosMonto {
  return {
    capital: rubros?.capital ?? RUBROS_VACIOS.capital,
    utilidad: rubros?.utilidad ?? RUBROS_VACIOS.utilidad,
    iva: rubros?.iva ?? RUBROS_VACIOS.iva,
    repuestoExterno: rubros?.repuestoExterno ?? RUBROS_VACIOS.repuestoExterno,
  };
}

/**
 * Única puerta de escritura de movimientos (§8 del diseño). Corre todas las
 * validaciones de integridad antes de tocar Airtable; nunca hace un POST
 * parcial ni intenta "arreglar" datos inválidos.
 */
export async function crearMovimiento(input: CrearMovimientoInput, options: CrearMovimientoOptions = {}): Promise<Movimiento> {
  if (!(input.monto > 0)) throw new Error("El monto debe ser mayor a 0.");
  if (!cleanString(input.registradoPor)) throw new Error("registradoPor es obligatorio.");

  const rubros = normalizarRubros(input.rubros);
  const estadoDistribucion = input.estadoDistribucion ?? inferirEstadoDistribucion(input.tipo, input.categoria, input.monto, rubros);
  validarSumaRubros(input.monto, rubros, estadoDistribucion);
  validarCuentasPorTipo(input.tipo, input.cuentaOrigenId, input.cuentaDestinoId, options);

  const [cuentaOrigen, cuentaDestino] = await Promise.all([
    input.cuentaOrigenId ? fetchCuentaById(input.cuentaOrigenId) : Promise.resolve(null),
    input.cuentaDestinoId ? fetchCuentaById(input.cuentaDestinoId) : Promise.resolve(null),
  ]);
  if (input.cuentaOrigenId && !cuentaOrigen) throw new Error(`Cuenta Origen ${input.cuentaOrigenId} no encontrada.`);
  if (input.cuentaDestinoId && !cuentaDestino) throw new Error(`Cuenta Destino ${input.cuentaDestinoId} no encontrada.`);
  if (cuentaOrigen) validarCuentaActiva(cuentaOrigen);
  if (cuentaDestino) validarCuentaActiva(cuentaDestino);
  if (input.tipo === "Movimiento Interno" && cuentaOrigen && cuentaDestino) {
    validarTransferenciaPermitida(cuentaOrigen, cuentaDestino);
  }

  let alertaDescuadre = false;
  if (cuentaOrigen && (input.tipo === "Movimiento Interno" || input.tipo === "Egreso" || input.tipo === "Ajuste")) {
    const saldoActual = await calcularSaldoCuenta(cuentaOrigen.id);
    alertaDescuadre = evaluarSaldoParaEgresoOMovimientoInterno(input.tipo, saldoActual, input.monto, cuentaOrigen).alertaDescuadre;
  }

  const F = MOVIMIENTOS_FIELDS;
  const fields = compactFields({
    [F.movimientoId]: generarMovimientoId(),
    [F.origen]: input.origen,
    [F.tipo]: input.tipo,
    [F.categoria]: input.categoria,
    [F.estado]: input.estado ?? "Confirmado",
    [F.cuentaOrigen]: cuentaOrigen ? [cuentaOrigen.id] : undefined,
    [F.cuentaDestino]: cuentaDestino ? [cuentaDestino.id] : undefined,
    [F.rubroCapital]: rubros.capital || undefined,
    [F.rubroUtilidad]: rubros.utilidad || undefined,
    [F.rubroIva]: rubros.iva || undefined,
    [F.rubroRepuestoExterno]: rubros.repuestoExterno || undefined,
    [F.estadoDistribucion]: estadoDistribucion,
    [F.alertaDescuadre]: alertaDescuadre,
    [F.monto]: input.monto,
    [F.montoBruto]: input.montoBruto,
    [F.montoNeto]: input.montoNeto,
    [F.comision]: input.comision,
    [F.fecha]: cleanString(input.fecha) || new Date().toISOString(),
    [F.metodo]: input.metodo,
    [F.transaccionId]: cleanString(input.transaccionId),
    [F.comprobante]: attachmentFromUrl(input.comprobanteUrl),
    [F.observacion]: cleanString(input.observacion),
    [F.registradoPor]: input.registradoPor,
    [F.fechaCreacion]: new Date().toISOString(),
    [F.abono]: input.abonoId ? [input.abonoId] : undefined,
    [F.facturaElectronica]: input.facturaElectronicaId ? [input.facturaElectronicaId] : undefined,
    [F.notaCredito]:        input.notaCreditoId ? [input.notaCreditoId] : undefined,
    [F.horariosPago]: input.horariosPagoId ? [input.horariosPagoId] : undefined,
    [F.cliente]: input.clienteId ? [input.clienteId] : undefined,
    [F.proveedor]: input.proveedorId ? [input.proveedorId] : undefined,
    [F.pagoShippingRelacionado]: input.pagoShippingId ? [input.pagoShippingId] : undefined,
    [F.reversaA]: input.reversaAId ? [input.reversaAId] : undefined,
  });

  const response = await conResolucionDeTablaMovimientos(getClient(), (nombreTabla) =>
    airtableMutation<AirtableMutationResponse>(tableUrl(nombreTabla), {
      method: "POST",
      body: JSON.stringify({ records: [{ fields }] }),
    })
  );
  const created = response.records?.[0];
  if (!created) throw new Error("Airtable no devolvió el movimiento creado.");
  return mapMovimiento(created);
}

/**
 * Corrección 1 — anular NUNCA crea un movimiento nuevo. Solo cambia el
 * estado a Anulado; la exclusión de Anulado en las fórmulas de saldo (§2.3b)
 * ES la reversión. Distinto de una Devolución (dinero que de verdad
 * regresó) — eso sí sería un movimiento nuevo real, no implementado en
 * esta fase (ver §8 del diseño de 20.1).
 *
 * Fase 20.3 §2.4 — política de cadena sobre `Reversa a`/`Compensado Por`:
 * - Si este movimiento tiene compensadores activos (hijos de una
 *   acreditación, no `Anulado`), se rechaza — anularlo rompería la
 *   identidad de conservación de dólares de §3.3/§3.7. Se listan los
 *   compensadores activos en el mensaje para que se anulen primero.
 * - Si este movimiento ES un hijo (`Reversa a` poblado) y el original que
 *   compensa sigue activo, la anulación procede igual (nunca se bloquea a
 *   sí misma) pero devuelve una advertencia explícita — mismo principio
 *   que la Corrección 1 de la Fase 20.2 con abonos ya facturados.
 */
export async function anularMovimiento(id: string, motivo: string): Promise<{ movimiento: Movimiento; warning: string | null }> {
  const recordId = cleanString(id);
  if (!recordId) throw new Error("Record ID de movimiento inválido.");

  const actual = await fetchMovimientoById(recordId);
  if (!actual) throw new Error(`Movimiento ${recordId} no encontrado.`);
  if (actual.estado === "Anulado") throw new Error("Este movimiento ya está anulado.");

  if (actual.compensadoPorIds.length > 0) {
    const compensadores = await Promise.all(actual.compensadoPorIds.map((cid) => fetchMovimientoById(cid)));
    const activos = compensadores.filter((c): c is Movimiento => !!c && c.estado !== "Anulado");
    if (activos.length > 0) {
      const detalle = activos.map((c) => `${c.movimientoId} (${c.tipo}, $${c.monto.toFixed(2)})`).join(", ");
      throw new Error(
        `No se puede anular "${actual.movimientoId}": tiene ${activos.length} movimiento(s) compensador(es) activo(s) — anúlalos primero: ${detalle}.`
      );
    }
  }

  const F = MOVIMIENTOS_FIELDS;
  const fields = compactFields({
    [F.estado]: "Anulado",
    [F.fechaAnulacion]: new Date().toISOString(),
    [F.motivoAnulacion]: cleanString(motivo) || "Sin motivo especificado.",
  });

  const response = await conResolucionDeTablaMovimientos(getClient(), (nombreTabla) =>
    airtableMutation<AirtableMutationResponse>(tableUrl(nombreTabla), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id: recordId, fields }] }),
    })
  );
  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el movimiento anulado.");
  const movimiento = mapMovimiento(updated);

  let warning: string | null = null;
  if (actual.reversaAId) {
    const original = await fetchMovimientoById(actual.reversaAId);
    if (original && original.estado !== "Anulado") {
      warning = `Este movimiento compensaba a "${original.movimientoId}" (${original.estado}) — anularlo puede dejar descuadrada la cadena de acreditación; revisa el saldo de las cuentas involucradas manualmente.`;
      console.warn("[Finanzas] Movimiento compensador anulado con original activo", {
        id: recordId,
        movimientoId: movimiento.movimientoId,
        originalId: original.id,
        originalMovimientoId: original.movimientoId,
      });
    }
  }

  return { movimiento, warning };
}

/**
 * Fase 20.3 §3.4 (Paso A) — transición Pendiente→Acreditado, exclusiva de
 * pagos en tránsito (tarjeta/PayPhone). Alcance angosto, igual criterio que
 * `actualizarMovimiento`: nunca toca `Monto`/`Cuenta Destino`/`Tipo`/
 * `Categoría` — solo `Estado del Movimiento` y los 3 campos que 20.1 dejó
 * preparados exactamente para esto (`Monto Bruto`/`Monto Neto`/`Comisión`).
 * No crea los movimientos compensatorios — eso es responsabilidad de
 * `procesarAcreditacion` (lib/finanzas/acreditacion.ts), que orquesta este
 * paso junto con los otros dos.
 */
export async function acreditarMovimientoPendiente(id: string, cambios: { montoNeto: number; fecha: string }): Promise<Movimiento> {
  const recordId = cleanString(id);
  if (!recordId) throw new Error("Record ID de movimiento inválido.");

  const actual = await fetchMovimientoById(recordId);
  if (!actual) throw new Error(`Movimiento ${recordId} no encontrado.`);
  if (actual.tipo !== "Ingreso") throw new Error(`Solo se puede acreditar un movimiento de tipo Ingreso (actual: "${actual.tipo}").`);
  if (actual.estado !== "Pendiente") throw new Error(`Solo se puede acreditar un movimiento en estado Pendiente (actual: "${actual.estado}").`);
  if (!actual.cuentaDestinoId) throw new Error("El movimiento no tiene Cuenta Destino resuelta.");

  const cuentaDestino = await fetchCuentaById(actual.cuentaDestinoId);
  if (!cuentaDestino) throw new Error(`Cuenta Destino ${actual.cuentaDestinoId} no encontrada.`);
  if (cuentaDestino.tipo !== "Tránsito") {
    throw new Error(`Solo se pueden acreditar movimientos con Cuenta Destino de tipo Tránsito (actual: "${cuentaDestino.tipo}").`);
  }

  if (!(cambios.montoNeto > 0)) throw new Error("El monto neto debe ser mayor a 0.");
  if (round2(cambios.montoNeto) > round2(actual.monto)) {
    throw new Error(`El monto neto ($${cambios.montoNeto.toFixed(2)}) no puede ser mayor al bruto ($${actual.monto.toFixed(2)}).`);
  }

  const comision = round2(actual.monto - cambios.montoNeto);
  const F = MOVIMIENTOS_FIELDS;
  const fields = compactFields({
    [F.estado]: "Acreditado",
    [F.montoBruto]: actual.montoBruto ?? actual.monto,
    [F.montoNeto]: cambios.montoNeto,
    [F.comision]: comision,
  });

  const response = await conResolucionDeTablaMovimientos(getClient(), (nombreTabla) =>
    airtableMutation<AirtableMutationResponse>(tableUrl(nombreTabla), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id: recordId, fields }] }),
    })
  );
  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el movimiento acreditado.");
  return mapMovimiento(updated);
}

/**
 * Fase 20.2 §3 — actualización de alcance angosto: nunca toca hechos
 * económicos (Monto, cuentas, Tipo, Categoría), solo el link a la Factura
 * Electrónica que formaliza el anticipo y la transición de clasificación
 * que eso implica. Usada por el Puente 2(b) para marcar como facturados los
 * movimientos de abonos ya existentes, sin duplicar el ingreso.
 */
export async function actualizarMovimiento(
  id: string,
  cambios: { facturaElectronicaId?: string; estadoDistribucion?: "Pendiente de clasificar" }
): Promise<Movimiento> {
  const recordId = cleanString(id);
  if (!recordId) throw new Error("Record ID de movimiento inválido.");

  const actual = await fetchMovimientoById(recordId);
  if (!actual) throw new Error(`Movimiento ${recordId} no encontrado.`);
  if (actual.estado === "Anulado") throw new Error("No se puede actualizar un movimiento anulado.");

  if (cambios.facturaElectronicaId) {
    const yaTieneOtra = actual.facturaElectronicaIds.some((fid) => fid !== cambios.facturaElectronicaId);
    if (yaTieneOtra) {
      throw new Error(
        `El movimiento ${recordId} ya está vinculado a otra Factura Electrónica (${actual.facturaElectronicaIds.join(", ")}) — no se puede reasignar.`
      );
    }
  }

  if (cambios.estadoDistribucion && actual.estadoDistribucion !== "Sin distribuir") {
    throw new Error(
      `Solo se permite la transición "Sin distribuir" → "Pendiente de clasificar" (estado actual: "${actual.estadoDistribucion}").`
    );
  }

  const F = MOVIMIENTOS_FIELDS;
  const fields = compactFields({
    [F.facturaElectronica]: cambios.facturaElectronicaId ? [cambios.facturaElectronicaId] : undefined,
    [F.estadoDistribucion]: cambios.estadoDistribucion,
  });
  if (Object.keys(fields).length === 0) return actual;

  const response = await conResolucionDeTablaMovimientos(getClient(), (nombreTabla) =>
    airtableMutation<AirtableMutationResponse>(tableUrl(nombreTabla), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id: recordId, fields }] }),
    })
  );
  const updated = response.records?.[0];
  if (!updated) throw new Error("Airtable no devolvió el movimiento actualizado.");
  return mapMovimiento(updated);
}

export async function fetchMovimientoById(id: string): Promise<Movimiento | null> {
  const recordId = cleanString(id);
  if (!recordId) return null;
  const record = await conResolucionDeTablaMovimientos(getClient(), (nombreTabla) => fetchRecordById(tableUrl(nombreTabla), recordId));
  return record ? mapMovimiento(record) : null;
}

function buildFiltroFormula(filtros: ListarMovimientosFiltros) {
  const partes: string[] = [];
  if (filtros.tipo) partes.push(`{${MOVIMIENTOS_FIELDS.tipo}}='${filtros.tipo}'`);
  if (filtros.categoria) partes.push(`{${MOVIMIENTOS_FIELDS.categoria}}='${filtros.categoria}'`);
  if (filtros.estado) partes.push(`{${MOVIMIENTOS_FIELDS.estado}}='${filtros.estado}'`);
  if (filtros.desde) partes.push(`IS_AFTER({${MOVIMIENTOS_FIELDS.fecha}}, '${filtros.desde}')`);
  if (filtros.hasta) partes.push(`IS_BEFORE({${MOVIMIENTOS_FIELDS.fecha}}, '${filtros.hasta}')`);
  if (!partes.length) return undefined;
  return partes.length === 1 ? partes[0] : `AND(${partes.join(",")})`;
}

/** Listado para la pantalla /finanzas y su API — filtros solo sobre campos que no son de link. */
export async function listarMovimientos(filtros: ListarMovimientosFiltros = {}): Promise<Movimiento[]> {
  const formula = buildFiltroFormula(filtros);
  const registros = await conResolucionDeTablaMovimientos(getClient(), async (nombreTabla) => {
    const records: NonNullable<AirtableListResponse["records"]> = [];
    let offset: string | undefined;
    do {
      const url = new URL(tableUrl(nombreTabla));
      url.searchParams.set("pageSize", "100");
      if (formula) url.searchParams.set("filterByFormula", formula);
      if (filtros.maxRecords) url.searchParams.set("maxRecords", String(filtros.maxRecords));
      url.searchParams.append("sort[0][field]", MOVIMIENTOS_FIELDS.fecha);
      url.searchParams.append("sort[0][direction]", "desc");
      if (offset) url.searchParams.set("offset", offset);
      const data = await airtableRequest<AirtableListResponse>(url.toString());
      records.push(...(data.records ?? []));
      offset = data.offset;
    } while (offset && (!filtros.maxRecords || records.length < filtros.maxRecords));
    return records;
  });
  return registros.map(mapMovimiento);
}
