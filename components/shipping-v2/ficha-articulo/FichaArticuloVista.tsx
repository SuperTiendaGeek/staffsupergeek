"use client";

// Punto 18 (25-oct-2026): elige la composición de la ficha según el perfil
// que decidió el SERVIDOR (no según lo que crea el navegador). Cada perfil
// tiene la suya; comparten piezas (foto, cabecera, filas, pestañas) pero no
// se pinta una para luego esconder partes.

import type { ReactNode } from "react";
import type { FichaArticulo, FichaInterna } from "@/lib/shipping-v2/ficha-articulo";
import { ShippingV2ItemDetailView } from "@/app/shipping-v2/items/ShippingV2ItemsClient";
import { ShippingV2ActivoAcciones } from "@/app/shipping-v2/items/[id]/ShippingV2ActivoAcciones";
import { EliminarItemAdmin } from "@/app/shipping-v2/items/[id]/EliminarItemAdmin";
import { CostosTraerlo } from "@/components/shipping-v2/CostosTraerlo";
import { useFichaArticulo } from "./contexto";
import { FichaTecnicoVista } from "./FichaTecnicoVista";
import { FichaProveedorVista } from "./FichaProveedorVista";

type Props = {
  ficha: FichaArticulo;
  modo: "modal" | "pagina";
  /** Recarga la ficha tras una acción que cambia mucho (novedades, acciones de Administrador). */
  alCambiar?: () => void;
};

function VistaInterna({ perfil, datos, modo, alCambiar }: { perfil: "admin" | "staff"; datos: FichaInterna; modo: Props["modo"]; alCambiar?: () => void }) {
  const contexto = useFichaArticulo();
  const { item } = datos;
  const adminPanel: ReactNode = perfil === "admin" ? (
    <>
      <ShippingV2ActivoAcciones
        itemId={item.id}
        sku={item.sku}
        esActivo={item.usoLocal === true}
        cantidad={item.cantidad ?? 0}
        estado={item.estado ?? ""}
        estadoRevision={item.estadoRevision ?? ""}
        unidadesDadasDeBaja={item.unidadesDadasDeBaja ?? 0}
        alTerminar={alCambiar}
      />
      <EliminarItemAdmin
        itemId={item.id}
        alEliminar={modo === "modal" && contexto ? () => { contexto.avisarCambio({ id: item.id }); contexto.cerrar(); } : undefined}
      />
    </>
  ) : undefined;

  return (
    <ShippingV2ItemDetailView
      key={item.id}
      perfil={perfil}
      modo={modo}
      item={item}
      proveedores={datos.proveedores}
      pago={datos.pago}
      packing={datos.packing}
      novedades={datos.novedades}
      esAdmin={perfil === "admin"}
      camposOcultos={datos.camposOcultos}
      camposSoloLectura={datos.camposSoloLectura}
      permissions={datos.permissions}
      rolNovedades={datos.rolNovedades}
      trazabilidad={datos.trazabilidad}
      hermanas={datos.hermanas}
      enlaces={datos.enlaces}
      publicaciones={datos.publicaciones}
      adminPanel={adminPanel}
      costosTraerlo={datos.costosTraerlo ? <CostosTraerlo itemId={item.id} /> : undefined}
      alCambiar={alCambiar}
      onSaved={(actualizado) => contexto?.avisarCambio({ id: actualizado.id })}
    />
  );
}

export function FichaArticuloVista({ ficha, modo, alCambiar }: Props) {
  switch (ficha.perfil) {
    case "admin":
    case "staff":
      return <VistaInterna perfil={ficha.perfil} datos={ficha.datos} modo={modo} alCambiar={alCambiar} />;
    case "tecnico":
      return <FichaTecnicoVista key={ficha.datos.item.id} datos={ficha.datos} modo={modo} alCambiar={alCambiar} />;
    case "proveedor":
      return <FichaProveedorVista key={ficha.datos.item.id} datos={ficha.datos} modo={modo} alCambiar={alCambiar} />;
  }
}
