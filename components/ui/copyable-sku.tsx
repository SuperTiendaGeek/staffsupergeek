"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type EstadoCopia = "listo" | "copiado" | "error";

const TEXTO: Record<EstadoCopia, string> = {
  listo: "Copiar",
  copiado: "Copiado",
  error: "Error al copiar",
};

/** Cuánto se queda visible la confirmación antes de volver a "Copiar". */
const DURACION_MS: Record<Exclude<EstadoCopia, "listo">, number> = {
  copiado: 1500,
  error: 2000,
};

type Props = {
  /** Valor exacto que va al portapapeles (sin tocar: ni espacios ni nada extra). */
  sku: string;
  /** Qué es el valor, para lectores de pantalla ("SKU", "número de serie"…). */
  etiqueta?: string;
  /** Lo que se ve. Si no se pasa, se muestra el propio valor. */
  children?: React.ReactNode;
  className?: string;
};

/**
 * Texto que se copia al pulsarlo, con un tooltip oscuro "Copiar" → "Copiado".
 *
 * Se ve igual que el texto que reemplaza (hereda letra y color); solo cambia el
 * cursor. Es un <button> de verdad, así que Enter y Espacio también copian.
 * Pensado para SKU, pero sirve para cualquier código (serie, código de barras,
 * referencias): `<CopyableSKU sku={serie} etiqueta="número de serie" />`.
 *
 * El tooltip es el de Radix del proyecto (components/ui/tooltip), controlado a
 * mano: Radix lo cierra al hacer clic y aquí tiene que quedarse para mostrar
 * "Copiado", y volver a "Copiar" si el cursor sigue encima.
 */
export function CopyableSKU({ sku, etiqueta = "SKU", children, className }: Props) {
  const [estado, setEstado] = React.useState<EstadoCopia>("listo");
  const [encima, setEncima] = React.useState(false);
  const [conTeclado, setConTeclado] = React.useState(false);
  const temporizador = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const mostrar = (nuevo: Exclude<EstadoCopia, "listo">) => {
    if (temporizador.current) clearTimeout(temporizador.current);
    setEstado(nuevo);
    temporizador.current = setTimeout(() => {
      setEstado("listo");
      temporizador.current = null;
    }, DURACION_MS[nuevo]);
  };

  const copiar = async (event: React.MouseEvent<HTMLButtonElement>) => {
    // Copiar no debe disparar nada del contenedor (editar en línea, abrir fila…).
    event.preventDefault();
    event.stopPropagation();
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Portapapeles no disponible");
      await navigator.clipboard.writeText(sku);
      mostrar("copiado");
    } catch {
      mostrar("error");
    }
  };

  const abierto = encima || conTeclado || estado !== "listo";
  const anuncio = estado === "copiado" ? `${etiqueta} copiado` : estado === "error" ? "Error al copiar" : "";

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      {/* onOpenChange se ignora a propósito: la visibilidad la deciden el cursor, el foco y el estado. */}
      <Tooltip open={abierto} onOpenChange={() => {}}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={copiar}
            onPointerEnter={() => setEncima(true)}
            onPointerLeave={() => setEncima(false)}
            onFocus={(event) => setConTeclado(event.currentTarget.matches(":focus-visible"))}
            onBlur={() => setConTeclado(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setEncima(false);
                setConTeclado(false);
              }
            }}
            aria-label={`Copiar ${etiqueta} ${sku}`}
            className={cn(
              "inline cursor-pointer rounded-sm border-0 bg-transparent p-0 text-left align-baseline [color:inherit] [font:inherit] [letter-spacing:inherit] outline-none focus-visible:ring-1 focus-visible:ring-[#D7FF4F]/60",
              className,
            )}
          >
            {children ?? sku}
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          sideOffset={6}
          onEscapeKeyDown={() => {
            setEncima(false);
            setConTeclado(false);
          }}
          className="z-[100] overflow-visible whitespace-nowrap rounded-md border border-white/10 bg-[#0A0A09] px-2 py-1 text-[12px] font-medium leading-4 text-white shadow-lg shadow-black/40"
        >
          {TEXTO[estado]}
          <TooltipPrimitive.Arrow className="fill-[#0A0A09]" width={10} height={5} />
        </TooltipContent>
      </Tooltip>
      <span className="sr-only" role="status" aria-live="polite">{anuncio}</span>
    </TooltipProvider>
  );
}
