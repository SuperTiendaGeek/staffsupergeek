import type { Metadata } from "next";
import { NovedadProveedorClient } from "./NovedadProveedorClient";

// Página PÚBLICA del botón RESPONDER del correo al proveedor (punto 8c).
// Sin login: la protege el código del enlace. No indexable.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Novedad · SUPER GEEK",
  robots: { index: false, follow: false },
};

export default async function NovedadProveedorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <NovedadProveedorClient token={token} />;
}
