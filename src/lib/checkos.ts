// Checkos — Coin-System für Checko
// Pakete, Qualitätsstufen, Balance-Management
// User sieht KEINE Modellnamen, nur Standard/Premium/Pro

import { prisma } from "@/lib/prisma";

// ==================== PAKETE ====================

export interface CheckoPackage {
  id: string;
  amount: number;       // Anzahl Checkos
  priceCHF: number;     // Preis in Rappen (Cent)
  priceDisplay: string; // Anzeige-Preis
  savings: string;      // Ersparnis-Text
  popular: boolean;     // Beliebtestes Paket
}

export function getPackages(): CheckoPackage[] {
  return [
    {
      id: "checkos-20",
      amount: 20,
      priceCHF: 2000,       // 20.00 CHF
      priceDisplay: "CHF 20.00",
      savings: "",
      popular: false,
    },
    {
      id: "checkos-50",
      amount: 50,
      priceCHF: 4500,       // 45.00 CHF (10% Rabatt)
      priceDisplay: "CHF 45.00",
      savings: "Spare 10%",
      popular: true,
    },
    {
      id: "checkos-100",
      amount: 100,
      priceCHF: 8500,       // 85.00 CHF (15% Rabatt)
      priceDisplay: "CHF 85.00",
      savings: "Spare 15%",
      popular: false,
    },
  ];
}

/**
 * Finde ein Paket anhand seiner ID
 */
export function getPackageById(packageId: string): CheckoPackage | undefined {
  return getPackages().find((p) => p.id === packageId);
}

// ==================== QUALITÄTSSTUFEN ====================

export interface QualityTier {
  id: string;
  name: string;        // Anzeigename für User
  checkoCost: number;  // Kosten pro Nutzung
  description: string;
}

export function getQualityTiers(): QualityTier[] {
  return [
    {
      id: "standard",
      name: "Standard",
      checkoCost: 2,
      description: "Schnell und zuverlässig",
    },
    {
      id: "premium",
      name: "Premium",
      checkoCost: 4,
      description: "Bessere Qualität und mehr Details",
    },
    {
      id: "pro",
      name: "Pro",
      checkoCost: 7,
      description: "Maximale Qualität und Tiefe",
    },
  ];
}

/**
 * Finde eine Qualitätsstufe anhand der ID
 */
export function getQualityTierById(tierId: string): QualityTier | undefined {
  return getQualityTiers().find((t) => t.id === tierId);
}

// ==================== BALANCE-MANAGEMENT ====================

/**
 * Checkos-Kontostand eines Users abfragen
 */
export async function getBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { checkosBalance: true },
  });
  return user?.checkosBalance ?? 0;
}

/**
 * Checkos nach einem Kauf gutschreiben
 * Erstellt CheckoPurchase + CheckoTransaction + aktualisiert Balance
 */
export async function purchaseCheckos(
  userId: string,
  packageId: string,
  stripePaymentId?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const pkg = getPackageById(packageId);
  if (!pkg) {
    return { success: false, newBalance: 0, error: "Ungültiges Paket" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // CheckoPurchase erstellen
      await tx.checkoPurchase.create({
        data: {
          userId,
          amount: pkg.amount,
          priceCHF: pkg.priceCHF,
          stripePaymentId: stripePaymentId || null,
          status: "completed",
        },
      });

      // CheckoTransaction erstellen (Gutschrift)
      await tx.checkoTransaction.create({
        data: {
          userId,
          amount: pkg.amount,
          type: "purchase",
          description: `${pkg.amount} Checkos gekauft (${pkg.priceDisplay})`,
        },
      });

      // Balance aktualisieren
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { checkosBalance: { increment: pkg.amount } },
        select: { checkosBalance: true },
      });

      return updatedUser.checkosBalance;
    });

    return { success: true, newBalance: result };
  } catch (error) {
    console.error("purchaseCheckos error:", error);
    return { success: false, newBalance: 0, error: "Fehler beim Gutschreiben" };
  }
}

/**
 * Checkos abziehen (bei Modulnutzung)
 * Prüft ob genug Balance vorhanden
 */
export async function deductCheckos(
  userId: string,
  amount: number,
  moduleSlug?: string,
  qualityTier?: string,
  description?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  if (amount <= 0) {
    return { success: false, newBalance: 0, error: "Ungültiger Betrag" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Aktuelle Balance prüfen
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { checkosBalance: true },
      });

      if (!user || user.checkosBalance < amount) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      // CheckoTransaction erstellen (Verbrauch = negativer Betrag)
      await tx.checkoTransaction.create({
        data: {
          userId,
          amount: -amount,
          type: "usage",
          description: description || `${amount} Checkos verbraucht`,
          moduleSlug: moduleSlug || null,
          qualityTier: qualityTier || null,
        },
      });

      // Balance aktualisieren
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { checkosBalance: { decrement: amount } },
        select: { checkosBalance: true },
      });

      return updatedUser.checkosBalance;
    });

    return { success: true, newBalance: result };
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_BALANCE") {
      return { success: false, newBalance: 0, error: "Nicht genügend Checkos" };
    }
    console.error("deductCheckos error:", error);
    return { success: false, newBalance: 0, error: "Fehler beim Abziehen" };
  }
}

/**
 * Checkos verschenken (Admin-Funktion)
 */
export async function giftCheckos(
  userId: string,
  amount: number,
  adminId: string,
  description?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  if (amount <= 0) {
    return { success: false, newBalance: 0, error: "Ungültiger Betrag" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // CheckoTransaction erstellen (Geschenk vom Admin)
      await tx.checkoTransaction.create({
        data: {
          userId,
          amount: amount,
          type: "admin_gift",
          description: description || `${amount} Checkos vom Admin geschenkt`,
        },
      });

      // Balance aktualisieren
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { checkosBalance: { increment: amount } },
        select: { checkosBalance: true },
      });

      return updatedUser.checkosBalance;
    });

    return { success: true, newBalance: result };
  } catch (error) {
    console.error("giftCheckos error:", error);
    return { success: false, newBalance: 0, error: "Fehler beim Verschenken" };
  }
}

/**
 * Letzte Transaktionen eines Users laden
 */
export async function getTransactions(
  userId: string,
  limit: number = 20
): Promise<{
  id: string;
  amount: number;
  type: string;
  description: string | null;
  moduleSlug: string | null;
  qualityTier: string | null;
  createdAt: Date;
}[]> {
  return prisma.checkoTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      amount: true,
      type: true,
      description: true,
      moduleSlug: true,
      qualityTier: true,
      createdAt: true,
    },
  });
}
