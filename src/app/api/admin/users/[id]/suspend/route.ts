// Admin API: User sperren/entsperren
// PUT — Toggle isSuspended + optional suspendReason

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { z } from "zod";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

const suspendSchema = z.object({
  isSuspended: z.boolean(),
  reason: z.string().max(500).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(request, "admin-suspend", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const { id: userId } = await params;

    // User existiert?
    const user = await prisma.user.findFirst({
      where: { id: userId },
      select: { id: true, email: true, name: true, isSuspended: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });
    }

    // Sich selbst nicht sperren
    if (userId === session.user.id) {
      return NextResponse.json(
        { error: "Du kannst dich nicht selbst sperren" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = suspendSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((e: { message: string }) => e.message).join(", ");
      return NextResponse.json({ error: errors }, { status: 400 });
    }

    const { isSuspended, reason } = parsed.data;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isSuspended,
        suspendReason: isSuspended ? (reason || null) : null,
      },
      select: { id: true, isSuspended: true, suspendReason: true },
    });

    // AuditLog
    const action = isSuspended ? "USER_SUSPENDED" : "USER_UNSUSPENDED";
    const details = isSuspended
      ? `User ${user.email} gesperrt${reason ? `. Grund: ${reason}` : ""}`
      : `User ${user.email} entsperrt`;

    await logAdminAction(session.user.id, action, userId, details);

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Suspend user error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
