// Admin API: Passwort-Reset-Mail an User senden
// POST — Generiert Reset-Token und sendet Reset-E-Mail
// Nur admin darf diese Route nutzen

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { sendPasswordResetEmail } from "@/lib/email";
import crypto from "crypto";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(_request, "admin-send-reset", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
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
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });
    }

    // Nur für User mit Passwort (nicht OAuth-only)
    if (!user.password) {
      return NextResponse.json(
        { error: "Dieser Benutzer nutzt OAuth-Login (kein Passwort gesetzt)." },
        { status: 400 }
      );
    }

    // Reset-Token generieren (wie forgot-password Flow)
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 Stunde gültig

    // Token hashen für DB
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    await prisma.user.update({
      where: { id: userId },
      data: {
        resetToken: hashedToken,
        resetTokenExpiresAt,
      },
    });

    // Reset-E-Mail senden
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const resetUrl = `${appUrl}/passwort-zuruecksetzen?token=${resetToken}`;

    const emailSent = await sendPasswordResetEmail(
      user.email,
      user.name || "Benutzer",
      resetUrl
    );

    // AuditLog
    await logAdminAction(
      session.user.id,
      "PASSWORD_RESET_SENT",
      userId,
      `Passwort-Reset-Mail gesendet an ${user.email}${emailSent ? " (E-Mail gesendet)" : " (Console-Fallback)"}`
    );

    return NextResponse.json({
      success: true,
      email: user.email,
      emailSent,
      message: emailSent
        ? `Passwort-Reset-Mail an ${user.email} gesendet`
        : `Passwort-Reset-Link in Console geloggt (SMTP nicht konfiguriert)`,
    });
  } catch (error) {
    console.error("Send reset error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
