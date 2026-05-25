export type ShippingV2ItemOperationRuleInput = {
  tipoOperacion?: string;
  categoria?: string;
  tipoItem?: string;
  proveedorCompra?: string;
  proveedorLogistico?: string;
  origenFisicoActual?: string;
  estadoItem?: string;
};

export type ShippingV2ItemFlowDefaults = {
  requierePago: boolean;
  requierePacking: boolean;
  afectaInventario: boolean;
  disponibleParaVenta: boolean;
  estadoItemSugerido: string;
  estadoRevisionSugerido: string;
  notas: string[];
};

function normalizeRuleText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const SALE_ELIGIBLE_STATES = new Set([
  "pendiente de pago",
  "pagado",
  "pendiente de packing",
  "en packing",
  "en transito",
  "recibido",
  "en revision",
  "disponible",
]);

const SALE_BLOCKED_STATES = new Set([
  "uso local",
  "repuesto",
  "usado en reparacion",
  "con novedad critica",
  "en garantia con proveedor",
  "destinado a partes",
  "desarmado parcialmente",
  "desarmado completamente",
  "vendido",
  "cancelado",
  "archivado",
]);

export function getDefaultItemFlowByOperation(input: ShippingV2ItemOperationRuleInput): ShippingV2ItemFlowDefaults {
  const operation = normalizeRuleText(input.tipoOperacion);
  const currentState = input.estadoItem?.trim() || "Registrado";
  const base: ShippingV2ItemFlowDefaults = {
    requierePago: false,
    requierePacking: false,
    afectaInventario: true,
    disponibleParaVenta: false,
    estadoItemSugerido: currentState,
    estadoRevisionSugerido: "No aplica",
    notas: [],
  };

  if (operation === "compra a proveedor") {
    Object.assign(base, {
      requierePago: true,
      requierePacking: true,
      afectaInventario: true,
      disponibleParaVenta: true,
      estadoItemSugerido: "Pendiente de pago",
    });
    base.notas.push("Aunque esté pendiente de pago, puede ofrecerse o reservarse si fue aprobado para compra.");
  } else if (operation === "compra ya pagada") {
    Object.assign(base, {
      requierePago: true,
      requierePacking: true,
      afectaInventario: true,
      disponibleParaVenta: true,
      estadoItemSugerido: "Pagado",
    });
    base.notas.push("Si viene del exterior, puede ofrecerse o reservarse aunque todavía esté pendiente de llegada.");
  } else if (operation === "regalo de proveedor") {
    Object.assign(base, {
      requierePago: false,
      requierePacking: true,
      afectaInventario: true,
      disponibleParaVenta: true,
      estadoItemSugerido: "Registrado",
    });
    base.notas.push("Puede ofrecerse después de registrarse si comercialmente se desea; la entrega depende de recepción y revisión.");
  } else if (operation === "encargo enviado a proveedor") {
    Object.assign(base, {
      requierePago: false,
      requierePacking: true,
      afectaInventario: true,
      disponibleParaVenta: true,
      estadoItemSugerido: "Pendiente de packing",
    });
    base.notas.push("Puede ofrecerse o reservarse si el negocio ya lo considera aprobado.");
  } else if (operation === "reajuste de inventario") {
    Object.assign(base, {
      requierePago: false,
      requierePacking: false,
      afectaInventario: true,
      disponibleParaVenta: true,
      estadoItemSugerido: "Disponible",
    });
  } else if (operation === "uso local") {
    Object.assign(base, {
      requierePago: false,
      requierePacking: false,
      afectaInventario: true,
      disponibleParaVenta: false,
      estadoItemSugerido: "Uso local",
    });
  } else if (operation === "repuesto") {
    Object.assign(base, {
      requierePago: false,
      requierePacking: false,
      afectaInventario: true,
      disponibleParaVenta: false,
      estadoItemSugerido: "Repuesto",
    });
    base.notas.push("Un repuesto puede venderse en algunos casos, pero por defecto queda reservado para uso técnico.");
  } else if (operation === "parte / componente") {
    Object.assign(base, {
      requierePago: false,
      requierePacking: false,
      afectaInventario: true,
      disponibleParaVenta: true,
      estadoItemSugerido: "Disponible",
    });
  } else if (operation === "despiece de equipo") {
    Object.assign(base, {
      requierePago: false,
      requierePacking: false,
      afectaInventario: true,
      disponibleParaVenta: false,
      estadoItemSugerido: "Destinado a partes",
    });
    base.notas.push("El Item padre no debe venderse como equipo completo. Los Items hijos creados después sí pueden quedar disponibles.");
  } else if (operation === "migracion historica") {
    Object.assign(base, {
      requierePago: false,
      requierePacking: false,
      afectaInventario: true,
      disponibleParaVenta: false,
      estadoItemSugerido: "Migrado",
    });
    base.notas.push("No se asume que un Item migrado está disponible hasta revisarlo.");
  } else if (operation === "correccion administrativa") {
    Object.assign(base, {
      requierePago: false,
      requierePacking: false,
      afectaInventario: false,
      disponibleParaVenta: false,
      estadoItemSugerido: currentState || "Registrado",
    });
  }

  const normalizedSuggestedState = normalizeRuleText(base.estadoItemSugerido);
  if (SALE_BLOCKED_STATES.has(normalizedSuggestedState)) {
    base.disponibleParaVenta = false;
  } else if (SALE_ELIGIBLE_STATES.has(normalizedSuggestedState) && operation !== "correccion administrativa") {
    base.disponibleParaVenta = true;
  }

  return base;
}
