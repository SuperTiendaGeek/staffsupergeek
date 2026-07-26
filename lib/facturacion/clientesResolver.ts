import "server-only";

// Resolvedor de cliente para documentos (reserva, y reutilizable en factura/
// recibo/proforma). Decide cómo vincular el cliente de un documento contra la
// tabla Clientes, con reglas de gobernanza claras:
//
//   1) Si viene de la búsqueda (airtableId) → se vincula a ese registro. Solo si
//      el usuario pide EXPLÍCITAMENTE "actualizar ficha" se corrigen sus datos
//      (Nombre/Teléfono/Correo) con un PATCH PARCIAL — nunca borra Cédula,
//      Dirección ni Notas.
//   2) Si es manual y la cédula ya existe → se vincula al existente usando SUS
//      datos canónicos (NO se sobrescribe la ficha con lo tecleado, para no
//      corromper el maestro por un typo). Se informa que ya existía.
//   3) Si es manual y no existe → se crea en Clientes.

import { buscarClienteDuplicado, createCliente } from "@/lib/tecnicos/airtable/index";

const CLIENTES_TABLE = "Clientes";

export type DatosClienteDoc = {
  razonSocial:     string;
  identificacion?: string;
  correo?:         string;
  telefono?:       string;
  airtableId?:     string;
};

export type ResolucionCliente = {
  clienteId:        string | undefined;
  clienteExistente: boolean;   // se vinculó a un registro que ya existía (manual)
  fichaActualizada: boolean;   // se corrigieron datos del maestro
  datos:            DatosClienteDoc;   // datos a guardar en el documento (canónicos si existía)
};

// PATCH parcial: solo Nombre/Teléfono/Correo. Deja intactos Cédula, Dirección y
// Notas. Prueba nombres con y sin tilde (la base puede tener cualquiera).
async function patchClienteDatos(recordId: string, d: { razonSocial: string; correo?: string; telefono?: string }): Promise<void> {
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Falta AIRTABLE_API_KEY/BASE_ID.");
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(CLIENTES_TABLE)}/${encodeURIComponent(recordId)}`;
  const variantes = [
    { "Nombre": d.razonSocial, "Teléfono": d.telefono ?? "", "Correo": d.correo ?? "" },
    { "Nombre": d.razonSocial, "Telefono": d.telefono ?? "", "Correo": d.correo ?? "" },
  ];
  let ultimo = "";
  for (const fields of variantes) {
    const res = await fetch(url, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields, typecast: true }), cache: "no-store" });
    if (res.ok) return;
    ultimo = await res.text();
    if (!/UNKNOWN_FIELD_NAME|Unknown field/i.test(ultimo)) throw new Error(`PATCH Clientes ${res.status}: ${ultimo}`);
  }
  throw new Error(`PATCH Clientes: ${ultimo}`);
}

export async function resolverClienteDocumento(cli: DatosClienteDoc, actualizarFicha: boolean): Promise<ResolucionCliente> {
  const cedula = cli.identificacion?.trim() || "";

  // 1) Seleccionado de la búsqueda (o ya vinculado).
  if (cli.airtableId) {
    let fichaActualizada = false;
    if (actualizarFicha) {
      try { await patchClienteDatos(cli.airtableId, { razonSocial: cli.razonSocial, correo: cli.correo, telefono: cli.telefono }); fichaActualizada = true; }
      catch (e) { console.error("[resolverClienteDocumento] actualizar ficha:", e); }
    }
    return { clienteId: cli.airtableId, clienteExistente: false, fichaActualizada, datos: cli };
  }

  // 2) Manual con cédula que ya existe → vincular al existente (datos canónicos).
  if (cedula) {
    const dup = await buscarClienteDuplicado({ cedula });
    if (dup) {
      return {
        clienteId: dup.id, clienteExistente: true, fichaActualizada: false,
        datos: { razonSocial: dup.nombre, identificacion: dup.cedula || undefined, correo: dup.correo || undefined, telefono: dup.telefono || undefined, airtableId: dup.id },
      };
    }
  }

  // 3) Manual nuevo → crear.
  const creado = await createCliente({ nombre: cli.razonSocial, cedula: cedula || null, telefono: cli.telefono || null, correo: cli.correo || null });
  return { clienteId: creado.id, clienteExistente: false, fichaActualizada: false, datos: { ...cli, identificacion: cedula || undefined, airtableId: creado.id } };
}
