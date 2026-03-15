// Admin API: Module management
// GET — list all modules (sorted by sortOrder)
// PATCH — update status, sortOrder, price, name, description

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

const VALID_STATUSES = ["active", "coming_soon", "beta", "maintenance"];

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") return null;
  return session;
}

export async function GET(request: Request) {
  const rl = checkRateLimit(request, "admin-modules", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

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
  const rl = checkRateLimit(request, "admin-modules-patch", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

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
    if (typeof updates.name === "string" && updates.name.trim()) {
      allowedUpdates.name = updates.name.trim();
    }
    if (typeof updates.description === "string") {
      allowedUpdates.description = updates.description;
    }
    if (typeof updates.status === "string" && VALID_STATUSES.includes(updates.status)) {
      allowedUpdates.status = updates.status;
      // Sync isActive with status
      allowedUpdates.isActive = updates.status === "active";
    }
    if (typeof updates.sortOrder === "number" && updates.sortOrder >= 0) {
      allowedUpdates.sortOrder = updates.sortOrder;
    }
    if (typeof updates.icon === "string") {
      allowedUpdates.icon = updates.icon;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return NextResponse.json({ error: "Keine gültigen Felder zum Aktualisieren" }, { status: 400 });
    }

    const updatedModule = await prisma.module.update({
      where: { id: moduleId },
      data: allowedUpdates,
    });

    await logAdminAction(
      session.user.id,
      "MODULE_UPDATED",
      moduleId,
      JSON.stringify(allowedUpdates)
    );

    return NextResponse.json({ module: updatedModule });
  } catch (error) {
    console.error("Error updating module:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
