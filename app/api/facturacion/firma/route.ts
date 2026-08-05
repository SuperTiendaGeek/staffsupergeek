import { NextResponse } from "next/server";

import { requireFacturacionAdmin } from "@/lib/facturacion/api-auth";
import {
  leerFirmaActiva,
  listarFirmas,
  guardarFirmaActiva,
  existeHuella,
} from "@/lib/facturacion/firma/almacen";
import {
  obtenerFirmaActiva,
  _resetCacheFirmaActiva,
} from "@/lib/facturacion/firma/resolverFirmaActiva";
import { inspeccionarP12, FirmaInvalidaError } from "@/lib/facturacion/firma/inspeccionar";
import { huellaSha256 } from "@/lib/facturacion/firma/cripto";
import { evaluarCargaFirma, avisoAlCargar } from "@/lib/facturacion/firma/validarCarga";
import { diasRestantes, nivelVigencia, mensajeVigencia } from "@/lib/facturacion/firma/vigencia";

export const dynamic = "force-dynamic";

// GET  /api/facturacion/firma  → estado de la firma en uso + historial
// POST /api/facturacion/firma  → cargar un .p12 nuevo y dejarlo activo
//
// Solo administrador: cambiar la firma cambia con qué identidad tributaria se
// firma TODO lo que emite el negocio. Un usuario de facturación puede emitir,
// pero no puede cambiar con qué identidad se emite.
//
// Este endpoint NUNCA devuelve el certificado ni la contraseña. Solo
// metadatos: quién es el titular, quién lo emitió y hasta cuándo sirve.

/** Tamaño máximo razonable para un .p12. Los reales pesan entre 3 y 10 KB. */
const MAX_BYTES = 1024 * 1024; // 1 MB

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const { response } = await requireFacturacionAdmin();
  if (response) return response;

  const ahora = new Date();

  // Qué firma está usando de verdad el motor de emisión ahora mismo. Puede
  // venir de Airtable o de las variables de entorno — la pantalla lo muestra
  // tal cual para que no haya dudas de con qué se está firmando.
  let enUso: {
    origen: string;
    titular?: string;
    emisor?: string;
    identificacion?: string;
    validoDesde?: string;
    validoHasta?: string;
    diasRestantes?: number;
    nivel?: string;
    mensaje?: string;
  } | null = null;
  let errorEnUso: string | null = null;

  try {
    const firma = await obtenerFirmaActiva();
    enUso = { origen: firma.origen };
    if (firma.metadatos) {
      const m = firma.metadatos;
      enUso = {
        origen:         firma.origen,
        titular:        m.titular,
        emisor:         m.emisor,
        identificacion: m.identificacion,
        validoDesde:    m.validoDesde.toISOString(),
        validoHasta:    m.validoHasta.toISOString(),
        diasRestantes:  diasRestantes(m.validoHasta, ahora),
        nivel:          nivelVigencia(m.validoHasta, ahora),
        mensaje:        mensajeVigencia(m.validoHasta, ahora),
      };
    }
  } catch (e) {
    errorEnUso = e instanceof Error ? e.message : "No se pudo resolver la firma en uso";
  }

  try {
    const [activa, historial] = await Promise.all([leerFirmaActiva(), listarFirmas()]);
    return NextResponse.json({
      success: true,
      data: {
        enUso,
        errorEnUso,
        // La fila "Activa" de Airtable, si existe. Puede no haberla y aun así
        // haber firma en uso (la de las variables de entorno).
        activa: activa
          ? {
              recordId:      activa.recordId,
              nombre:        activa.nombre,
              titularEmisor: activa.titularEmisor,
              validoDesde:   activa.validoDesde?.toISOString() ?? null,
              validoHasta:   activa.validoHasta?.toISOString() ?? null,
              subidoPor:     activa.subidoPor,
              fechaSubida:   activa.fechaSubida?.toISOString() ?? null,
            }
          : null,
        historial: historial.map((f) => ({
          recordId:      f.recordId,
          nombre:        f.nombre,
          titularEmisor: f.titularEmisor,
          estado:        f.estado,
          validoHasta:   f.validoHasta?.toISOString() ?? null,
          subidoPor:     f.subidoPor,
          fechaSubida:   f.fechaSubida?.toISOString() ?? null,
        })),
      },
    });
  } catch (e) {
    console.error("[/api/facturacion/firma GET]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al leer la firma" },
      { status: 500 }
    );
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

type Body = {
  nombre?:    string;
  p12Base64?: string;
  password?:  string;
};

export async function POST(request: Request) {
  const { response, session } = await requireFacturacionAdmin();
  if (response || !session) {
    return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 });
  }

  if (!body.p12Base64?.trim()) {
    return NextResponse.json({ success: false, error: "Falta el archivo del certificado." }, { status: 400 });
  }
  if (!body.password) {
    return NextResponse.json({ success: false, error: "Falta la contraseña del certificado." }, { status: 400 });
  }

  let p12: Buffer;
  try {
    p12 = Buffer.from(body.p12Base64, "base64");
  } catch {
    return NextResponse.json({ success: false, error: "El archivo no se pudo leer." }, { status: 400 });
  }

  if (p12.length === 0) {
    return NextResponse.json({ success: false, error: "El archivo está vacío." }, { status: 400 });
  }
  if (p12.length > MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: "El archivo es demasiado grande para ser un certificado .p12." },
      { status: 400 }
    );
  }

  // 1. Abrir el certificado. Aquí se cae la contraseña equivocada y el archivo
  //    que no es un .p12, con mensajes ya escritos para el usuario.
  let metadatos;
  try {
    metadatos = inspeccionarP12(p12, body.password);
  } catch (e) {
    if (e instanceof FirmaInvalidaError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
    throw e;
  }

  // 2. Reglas de negocio (puras, testeadas aparte).
  const ahora = new Date();
  const ruc   = process.env.SRI_RUC?.trim() ?? "";

  let huellaYaExiste = false;
  try {
    huellaYaExiste = await existeHuella(huellaSha256(p12));
  } catch (e) {
    console.error("[/api/facturacion/firma POST] no se pudo verificar la huella:", e);
  }

  const rechazo = evaluarCargaFirma({ metadatos, ruc, ahora, huellaYaExiste });
  if (rechazo) {
    return NextResponse.json({ success: false, error: rechazo.motivo }, { status: 400 });
  }

  // 3. Guardar. `guardarFirmaActiva` crea la nueva y solo después revoca la
  //    anterior: nunca queda un instante sin firma activa.
  try {
    const registro = await guardarFirmaActiva({
      nombre:         (body.nombre?.trim() || `firma-${ahora.toISOString().split("T")[0]}.p12`).slice(0, 120),
      p12,
      password:       body.password,
      titular:        metadatos.titular,
      emisor:         metadatos.emisor,
      identificacion: metadatos.identificacion,
      validoDesde:    metadatos.validoDesde,
      validoHasta:    metadatos.validoHasta,
      subidoPor:      session.user.nombre || session.user.email || "Portal",
    });

    // Que la próxima emisión use ya la firma nueva sin esperar a que se
    // recicle la instancia.
    _resetCacheFirmaActiva();

    return NextResponse.json({
      success: true,
      data: {
        recordId:      registro.recordId,
        titular:       metadatos.titular,
        emisor:        metadatos.emisor,
        validoHasta:   metadatos.validoHasta.toISOString(),
        diasRestantes: diasRestantes(metadatos.validoHasta, ahora),
        aviso:         avisoAlCargar(metadatos, ahora),
      },
    });
  } catch (e) {
    console.error("[/api/facturacion/firma POST]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "No se pudo guardar la firma" },
      { status: 500 }
    );
  }
}
