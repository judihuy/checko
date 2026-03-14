// Admin API: User bearbeiten + löschen
// PUT — User-Daten aktualisieren (Name, E-Mail, Rolle)
// DELETE — User komplett löschen (Cascade)

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { z } from "zod";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return null;
  }
  return session;
}

// Zod-Schema für User-Update
const updateUserSchema = z.object({
  name: z.string().min(1, "Name darf nicht leer sein").max(100).optional(),
  email: z.string().email("Ungültige E-Mail-Adresse").optional(),
  role: z.enum(["user", "moderator", "admin"]).describe("Rolle muss user, moderator oder admin sein").optional(),
});

// PUT — User bearbeiten
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const { id: userId } = await params;

    // User existiert?
    const existingUser = await prisma.user.findFirst({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((e: { message: string }) => e.message).join(", ");
      return NextResponse.json({ error: errors }, { status: 400 });
    }

    const { name, email, role } = parsed.data;

    // Mindestens ein Feld muss geändert werden
    if (!name && !email && !role) {
      return NextResponse.json(
        { error: "Mindestens ein Feld muss geändert werden" },
        { status: 400 }
      );
    }

    // E-Mail Duplikat prüfen
    if (email && email.toLowerCase().trim() !== existingUser.email) {
      const emailExists = await prisma.user.findFirst({
        where: { email: email.toLowerCase().trim() },
      });
      if (emailExists) {
        return NextResponse.json(
          { error: "Diese E-Mail-Adresse wird bereits verwendet" },
          { status: 409 }
        );
      }
    }

    // Update-Daten zusammenstellen
    const updateData: {
      name?: string;
      email?: string;
      role?: string;
      isEmailVerified?: boolean;
    } = {};

    if (name) updateData.name = name;
    if (role) updateData.role = role;

    // Wenn E-Mail geändert → isEmailVerified auf false
    if (email && email.toLowerCase().trim() !== existingUser.email) {
      updateData.email = email.toLowerCase().trim();
      updateData.isEmailVerified = false;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, isEmailVerified: true },
    });

    // AuditLog
    const changes: string[] = [];
    if (name && name !== existingUser.name) changes.push(`Name: "${existingUser.name}" → "${name}"`);
    if (updateData.email) changes.push(`E-Mail: "${existingUser.email}" → "${updateData.email}" (Verifizierung zurückgesetzt)`);
    if (role && role !== existingUser.role) changes.push(`Rolle: "${existingUser.role}" → "${role}"`);

    await logAdminAction(
      session.user.id,
      "USER_UPDATED",
      userId,
      `User ${existingUser.email} bearbeitet: ${changes.join(", ")}`
    );

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}

// DELETE — User löschen (Cascade durch Prisma-Schema)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const { id: userId } = await params;

    // User existiert?
    const user = await prisma.user.findFirst({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });
    }

    // Sich selbst nicht löschen
    if (userId === session.user.id) {
      return NextResponse.json(
        { error: "Du kannst dich nicht selbst löschen" },
        { status: 400 }
      );
    }

    // User löschen — Cascade löscht verknüpfte Daten (Account, Session, Transactions etc.)
    await prisma.user.delete({
      where: { id: userId },
    });

    // AuditLog
    await logAdminAction(
      session.user.id,
      "USER_DELETED",
      userId,
      `User gelöscht: ${user.email} (${user.name || "Kein Name"})`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
