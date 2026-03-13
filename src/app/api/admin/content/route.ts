// Admin API: ContentBlock CRUD
// GET — list all content blocks
// POST — create new content block
// PUT — update existing content block
// DELETE — delete content block

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const blocks = await prisma.contentBlock.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ blocks });
  } catch (error) {
    console.error("Error fetching content blocks:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const { slug, title, content } = await request.json();

    if (!slug || !content) {
      return NextResponse.json(
        { error: "Slug und Inhalt sind erforderlich." },
        { status: 400 }
      );
    }

    const existing = await prisma.contentBlock.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: "Ein Inhalt mit diesem Slug existiert bereits." },
        { status: 409 }
      );
    }

    const block = await prisma.contentBlock.create({
      data: { slug, title: title || null, content },
    });

    await logAdminAction(session.user.id, "CONTENT_CREATED", slug);

    return NextResponse.json({ block }, { status: 201 });
  } catch (error) {
    console.error("Error creating content block:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const { id, title, content } = await request.json();

    if (!id || !content) {
      return NextResponse.json(
        { error: "ID und Inhalt sind erforderlich." },
        { status: 400 }
      );
    }

    const block = await prisma.contentBlock.update({
      where: { id },
      data: { title: title || null, content },
    });

    await logAdminAction(session.user.id, "CONTENT_UPDATED", block.slug);

    return NextResponse.json({ block });
  } catch (error) {
    console.error("Error updating content block:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "ID ist erforderlich." }, { status: 400 });
    }

    const block = await prisma.contentBlock.delete({ where: { id } });

    await logAdminAction(session.user.id, "CONTENT_DELETED", block.slug);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting content block:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
