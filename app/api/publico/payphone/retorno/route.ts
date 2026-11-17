import { NextResponse } from "next/server";
import { procesarRetornoPayPhone } from "@/lib/pagos-en-linea/servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ruta PÚBLICA (punto 23 / 10D): PayPhone devuelve aquí al cliente después de
// pagar, con `id` (PayPhone) y `clientTransactionId` (nuestro PL-000001).
// Contrato registrado en PayPhone Developer ("SUPER GEEK - Pedidos").
//   - El servidor CONFIRMA con PayPhone antes de registrar nada: nunca se cree
//     lo que diga la URL.
//   - A dónde volver lo decide el servidor (el enlace del pedido guardado),
//     nunca un parámetro de la URL.
//   - Esta URL no lleva el token del cliente.

const NO_CACHE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = (url.searchParams.get("id") ?? "").trim().slice(0, 20);
  const codigo = (url.searchParams.get("clientTransactionId") ?? "").trim().slice(0, 50);
  const destino = await procesarRetornoPayPhone(id, codigo).catch((e) => {
    console.error("[payphone retorno]", e);
    return null;
  });
  if (destino) return NextResponse.redirect(new URL(destino, url.origin), { status: 303, headers: NO_CACHE });
  return new NextResponse(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SUPER GEEK</title>` +
      `<body style="margin:0;background:#151613;color:#F0F0EC;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;text-align:center">` +
      `<div><p style="font-weight:800;letter-spacing:.08em;color:#D7FF4F">SUPER GEEK</p><p>No encontramos este pago. Vuelve al enlace de tu pedido o escríbenos por WhatsApp.</p></div></body></html>`,
    { status: 404, headers: { ...NO_CACHE, "Content-Type": "text/html; charset=utf-8" } },
  );
}
