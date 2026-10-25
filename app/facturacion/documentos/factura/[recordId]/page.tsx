import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessApp } from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";
import { obtenerDocumentoVisor } from "@/lib/facturacion/documentos/visor";
import { DocumentoEncabezado, DocumentoVista } from "@/components/documentos/DocumentoVista";
import { BotonVolver } from "@/components/documentos/BotonVolver";

export const dynamic = "force-dynamic";

// Vista de SOLO LECTURA de una factura por URL directa, con el mismo formato
// del visor de documentos (components/documentos). Dentro del portal los
// documentos se abren en la ventana flotante; esta página queda para enlaces
// guardados o compartidos.
export default async function VerFacturaPage({ params }: { params: Promise<{ recordId: string }> }) {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");

  const { recordId } = await params;
  const doc = recordId ? await obtenerDocumentoVisor("factura", recordId, { facturacion: canAccessApp(session, "Facturación") }) : null;

  if (!doc) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#101110] px-4 text-[#F0F0EC]">
        <div className="rounded-2xl border border-[#3A3A36] bg-[#1A1A16] p-6 text-center">
          <p className="text-sm text-[#A7A7A7]">Factura no encontrada.</p>
          <Link href="/facturacion" className="mt-3 inline-block text-sm text-[#D7FF4F] hover:underline">Volver a Facturación</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#101110] px-3 py-4 text-[#EDEDE7] sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-[920px] overflow-hidden rounded-2xl border border-[#30312D] bg-[#121310]">
        <div className="border-b border-[#30312D] bg-[#161713] px-4 py-2.5">
          <DocumentoEncabezado tipo="factura" doc={doc} antes={<BotonVolver />} />
        </div>
        <div className="px-4 py-3">
          <DocumentoVista doc={doc} />
        </div>
      </div>
    </main>
  );
}
