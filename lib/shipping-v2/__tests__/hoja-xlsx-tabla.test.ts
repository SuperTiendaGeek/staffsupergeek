/**
 * Tabla simple en Excel (punto 10c-3: exportar "Cambios de código").
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/hoja-xlsx-tabla.test.ts
 */
import { crearTablaXlsx, leerXlsx } from "../hoja-xlsx";

const bytes = crearTablaXlsx("Cambios de código", [{ titulo: "Antes", ancho: 14 }, { titulo: "Ahora", ancho: 14 }, { titulo: "En tienda", ancho: 10 }], [
  ["ACC-000170", "REP-000043", 0],
  ["LAP-000100", "DES-000038 & <x>", 1],
]);
const filas = leerXlsx(bytes);
const ok = filas.length === 3 && filas[0][0] === "Antes" && filas[2][1] === "DES-000038 & <x>" && String(filas[1][2]) === "0";
console.log(ok ? "✓ La tabla se abre y conserva textos con símbolos y números\n\nTodo bien." : `✗ ${JSON.stringify(filas)}`);
if (!ok) process.exit(1);
