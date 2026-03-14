// DELETE /api/modules/preisradar/saved/[id] — Gespeichertes entfernen
// PUT /api/modules/preisradar/saved/[id] — Favorit togglen / Notiz updaten

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await params;

  // findFirst statt findUnique (Prisma Engine-Bug)
  const saved = await prisma.savedAlert.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!saved) {
    return NextResponse.json(
      { error: "Gespeicherter Alert nicht gefunden" },
      { status: 404 }
    );
  }

  await prisma.savedAlert.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await params;

  let body: { isFavorite?: boolean; note?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }

  // findFirst statt findUnique (Prisma Engine-Bug)
  const saved = await prisma.savedAlert.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!saved) {
    return NextResponse.json(
      { error: "Gespeicherter Alert nicht gefunden" },
      { status: 404 }
    );
  }

  const updateData: { isFavorite?: boolean; note?: string | null } = {};
  if (typeof body.isFavorite === "boolean") {
    updateData.isFavorite = body.isFavorite;
  }
  if (body.note !== undefined) {
    updateData.note = body.note;
  }

  const updated = await prisma.savedAlert.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ success: true, saved: updated });
}
