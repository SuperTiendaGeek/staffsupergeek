// Piezas compartidas por los tickets térmicos de 80 mm (factura y recibo).
// Reutiliza el mismo enfoque probado en los tickets de técnicos:
//   @page { size: 80mm auto; margin: 0 }  ·  .ticket { width: 72mm }
// El navegador imprime a la impresora térmica desde el diálogo de impresión.

export type EmisorTicket = {
  nombreComercial: string;
  razonSocial: string;
  ruc: string;
  dirMatriz: string;
};

export const mon = (n: number) => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;

export const FORMA_PAGO_LABEL: Record<string, string> = {
  "01": "Efectivo",
  "15": "Compensación de deudas",
  "16": "Tarjeta de débito",
  "17": "Dinero electrónico",
  "18": "Tarjeta prepago",
  "19": "Tarjeta de crédito",
  "20": "Otros (sist. financiero)",
  "21": "Endoso de títulos",
};

export const TICKET_CSS = `
  html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
  @page { size: 80mm auto; margin: 0; }
  .ticket-page { min-height: 100vh; background: #fff; color: #000; }
  .ticket { width: 72mm; margin: 0 auto; padding: 4mm 2mm 6mm; box-sizing: border-box; font-size: 11px; line-height: 1.3; }
  .center { text-align: center; }
  .brand { font-size: 17px; font-weight: 800; letter-spacing: 0.03em; }
  .muted { color: #000; font-size: 10px; }
  .doc-title { margin-top: 8px; font-size: 13px; font-weight: 800; text-transform: uppercase; }
  .doc-num { font-size: 13px; font-weight: 800; }
  .aviso { margin: 6px 0; padding: 3px; border: 1px dashed #000; font-size: 10px; font-weight: 800; text-align: center; }
  .sep { border-top: 1px dashed #000; margin: 7px 0; }
  .row { display: flex; gap: 4px; margin: 2px 0; }
  .row .label { min-width: 20mm; font-weight: 700; }
  .row .value { flex: 1; word-break: break-word; }
  .item { margin: 4px 0; }
  .item-desc { font-weight: 700; }
  .item-calc { display: flex; justify-content: space-between; }
  .tot { display: flex; justify-content: space-between; margin: 2px 0; }
  .tot.big { font-size: 14px; font-weight: 900; margin-top: 4px; }
  .sri { font-size: 9px; word-break: break-all; }
  .sri .k { font-weight: 700; }
  .thanks { margin-top: 9px; font-size: 12px; font-weight: 800; text-align: center; }
  .print-actions { display: flex; justify-content: center; gap: 8px; padding: 14px; background: #f3f3f3; }
  .print-actions button, .print-actions a { border: 1px solid #111; border-radius: 6px; background: #fff; color: #111; padding: 8px 12px; font: 700 13px Arial, Helvetica, sans-serif; text-decoration: none; cursor: pointer; }
  @media print { .print-actions { display: none !important; } .ticket { margin: 0; } }
`;

/** Encabezado del emisor. Evita duplicar el nombre cuando el nombre comercial
 *  y la razón social coinciden (mismo criterio que el RIDE). */
export function EmisorHeader({ emisor }: { emisor: EmisorTicket }) {
  const mostrarRazon = emisor.razonSocial && emisor.razonSocial.trim() !== emisor.nombreComercial.trim();
  return (
    <header className="center">
      <div className="brand">{emisor.nombreComercial}</div>
      {mostrarRazon && <div className="muted">{emisor.razonSocial}</div>}
      <div className="muted">RUC: {emisor.ruc}</div>
      <div className="muted">{emisor.dirMatriz}</div>
    </header>
  );
}
