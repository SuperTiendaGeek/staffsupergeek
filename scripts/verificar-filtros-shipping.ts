/**
 * Verificación SOLO LECTURA de los filtros nuevos contra Airtable real
 * (rediseño del 15-oct-2026: búsqueda de Artículos y lectura rápida de
 * Recepción). No escribe nada.
 *
 * USO (en la Mac, antes de publicar):
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/verificar-filtros-shipping.ts
 *
 * Comprueba:
 *   1. Recepción: la lectura nueva (filtrada y en 4 partes en paralelo) trae
 *      EXACTAMENTE los mismos artículos visibles que leer la tabla entera, y
 *      cuánto tarda cada forma.
 *   2. Artículos: varias búsquedas reales (laptops disponibles, HP, MacBook,
 *      desktops vendidos, 16gb, un proveedor) devuelven resultados que cumplen
 *      el filtro.
 * Si algo falla, termina con error: NO publicar.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

async function cargarEnvLocal(): Promise<void> {
  const raw = await readFile(path.join(process.cwd(), ".env.local"), "utf8").catch(() => "");
  for (const linea of raw.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const corte = limpia.indexOf("=");
    if (corte < 1) continue;
    const clave = limpia.slice(0, corte).trim();
    let valor = limpia.slice(corte + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) valor = valor.slice(1, -1);
    process.env[clave] ||= valor;
  }
}

let fallos = 0;
function revisar(cond: boolean, msg: string) {
  if (cond) console.log("✓", msg);
  else { fallos++; console.error("✗", msg); }
}

async function main() {
  await cargarEnvLocal();
  // Después de cargar las variables: airtable.ts las lee al usarse.
  const { getShippingV2ItemsPage, getShippingV2Proveedores, getShippingV2ReceptionItems } = await import("../lib/shipping-v2/airtable");
  const { systemShippingV2Access } = await import("../lib/shipping-v2/access");
  const { shouldShowShippingV2ReceptionItem } = await import("../lib/shipping-v2/reception-visibility");
  const { FILTRO_ARTICULOS_VACIO, coincidenTerminos, normalizarBusqueda, terminosBusqueda } = await import("../lib/shipping-v2/items-filtro");

  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY / AIRTABLE_BASE_ID en .env.local");
  const access = systemShippingV2Access();

  // ── 1. Recepción ─────────────────────────────────────────────────────────
  console.log("— Recepción —");
  const campos = ["Estado Item", "Estado de revisión", "Recibido", "Fotos tomadas", "Shopify publicado", "Marketplace publicado", "Mercado Libre publicado", "Grupos Facebook publicado", "Facebook Super Geek", "Operación Comercial", "Modo logístico"];
  const t0 = Date.now();
  const todos: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    for (const campo of campos) params.append("fields[]", campo);
    if (offset) params.set("offset", offset);
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Shipping Items")}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { records: Array<{ id: string; fields: Record<string, unknown> }>; offset?: string };
    todos.push(...data.records);
    offset = data.offset;
  } while (offset);
  const texto = (v: unknown) => (typeof v === "string" ? v : "");
  const esperados = new Set(todos.filter((r) => shouldShowShippingV2ReceptionItem({
    estado: texto(r.fields["Estado Item"]),
    estadoRevision: texto(r.fields["Estado de revisión"]),
    esRepuesto: false,
    recibido: r.fields["Recibido"] === true,
    fotosTomadas: r.fields["Fotos tomadas"] === true,
    shopifyPublicado: r.fields["Shopify publicado"] === true,
    marketplacePublicado: r.fields["Marketplace publicado"] === true,
    mercadoLibrePublicado: r.fields["Mercado Libre publicado"] === true,
    gruposFacebookPublicado: r.fields["Grupos Facebook publicado"] === true,
    facebookSuperGeek: r.fields["Facebook Super Geek"] === true,
    operacionComercialId: Array.isArray(r.fields["Operación Comercial"]) ? String(r.fields["Operación Comercial"][0] ?? "") || undefined : undefined,
    modoLogistico: texto(r.fields["Modo logístico"]),
  })).map((r) => r.id));
  const msTabla = Date.now() - t0;

  const t1 = Date.now();
  const recepcion = (await getShippingV2ReceptionItems({ includeAiName: false, access })).filter(shouldShowShippingV2ReceptionItem);
  const msNuevo = Date.now() - t1;
  const obtenidos = new Set(recepcion.map((item) => item.id));
  const faltan = [...esperados].filter((id) => !obtenidos.has(id));
  const sobran = [...obtenidos].filter((id) => !esperados.has(id));
  console.log(`  Tabla entera: ${todos.length} artículos, ${esperados.size} visibles (solo 11 campos, ${msTabla} ms).`);
  console.log(`  Lectura nueva: ${obtenidos.size} visibles en ${msNuevo} ms (registros completos).`);
  revisar(faltan.length === 0, `No falta ningún artículo en Recepción${faltan.length ? ` (faltan: ${faltan.slice(0, 10).join(", ")})` : ""}`);
  revisar(sobran.length === 0, `No sobra ningún artículo${sobran.length ? ` (sobran: ${sobran.slice(0, 10).join(", ")})` : ""}`);

  // ── 2. Artículos ─────────────────────────────────────────────────────────
  console.log("\n— Artículos —");
  const proveedores = await getShippingV2Proveedores();
  const ebay = proveedores.find((p) => /ebay/i.test(p.proveedorId || p.nombre)) ?? proveedores[0];
  const casos = [
    { nombre: "laptops disponibles", filtro: { ...FILTRO_ARTICULOS_VACIO, categoria: "Laptop", estado: "Disponible" } },
    { nombre: "laptops hp", filtro: { ...FILTRO_ARTICULOS_VACIO, categoria: "Laptop", q: "hp" } },
    { nombre: "macbook", filtro: { ...FILTRO_ARTICULOS_VACIO, q: "macbook" } },
    { nombre: "desktops vendidos", filtro: { ...FILTRO_ARTICULOS_VACIO, categoria: "Desktop", estado: "Vendido" } },
    { nombre: "laptops en tránsito", filtro: { ...FILTRO_ARTICULOS_VACIO, categoria: "Laptop", estado: "En tránsito" } },
    { nombre: "16gb", filtro: { ...FILTRO_ARTICULOS_VACIO, q: "16gb" } },
    { nombre: `proveedor ${ebay?.proveedorId}`, filtro: { ...FILTRO_ARTICULOS_VACIO, proveedor: ebay?.id ?? "" } },
  ];
  for (const caso of casos) {
    const t = Date.now();
    const pagina = await getShippingV2ItemsPage({ pageSize: 100, sortBy: "newest", access, filtro: caso.filtro, proveedores });
    const ms = Date.now() - t;
    const terminos = terminosBusqueda(caso.filtro.q);
    const malos = pagina.items.filter((item) =>
      (caso.filtro.categoria && item.categoria !== caso.filtro.categoria) ||
      (caso.filtro.estado && item.estado !== caso.filtro.estado) ||
      (caso.filtro.proveedor && item.proveedorId !== caso.filtro.proveedor));
    // El texto también puede coincidir en la etiqueta del proveedor o del packing: solo se informa.
    const sinTexto = terminos.length ? pagina.items.filter((item) => !coincidenTerminos(normalizarBusqueda(
      [item.nombre, item.sku, item.skuProveedor, item.marca, item.modelo, item.numeroSerie, item.categoria, item.packingId, item.trackingDirecto, item.trackingHaciaIntermediario, item.trackingDesdeIntermediario, item.proveedorNombre].join(" ")
    ), terminos)) : [];
    console.log(`  «${caso.nombre}»: ${pagina.items.length}${pagina.nextOffset ? "+" : ""} en ${ms} ms · ${pagina.items.slice(0, 3).map((i) => `${i.sku} ${i.nombre}`).join(" | ")}`);
    if (sinTexto.length) console.log(`    (aviso: ${sinTexto.length} coinciden fuera del nombre/SKU: ${sinTexto.slice(0, 5).map((i) => i.sku).join(", ")})`);
    revisar(malos.length === 0, `«${caso.nombre}» solo trae lo que cumple el filtro${malos.length ? ` (no cumplen: ${malos.slice(0, 5).map((i) => i.sku).join(", ")})` : ""}`);
  }

  if (fallos > 0) {
    console.error(`\n${fallos} comprobación(es) fallaron: NO publicar.`);
    process.exit(1);
  }
  console.log("\n✅ Filtros verificados contra Airtable (no se escribió nada).");
}

main().catch((error) => {
  console.error("✗ Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
