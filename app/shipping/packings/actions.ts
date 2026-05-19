"use server";

import { redirect } from "next/navigation";
import { canAccessApp } from "@/lib/apps";
import { crearShippingPackingRapido } from "@/lib/shipping/airtable";
import { getSessionFromCookie } from "@/lib/session";

export async function crearPackingRapidoAction() {
  const session = await getSessionFromCookie();

  if (!session || !canAccessApp(session, "Shipping")) {
    redirect("/acceso-denegado");
  }

  const result = await crearShippingPackingRapido();
  redirect(`/shipping/packings/${result.packing.id}`);
}
