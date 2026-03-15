// NextAuth.js Configuration
// Credentials provider (email + password) + optional Google OAuth
// Includes email verification check + brute-force protection

import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import type { Adapter } from "next-auth/adapters";

// ============================================================
// Brute-Force Login-Schutz (In-Memory)
// Nach 10 Fehlversuchen: 30 Minuten gesperrt
// ============================================================

interface LoginAttempt {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
}

const loginAttempts = new Map<string, LoginAttempt>();

const MAX_FAILED_ATTEMPTS = 10;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 Minuten
const ATTEMPT_WINDOW_MS = 30 * 60 * 1000; // 30 Minuten Fenster

// Aufräumen alle 10 Minuten
setInterval(() => {
  const now = Date.now();
  for (const [email, attempt] of loginAttempts.entries()) {
    // Entferne Einträge die älter als 60 Minuten sind
    if (now - attempt.firstAttemptAt > 60 * 60 * 1000 && (!attempt.lockedUntil || now > attempt.lockedUntil)) {
      loginAttempts.delete(email);
    }
  }
}, 10 * 60 * 1000);

function isLoginLocked(email: string): boolean {
  const attempt = loginAttempts.get(email);
  if (!attempt) return false;

  // Lock abgelaufen?
  if (attempt.lockedUntil && Date.now() > attempt.lockedUntil) {
    loginAttempts.delete(email);
    return false;
  }

  return !!attempt.lockedUntil;
}

function recordFailedLogin(email: string): void {
  const now = Date.now();
  const attempt = loginAttempts.get(email);

  if (!attempt || now - attempt.firstAttemptAt > ATTEMPT_WINDOW_MS) {
    // Neues Fenster starten
    loginAttempts.set(email, {
      count: 1,
      firstAttemptAt: now,
      lockedUntil: null,
    });
    return;
  }

  attempt.count += 1;

  if (attempt.count >= MAX_FAILED_ATTEMPTS) {
    attempt.lockedUntil = now + LOCK_DURATION_MS;
  }

  loginAttempts.set(email, attempt);
}

function resetLoginAttempts(email: string): void {
  loginAttempts.delete(email);
}

// ============================================================
// NextAuth Configuration
// ============================================================

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    newUser: "/dashboard",
  },
  providers: [
    CredentialsProvider({
      name: "Anmeldedaten",
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("E-Mail und Passwort sind erforderlich.");
        }

        const normalizedEmail = credentials.email.toLowerCase().trim();

        // Brute-Force Check
        if (isLoginLocked(normalizedEmail)) {
          throw new Error("Zu viele fehlgeschlagene Anmeldeversuche. Bitte warte 30 Minuten.");
        }

        const user = await prisma.user.findFirst({
          where: { email: normalizedEmail },
        });

        if (!user || !user.password) {
          recordFailedLogin(normalizedEmail);
          throw new Error("Ungültige Anmeldedaten.");
        }

        // Check if user is suspended
        if (user.isSuspended) {
          throw new Error("Dein Konto wurde gesperrt.");
        }

        // Check email verification
        if (!user.isEmailVerified) {
          throw new Error("E-Mail-Adresse noch nicht bestätigt. Bitte prüfe dein Postfach.");
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          recordFailedLogin(normalizedEmail);
          throw new Error("Ungültige Anmeldedaten.");
        }

        // Erfolgreicher Login — Counter zurücksetzen
        resetLoginAttempts(normalizedEmail);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
    // Google OAuth (optional — only active if env vars are set)
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role || "user";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
