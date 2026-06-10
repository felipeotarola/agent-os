import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { qaCustomers, qaReportEvidenceAssets, qaReports, qaReportWriterTokens } from '@/db/schema';
import { hashQaToken } from '@/lib/qa-report-tokens';
import type { QaReport, QaReportVertical } from './types';

function toQaReport(row: {
  report: typeof qaReports.$inferSelect;
  customer: typeof qaCustomers.$inferSelect;
}): QaReport | null {
  const payload = row.report.reportPayload as Partial<QaReport>;
  if (!payload || typeof payload !== 'object') return null;

  return {
    ...(payload as QaReport),
    vertical: row.report.vertical as QaReportVertical,
    customerSlug: row.customer.slug,
    customerName: row.customer.name,
    slug: row.report.slug,
    title: row.report.title,
    targetUrl: row.report.targetUrl,
    agentName: row.report.agentName,
    executiveSummary: row.report.summary,
    verdict: row.report.verdict,
    score: row.report.score
  };
}

export async function getPersistedQaReports(): Promise<QaReport[]> {
  const rows = await db
    .select({ report: qaReports, customer: qaCustomers })
    .from(qaReports)
    .innerJoin(qaCustomers, eq(qaReports.customerId, qaCustomers.id));

  return rows.map(toQaReport).filter((report): report is QaReport => Boolean(report));
}

export async function getPersistedQaReportByCustomer(
  vertical: string,
  customerSlug: string,
  slug: string
): Promise<QaReport | undefined> {
  const rows = await db
    .select({ report: qaReports, customer: qaCustomers })
    .from(qaReports)
    .innerJoin(qaCustomers, eq(qaReports.customerId, qaCustomers.id))
    .where(
      and(
        eq(qaReports.vertical, vertical),
        eq(qaCustomers.slug, customerSlug),
        eq(qaReports.slug, slug)
      )
    )
    .limit(1);

  return rows[0] ? (toQaReport(rows[0]) ?? undefined) : undefined;
}

export async function upsertPersistedQaReport(report: QaReport) {
  const customerId = `qa_customer_${report.customerSlug}`;
  const reportId = `qa_report_${report.vertical}_${report.customerSlug}_${report.slug}`;
  const now = new Date();
  const generatedAt = new Date(report.generatedAt);

  await db
    .insert(qaCustomers)
    .values({
      id: customerId,
      name: report.customerName,
      slug: report.customerSlug,
      websiteUrl: report.targetUrl,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: qaCustomers.slug,
      set: {
        name: report.customerName,
        websiteUrl: report.targetUrl,
        updatedAt: now
      }
    });

  await db
    .insert(qaReports)
    .values({
      id: reportId,
      customerId,
      vertical: report.vertical,
      slug: report.slug,
      title: report.title,
      targetUrl: report.targetUrl,
      status: 'published',
      agentName: report.agentName,
      reportTemplate: report.reportType,
      summary: report.executiveSummary,
      verdict: report.verdict,
      score: report.score,
      reportPayload: report as unknown as Record<string, unknown>,
      generatedAt: Number.isNaN(generatedAt.getTime()) ? now : generatedAt,
      publishedAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: [qaReports.customerId, qaReports.vertical, qaReports.slug],
      set: {
        title: report.title,
        targetUrl: report.targetUrl,
        status: 'published',
        agentName: report.agentName,
        reportTemplate: report.reportType,
        summary: report.executiveSummary,
        verdict: report.verdict,
        score: report.score,
        reportPayload: report as unknown as Record<string, unknown>,
        generatedAt: Number.isNaN(generatedAt.getTime()) ? now : generatedAt,
        publishedAt: now,
        updatedAt: now
      }
    });

  if (report.evidence.length) {
    await db.delete(qaReportEvidenceAssets).where(eq(qaReportEvidenceAssets.reportId, reportId));
    await db.insert(qaReportEvidenceAssets).values(
      report.evidence.map((evidence) => ({
        id: `${reportId}_${evidence.id}`,
        reportId,
        evidenceId: evidence.id,
        label: evidence.label,
        path: evidence.path,
        blobUrl: evidence.blobUrl ?? evidence.imageUrl,
        viewport: evidence.viewport,
        metadata: {
          imageUrl: evidence.imageUrl,
          notes: evidence.notes,
          capturedAt: evidence.capturedAt
        }
      }))
    );
  }

  return reportId;
}

export async function verifyQaWriterToken(token: string) {
  const tokenHash = hashQaToken(token);
  const rows = await db
    .select()
    .from(qaReportWriterTokens)
    .where(eq(qaReportWriterTokens.tokenHash, tokenHash))
    .limit(1);
  const writerToken = rows[0];
  if (!writerToken || writerToken.status !== 'active') return null;
  if (writerToken.expiresAt.getTime() < Date.now()) return null;

  await db
    .update(qaReportWriterTokens)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(qaReportWriterTokens.id, writerToken.id));

  return writerToken;
}
