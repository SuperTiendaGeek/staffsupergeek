"use client";

import { useRouter } from "next/navigation";
import { StaffButton } from "@/components/staff/StaffDesignSystem";
import { AcreditarPanel } from "@/components/finanzas/AcreditarPanel";
import { DepositoForm } from "@/components/finanzas/DepositoForm";
import { FinanzasModal } from "@/components/finanzas/FinanzasModal";
import { MovimientoManualForm } from "@/components/finanzas/MovimientoManualForm";

type CuentaOpcion = { id: string; nombre: string; permiteTransferirAIds: string[] };

type Props = {
  cuentas: CuentaOpcion[];
  preGoLive: boolean;
  esAdmin: boolean;
};

// Fase 20.3 (iteración de UX) — las 3 capacidades operativas se lanzan como
// modales flotantes desde /finanzas (StaffModal + FinanzasModal), en vez de
// páginas a pantalla completa. Jerarquía visual: "Transferencia entre
// cuentas" y "Acreditar pendientes" son las acciones del día a día
// (primary); "Movimiento manual" es el escape hatch admin-only, con menor
// peso visual (secondary).
export function FinanzasAcciones({ cuentas, preGoLive, esAdmin }: Props) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FinanzasModal
        trigger={(open) => (
          <StaffButton type="button" variant="primary" onClick={open}>
            Transferencia entre cuentas
          </StaffButton>
        )}
        title="Transferencia entre cuentas"
        description="Depósitos de caja y movimientos entre tus cuentas."
      >
        {(close) => <DepositoForm cuentas={cuentas} preGoLive={preGoLive} onDone={close} />}
      </FinanzasModal>

      <FinanzasModal
        trigger={(open) => (
          <StaffButton type="button" variant="primary" onClick={open}>
            Acreditar pendientes
          </StaffButton>
        )}
        title="Acreditar pagos en tránsito"
        description="Ingresa el monto neto recibido de la pasarela — la comisión se calcula sola."
      >
        {() => <AcreditarPanel onAcreditado={() => router.refresh()} />}
      </FinanzasModal>

      {esAdmin ? (
        <FinanzasModal
          trigger={(open) => (
            <StaffButton type="button" variant="secondary" onClick={open}>
              Movimiento manual
            </StaffButton>
          )}
          title="Movimiento manual"
          description="Ingresos/egresos sueltos que ningún puente cubre."
        >
          {(close) => <MovimientoManualForm cuentas={cuentas} onDone={close} />}
        </FinanzasModal>
      ) : null}
    </div>
  );
}
