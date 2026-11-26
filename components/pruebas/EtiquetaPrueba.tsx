// Punto 16: etiqueta amarilla «PRUEBA» (mismo estilo que «PRUEBAS» de Facturación).
import { ETIQUETA_PRUEBA } from "@/lib/pruebas/reglas";

export function EtiquetaPrueba({ className = "" }: { className?: string }) {
  return (
    <span
      title="De prueba: fuera de tableros y reportes; no va a Finanzas"
      className={`inline-flex shrink-0 items-center rounded-full border border-[#FFD36B]/50 bg-[#FFD36B]/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-[#FFD36B] ${className}`}
    >
      {ETIQUETA_PRUEBA}
    </span>
  );
}
