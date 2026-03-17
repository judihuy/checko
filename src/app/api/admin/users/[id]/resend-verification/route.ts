// Admin API: Verifizierungslink erneut senden
// POST — Generiert neuen verificationToken + sendet E-Mail (oder Console-Fallback)
// Nur admin darf diese Route nutzen

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { sendVerificationEmail } from "@/lib/email";
import crypto from "crypto";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(_request, "admin-resend-verification", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  // Nur admin darf
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
        isEmailVerified: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });
    }

    if (user.isEmailVerified) {
      return NextResponse.json(
        { error: "Benutzer ist bereits verifiziert" },
        { status: 400 }
      );
    }

    // Neuen Verifizierungstoken generieren
    const verificationToken = crypto.randomBytes(32).toString("hex");

    await prisma.user.update({
      where: { id: userId },
      data: { verificationToken },
    });

    // Verifizierungs-E-Mail senden
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const verifyUrl = `${appUrl}/api/auth/verify?token=${verificationToken}`;

    const emailSent = await sendVerificationEmail(
      user.email,
      user.name || "Benutzer",
      verifyUrl
    );

    // AuditLog
    await logAdminAction(
      session.user.id,
      "VERIFICATION_RESENT",
      userId,
      `Verifizierungslink erneut gesendet an ${user.email}${emailSent ? " (E-Mail gesendet)" : " (Console-Fallback)"}`
    );

    return NextResponse.json({
      success: true,
      email: user.email,
      emailSent,
      message: emailSent
        ? `Verifizierungslink an ${user.email} gesendet`
        : `Verifizierungslink in Console geloggt (SMTP nicht konfiguriert)`,
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
