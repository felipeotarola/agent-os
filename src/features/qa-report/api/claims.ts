import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/db/client';
import { qaReportClaims, qaReportWriterTokens } from '@/db/schema';
import { createOpaqueToken, hashQaToken } from '@/lib/qa-report-tokens';
import type { QaReportVertical } from './types';

const claimTtlMs = 30 * 60 * 1000;
const writerTokenTtlMs = 1000 * 60 * 60 * 24 * 90;

export interface CreateQaClaimInput {
  vertical: QaReportVertical;
  requestedByAgent?: string;
  customerSlug?: string;
  customerName?: string;
  reportSlug?: string;
  targetUrl?: string;
  metadata?: Record<string, unknown>;
}

export async function createQaReportClaim(input: CreateQaClaimInput) {
  const claimToken = createOpaqueToken('qa_claim');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + claimTtlMs);
  const id = randomUUID();

  await db.insert(qaReportClaims).values({
    id,
    tokenHash: hashQaToken(claimToken),
    requestedByAgent: input.requestedByAgent ?? 'Sladdis',
    vertical: input.vertical,
    customerSlug: input.customerSlug ?? '',
    customerName: input.customerName ?? '',
    reportSlug: input.reportSlug ?? '',
    targetUrl: input.targetUrl ?? '',
    expiresAt,
    metadata: input.metadata ?? {}
  });

  return { id, claimToken, expiresAt };
}

export async function getQaReportClaimByToken(claimToken: string) {
  const rows = await db
    .select()
    .from(qaReportClaims)
    .where(eq(qaReportClaims.tokenHash, hashQaToken(claimToken)))
    .limit(1);

  return rows[0] ?? null;
}

export async function approveQaReportClaim(claimToken: string, approvedBy: string) {
  const claim = await getQaReportClaimByToken(claimToken);
  const now = new Date();

  if (!claim || claim.status !== 'pending' || claim.expiresAt.getTime() < now.getTime()) {
    return null;
  }

  await db
    .update(qaReportClaims)
    .set({
      status: 'approved',
      approvedBy,
      approvedAt: now,
      updatedAt: now
    })
    .where(eq(qaReportClaims.id, claim.id));

  return { ...claim, status: 'approved' as const, approvedBy, approvedAt: now };
}

export async function exchangeQaReportClaim(claimToken: string) {
  const claim = await getQaReportClaimByToken(claimToken);
  const now = new Date();

  if (!claim || claim.status !== 'approved' || claim.expiresAt.getTime() < now.getTime()) {
    return null;
  }

  const writerToken = createOpaqueToken('qa_writer');
  const writerTokenId = randomUUID();
  const expiresAt = new Date(now.getTime() + writerTokenTtlMs);

  await db.insert(qaReportWriterTokens).values({
    id: writerTokenId,
    tokenHash: hashQaToken(writerToken),
    name: `${claim.requestedByAgent} ${claim.vertical} writer`,
    scope: {
      vertical: claim.vertical,
      customerSlug: claim.customerSlug || undefined,
      reportSlug: claim.reportSlug || undefined
    },
    expiresAt,
    metadata: {
      claimId: claim.id,
      targetUrl: claim.targetUrl
    }
  });

  await db
    .update(qaReportClaims)
    .set({
      status: 'exchanged',
      writerTokenId,
      exchangedAt: now,
      updatedAt: now
    })
    .where(and(eq(qaReportClaims.id, claim.id), eq(qaReportClaims.status, 'approved')));

  return {
    writerToken,
    expiresAt,
    scope: {
      vertical: claim.vertical,
      customerSlug: claim.customerSlug || undefined,
      reportSlug: claim.reportSlug || undefined
    }
  };
}
