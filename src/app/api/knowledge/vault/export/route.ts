import { getKnowledgeSnapshot } from '@/db/knowledge';
import { getSessionFromRequest } from '@/lib/auth/session';
import { createZip } from '@/lib/zip';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const snapshot = await getKnowledgeSnapshot();
  const zip = createZip(snapshot.vault.files);
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(zip, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="agent-os-vault-${date}.zip"`,
      'cache-control': 'no-store'
    }
  });
}
