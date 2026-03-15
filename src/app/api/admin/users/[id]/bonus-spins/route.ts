// Admin API: Bonus-Spins für Glücksrad freischalten
// POST — Setzt bonusSpins += spins, bonusSpinsNoSpendRequired = noSpendRequired
// Nur admin darf diese Route nutzen

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { z } from "zod";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

const bonusSpinsSchema = z.object({
  spins: z.number().int().min(1).max(100),
  noSpendRequired: z.boolean(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(request, "admin-bonus-spins", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const { id: userId } = await params;

    // User suchen
    const user = await prisma.user.findFirst({
      where: { id: userId },
      select: { id: true, email: true, name: true, bonusSpins: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = bonusSpinsSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((e: { message: string }) => e.message).join(", ");
      return NextResponse.json({ error: errors }, { status: 400 });
    }

    const { spins, noSpendRequired } = parsed.data;

    // bonusSpins += spins, noSpendRequired setzen
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        bonusSpins: { increment: spins },
        bonusSpinsNoSpendRequired: noSpendRequired,
      },
      select: { bonusSpins: true, bonusSpinsNoSpendRequired: true },
    });

    // AuditLog
    await logAdminAction(
      session.user.id,
      "BONUS_SPINS_GRANTED",
      userId,
      `${spins} Bonus-Drehungen freigeschaltet für ${user.email} (Ohne Verbrauch: ${noSpendRequired ? "Ja" : "Nein"}). Neuer Stand: ${updatedUser.bonusSpins}`
    );

    return NextResponse.json({
      success: true,
      bonusSpins: updatedUser.bonusSpins,
      bonusSpinsNoSpendRequired: updatedUser.bonusSpinsNoSpendRequired,
      message: `${spins} Bonus-Drehung${spins > 1 ? "en" : ""} freigeschaltet!`,
    });
  } catch (error) {
    console.error("Bonus spins error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
