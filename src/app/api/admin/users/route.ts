// Admin API: User management
// GET — list all users (mit Checkos-Balance)
// PATCH — change user role

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return null;
  }
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        checkosBalance: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const { userId, role } = await request.json();

    if (!userId || !["user", "admin"].includes(role)) {
      return NextResponse.json({ error: "Ungültige Parameter" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    await logAdminAction(
      session.user.id,
      "USER_ROLE_CHANGED",
      userId,
      `Rolle geändert zu ${role} für ${user.email}`
    );

    return NextResponse.json({ user: { id: user.id, role: user.role } });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
