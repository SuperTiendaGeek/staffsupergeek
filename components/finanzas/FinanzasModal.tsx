"use client";

import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { StaffModal } from "@/components/staff/StaffDesignSystem";

type Props = {
  trigger: (open: () => void) => ReactNode;
  title: string;
  description?: string;
  children: (close: () => void) => ReactNode;
};

// Envoltorio genérico para los flujos operativos de /finanzas (depósito,
// acreditar, movimiento manual): botón disparador + StaffModal flotante
// sobre un backdrop, mismo patrón de portal ya usado en
// AnularMovimientoButton/AnularPagoHorarioButton, pero reutilizando
// StaffModal del sistema de diseño en vez de un `<form>` suelto.
export function FinanzasModal({ trigger, title, description, children }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const close = () => setIsOpen(false);

  const modal = isOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-5"
      onClick={close}
    >
      <div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
        <StaffModal className="max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-2 border-b border-[#3A3A36] px-4 py-3">
            <div>
              <h3 className="text-base font-semibold text-[#F5F5F5]">{title}</h3>
              {description ? <p className="mt-0.5 text-sm text-[#A7A7A7]">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={close}
              className="shrink-0 rounded-full border border-[#3A3A36] px-3 py-1 text-sm text-[#CFCFCB] transition hover:text-[#F5F5F5]"
            >
              Cerrar
            </button>
          </div>
          <div className="px-4 py-4">{children(close)}</div>
        </StaffModal>
      </div>
    </div>
  ) : null;

  return (
    <>
      {trigger(() => setIsOpen(true))}
      {isMounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
