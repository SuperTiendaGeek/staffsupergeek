import "server-only";

export type ProveedorSoftware = {
  id: string;
  nombre: string;
};

export async function fetchProveedoresSoftware(): Promise<ProveedorSoftware[]> {
  const apiKey = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();

  if (!apiKey || !baseId) {
    throw new Error("Faltan variables de entorno para Airtable: AIRTABLE_API_KEY / AIRTABLE_BASE_ID");
  }

  const url = new URL(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Shipping Proveedores")}`
  );
  url.searchParams.set("filterByFormula", `{Tipo de proveedor} = 'Software'`);
  url.searchParams.set("sort[0][field]", "Nombre proveedor");
  url.searchParams.set("sort[0][direction]", "asc");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    records: { id: string; fields: Record<string, unknown> }[];
  };

  return data.records
    .map((r) => ({
      id: r.id,
      nombre:
        typeof r.fields["Nombre proveedor"] === "string"
          ? r.fields["Nombre proveedor"].trim()
          : "",
    }))
    .filter((p) => p.nombre.length > 0);
}
