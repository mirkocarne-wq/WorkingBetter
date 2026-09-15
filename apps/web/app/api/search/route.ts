import { NextResponse } from 'next/server';
import { ApiError, apiFetch, type Person } from '@/lib/api';

/** Ricerca persone per la palette ⌘K (CORE-064): inoltra all'API con il token di sessione. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 100) ?? '';
  if (q.length < 2) return NextResponse.json({ items: [] });
  try {
    const r = await apiFetch<{ items: Person[] }>(`/people?q=${encodeURIComponent(q)}&limit=8`);
    return NextResponse.json({ items: r.items.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, email: p.email, jobTitle: p.jobTitle })) });
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ items: [] }, { status: e.status === 401 ? 401 : 200 });
    throw e;
  }
}
