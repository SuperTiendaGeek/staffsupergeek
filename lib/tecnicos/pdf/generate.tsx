import path from "path";
import React from "react";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

// ─── Fonts ────────────────────────────────────────────────────────────────────
// Local woff files in public/fonts/ — no network dependency at render time
const fontFile = (name: string) =>
  path.join(process.cwd(), "public", "fonts", name);

Font.register({
  family: "Inter",
  fonts: [
    { src: fontFile("inter-400.woff"), fontWeight: 400 },
    { src: fontFile("inter-600.woff"), fontWeight: 600 },
    { src: fontFile("inter-700.woff"), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

// ─── Interface ────────────────────────────────────────────────────────────────
export interface PDFProductoData {
  softwareProducto: string;
  marcaProducto: string | null;
  tipoProducto: string | null;
  logoProductoUrl: string | null;
  portalActivacionCatalogo: string | null;
  instruccionesPdfCatalogo: string | null;
  notasParaClienteCatalogo: string | null;
  duracion: string | null;
  fechaUsoVenta: string | null;
  expira: string | null;
  clienteNombre: string | null;
  ordenIdVisible: string | null;
  claveActivacion: string | null;
  usuarioCorreo: string | null;
  contrasena: string | null;
  generadoPor: string;
  fechaGeneracion: string;
}

// ─── Colors ───────────────────────────────────────────────────────────────────
const LIME      = "#D7FF4F";
const INK       = "#0B0D0A";
const DIM       = "#5B5B57";
const RULE      = "#E0E0DB";
const GHOST     = "#F2F2EF";
const LIME_TINT = "#ECFFD0";
const TEXT_GRN  = "#2E5C00";
const CRED_BG   = "#0D1F00";
const CRED_LIME = "#D7FF4F";
const CRED_LBL  = "#7AB534";
const CRED_VAL  = "#E4E4E0";
const CRED_DVD  = "#243B0B";
const WARM      = "#FFF8E8";
const WARM_BRD  = "#EDCE5A";
const WARM_TXT  = "#775A02";
const FOOTER_BG = "#141412";

// ─── Layout ───────────────────────────────────────────────────────────────────
const PM  = 40;       // horizontal page margin
const CW  = 515.28;   // content width (A4 595.28 - 2×40)
const FH  = 36;       // footer height

// ─── Text utilities ───────────────────────────────────────────────────────────
function clean(t: string | null | undefined): string {
  if (!t) return "";
  return t
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/[""„‟]/g, '"')
    .replace(/[''‚‛′‵]/g, "'")
    .replace(/[—–‒‑‐]/g, "-")
    .replace(/…/g, "...")
    .replace(/ | | /g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return clean(d);
    return dt.toLocaleDateString("es-CR", { year: "numeric", month: "long", day: "numeric" });
  } catch { return clean(d); }
}

function parseSteps(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\d+[\.\)]\s*/, ""));
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    fontFamily: "Inter",
  },

  topStripe: {
    height: 5,
    backgroundColor: LIME,
  },

  content: {
    flex: 1,
    paddingHorizontal: PM,
    paddingBottom: FH + 12,
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: FH,
    backgroundColor: FOOTER_BG,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: PM,
    borderTopWidth: 1.5,
    borderTopColor: LIME,
  },
  footerLeft: {
    flexDirection: "column",
  },
  footerText: {
    fontSize: 6.5,
    color: "#6B6B67",
    fontFamily: "Inter",
    fontWeight: 400,
    lineHeight: 1.5,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: 16,
    paddingBottom: 12,
  },
  brandName: {
    fontSize: 17,
    fontWeight: 700,
    color: INK,
    letterSpacing: 0.5,
  },
  slogan: {
    fontSize: 7,
    color: DIM,
    marginTop: 3,
    fontWeight: 400,
  },
  docLabel: {
    fontSize: 7,
    color: DIM,
    textAlign: "right",
    fontWeight: 400,
    lineHeight: 1.6,
  },

  // Dividers
  hairline: {
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    marginBottom: 14,
  },
  limeDivider: {
    borderBottomWidth: 1.5,
    borderBottomColor: LIME,
    marginTop: 12,
    marginBottom: 16,
  },

  // Hero
  hero: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: 14,
  },
  heroLeft: {
    flex: 1,
    paddingRight: 14,
  },
  productName: {
    fontSize: 23,
    fontWeight: 700,
    color: INK,
    lineHeight: 1.2,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 9,
  },
  badge: {
    backgroundColor: LIME_TINT,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginRight: 5,
    marginBottom: 5,
  },
  badgeText: {
    fontSize: 7,
    color: TEXT_GRN,
    fontWeight: 600,
  },
  logo: {
    width: 56,
    height: 56,
    objectFit: "contain",
  },

  // Info chips (2-column grid)
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 14,
  },
  chip: {
    backgroundColor: GHOST,
    borderRadius: 5,
    padding: 9,
    width: (CW - 8) / 2,
    marginBottom: 8,
  },
  chipOdd: {
    marginRight: 8,
  },
  chipLabel: {
    fontSize: 5.5,
    color: DIM,
    fontWeight: 600,
    marginBottom: 4,
    letterSpacing: 0.4,
  },
  chipValue: {
    fontSize: 9.5,
    color: INK,
    fontWeight: 600,
    lineHeight: 1.3,
  },

  // Eyebrow section labels
  eyebrow: {
    fontSize: 6,
    color: DIM,
    fontWeight: 700,
    letterSpacing: 0.6,
    marginBottom: 5,
  },

  // Portal
  portalValue: {
    fontSize: 9,
    color: TEXT_GRN,
    marginBottom: 14,
    lineHeight: 1.4,
  },

  // Credential box
  credBox: {
    backgroundColor: CRED_BG,
    borderRadius: 8,
    padding: 18,
    marginBottom: 16,
    borderTopWidth: 3,
    borderTopColor: LIME,
  },
  credTitle: {
    fontSize: 6.5,
    color: CRED_LBL,
    fontWeight: 700,
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  credKeyLabel: {
    fontSize: 6,
    color: CRED_LBL,
    fontWeight: 600,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  credKeyValue: {
    fontFamily: "Courier-Bold",
    fontSize: 14,
    color: CRED_LIME,
    lineHeight: 1.4,
    letterSpacing: 0.5,
  },
  credDivider: {
    borderTopWidth: 0.5,
    borderTopColor: CRED_DVD,
    marginVertical: 12,
  },
  credRow: {
    flexDirection: "row",
  },
  credCell: {
    flex: 1,
    marginRight: 16,
  },
  credCellLast: {
    flex: 1,
  },
  credFieldLabel: {
    fontSize: 6,
    color: CRED_LBL,
    fontWeight: 600,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  credFieldValue: {
    fontSize: 9,
    color: CRED_VAL,
    fontFamily: "Inter",
    lineHeight: 1.4,
  },
  credMonoValue: {
    fontSize: 9,
    color: CRED_VAL,
    fontFamily: "Courier",
    lineHeight: 1.4,
  },

  // Instructions
  stepRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  stepNum: {
    fontSize: 8.5,
    color: TEXT_GRN,
    fontWeight: 700,
    width: 18,
    flexShrink: 0,
  },
  stepText: {
    fontSize: 8.5,
    color: INK,
    flex: 1,
    lineHeight: 1.5,
  },

  // Notes
  notesBox: {
    backgroundColor: GHOST,
    borderRadius: 5,
    padding: 10,
    marginBottom: 14,
  },
  notesText: {
    fontSize: 8.5,
    color: INK,
    lineHeight: 1.55,
  },

  // Security note
  secBox: {
    backgroundColor: WARM,
    borderRadius: 5,
    padding: 10,
    borderWidth: 0.75,
    borderColor: WARM_BRD,
    marginBottom: 6,
  },
  secText: {
    fontSize: 7.5,
    color: WARM_TXT,
    lineHeight: 1.6,
  },
});

// ─── Component helpers ────────────────────────────────────────────────────────

type D = { data: PDFProductoData };

const DocFooter = ({ data }: D) => (
  <View style={S.footer} fixed>
    <View style={S.footerLeft}>
      <Text style={S.footerText}>{`Generado por: ${clean(data.generadoPor)}`}</Text>
      <Text style={S.footerText}>{clean(data.fechaGeneracion)}</Text>
    </View>
    <Text style={S.footerText}>Documento confidencial · SUPER GEEK</Text>
  </View>
);

const DocHeader = ({ data }: D) => (
  <View style={S.header}>
    <View>
      <Text style={S.brandName}>SUPER GEEK</Text>
      <Text style={S.slogan}>Rompiendo la brecha digital</Text>
    </View>
    <View style={{ alignItems: "flex-end" }}>
      <Text style={S.docLabel}>Documento de respaldo digital</Text>
      <Text style={[S.docLabel, { fontSize: 6.5 }]}>{clean(data.fechaGeneracion)}</Text>
    </View>
  </View>
);

const Hero = ({ data, logoSrc }: D & { logoSrc: string | null }) => {
  const badges = [data.marcaProducto, data.tipoProducto].filter(Boolean) as string[];
  return (
    <>
      <View style={S.hairline} />
      <View style={S.hero}>
        <View style={S.heroLeft}>
          <Text style={S.productName}>{clean(data.softwareProducto)}</Text>
          {badges.length > 0 && (
            <View style={S.badgesRow}>
              {badges.map((b, i) => (
                <View key={i} style={S.badge}>
                  <Text style={S.badgeText}>{clean(b)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        {logoSrc && (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={logoSrc} style={S.logo} />
        )}
      </View>
      <View style={S.limeDivider} />
    </>
  );
};

const InfoSection = ({ data }: D) => {
  const isPerp = /perpetua/i.test(data.duracion ?? "");
  const chips: { label: string; value: string }[] = [];
  if (data.duracion)       chips.push({ label: "DURACION",           value: isPerp ? "Perpetua" : clean(data.duracion) });
  if (data.fechaUsoVenta)  chips.push({ label: "FECHA DE ACTIVACION", value: fmtDate(data.fechaUsoVenta) });
  if (data.expira && !isPerp) chips.push({ label: "EXPIRA",           value: fmtDate(data.expira) });
  if (data.clienteNombre)  chips.push({ label: "CLIENTE",             value: clean(data.clienteNombre) });
  if (data.ordenIdVisible) chips.push({ label: "ORDEN",               value: `#${clean(data.ordenIdVisible)}` });
  if (chips.length === 0) return null;
  return (
    <View style={S.infoGrid}>
      {chips.map((c, i) => (
        <View key={i} style={[S.chip, i % 2 === 0 ? S.chipOdd : {}]}>
          <Text style={S.chipLabel}>{c.label}</Text>
          <Text style={S.chipValue}>{c.value}</Text>
        </View>
      ))}
    </View>
  );
};

const PortalSection = ({ data }: D) => {
  if (!data.portalActivacionCatalogo?.trim()) return null;
  return (
    <>
      <Text style={S.eyebrow}>PORTAL DE ACTIVACION</Text>
      <Text style={S.portalValue}>{clean(data.portalActivacionCatalogo)}</Text>
    </>
  );
};

const CredentialSection = ({ data }: D) => {
  const hasKey  = Boolean(data.claveActivacion);
  const hasUser = Boolean(data.usuarioCorreo);
  const hasPass = Boolean(data.contrasena);
  if (!hasKey && !hasUser && !hasPass) return null;

  return (
    <View style={S.credBox}>
      <Text style={S.credTitle}>CREDENCIALES DE ACCESO</Text>

      {hasKey && (
        <View style={{ marginBottom: hasUser || hasPass ? 0 : 2 }}>
          <Text style={S.credKeyLabel}>CLAVE DE ACTIVACION</Text>
          <Text style={S.credKeyValue}>{clean(data.claveActivacion)}</Text>
        </View>
      )}

      {hasKey && (hasUser || hasPass) && <View style={S.credDivider} />}

      {(hasUser || hasPass) && (
        <View style={S.credRow}>
          {hasUser && (
            <View style={hasPass ? S.credCell : S.credCellLast}>
              <Text style={S.credFieldLabel}>USUARIO / CORREO</Text>
              <Text style={S.credFieldValue}>{clean(data.usuarioCorreo)}</Text>
            </View>
          )}
          {hasPass && (
            <View style={S.credCellLast}>
              <Text style={S.credFieldLabel}>CONTRASENA</Text>
              <Text style={S.credMonoValue}>{clean(data.contrasena)}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const InstructionsSection = ({ data }: D) => {
  const steps = parseSteps(data.instruccionesPdfCatalogo);
  if (steps.length === 0) return null;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={S.eyebrow}>INSTRUCCIONES DE ACTIVACION</Text>
      {steps.map((step, i) => (
        <View key={i} style={S.stepRow}>
          <Text style={S.stepNum}>{`${i + 1}.`}</Text>
          <Text style={S.stepText}>{clean(step)}</Text>
        </View>
      ))}
    </View>
  );
};

const NotesSection = ({ data }: D) => {
  if (!data.notasParaClienteCatalogo?.trim()) return null;
  const lines = data.notasParaClienteCatalogo
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={S.eyebrow}>NOTAS IMPORTANTES</Text>
      <View style={S.notesBox}>
        {lines.map((line, i) => (
          <Text key={i} style={[S.notesText, i > 0 ? { marginTop: 5 } : {}]}>
            {clean(line)}
          </Text>
        ))}
      </View>
    </View>
  );
};

const SecurityNote = () => (
  <View style={S.secBox}>
    <Text style={S.secText}>
      Conserve este documento en un lugar seguro. Las credenciales son personales e
      intransferibles. No comparta esta informacion por medios inseguros.
      Si cree que fueron comprometidas, contacte a SUPER GEEK de inmediato.
    </Text>
  </View>
);

// ─── Document tree ────────────────────────────────────────────────────────────
type DocProps = D & { logoSrc: string | null };

const ProductoDoc = ({ data, logoSrc }: DocProps) => (
  <Document>
    <Page size="A4" style={S.page}>
      <View style={S.topStripe} />
      <DocFooter data={data} />
      <View style={S.content}>
        <DocHeader data={data} />
        <Hero data={data} logoSrc={logoSrc} />
        <InfoSection data={data} />
        <PortalSection data={data} />
        <View style={[S.hairline, { marginBottom: 10 }]} />
        <CredentialSection data={data} />
        <InstructionsSection data={data} />
        <NotesSection data={data} />
        <SecurityNote />
      </View>
    </Page>
  </Document>
);

// ─── Export ───────────────────────────────────────────────────────────────────
export async function generateProductoDigitalPDF(data: PDFProductoData): Promise<Uint8Array> {
  // Pre-fetch logo so @react-pdf never makes outbound requests at render time
  let logoSrc: string | null = null;
  if (data.logoProductoUrl) {
    try {
      const res = await fetch(data.logoProductoUrl);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const ct  = res.headers.get("content-type") ?? "image/jpeg";
        logoSrc   = `data:${ct};base64,${Buffer.from(buf).toString("base64")}`;
      }
    } catch { /* logo is optional, proceed without it */ }
  }

  const buffer = await renderToBuffer(<ProductoDoc data={data} logoSrc={logoSrc} />);
  return buffer;
}
