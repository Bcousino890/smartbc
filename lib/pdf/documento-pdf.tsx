import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { DocBlock } from "@/lib/documentos/templates";

// Documento PDF genérico para "documentos tipo" (mandatos, órdenes de venta /
// arriendo, personal shopper). Recibe los bloques ya interpolados por la
// plantilla y los renderiza con la marca BC en A4 vertical, listo para
// imprimir y firmar.

const COLORS = {
  ink: "#1f1c14",
  cream: "#ffffff",
  gold: "#d4af7f",
  goldDark: "#a8814a",
  inkSoft: "#3a352b",
  muted: "#8a8276",
  border: "#e6dccb",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 44,
    paddingHorizontal: 44,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: COLORS.ink,
    backgroundColor: COLORS.cream,
    lineHeight: 1.45,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: `1px solid ${COLORS.gold}`,
    paddingBottom: 10,
    marginBottom: 16,
  },
  brand: {
    fontFamily: "Times-Bold",
    fontSize: 13,
    letterSpacing: 1.4,
    color: COLORS.ink,
  },
  brandSub: {
    fontFamily: "Helvetica",
    fontSize: 7,
    letterSpacing: 2,
    color: COLORS.goldDark,
    marginTop: 2,
  },
  logo: {
    width: 120,
    height: Math.round(120 * (519 / 3282)),
    objectFit: "contain",
  },
  meta: {
    textAlign: "right",
    fontSize: 7.5,
    color: COLORS.muted,
  },
  title: {
    fontFamily: "Times-Bold",
    fontSize: 16,
    textAlign: "center",
    letterSpacing: 1,
    marginBottom: 4,
    color: COLORS.ink,
  },
  subtitle: {
    fontSize: 8.5,
    textAlign: "center",
    color: COLORS.muted,
    marginBottom: 16,
  },
  paragraph: {
    marginBottom: 8,
    textAlign: "justify",
  },
  heading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    letterSpacing: 1,
    color: COLORS.goldDark,
    marginTop: 8,
    marginBottom: 6,
  },
  clauseRow: {
    flexDirection: "row",
    marginBottom: 7,
  },
  clauseNum: {
    fontFamily: "Helvetica-Bold",
    width: 18,
    color: COLORS.goldDark,
  },
  clauseText: {
    flex: 1,
    textAlign: "justify",
  },
  spacer: { height: 12 },
  signaturesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 30,
  },
  signCol: {
    width: "45%",
    alignItems: "center",
  },
  signLine: {
    borderTop: `1px solid ${COLORS.ink}`,
    width: "100%",
    marginBottom: 4,
  },
  signLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    textAlign: "center",
  },
  signSub: {
    fontSize: 8,
    color: COLORS.inkSoft,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 44,
    right: 44,
    textAlign: "center",
    fontSize: 7,
    color: COLORS.muted,
    borderTop: `0.5px solid ${COLORS.border}`,
    paddingTop: 6,
  },
});

export type DocumentoPdfData = {
  title: string;
  subtitle?: string;
  reference?: string;
  dateLabel?: string;
  blocks: DocBlock[];
  logoDataUri?: string | null;
  footerText?: string;
};

function renderBlock(block: DocBlock, i: number): ReactElement {
  switch (block.type) {
    case "heading":
      return (
        <Text key={i} style={styles.heading}>
          {block.text}
        </Text>
      );
    case "clause":
      return (
        <View key={i} style={styles.clauseRow} wrap={false}>
          <Text style={styles.clauseNum}>{block.num})</Text>
          <Text style={styles.clauseText}>{block.text}</Text>
        </View>
      );
    case "spacer":
      return <View key={i} style={styles.spacer} />;
    case "signatures":
      return (
        <View key={i} style={styles.signaturesRow} wrap={false}>
          {block.columns.map((col, ci) => (
            <View key={ci} style={styles.signCol}>
              <View style={styles.signLine} />
              {col.lines.map((line, li) => (
                <Text key={li} style={li === 0 ? styles.signLabel : styles.signSub}>
                  {line}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    case "paragraph":
    default:
      return (
        <Text key={i} style={styles.paragraph}>
          {block.text}
        </Text>
      );
  }
}

export function DocumentoPdfDocument(data: DocumentoPdfData): ReactElement {
  const {
    title,
    subtitle,
    reference,
    dateLabel,
    blocks,
    logoDataUri,
    footerText,
  } = data;

  return (
    <Document title={title} author="Benjamín Cousiño Propiedades">
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          {logoDataUri ? (
            <Image src={logoDataUri} style={styles.logo} />
          ) : (
            <View>
              <Text style={styles.brand}>BENJAMÍN COUSIÑO</Text>
              <Text style={styles.brandSub}>PROPIEDADES</Text>
            </View>
          )}
          <View style={styles.meta}>
            {!!reference && <Text>Ref.: {reference}</Text>}
            {!!dateLabel && <Text>{dateLabel}</Text>}
          </View>
        </View>

        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

        {blocks.map((b, i) => renderBlock(b, i))}

        {!!footerText && (
          <Text style={styles.footer} fixed>
            {footerText}
          </Text>
        )}
      </Page>
    </Document>
  );
}
