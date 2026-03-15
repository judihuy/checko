// Forgot Password API
// Generates a reset token and sends email (or logs to console in dev mode)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, RATE_LIMIT_SENSITIVE } from "@/lib/rate-limit";

export async function POST(request: Request) {
  // Globales Rate-Limiting: 5 pro 15 Minuten pro IP
  const rl = checkRateLimit(request, "forgot-password", RATE_LIMIT_SENSITIVE.max, RATE_LIMIT_SENSITIVE.windowMs);
  if (rl) return rl;
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "E-Mail-Adresse ist erforderlich." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user (Anti-Enumeration: same response whether user exists or not)
    const user = await prisma.user.findFirst({
      where: { email: normalizedEmail },
    });

    if (!user || !user.password) {
      // User doesn't exist or uses OAuth — return same response
      return NextResponse.json({
        message: "Falls ein Konto mit dieser E-Mail existiert, wurde ein Reset-Link gesendet.",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save hashed token to DB
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashedToken,
        resetTokenExpiresAt,
      },
    });

    // Send email or log to console
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resetUrl = `${appUrl}/passwort-zuruecksetzen?token=${resetToken}`;

    const emailSent = await sendPasswordResetEmail(
      user.email,
      user.name || "Benutzer",
      resetUrl
    );

    if (!emailSent) {
      console.log("=== PASSWORT-RESET LINK (Dev-Modus) ===");
      console.log(`User: ${user.email}`);
      console.log(`Link: ${resetUrl}`);
      console.log("========================================");
    }

    return NextResponse.json({
      message: "Falls ein Konto mit dieser E-Mail existiert, wurde ein Reset-Link gesendet.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Ein unerwarteter Fehler ist aufgetreten." },
      { status: 500 }
    );
  }
}
