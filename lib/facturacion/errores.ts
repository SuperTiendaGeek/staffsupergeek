// Errores de rechazo de negocio del módulo de facturación — distintos de un
// error inesperado (500): el llamador hizo algo que la regla de negocio no
// permite (dato inválido, límite superado), no un fallo del sistema.
// Los route handlers los distinguen de Error genérico para responder 400
// en vez de 500 sin perder el mensaje.
export class FacturacionRechazoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FacturacionRechazoError";
  }
}
