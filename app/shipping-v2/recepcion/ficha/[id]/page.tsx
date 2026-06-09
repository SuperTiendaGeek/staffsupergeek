import { PortalShell } from "@/components/PortalShell";
import { getShippingV2ItemById, getShippingV2TechnicalOptionSets } from "@/lib/shipping-v2/airtable";
import { ShippingV2FichaTecnicaClient } from "./ShippingV2FichaTecnicaClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ShippingV2FichaTecnicaPage({ params }: Props) {
  const { id } = await params;
  const [item, technicalOptions] = await Promise.all([
    getShippingV2ItemById(id, { includeAiName: false }),
    getShippingV2TechnicalOptionSets(),
  ]);

  return (
    <PortalShell density="compact" eyebrow="Shipping V2" title="Ficha técnica" description="Preparación técnica para publicación e impresión">
      <ShippingV2FichaTecnicaClient item={item} technicalOptions={technicalOptions} />
    </PortalShell>
  );
}
