import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const res = await db.query('SELECT * FROM posts ORDER BY created_at DESC LIMIT 50');
    return NextResponse.json({ success: true, posts: res.rows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { title, content } = await req.json();
    if (!title) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }

    const res = await db.query(
      'INSERT INTO posts (title, content, created_at) VALUES (?, ?, ?)',
      [title, content || '', Date.now()]
    );

    return NextResponse.json({ success: true, post: { id: res.lastInsertRowid, title, content } });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
