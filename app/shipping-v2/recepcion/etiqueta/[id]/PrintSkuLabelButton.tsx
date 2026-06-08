"use client";

export function PrintSkuLabelButton() {
  return (
    <button type="button" onClick={() => window.print()}>
      Imprimir
    </button>
  );
}
