/**
 * Ejecutar:
 * NODE_OPTIONS="--conditions react-server" npx tsx lib/shipping-v2/__tests__/facebook-super-geek-text.test.ts
 */

import {
  generateShippingV2FacebookTextOptions,
  getShippingV2FacebookPublicationBlockReason,
  getShippingV2FacebookTextGenerationBlockReason,
} from "../facebook-super-geek-text";
import type { ShippingV2Item } from "@/types/shipping-v2";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("x", msg);
  } else {
    console.log("✓", msg);
  }
}

const itemBase = {
  sku: "ACC-000134",
  nombre: "Docking Station Lenovo LDC-VAR USB-C",
  marca: "Lenovo",
  modelo: "LDC-VAR",
  categoria: "Accesorio",
  tipoItem: "Accesorio",
  condicion: "Open Box",
  estado: "Disponible",
  cantidad: 1,
  qty: 1,
  precioVenta: 50,
  disponibleVenta: true,
  textoFacebook: "",
  technicalSheet: {
    marcaFicha: "",
    modeloFicha: "",
    sistemaOperativo: "",
    pantallaTamano: "",
    pantallaResolucion: "",
    cpuMarca: "",
    cpuModelo: "",
    cpuFrecuenciaBase: "",
    cpuFrecuenciaTurbo: "",
    ramCapacidad: "",
    ramTipo: "",
    almacenamientoPrincipal: "",
    almacenamientoTipo: "",
    gpu: "",
    bateriaSalud: null,
    bateriaEstado: "",
    connectivityV2Ids: [],
    portV2Ids: [],
    extraFeatureV2Ids: [],
    connectivityV2Names: [],
    portV2Names: [],
    extraFeatureV2Names: [],
    observacionFichaTecnica: "",
    fichaTecnicaGenerada: false,
    fichaTecnicaRevisada: false,
    fichaTecnicaGeneradaPor: "",
    fichaTecnicaRevisadaPor: "",
    fechaFichaTecnicaGenerada: "",
    fechaFichaTecnicaRevisada: "",
  },
} satisfies Pick<
  ShippingV2Item,
  | "sku"
  | "nombre"
  | "marca"
  | "modelo"
  | "categoria"
  | "tipoItem"
  | "condicion"
  | "estado"
  | "cantidad"
  | "qty"
  | "precioVenta"
  | "disponibleVenta"
  | "textoFacebook"
  | "technicalSheet"
>;

const opciones = generateShippingV2FacebookTextOptions(itemBase);

assert(opciones.length >= 4, "genera varias opciones de texto");
assert(opciones[0].text.includes("🔥 DISPONIBLE PARA RESERVA 🔥"), "mantiene el encabezado base");
assert(opciones[0].text.includes("ACC-000134"), "incluye SKU");
assert(opciones[0].text.includes("$50"), "incluye Precio venta final");
assert(opciones.some((opcion) => opcion.tone === "amigable"), "incluye tono amigable");
assert(opciones.some((opcion) => opcion.tone === "empatica"), "incluye tono empático");

assert(
  getShippingV2FacebookTextGenerationBlockReason({ precioVenta: null }).includes("Precio venta final"),
  "bloquea generación sin precio"
);
assert(
  getShippingV2FacebookPublicationBlockReason({ precioVenta: 50, textoFacebook: "" }).includes("Texto Facebook"),
  "bloquea publicación sin texto"
);
assert(
  getShippingV2FacebookPublicationBlockReason({ precioVenta: 50, textoFacebook: opciones[0].text }) === "",
  "permite publicación con precio y texto"
);

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}

console.log("\n✅ facebook-super-geek-text.test.ts — todos los asserts pasaron");
