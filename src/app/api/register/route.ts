// Registration API endpoint
// Creates a new user with hashed password + email verification
// Optional: referralCode für Empfehlungssystem

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";
import { sendVerificationEmail } from "@/lib/email";
import { processReferral } from "@/lib/referral";
import { generateReferralCode } from "@/lib/referral";

// --- In-Memory Rate-Limiting ---
// Max 5 Registrierungen pro IP innerhalb von 15 Minuten
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

const rateLimitMap = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  rateLimitMap.set(ip, recent);

  if (recent.length >= RATE_LIMIT_MAX) {
    return true;
  }

  recent.push(now);
  rateLimitMap.set(ip, recent);
  return false;
}

// Alte Einträge regelmässig aufräumen (alle 10 Minuten)
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitMap.entries()) {
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) {
      rateLimitMap.delete(ip);
    } else {
      rateLimitMap.set(ip, recent);
    }
  }
}, 10 * 60 * 1000);

const registerSchema = z.object({
  name: z.string().min(2, "Name muss mindestens 2 Zeichen lang sein."),
  email: z.string().email("Ungültige E-Mail-Adresse."),
  password: z
    .string()
    .min(8, "Passwort muss mindestens 8 Zeichen lang sein.")
    .regex(/[A-Z]/, "Passwort muss mindestens einen Grossbuchstaben enthalten.")
    .regex(/[0-9]/, "Passwort muss mindestens eine Zahl enthalten."),
  referralCode: z.string().max(20).optional(),
});

export async function POST(request: Request) {
  // Rate-Limiting prüfen
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Zu viele Registrierungsversuche. Bitte versuche es in 15 Minuten erneut." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const validation = registerSchema.safeParse(body);

    if (!validation.success) {
      const firstError = validation.error.issues[0];
      return NextResponse.json(
        { error: firstError.message },
        { status: 400 }
      );
    }

    const { name, email, password, referralCode } = validation.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      // Anti-Enumeration: Same response as success
      return NextResponse.json(
        { message: "Registrierung erfolgreich! Bitte prüfe dein E-Mail-Postfach." },
        { status: 201 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // Generate referral code for the new user
    const newUserReferralCode = await generateReferralCode();

    // Dev-Modus: Falls kein SMTP konfiguriert, User direkt verifizieren
    const smtpConfigured = !!process.env.SMTP_HOST;

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        password: hashedPassword,
        verificationToken: smtpConfigured ? verificationToken : null,
        isEmailVerified: smtpConfigured ? false : true,
        referralCode: newUserReferralCode,
      },
    });

    // Referral-Code verarbeiten (wenn angegeben)
    if (referralCode && referralCode.trim()) {
      const referralResult = await processReferral(user.id, referralCode.trim().toUpperCase());
      if (!referralResult.success) {
        console.log(`Referral code "${referralCode}" für User ${user.id}: ${referralResult.error}`);
      }
    }

    if (smtpConfigured) {
      // Send verification email
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const verifyUrl = `${appUrl}/api/auth/verify?token=${verificationToken}`;

      await sendVerificationEmail(user.email, user.name || "Benutzer", verifyUrl);
    } else {
      // Dev-Modus: Token in Console loggen
      console.log("=== DEV-MODUS: E-Mail-Verifizierung übersprungen ===");
      console.log(`User ${user.email} wurde automatisch verifiziert.`);
      console.log(`Verification Token (nicht benötigt): ${verificationToken}`);
    }

    return NextResponse.json(
      {
        message: "Registrierung erfolgreich! Bitte prüfe dein E-Mail-Postfach.",
        user: { id: user.id, name: user.name, email: user.email },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Ein unerwarteter Fehler ist aufgetreten." },
      { status: 500 }
    );
  }
}
