// Forgot Password API
// Generates a reset token and sends email (or logs to console in dev mode)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";

// Rate-limiting: max 3 requests per email per 15 minutes
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  rateLimitMap.set(key, recent);

  if (recent.length >= RATE_LIMIT_MAX) {
    return true;
  }

  recent.push(now);
  rateLimitMap.set(key, recent);
  return false;
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "E-Mail-Adresse ist erforderlich." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Rate-Limiting per IP
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";

    if (isRateLimited(`${ip}:${normalizedEmail}`)) {
      // Anti-Enumeration: Always return success
      return NextResponse.json({
        message: "Falls ein Konto mit dieser E-Mail existiert, wurde ein Reset-Link gesendet.",
      });
    }

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
