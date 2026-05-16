"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { SHIPPING_CREATABLE_ITEM_FOR_OPTIONS, type ShippingProveedor } from "@/types/shipping";

type Props = {
  proveedores: ShippingProveedor[];
};

type ApiResponse = {
  success?: boolean;
  error?: string;
  warning?: string | null;
  paymentWarning?: boolean;
};

const categorias = ["Laptop", "Desktop", "Electronico", "Repuesto"];
const carriers = ["UPS", "USPS", "FeDex", "Gofo", "Otros"];

async function parseApi(response: Response): Promise<ApiResponse | null> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return null;
  }
}

function FieldLabel({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">
      {children}
      {required ? <span className="text-geek-lime"> *</span> : null}
    </span>
  );
}

export function NewShippingItemForm({ proveedores }: Props) {
  const router = useRouter();
  const [regalo, setRegalo] = useState(false);
  const [encargo, setEncargo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("regalo", regalo ? "true" : "false");
    formData.set("encargo", encargo ? "true" : "false");

    const costo = Number(String(formData.get("costoProveedor") ?? "").replace(",", "."));
    if (!Number.isFinite(costo) || costo < 0) {
      setError("Costo Proveedor debe ser mayor o igual a 0.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/shipping/items", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });
      const payload = await parseApi(response);

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No se pudo crear el item.");
      }

      router.push(payload.paymentWarning ? "/shipping/items?created=1&paymentWarning=1" : "/shipping/items?created=1");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-5">
      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <section className="rounded-lg border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/25">
        <div>
          <h2 className="text-lg font-semibold text-white">Información principal</h2>
          <p className="mt-1 text-sm text-zinc-500">Datos base para compras, stock, pedidos y repuestos.</p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <FieldLabel required>Item</FieldLabel>
            <input
              name="item"
              required
              className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime"
            />
          </label>

          <label className="block">
            <FieldLabel required>Categoría</FieldLabel>
            <select
              name="categoria"
              required
              defaultValue=""
              className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime"
            >
              <option value="" disabled>Seleccionar</option>
              {categorias.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <FieldLabel required>Item Para</FieldLabel>
            <select
              name="itemPara"
              required
              defaultValue=""
              className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime"
            >
              <option value="" disabled>Seleccionar</option>
              {SHIPPING_CREATABLE_ITEM_FOR_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <FieldLabel required>Proveedor</FieldLabel>
            <select
              name="proveedorId"
              required
              defaultValue=""
              className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime"
            >
              <option value="" disabled>Seleccionar proveedor</option>
              {proveedores.map((proveedor) => (
                <option key={proveedor.id} value={proveedor.id}>
                  {proveedor.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <FieldLabel>Qty</FieldLabel>
            <input
              name="qty"
              type="number"
              min="1"
              step="1"
              defaultValue="1"
              className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime"
            />
          </label>

          <label className="block">
            <FieldLabel required>Costo Proveedor</FieldLabel>
            <input
              name="costoProveedor"
              type="number"
              min="0"
              step="0.01"
              required
              className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime"
            />
          </label>

          <label className="block">
            <FieldLabel>Precio Venta</FieldLabel>
            <input
              name="precioVenta"
              type="number"
              min="0"
              step="0.01"
              className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime"
            />
          </label>

          <label className="block">
            <FieldLabel>Peso</FieldLabel>
            <input
              name="peso"
              type="number"
              min="0"
              step="0.01"
              className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime"
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/25">
        <div>
          <h2 className="text-lg font-semibold text-white">Operación</h2>
          <p className="mt-1 text-sm text-zinc-500">Señales logísticas y clasificación operativa.</p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex h-12 items-center gap-3 rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-zinc-200">
            <input
              type="checkbox"
              checked={regalo}
              onChange={(event) => setRegalo(event.target.checked)}
              className="h-4 w-4 accent-geek-lime"
            />
            Regalo
          </label>

          <label className="flex h-12 items-center gap-3 rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-zinc-200">
            <input
              type="checkbox"
              checked={encargo}
              onChange={(event) => setEncargo(event.target.checked)}
              className="h-4 w-4 accent-geek-lime"
            />
            Encargo
          </label>

          <label className="block">
            <FieldLabel>Carrier</FieldLabel>
            <select
              name="carrier"
              defaultValue=""
              className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime"
            >
              <option value="">Sin carrier</option>
              {carriers.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <FieldLabel>USA Tracking</FieldLabel>
            <input
              name="usaTracking"
              className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime"
            />
          </label>

          <label className="block sm:col-span-2">
            <FieldLabel>EC Tracking</FieldLabel>
            <input
              name="ecTracking"
              className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime"
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/25">
        <div>
          <h2 className="text-lg font-semibold text-white">Notas y evidencia</h2>
          <p className="mt-1 text-sm text-zinc-500">Notas internas, notas públicas y fotos del item.</p>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="block">
            <FieldLabel>Nota Interna</FieldLabel>
            <textarea
              name="notaInterna"
              rows={4}
              className="mt-2 w-full rounded-md border border-zinc-800 bg-[#111] px-4 py-3 text-sm text-white outline-none transition focus:border-geek-lime"
            />
          </label>

          <label className="block">
            <FieldLabel>Nota Pública</FieldLabel>
            <textarea
              name="notaPublica"
              rows={4}
              className="mt-2 w-full rounded-md border border-zinc-800 bg-[#111] px-4 py-3 text-sm text-white outline-none transition focus:border-geek-lime"
            />
          </label>

          <label className="block">
            <FieldLabel>Fotos</FieldLabel>
            <input
              name="fotos"
              type="file"
              accept="image/*"
              multiple
              className="mt-2 block w-full rounded-md border border-dashed border-zinc-800 bg-[#111] px-4 py-3 text-sm text-zinc-300 file:mr-4 file:rounded-md file:border-0 file:bg-geek-lime file:px-3 file:py-2 file:text-sm file:font-semibold file:text-geek-black"
            />
          </label>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href="/shipping/items"
          className="rounded-md border border-white/10 px-4 py-2.5 text-center text-sm font-semibold text-zinc-200 transition hover:border-geek-lime/50 hover:text-geek-lime"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={saving || proveedores.length === 0}
          className="rounded-md bg-geek-lime px-5 py-2.5 text-sm font-semibold text-geek-black shadow-glow transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar Item"}
        </button>
      </div>
    </form>
  );
}
