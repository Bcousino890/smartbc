import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

// PDF de resumen de candidato para el propietario — pensado para acompañar
// (o sustituir) el envío manual del "Descargar PDF" del panel de admin.
// Deliberadamente NO incluye documentos originales ni datos sensibles en
// crudo (DNI/RUT, cuentas bancarias): solo el análisis ya procesado.

const COLORS = {
  ink: "#1f1c14",
  cream: "#f7f1e6",
  gold: "#d4af7f",
  goldDark: "#a8814a",
  inkSoft: "#5b5447",
  muted: "#8a8276",
  border: "#e6dccb",
  green: "#16a34a",
  greenBg: "#f0fdf4",
  greenBorder: "#bbf7d0",
  amber: "#b45309",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 36,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: COLORS.ink,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: `1px solid ${COLORS.gold}`,
    paddingBottom: 10,
    marginBottom: 16,
  },
  brand: { fontFamily: "Times-Bold", fontSize: 14, letterSpacing: 1.6, color: COLORS.ink },
  brandSub: { fontFamily: "Helvetica", fontSize: 8, letterSpacing: 2.5, color: COLORS.goldDark, marginTop: 2 },
  logo: { width: 130, height: Math.round(130 * (519 / 3282)), objectFit: "contain" },
  meta: { textAlign: "right", fontSize: 8, color: COLORS.muted },
  title: { fontFamily: "Times-Bold", fontSize: 18, color: COLORS.ink, marginBottom: 4 },
  metaLine: { fontSize: 9.5, color: COLORS.inkSoft, marginBottom: 14 },
  scoreBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.greenBg,
    border: `1px solid ${COLORS.greenBorder}`,
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  scoreNum: { fontFamily: "Times-Bold", fontSize: 28, color: COLORS.green },
  scoreOf: { fontSize: 12, color: COLORS.muted },
  scoreLabel: { fontSize: 10, color: COLORS.inkSoft },
  scoreRec: { fontFamily: "Helvetica-Bold", fontSize: 11, color: COLORS.green, marginTop: 2 },
  sectionTitle: {
    fontFamily: "Times-Bold",
    fontSize: 12,
    color: COLORS.ink,
    marginBottom: 6,
    marginTop: 14,
    borderBottom: `1px solid ${COLORS.border}`,
    paddingBottom: 4,
  },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  infoItem: {
    width: "48%",
    backgroundColor: COLORS.cream,
    borderRadius: 6,
    padding: 8,
  },
  infoLabel: { fontSize: 7.5, letterSpacing: 0.5, color: COLORS.muted, textTransform: "uppercase" },
  infoValue: { fontFamily: "Helvetica-Bold", fontSize: 11, color: COLORS.ink, marginTop: 2 },
  summaryBox: {
    backgroundColor: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 6,
    padding: 10,
    fontSize: 9.5,
    color: "#78350f",
    lineHeight: 1.5,
  },
  contextLine: { fontSize: 8, color: COLORS.muted, marginTop: 4, fontStyle: "italic" },
  table: { marginTop: 4 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: COLORS.cream, borderRadius: 4 },
  tableRow: { flexDirection: "row", borderBottom: `1px solid ${COLORS.border}` },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: COLORS.muted, padding: 6, textTransform: "uppercase" },
  td: { fontSize: 9, color: COLORS.ink, padding: 6 },
  colDoc: { width: "32%" },
  colStatus: { width: "18%" },
  colNotes: { width: "50%" },
  docPerson: { fontSize: 7.5, color: COLORS.muted, marginTop: 1 },
  docExplanation: { fontStyle: "italic", color: COLORS.inkSoft },
  footer: {
    marginTop: 18,
    padding: 12,
    backgroundColor: COLORS.ink,
    color: COLORS.cream,
    borderRadius: 6,
    fontSize: 8,
    lineHeight: 1.5,
  },
});

const STATUS_LABEL: Record<string, string> = {
  verified: "Verificado",
  pending: "Pendiente",
  rejected: "Rechazado",
  needs_correction: "Necesita corrección",
};

export type CandidateSummaryPdfData = {
  clientName: string;
  clientEmail: string;
  operationLabel: string;
  countryLabel: string;
  propertyTitle: string | null;
  generatedAt: string;
  logoDataUri?: string | null;
  score: {
    total: number;
    recommendationLabel: string;
    summary: string | null;
    incomeDisplay: string | null;
    incomeRatio: number | null;
    currencyContext: string | null;
  } | null;
  documents: {
    name: string;
    status: string;
    notes: string | null;
    // Explicación automática (IA) de qué es el documento y qué confirma —
    // solo se usa cuando no hay una nota manual del equipo.
    explanation: string | null;
    // Nombre del titular extraído del propio documento (identidad, nómina,
    // extracto...) — permite ver de quién es cada documento cuando hay
    // varios solicitantes.
    personName: string | null;
  }[];
};

export function CandidateSummaryPdfDocument({ data }: { data: CandidateSummaryPdfData }): ReactElement {
  const verifiedCount = data.documents.filter((d) => d.status === "verified").length;
  return (
    <Document title={`Resumen candidato — ${data.clientName}`} author="Benjamín Cousiño Propiedades">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {data.logoDataUri ? (
            <Image src={data.logoDataUri} style={styles.logo} />
          ) : (
            <View>
              <Text style={styles.brand}>BENJAMÍN COUSIÑO</Text>
              <Text style={styles.brandSub}>PROPIEDADES</Text>
            </View>
          )}
          <View style={styles.meta}>
            <Text>{data.generatedAt}</Text>
            <Text style={{ marginTop: 2 }}>contacto@bcousinoprop.com</Text>
          </View>
        </View>

        <Text style={styles.title}>Resumen de Candidato</Text>
        <Text style={styles.metaLine}>
          {data.operationLabel} · {data.countryLabel}
          {data.propertyTitle ? ` · ${data.propertyTitle}` : ""}
        </Text>

        {data.score && (
          <View style={styles.scoreBox}>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={styles.scoreNum}>{data.score.total}</Text>
              <Text style={styles.scoreOf}>/100</Text>
            </View>
            <View>
              <Text style={styles.scoreLabel}>Puntuación del candidato</Text>
              <Text style={styles.scoreRec}>{data.score.recommendationLabel}</Text>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Información del candidato</Text>
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Nombre</Text>
            <Text style={styles.infoValue}>{data.clientName}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Contacto</Text>
            <Text style={styles.infoValue}>{data.clientEmail}</Text>
          </View>
          {data.score?.incomeDisplay && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Ingresos verificados</Text>
              <Text style={styles.infoValue}>{data.score.incomeDisplay}</Text>
            </View>
          )}
          {data.score?.incomeRatio && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Ratio ingresos / renta</Text>
              <Text style={styles.infoValue}>{data.score.incomeRatio.toFixed(1)}x</Text>
            </View>
          )}
        </View>

        {data.score?.summary && (
          <>
            <Text style={styles.sectionTitle}>Análisis</Text>
            <View style={styles.summaryBox}>
              <Text>{data.score.summary}</Text>
            </View>
            {data.score.currencyContext && (
              <Text style={styles.contextLine}>{data.score.currencyContext}</Text>
            )}
          </>
        )}

        <Text style={styles.sectionTitle}>
          Documentación ({verifiedCount}/{data.documents.length} verificados)
        </Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, styles.colDoc]}>Documento</Text>
            <Text style={[styles.th, styles.colStatus]}>Estado</Text>
            <Text style={[styles.th, styles.colNotes]}>Notas / qué confirma</Text>
          </View>
          {data.documents.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.td, { width: "100%", color: COLORS.muted }]}>Sin documentos</Text>
            </View>
          ) : (
            data.documents.map((d, i) => (
              <View style={styles.tableRow} key={i} wrap={false}>
                <View style={[styles.td, styles.colDoc]}>
                  <Text>{d.name}</Text>
                  {!!d.personName && <Text style={styles.docPerson}>Titular: {d.personName}</Text>}
                </View>
                <Text style={[styles.td, styles.colStatus]}>{STATUS_LABEL[d.status] ?? d.status}</Text>
                <Text style={[styles.td, styles.colNotes, d.notes ? {} : styles.docExplanation]}>
                  {d.notes ?? d.explanation ?? "—"}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.footer}>
          <Text>
            Este resumen fue preparado por el equipo de Benjamín Cousiño Propiedades. Los documentos
            originales están en custodia del equipo y no se adjuntan en este informe.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
