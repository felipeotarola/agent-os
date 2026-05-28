import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { bridgeRequest } from '@/lib/bridge';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;
const OPENCLAW_HOME = process.env.OPENCLAW_HOME ?? '/root/.openclaw';
const AGENT_OS_SECRETS_DIR =
  process.env.AGENT_OS_SECRETS_DIR ?? path.join(OPENCLAW_HOME, 'secrets', 'agent-os');

function readManagedSecretSync(name: string) {
  const envValue = String(process.env[name] ?? '').trim();
  if (envValue) return envValue;
  try {
    return readFileSync(path.join(AGENT_OS_SECRETS_DIR, name), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function blobReadWriteToken() {
  return (
    readManagedSecretSync('BLOB_READ_WRITE_TOKEN') ??
    readManagedSecretSync('VERCEL_BLOB_READ_WRITE_TOKEN')
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  const token = blobReadWriteToken();

  try {
    if (!token) {
      const response = await bridgeRequest('/content/blob-upload', {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: 8000
      });
      return NextResponse.json(response);
    }

    const response = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        maximumSizeInBytes: MAX_IMAGE_UPLOAD_BYTES,
        addRandomSuffix: true
      }),
      onUploadCompleted: async () => {}
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'blob-upload-token-failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
