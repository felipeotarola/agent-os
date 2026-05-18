import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({ error: 'disabled: mock endpoint removed' }, { status: 410 });
}

export function PATCH() {
  return NextResponse.json({ error: 'disabled: mock endpoint removed' }, { status: 410 });
}

export function DELETE() {
  return NextResponse.json({ error: 'disabled: mock endpoint removed' }, { status: 410 });
}
