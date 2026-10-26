"use client";

// Punto 18 (25-oct-2026): elige la composición de la ficha según el perfil
// que decidió el SERVIDOR (no según lo que crea el navegador). Cada perfil
// tiene la suya; comparten piezas (foto, cabecera, filas, pestañas) pero no
// se pinta una para luego esconder partes.

import { useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { FichaArticulo, FichaInterna } from "@/lib/shipping-v2/ficha-articulo";
import { ShippingV2ItemDetailView } from "@/app/shipping-v2/items/ShippingV2ItemsClient";
import { ShippingV2ActivoAcciones } from "@/app/shipping-v2/items/[id]/ShippingV2ActivoAcciones";
import { EliminarItemAdmin } from "@/app/shipping-v2/items/[id]/EliminarItemAdmin";
import { CostosTraerlo } from "@/components/shipping-v2/CostosTraerlo";
import { hrefArticulo, useFichaArticulo } from "./contexto";
import { FichaTecnicoVista } from "./FichaTecnicoVista";
import { FichaProveedorVista } from "./FichaProveedorVista";

type Props = {
  ficha: FichaArticulo;
  modo: "modal" | "pagina";
  /** Recarga la ficha tras una acción que cambia mucho (novedades, acciones de Administrador). */
  alCambiar?: () => void;
  /** Punto 18b: quién cambia de unidad (Control lleva su propia ventana). Sin esto: la ventana única o la página. */
  onElegirUnidad?: (id: string) => void;
};

/**
 * Punto 18b (25-oct-2026): la ficha es el contenedor del SKU. Elegir otra
 * unidad NO abre otra ficha: en la ventana se cambia el registro en el mismo
 * lugar (la dirección se actualiza en silencio); en la página completa se
 * reemplaza la dirección sin mover la pantalla.
 */
function useElegirUnidad(modo: Props["modo"], propio?: (id: string) => void) {
  const contexto = useFichaArticulo();
  const router = useRouter();
  return useCallback(
    (id: string) => {
      if (propio) return propio(id);
      if (modo === "modal" && contexto) return contexto.abrir(id);
      router.replace(hrefArticulo(id), { scroll: false });
    },
    [propio, modo, contexto, router]
  );
}

function VistaInterna({ perfil, datos, modo, alCambiar, onElegirUnidad }: { perfil: "admin" | "staff"; datos: FichaInterna; modo: Props["modo"]; alCambiar?: () => void; onElegirUnidad: (id: string) => void }) {
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
    // Punto 18b: sin "key" por artículo: al cambiar de unidad la ficha se queda
    // montada (pestaña abierta, posición) y solo se actualizan sus datos.
    <ShippingV2ItemDetailView
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
      costosTraerlo={datos.costosTraerlo ? <CostosTraerlo key={item.id} itemId={item.id} /> : undefined}
      alCambiar={alCambiar}
      onSaved={(actualizado) => contexto?.avisarCambio({ id: actualizado.id })}
      onElegirUnidad={onElegirUnidad}
    />
  );
}

export function FichaArticuloVista({ ficha, modo, alCambiar, onElegirUnidad }: Props) {
  const elegirUnidad = useElegirUnidad(modo, onElegirUnidad);
  switch (ficha.perfil) {
    case "admin":
    case "staff":
      return <VistaInterna perfil={ficha.perfil} datos={ficha.datos} modo={modo} alCambiar={alCambiar} onElegirUnidad={elegirUnidad} />;
    case "tecnico":
      return <FichaTecnicoVista datos={ficha.datos} modo={modo} alCambiar={alCambiar} onElegirUnidad={elegirUnidad} />;
    case "proveedor":
      return <FichaProveedorVista key={ficha.datos.item.id} datos={ficha.datos} modo={modo} alCambiar={alCambiar} />;
  }
}
