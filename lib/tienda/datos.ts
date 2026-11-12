// Datos públicos de la tienda (dueño, 12-nov-2026). Los usa la página del
// cliente (enlace del pedido) y sus mensajes de WhatsApp. Un solo lugar: si
// cambia el horario o la cuenta, se cambia aquí.

export const TIENDA = {
  nombre: "SUPER GEEK",
  direccion: "Vicente Ramón Roca y Cristóbal Colón",
  ciudad: "Otavalo",
  horario: ["Lun–Vie 9:30–13:00 · 14:30–18:00", "Sáb 9:00–14:00"],
  mapa: "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("Vicente Ramón Roca y Cristóbal Colón, Otavalo, Ecuador"),
  /** WhatsApp de la tienda (el mismo de los anuncios y avisos). */
  whatsapp: "593968808149",
  banco: {
    nombre: "Banco Pichincha",
    tipo: "Ahorros",
    numero: "2206476693",
    titular: "Alexis Ruben Bolaños Flores",
  },
} as const;

/** Enlace de WhatsApp a la tienda con el mensaje ya escrito. */
export function whatsappTienda(mensaje: string): string {
  return `https://wa.me/${TIENDA.whatsapp}?text=${encodeURIComponent(mensaje)}`;
}
