import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const response = await handleUpload({
      body,
      request,
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
