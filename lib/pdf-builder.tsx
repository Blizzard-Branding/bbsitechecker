import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { AuditResult, CategoryResult, Check } from "./types";

const COLORS = {
  navy: "#2b333e",
  salmon: "#eca392",
  green: "#788e8b",
  blue: "#455763",
  cream: "#f7f3ee",
  warmWhite: "#fdf9f5",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.warmWhite,
    padding: 40,
    fontSize: 10,
    color: COLORS.blue,
  },
  eyebrow: {
    fontSize: 10,
    color: COLORS.salmon,
    letterSpacing: 2,
    marginBottom: 4,
  },
  h1: {
    fontSize: 24,
    color: COLORS.navy,
    marginBottom: 4,
  },
  urlText: {
    fontSize: 11,
    color: COLORS.blue,
    marginBottom: 20,
  },
  scoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  scoreCard: {
    width: "31%",
    backgroundColor: "#ffffff",
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.cream,
  },
  scoreGrade: {
    fontSize: 28,
    color: COLORS.navy,
  },
  scoreLabel: {
    fontSize: 9,
    color: COLORS.blue,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    color: COLORS.navy,
    marginTop: 16,
    marginBottom: 8,
  },
  checkRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cream,
    paddingVertical: 6,
  },
  checkBadge: {
    width: 46,
    fontSize: 9,
  },
  checkBody: {
    flex: 1,
  },
  checkName: {
    fontSize: 10,
    color: COLORS.navy,
  },
  checkMessage: {
    fontSize: 9,
    color: COLORS.blue,
    marginTop: 2,
  },
  checkFix: {
    fontSize: 9,
    color: COLORS.green,
    marginTop: 2,
  },
  footer: {
    marginTop: 24,
    fontSize: 9,
    color: COLORS.blue,
  },
});

const CATEGORY_TITLE: Record<CategoryResult["category"], string> = {
  seo: "SEO",
  aio: "AI Optimization",
  wcag: "WCAG 2.2 AA",
};

const STATUS_LABEL: Record<Check["status"], string> = {
  pass: "Pass",
  partial: "Partial",
  fail: "Fail",
};

function CategorySection({ category }: { category: CategoryResult }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>
        {CATEGORY_TITLE[category.category]}, {category.grade} ({category.score})
      </Text>
      {category.checks.map((c) => (
        <View key={c.id} style={styles.checkRow} wrap={false}>
          <Text style={styles.checkBadge}>{STATUS_LABEL[c.status]}</Text>
          <View style={styles.checkBody}>
            <Text style={styles.checkName}>{c.name}</Text>
            <Text style={styles.checkMessage}>{c.message}</Text>
            {c.status !== "pass" && <Text style={styles.checkFix}>Fix: {c.howToFix}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

function ReportDocument({ audit }: { audit: AuditResult }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>BLIZZARD SITE CHECKER</Text>
        <Text style={styles.h1}>Full site report</Text>
        <Text style={styles.urlText}>{audit.url}</Text>

        <View style={styles.scoreRow}>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreGrade}>{audit.seo.grade}</Text>
            <Text style={styles.scoreLabel}>SEO — {audit.seo.score}/100</Text>
          </View>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreGrade}>{audit.aio.grade}</Text>
            <Text style={styles.scoreLabel}>AI Optimization — {audit.aio.score}/100</Text>
          </View>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreGrade}>{audit.wcag.grade}</Text>
            <Text style={styles.scoreLabel}>WCAG 2.2 AA — {audit.wcag.score}/100</Text>
          </View>
        </View>

        <CategorySection category={audit.seo} />
        <CategorySection category={audit.aio} />
        <CategorySection category={audit.wcag} />

        <Text style={styles.footer}>
          Want us to fix these findings? Book a consultation at blizzardbranding.com/contact.
        </Text>
      </Page>
    </Document>
  );
}

export async function buildReportPdf(audit: AuditResult): Promise<Buffer> {
  return renderToBuffer(<ReportDocument audit={audit} />);
}
