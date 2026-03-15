// Admin API: User management
// GET — list all users (mit Suche, Filter, Sortierung)
// PATCH — change user role (Legacy, beibehalten für Kompatibilität)

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { Prisma } from "@prisma/client";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return null;
  }
  return session;
}

export async function GET(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    // Query-Parameter aus der URL extrahieren
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() || "";
    const role = url.searchParams.get("role") || "";
    const filter = url.searchParams.get("filter") || "";
    const sort = url.searchParams.get("sort") || "createdAt";
    const order = url.searchParams.get("order") || "desc";

    // Where-Bedingungen aufbauen
    const where: Prisma.UserWhereInput = {};

    // Suche nach Name oder E-Mail
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ];
    }

    // Filter nach Rolle
    if (role === "admin") {
      where.role = "admin";
    } else if (role === "user") {
      where.role = "user";
    }

    // Filter nach Status (gesperrt)
    if (filter === "suspended") {
      where.isSuspended = true;
    }

    // Sortierung
    type SortField = "name" | "createdAt" | "checkosBalance";
    const validSortFields: SortField[] = ["name", "createdAt", "checkosBalance"];
    const sortField: SortField = validSortFields.includes(sort as SortField)
      ? (sort as SortField)
      : "createdAt";
    const sortOrder: Prisma.SortOrder = order === "asc" ? "asc" : "desc";

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        checkosBalance: true,
        isSuspended: true,
        suspendReason: true,
        isEmailVerified: true,
        bonusSpins: true,
        bonusSpinsNoSpendRequired: true,
        createdAt: true,
      },
      orderBy: { [sortField]: sortOrder },
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
