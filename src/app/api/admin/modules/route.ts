// Admin API: Module management
// GET — list all modules
// PATCH — toggle active status, change price

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
    const modules = await prisma.module.findMany({
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ modules });
  } catch (error) {
    console.error("Error fetching modules:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { moduleId, ...updates } = body;

    if (!moduleId) {
      return NextResponse.json({ error: "moduleId erforderlich" }, { status: 400 });
    }

    // Only allow specific fields to be updated
    const allowedUpdates: Record<string, unknown> = {};
    if (typeof updates.isActive === "boolean") {
      allowedUpdates.isActive = updates.isActive;
    }
    if (typeof updates.priceMonthly === "number" && updates.priceMonthly >= 0) {
      allowedUpdates.priceMonthly = updates.priceMonthly;
    }
    if (typeof updates.name === "string") {
      allowedUpdates.name = updates.name;
    }
    if (typeof updates.description === "string") {
      allowedUpdates.description = updates.description;
    }

    const module = await prisma.module.update({
      where: { id: moduleId },
      data: allowedUpdates,
    });

    await logAdminAction(
      session.user.id,
      "MODULE_UPDATED",
      moduleId,
      JSON.stringify(allowedUpdates)
    );

    return NextResponse.json({ module });
  } catch (error) {
    console.error("Error updating module:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
