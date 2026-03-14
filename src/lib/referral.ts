// Referral / Empfehlungssystem für Checko
// - Einzigartiger Referral-Code pro User
// - Beide Seiten bekommen 10 Checkos bei Registrierung
// - 10% Affiliate-Provision bei Checko-Käufen

import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// ==================== CODE GENERATION ====================

/**
 * Generiert einen einzigartigen 8-Zeichen alphanumerischen Referral-Code
 */
export async function generateReferralCode(): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Ohne I, O, 0, 1 (Verwechslungsgefahr)
  let attempts = 0;

  while (attempts < 10) {
    let code = "";
    const bytes = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) {
      code += chars[bytes[i] % chars.length];
    }

    // Prüfe ob Code schon existiert
    const existing = await prisma.user.findFirst({
      where: { referralCode: code },
    });

    if (!existing) {
      return code;
    }
    attempts++;
  }

  // Fallback: längerer Code
  return crypto.randomBytes(6).toString("hex").toUpperCase().slice(0, 8);
}

/**
 * Stellt sicher, dass ein User einen Referral-Code hat.
 * Generiert einen neuen, falls noch keiner existiert.
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { referralCode: true },
  });

  if (user?.referralCode) {
    return user.referralCode;
  }

  const code = await generateReferralCode();
  await prisma.user.update({
    where: { id: userId },
    data: { referralCode: code },
  });

  return code;
}

// ==================== REFERRAL PROCESSING ====================

/**
 * Verarbeitet eine Empfehlung: Beide bekommen 10 Checkos
 * Wird bei der Registrierung aufgerufen
 */
export async function processReferral(
  referredUserId: string,
  referrerCode: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Finde den Werber anhand des Codes
    const referrer = await prisma.user.findFirst({
      where: { referralCode: referrerCode },
      select: { id: true },
    });

    if (!referrer) {
      return { success: false, error: "Ungültiger Empfehlungscode." };
    }

    // Verhindere Selbst-Empfehlung
    if (referrer.id === referredUserId) {
      return { success: false, error: "Du kannst dich nicht selbst empfehlen." };
    }

    // Prüfe ob User bereits eine Empfehlung hat
    const existingReferral = await prisma.referral.findFirst({
      where: { referredId: referredUserId },
    });

    if (existingReferral) {
      return { success: false, error: "Du hast bereits einen Empfehlungscode verwendet." };
    }

    const REFERRAL_BONUS = 10;

    // Alles in einer Transaktion
    await prisma.$transaction(async (tx) => {
      // Referral-Eintrag erstellen
      await tx.referral.create({
        data: {
          referrerId: referrer.id,
          referredId: referredUserId,
          checkosEarned: REFERRAL_BONUS,
        },
      });

      // referredBy beim User setzen
      await tx.user.update({
        where: { id: referredUserId },
        data: { referredBy: referrer.id },
      });

      // Checkos für den Geworbenen
      await tx.user.update({
        where: { id: referredUserId },
        data: { checkosBalance: { increment: REFERRAL_BONUS } },
      });
      await tx.checkoTransaction.create({
        data: {
          userId: referredUserId,
          amount: REFERRAL_BONUS,
          type: "referral",
          description: `${REFERRAL_BONUS} Checkos für Empfehlungscode`,
        },
      });

      // Checkos für den Werber
      await tx.user.update({
        where: { id: referrer.id },
        data: { checkosBalance: { increment: REFERRAL_BONUS } },
      });
      await tx.checkoTransaction.create({
        data: {
          userId: referrer.id,
          amount: REFERRAL_BONUS,
          type: "referral",
          description: `${REFERRAL_BONUS} Checkos — Freund hat sich registriert!`,
        },
      });
    });

    return { success: true };
  } catch (error) {
    console.error("processReferral error:", error);
    return { success: false, error: "Fehler bei der Verarbeitung der Empfehlung." };
  }
}

// ==================== AFFILIATE EARNINGS ====================

/**
 * Affiliate-Provision: 10% wenn Geworbener Checkos kauft
 * Wird vom Stripe Webhook aufgerufen
 */
export async function processAffiliateEarnings(
  buyerUserId: string,
  purchasedCheckos: number
): Promise<{ success: boolean; affiliateAmount?: number }> {
  try {
    // Prüfe ob der Käufer von jemandem geworben wurde
    const user = await prisma.user.findFirst({
      where: { id: buyerUserId },
      select: { referredBy: true },
    });

    if (!user?.referredBy) {
      return { success: true }; // Kein Referrer → nichts zu tun
    }

    const affiliateAmount = Math.floor(purchasedCheckos * 0.1); // 10% Provision
    if (affiliateAmount <= 0) {
      return { success: true };
    }

    await prisma.$transaction(async (tx) => {
      // Affiliate-Checkos für den Werber
      await tx.user.update({
        where: { id: user.referredBy! },
        data: { checkosBalance: { increment: affiliateAmount } },
      });

      await tx.checkoTransaction.create({
        data: {
          userId: user.referredBy!,
          amount: affiliateAmount,
          type: "affiliate",
          description: `${affiliateAmount} Checkos Provision (10% von ${purchasedCheckos})`,
        },
      });

      // Referral-Eintrag aktualisieren (verdiente Checkos erhöhen)
      const referral = await tx.referral.findFirst({
        where: { referredId: buyerUserId },
      });

      if (referral) {
        await tx.referral.update({
          where: { id: referral.id },
          data: { checkosEarned: { increment: affiliateAmount } },
        });
      }
    });

    return { success: true, affiliateAmount };
  } catch (error) {
    console.error("processAffiliateEarnings error:", error);
    return { success: false };
  }
}

// ==================== STATS ====================

/**
 * Referral-Statistiken für einen User
 */
export async function getReferralStats(userId: string): Promise<{
  referralCode: string;
  totalReferrals: number;
  totalCheckosEarned: number;
  referrals: {
    id: string;
    referredName: string | null;
    referredEmail: string;
    checkosEarned: number;
    createdAt: Date;
  }[];
}> {
  // Sicherstellen, dass der User einen Code hat
  const referralCode = await ensureReferralCode(userId);

  // Alle Empfehlungen laden
  const referrals = await prisma.referral.findMany({
    where: { referrerId: userId },
    include: {
      referred: {
        select: { name: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Gesamte verdiente Checkos berechnen (Referral-Bonus + Affiliate)
  const totalCheckosEarned = referrals.reduce((sum, r) => sum + r.checkosEarned, 0)
    + referrals.length * 10; // 10 Checkos pro Registrierung

  return {
    referralCode,
    totalReferrals: referrals.length,
    totalCheckosEarned,
    referrals: referrals.map((r) => ({
      id: r.id,
      referredName: r.referred.name,
      referredEmail: r.referred.email,
      checkosEarned: r.checkosEarned + 10, // +10 vom Registrierungsbonus
      createdAt: r.createdAt,
    })),
  };
}
