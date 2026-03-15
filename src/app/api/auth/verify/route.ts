// Email Verification API
// Verifies user's email address via token
// Nach Verifizierung → Redirect zu /willkommen (Glücksrad)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBaseUrl } from "@/lib/utils";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

export async function GET(request: Request) {
  // Rate-Limiting: 60 pro Minute
  const rl = checkRateLimit(request, "auth-verify", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.redirect(
        new URL("/login?error=invalid-token", getBaseUrl())
      );
    }

    // Find user with this verification token
    const user = await prisma.user.findFirst({
      where: { verificationToken: token },
    });

    if (!user) {
      return NextResponse.redirect(
        new URL("/login?error=invalid-token", getBaseUrl())
      );
    }

    // Verify user
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        verificationToken: null,
        emailVerified: new Date(),
      },
    });

    // Redirect zu Willkommens-Seite mit Glücksrad
    return NextResponse.redirect(
      new URL("/willkommen?verified=true", getBaseUrl())
    );
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.redirect(
      new URL("/login?error=verification-failed", getBaseUrl())
    );
  }
}
