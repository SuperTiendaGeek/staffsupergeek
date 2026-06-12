import { StaffAppShell } from "@/components/staff/StaffAppShell";
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
    <StaffAppShell activeHref="/shipping-v2/recepcion" sectionLabel="Shipping V2">
      <ShippingV2FichaTecnicaClient item={item} technicalOptions={technicalOptions} />
    </StaffAppShell>
  );
}
